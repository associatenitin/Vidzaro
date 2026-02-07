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
import importlib
import site
from pathlib import Path

# Add NVIDIA CUDA pip package paths to PATH so onnxruntime-gpu finds cublasLt64_12.dll etc.
# (avoids needing the full CUDA Toolkit when using nvidia-cublas-cu12 / nvidia-cudnn-cu12 from pip)
def _add_nvidia_cuda_paths():
    paths_to_add = []
    # 1. Try explicit imports for well-known packages
    for pkg_name in ("nvidia.cublas", "nvidia.cudnn", "nvidia.cufft", "nvidia.curand", "nvidia.cusolver", "nvidia.cusparse"):
        try:
            mod = importlib.import_module(pkg_name)
            if hasattr(mod, "__path__"):
                pkg_dir = Path(mod.__path__[0]).resolve()
                for sub in ("bin", "lib"):
                    d = pkg_dir / sub
                    if d.is_dir():
                        paths_to_add.append(str(d))
        except Exception:
            pass

    # 2. Also scan site-packages/nvidia directory directly (more robust for nested names)
    try:
        for sp in site.getsitepackages():
            nvidia_dir = Path(sp) / "nvidia"
            if nvidia_dir.is_dir():
                for sub_dir in nvidia_dir.iterdir():
                    if sub_dir.is_dir():
                        for sub in ("bin", "lib"):
                            d = sub_dir / sub
                            if d.is_dir():
                                paths_to_add.append(str(d))
    except Exception:
        pass

    # Deduplicate
    paths_to_add = list(dict.fromkeys(paths_to_add))
    
    if paths_to_add:
        print(f"Adding CUDA paths to PATH/DLL search: {paths_to_add}")
        os.environ["PATH"] = os.pathsep.join(paths_to_add) + os.pathsep + os.environ.get("PATH", "")
        # For Python 3.8+ on Windows, we also need os.add_dll_directory
        if sys.platform == "win32" and hasattr(os, "add_dll_directory"):
            for p in paths_to_add:
                try:
                    os.add_dll_directory(p)
                except Exception:
                    pass


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


def _cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity; assumes embeddings may be unnormalized."""
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na < 1e-8 or nb < 1e-8:
        return 0.0
    return float(np.dot(a, b) / (na * nb + 1e-8))


def assign_track_ids(detections_per_frame, iou_thresh=0.3):
    """
    detections_per_frame: list of list of dicts with 'bbox' [x1,y1,x2,y2].
    Returns same structure with 'trackId' added (0, 1, 2, ...).
    IoU-based; use assign_track_ids_embedding when embeddings are available.
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


def assign_track_ids_embedding(detections_per_frame, sim_thresh=0.28):
    """
    Assign track IDs by face embedding similarity across keyframes.
    detections_per_frame: list of list of dicts with 'bbox' and 'embedding' (numpy array).
    Same person across frames (different poses/positions) gets the same trackId.
    Falls back to IoU when embedding is missing.
    
    Uses lower threshold (0.28) and stores multiple embeddings per track to handle
    significant pose changes (e.g., dancing, turning head).
    """
    next_id = 0
    track_embeddings = {}  # trackId -> list of embeddings (up to 5 per person)
    track_bbox = {}  # trackId -> last bbox (for IoU fallback)
    MAX_EMBEDDINGS_PER_TRACK = 5
    out = []
    for frame_dets in detections_per_frame:
        new_frame = []
        for det in frame_dets:
            bbox = det.get("bbox")
            if not bbox or len(bbox) != 4:
                continue
            emb = det.get("embedding")
            best_id = None
            best_score = sim_thresh
            if emb is not None and isinstance(emb, np.ndarray):
                # Compare against ALL stored embeddings for each track
                for tid, emb_list in track_embeddings.items():
                    for prev_emb in emb_list:
                        sim = _cosine_sim(emb, prev_emb)
                        if sim > best_score:
                            best_score = sim
                            best_id = tid
            if best_id is None and track_bbox:
                best_iou = 0.3
                for tid, prev_bbox in track_bbox.items():
                    iou = iou_box(bbox, prev_bbox)
                    if iou > best_iou:
                        best_iou = iou
                        best_id = tid
            if best_id is None:
                best_id = next_id
                next_id += 1
            # Store embedding (keep up to MAX_EMBEDDINGS_PER_TRACK diverse embeddings)
            if emb is not None and isinstance(emb, np.ndarray):
                if best_id not in track_embeddings:
                    track_embeddings[best_id] = []
                # Only add if somewhat different from existing (avoid duplicates)
                should_add = True
                for existing_emb in track_embeddings[best_id]:
                    if _cosine_sim(emb, existing_emb) > 0.85:
                        should_add = False
                        break
                if should_add and len(track_embeddings[best_id]) < MAX_EMBEDDINGS_PER_TRACK:
                    track_embeddings[best_id].append(emb)
            track_bbox[best_id] = bbox
            out_det = {k: v for k, v in det.items() if k != "embedding"}
            new_frame.append({**out_det, "trackId": best_id})
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
            emb = getattr(f, "normed_embedding", getattr(f, "embedding", None))
            det = {"bbox": bbox}
            if emb is not None:
                det["embedding"] = np.asarray(emb, dtype=np.float32)
            frame_dets.append(det)
        raw_per_frame.append(frame_dets)
        time_sec = round(idx / fps, 2)
        h, w = frame.shape[:2]
        keyframes.append({"frameIndex": idx, "time": time_sec, "width": w, "height": h, "faces": []})
    cap.release()

    with_tracks = assign_track_ids_embedding(raw_per_frame)
    for i, frame_dets in enumerate(with_tracks):
        if i < len(keyframes):
            keyframes[i]["faces"] = [{"bbox": d["bbox"], "trackId": d["trackId"]} for d in frame_dets]
            if i < len(stored_frames):
                # imencode expects BGR format, stored_frames are already BGR
                _, buf = cv2.imencode(".png", stored_frames[i])
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
        track_embeddings = {}  # trackId -> list of embeddings (up to 5 per person)
        track_bbox = {}  # trackId -> last bbox (for IoU fallback)
        MAX_EMBEDDINGS_PER_TRACK = 5
        SIM_THRESH = 0.28  # Lower threshold for pose variations
        frame_idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            faces = face_app.get(rgb)
            # Assign track id by embedding similarity (same logic as detect-faces)
            frame_dets = []
            for f in faces:
                bbox = f.bbox.astype(int).tolist()
                emb = getattr(f, "normed_embedding", getattr(f, "embedding", None))
                det = {"face": f, "bbox": bbox}
                if emb is not None:
                    det["embedding"] = np.asarray(emb, dtype=np.float32)
                frame_dets.append(det)
            next_id = max(list(track_embeddings.keys()) + list(track_bbox.keys()), default=-1) + 1
            for det in frame_dets:
                bbox = det["bbox"]
                emb = det.get("embedding")
                best_id = None
                best_score = SIM_THRESH
                # First try embedding matching against ALL stored embeddings
                if emb is not None:
                    for tid, emb_list in track_embeddings.items():
                        for prev_emb in emb_list:
                            sim = _cosine_sim(emb, prev_emb)
                            if sim > best_score:
                                best_score = sim
                                best_id = tid
                # Fallback to IoU if no embedding match
                if best_id is None and track_bbox:
                    best_iou = 0.3
                    for tid, prev_bbox in track_bbox.items():
                        iou = iou_box(bbox, prev_bbox)
                        if iou > best_iou:
                            best_iou = iou
                            best_id = tid
                if best_id is None:
                    best_id = next_id
                    next_id += 1
                # Store embedding (keep up to MAX_EMBEDDINGS_PER_TRACK diverse embeddings)
                if emb is not None:
                    if best_id not in track_embeddings:
                        track_embeddings[best_id] = []
                    should_add = True
                    for existing_emb in track_embeddings[best_id]:
                        if _cosine_sim(emb, existing_emb) > 0.85:
                            should_add = False
                            break
                    if should_add and len(track_embeddings[best_id]) < MAX_EMBEDDINGS_PER_TRACK:
                        track_embeddings[best_id].append(emb)
                track_bbox[best_id] = bbox
                det["trackId"] = best_id
            chosen_face = None
            for det in frame_dets:
                if det["trackId"] == target_track_id:
                    chosen_face = det["face"]
                    break
            if chosen_face is not None:
                # swapper.get expects the frame in the same format as face detection (RGB)
                # Perform swap on RGB, then convert back to BGR for saving
                rgb = swapper.get(rgb, chosen_face, source_face, paste_back=True)
                frame = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
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
