"""
Video Morph service: face detection and face swap using InsightFace.
Endpoints: POST /detect-faces, POST /swap
"""
import os
import sys
import json
import base64
import tempfile
import subprocess
import uuid
from pathlib import Path

# Add NVIDIA CUDA pip package paths to PATH so onnxruntime-gpu finds cublasLt64_12.dll etc.
# (avoids needing the full CUDA Toolkit when using nvidia-cublas-cu12 / nvidia-cudnn-cu12 from pip)
def _add_nvidia_cuda_paths():
    paths_to_add = []
    # Try both naming conventions (nvidia_cublas_cu12 or nvidia.cublas_cu12)
    for pkg_name in ("nvidia_cublas_cu12", "nvidia_cudnn_cu12", "nvidia.cublas_cu12", "nvidia.cudnn_cu12"):
        try:
            mod = __import__(pkg_name)
            if hasattr(mod, "__path__"):
                pkg_dir = Path(mod.__path__[0]).resolve()
            else:
                pkg_dir = Path(mod.__file__).resolve().parent
            for sub in ("bin", "lib", ""):
                d = pkg_dir / sub if sub else pkg_dir
                if d.is_dir():
                    paths_to_add.append(str(d))
                    break
        except Exception:
            pass
    if paths_to_add:
        os.environ["PATH"] = os.pathsep.join(paths_to_add) + os.pathsep + os.environ.get("PATH", "")


_add_nvidia_cuda_paths()

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException, Body
from pydantic import BaseModel

# InsightFace expects root such that models live in root/models/ (e.g. root/models/buffalo_sc/)
MORPH_ROOT = Path(__file__).resolve().parent
MODELS_ROOT = os.environ.get("MODELS_ROOT", str(MORPH_ROOT))
TEMP_DIR = os.environ.get("TEMP_DIR", tempfile.gettempdir())
Path(MODELS_ROOT).mkdir(parents=True, exist_ok=True)
Path(TEMP_DIR).mkdir(parents=True, exist_ok=True)

# Lazy-load heavy deps
_face_app = None
_swapper = None
# Override from request: None = use env; True = CPU only; False = prefer CUDA
_prefer_cpu_override: bool | None = None


def _get_providers():
    if _prefer_cpu_override is True:
        return ["CPUExecutionProvider"]
    if _prefer_cpu_override is False:
        return ["CUDAExecutionProvider", "CPUExecutionProvider"]
    if os.environ.get("USE_CPU", "").strip() == "1":
        return ["CPUExecutionProvider"]
    return ["CUDAExecutionProvider", "CPUExecutionProvider"]


def _apply_use_cuda(use_cuda: bool | None):
    """Apply request-level CPU/CUDA preference; clear cached models if preference changed."""
    global _face_app, _swapper, _prefer_cpu_override
    if use_cuda is None:
        return
    new_prefer_cpu = not use_cuda
    if _prefer_cpu_override != new_prefer_cpu:
        _prefer_cpu_override = new_prefer_cpu
        _face_app = None
        _swapper = None


def get_face_app():
    global _face_app
    if _face_app is None:
        try:
            import insightface
            from insightface.app import FaceAnalysis
            model = os.environ.get("INSIGHTFACE_MODEL", "buffalo_s")
            _face_app = FaceAnalysis(name=model, root=MODELS_ROOT, providers=_get_providers())
            _face_app.prepare(ctx_id=0, det_size=(640, 640))
        except Exception as e:
            raise RuntimeError(f"Failed to load FaceAnalysis: {e}") from e
    return _face_app


def get_swapper():
    global _swapper
    if _swapper is None:
        try:
            from insightface.model_zoo import get_model
            prov = _get_providers()
            _swapper = get_model("inswapper_128.onnx", root=MODELS_ROOT, download=True, providers=prov)
        except RuntimeError as e:
            if "Failed downloading" in str(e):
                local_path = Path(MODELS_ROOT) / "models" / "inswapper_128.onnx"
                if local_path.exists():
                    _swapper = get_model(str(local_path), root=MODELS_ROOT, download=False, providers=_get_providers())
                else:
                    raise RuntimeError(
                        "InSwapper download failed. Run: python download_models.py (uses Hugging Face fallback)"
                    ) from e
            else:
                raise
        except Exception as e:
            raise RuntimeError(f"Failed to load InSwapper: {e}") from e
    return _swapper


def iou_box(a, b):
    """IoU of two boxes [x1,y1,x2,y2]."""
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    area_a = (ax2 - ax1) * (ay2 - ay1)
    area_b = (bx2 - bx1) * (by2 - by1)
    return inter / (area_a + area_b - inter + 1e-6)


def assign_track_ids(detections_per_frame, iou_thresh=0.3):
    """
    detections_per_frame: list of list of dicts with 'bbox' [x1,y1,x2,y2].
    Returns same structure with 'trackId' added (0, 1, 2, ...).
    """
    next_id = 0
    track_bbox = {}  # trackId -> last bbox
    out = []
    for frame_dets in detections_per_frame:
        new_frame = []
        for det in frame_dets:
            bbox = det.get("bbox")
            if not bbox or len(bbox) != 4:
                continue
            best_id = None
            best_iou = iou_thresh
            for tid, prev_bbox in track_bbox.items():
                iou = iou_box(bbox, prev_bbox)
                if iou > best_iou:
                    best_iou = iou
                    best_id = tid
            if best_id is None:
                best_id = next_id
                next_id += 1
            track_bbox[best_id] = bbox
            new_frame.append({**det, "trackId": best_id})
        out.append(new_frame)
    return out


app = FastAPI(title="Video Morph Service")


class DetectFacesRequest(BaseModel):
    video_path: str
    use_cuda: bool | None = None  # None = use env/default; True = prefer GPU; False = CPU only


class SwapRequest(BaseModel):
    source_image_path: str
    video_path: str
    target_face_track_id: int = 0
    use_cuda: bool | None = None


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/detect-faces")
def detect_faces(req: DetectFacesRequest = Body(...)):
    """Extract sample frames from video, detect faces, return frames with bboxes and track ids."""
    _apply_use_cuda(req.use_cuda)
    video_path = req.video_path
    if not os.path.isfile(video_path):
        raise HTTPException(status_code=400, detail="Video file not found")
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise HTTPException(status_code=400, detail="Could not open video")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.release()

    # Sample ~every 2 seconds, max 15 frames
    interval_frames = max(1, int(fps * 2))
    frame_indices = list(range(0, total_frames, interval_frames))[:15]

    face_app = get_face_app()
    detections_per_frame = []
    keyframes = []  # list of { frameIndex, time, imageBase64? or image not for now, faces: [{ bbox, trackId }] }
    # We'll get bboxes first, then assign track ids
    raw_per_frame = []

    stored_frames = []
    cap = cv2.VideoCapture(video_path)
    for idx in frame_indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = cap.read()
        if not ret:
            continue
        stored_frames.append(frame)
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        faces = face_app.get(rgb)
        frame_dets = []
        for f in faces:
            bbox = f.bbox.astype(int).tolist()
            frame_dets.append({"bbox": bbox})
        raw_per_frame.append(frame_dets)
        time_sec = round(idx / fps, 2)
        h, w = frame.shape[:2]
        keyframes.append({"frameIndex": idx, "time": time_sec, "width": w, "height": h, "faces": []})
    cap.release()

    with_tracks = assign_track_ids(raw_per_frame)
    for i, frame_dets in enumerate(with_tracks):
        if i < len(keyframes):
            keyframes[i]["faces"] = [{"bbox": d["bbox"], "trackId": d["trackId"]} for d in frame_dets]
            if i < len(stored_frames):
                _, buf = cv2.imencode(".png", cv2.cvtColor(stored_frames[i], cv2.COLOR_BGR2RGB))
                keyframes[i]["imageBase64"] = "data:image/png;base64," + base64.b64encode(buf.tobytes()).decode("utf-8")

    return {
        "fps": fps,
        "totalFrames": total_frames,
        "keyframes": keyframes,
    }


@app.post("/swap")
def swap(req: SwapRequest = Body(...)):
    """Face swap: source face from image onto the person with target_face_track_id in the video."""
    _apply_use_cuda(req.use_cuda)
    src_path = req.source_image_path
    video_path = req.video_path
    target_track_id = req.target_face_track_id

    for p in (src_path, video_path):
        if not os.path.isfile(p):
            raise HTTPException(status_code=400, detail=f"File not found: {p}")

    face_app = get_face_app()
    swapper = get_swapper()

    # Load source face from image
    src_img = cv2.imread(src_path)
    if src_img is None:
        raise HTTPException(status_code=400, detail="Could not read source image")
    src_rgb = cv2.cvtColor(src_img, cv2.COLOR_BGR2RGB)
    src_faces = face_app.get(src_rgb)
    if not src_faces:
        raise HTTPException(status_code=400, detail="No face found in source image")
    source_face = src_faces[0]

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    out_id = str(uuid.uuid4())
    frames_dir = Path(TEMP_DIR) / f"morph_frames_{out_id}"
    frames_dir.mkdir(parents=True, exist_ok=True)
    out_video_path = Path(TEMP_DIR) / f"morph_out_{out_id}.mp4"

    try:
        track_bbox = {}
        frame_idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            faces = face_app.get(rgb)
            # Assign track id by IoU with previous bboxes (same logic as detect-faces)
            frame_dets = [{"face": f, "bbox": f.bbox.astype(int).tolist()} for f in faces]
            next_id = max(track_bbox.keys(), default=-1) + 1
            for det in frame_dets:
                bbox = det["bbox"]
                best_id = None
                best_iou = 0.3
                for tid, prev_bbox in track_bbox.items():
                    iou = iou_box(bbox, prev_bbox)
                    if iou > best_iou:
                        best_iou = iou
                        best_id = tid
                if best_id is None:
                    best_id = next_id
                    next_id += 1
                track_bbox[best_id] = bbox
                det["trackId"] = best_id
            chosen_face = None
            for det in frame_dets:
                if det["trackId"] == target_track_id:
                    chosen_face = det["face"]
                    break
            if chosen_face is not None:
                frame = swapper.get(frame, chosen_face, source_face, paste_back=True)
            frame_path = frames_dir / f"frame_{frame_idx:08d}.png"
            cv2.imwrite(str(frame_path), frame)
            frame_idx += 1
        cap.release()

        # Encode video with ffmpeg
        ffmpeg_cmd = [
            "ffmpeg", "-y",
            "-framerate", str(fps),
            "-i", str(frames_dir / "frame_%08d.png"),
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-preset", "fast", "-crf", "23",
            str(out_video_path),
        ]
        subprocess.run(ffmpeg_cmd, check=True, capture_output=True)

        return {"output_path": str(out_video_path)}
    finally:
        import shutil
        shutil.rmtree(frames_dir, ignore_errors=True)


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
