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
import traceback
from pathlib import Path

# Fix for GFPGAN/BasicsSR: torchvision removed functional_tensor in newer versions
from types import ModuleType
try:
    import torchvision.transforms.functional as F
    import torchvision.transforms as T
    # Create the missing module in memory
    mock_module = ModuleType('torchvision.transforms.functional_tensor')
    for attr in dir(F):
        if not attr.startswith('__'):
            setattr(mock_module, attr, getattr(F, attr))
    sys.modules['torchvision.transforms.functional_tensor'] = mock_module
    T.functional_tensor = mock_module
except Exception as e:
    print(f"Warning: Failed to patch torchvision: {e}")

import logging
from fastapi import BackgroundTasks

# Configure logging
morph_log_file = Path(__file__).parent / "morph_service.log"
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(morph_log_file),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

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

app = FastAPI(title="Video Morph Service")

def _cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity; assumes embeddings may be unnormalized."""
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na < 1e-8 or nb < 1e-8:
        return 0.0
    return float(np.dot(a, b) / (na * nb + 1e-8))

# InsightFace expects root such that models live in root/models/ (e.g. root/models/buffalo_sc/)
MORPH_ROOT = Path(__file__).resolve().parent
MODELS_ROOT = os.environ.get("MODELS_ROOT", str(MORPH_ROOT))
TEMP_DIR = os.environ.get("TEMP_DIR", tempfile.gettempdir())
Path(MODELS_ROOT).mkdir(parents=True, exist_ok=True)
Path(TEMP_DIR).mkdir(parents=True, exist_ok=True)

# Lazy-load heavy deps
_face_app = None
_swapper = None
_enhancer = None
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
        _enhancer = None


def get_face_app():
    global _face_app
    if _face_app is None:
        try:
            print("Loading FaceAnalysis model...")
            import insightface
            from insightface.app import FaceAnalysis
            model = os.environ.get("INSIGHTFACE_MODEL", "buffalo_s")
            _face_app = FaceAnalysis(name=model, root=MODELS_ROOT, providers=_get_providers())
            _face_app.prepare(ctx_id=0, det_size=(640, 640))
            print("FaceAnalysis loaded successfully.")
        except Exception as e:
            print(f"Failed to load FaceAnalysis: {e}")
            raise RuntimeError(f"Failed to load FaceAnalysis: {e}") from e
    return _face_app


def get_swapper():
    global _swapper
    if _swapper is None:
        try:
            print("Loading InSwapper model...")
            from insightface.model_zoo import get_model
            prov = _get_providers()
            _swapper = get_model("inswapper_128.onnx", root=MODELS_ROOT, download=True, providers=prov)
            print("InSwapper loaded successfully.")
        except RuntimeError as e:
            if "Failed downloading" in str(e):
                local_path = Path(MODELS_ROOT) / "models" / "inswapper_128.onnx"
                if local_path.exists():
                    print(f"Found local swapper model at {local_path}")
                    _swapper = get_model(str(local_path), root=MODELS_ROOT, download=False, providers=_get_providers())
                else:
                    print("InSwapper model not found locally and download failed.")
                    raise RuntimeError(
                        "InSwapper download failed. Run: python download_models.py (uses Hugging Face fallback)"
                    ) from e
            else:
                print(f"RuntimeError loading InSwapper: {e}")
                raise
        except Exception as e:
            print(f"Failed to load InSwapper: {e}")
            raise RuntimeError(f"Failed to load InSwapper: {e}") from e
    return _swapper


def get_enhancer():
    global _enhancer
    if _enhancer is None:
        try:
            print("Loading GFPGAN enhancer...")
            from gfpgan import GFPGANer
            import torch
            
            device = torch.device('cuda' if torch.cuda.is_available() and _prefer_cpu_override is not True else 'cpu')
            print(f"GFPGAN using device: {device}")
            
            model_url = 'https://github.com/TencentARC/GFPGAN/releases/download/v1.3.4/GFPGANv1.4.pth'
            _enhancer = GFPGANer(
                model_path=model_url,
                upscale=1,
                arch='clean',
                channel_multiplier=2,
                bg_upsampler=None,
                device=device
            )
            print("GFPGAN enhancer loaded successfully.")
        except Exception as e:
            print(f"Failed to load GFPGAN: {e}")
            # Non-fatal, mark as 'failed' so we don't try every 10 frames
            _enhancer = "failed"
            return None
    if _enhancer == "failed":
        return None
    return _enhancer


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


# Global state for tracking job progress
_jobs = {}

def update_job_progress(job_id: str, progress: float, status: str = "processing", result: dict = None):
    _jobs[job_id] = {
        "progress": round(progress, 2),
        "status": status,
        "result": result,
        "updated_at": os.times()[4]
    }

def assign_track_ids_embedding(detections_per_frame, sim_thresh=0.42):
    """
    Assign track IDs by face embedding similarity across keyframes.
    Ensures that each ID is used at most once per frame.
    """
    next_id = 0
    track_embeddings = {}  # trackId -> list of embeddings
    track_bbox = {}  # trackId -> last bbox
    MAX_EMBEDDINGS_PER_TRACK = 5
    out = []
    
    for frame_dets in detections_per_frame:
        new_frame = []
        used_ids_in_this_frame = set()
        
        # Sort detections by size or presence of embedding to prioritize better matches
        sorted_dets = sorted(frame_dets, key=lambda d: d.get("embedding") is not None, reverse=True)
        
        for det in sorted_dets:
            bbox = det.get("bbox")
            if not bbox or len(bbox) != 4: continue
            emb = det.get("embedding")
            best_id = None
            best_score = sim_thresh

            if emb is not None:
                for tid, emb_list in track_embeddings.items():
                    if tid in used_ids_in_this_frame: continue
                    for prev_emb in emb_list:
                        sim = _cosine_sim(emb, prev_emb)
                        if sim > best_score:
                            best_score = sim
                            best_id = tid
            
            # IoU fallback (only if no embedding match was found)
            if best_id is None and track_bbox:
                best_iou = 0.35
                for tid, prev_bbox in track_bbox.items():
                    if tid in used_ids_in_this_frame: continue
                    iou = iou_box(bbox, prev_bbox)
                    if iou > best_iou:
                        best_iou = iou
                        best_id = tid
            
            if best_id is None:
                best_id = next_id
                next_id += 1
            
            used_ids_in_this_frame.add(best_id)
            
            if emb is not None:
                if best_id not in track_embeddings: track_embeddings[best_id] = []
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
    
    repr_embeddings = {tid: embs[0].tolist() for tid, embs in track_embeddings.items() if embs}
    return out, repr_embeddings


class DetectFacesRequest(BaseModel):
    video_path: str
    use_cuda: bool | None = None

class SwapRequest(BaseModel):
    source_image_path: str
    video_path: str
    target_face_track_id: int = 0
    target_face_embedding: list[float] | None = None # Stable ID bootstrap
    job_id: str | None = None
    use_cuda: bool | None = None
    enhance: bool = True

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/progress/{job_id}")
def get_progress(job_id: str):
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@app.post("/detect-faces")
def detect_faces(req: DetectFacesRequest = Body(...)):
    try:
        _apply_use_cuda(req.use_cuda)
        video_path = req.video_path
        if not os.path.isfile(video_path):
            raise HTTPException(status_code=400, detail="Video file not found")
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        cap.release()

        interval_frames = max(1, int(fps * 2))
        frame_indices = list(range(0, total_frames, interval_frames))[:20]

        logger.info(f"Detecting faces for {video_path}...")
        face_app = get_face_app()
        logger.info("Face app loaded.")
        raw_per_frame = []
        stored_frames = []
        keyframes_meta = []

        cap = cv2.VideoCapture(video_path)
        for idx in frame_indices:
            logger.info(f"Reading frame {idx}...")
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ret, frame = cap.read()
            if not ret: 
                logger.warning(f"Failed to read frame {idx}")
                continue
            stored_frames.append(frame)
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            faces = face_app.get(rgb)
            logger.info(f"Found {len(faces)} faces in frame {idx}")
            frame_dets = []
            for f in faces:
                bbox = f.bbox.astype(int).tolist()
                emb = getattr(f, "normed_embedding", getattr(f, "embedding", None))
                det = {"bbox": bbox}
                if emb is not None:
                    det["embedding"] = np.asarray(emb, dtype=np.float32)
                frame_dets.append(det)
            raw_per_frame.append(frame_dets)
            h, w = frame.shape[:2]
            keyframes_meta.append({"frameIndex": idx, "time": round(idx/fps, 2), "width": w, "height": h})
        cap.release()

        logger.info("Assigning track IDs...")
        with_tracks, track_embeddings = assign_track_ids_embedding(raw_per_frame)
        
        logger.info("Encoding keyframes...")
        keyframes = []
        for i, frame_dets in enumerate(with_tracks):
            kf = keyframes_meta[i]
            kf["faces"] = [{"bbox": d["bbox"], "trackId": d["trackId"]} for d in frame_dets]
            _, buf = cv2.imencode(".png", stored_frames[i])
            kf["imageBase64"] = "data:image/png;base64," + base64.b64encode(buf.tobytes()).decode("utf-8")
            keyframes.append(kf)

        logger.info("Detection complete.")
        return {
            "fps": fps,
            "totalFrames": total_frames,
            "keyframes": keyframes,
            "trackEmbeddings": track_embeddings
        }
    except Exception as e:
        logger.error(f"Error in detect_faces: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/swap")
def swap(background_tasks: BackgroundTasks, req: SwapRequest = Body(...)):
    job_id = req.job_id or str(uuid.uuid4())
    update_job_progress(job_id, 0, "starting")
    background_tasks.add_task(_do_swap, job_id, req)
    return {"jobId": job_id, "status": "queued"}

def _do_swap(job_id: str, req: SwapRequest):
    frames_dir = None
    try:
        _apply_use_cuda(req.use_cuda)
        src_path, video_path = req.source_image_path, req.video_path
        target_track_id = req.target_face_track_id
        
        face_app, swapper = get_face_app(), get_swapper()
        src_img = cv2.imread(src_path)
        src_faces = face_app.get(cv2.cvtColor(src_img, cv2.COLOR_BGR2RGB))
        if not src_faces:
            update_job_progress(job_id, 0, "failed", {"error": "No face in source"})
            return
        source_face = src_faces[0]

        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        out_id = str(uuid.uuid4())
        frames_dir = Path(TEMP_DIR) / f"morph_frames_{out_id}"
        frames_dir.mkdir(parents=True, exist_ok=True)
        out_video_path = Path(TEMP_DIR) / f"morph_out_{out_id}.mp4"

        track_embeddings = {}
        if req.target_face_embedding:
            track_embeddings[target_track_id] = [np.array(req.target_face_embedding, dtype=np.float32)]

        track_bbox = {}
        SIM_THRESH = 0.42
        frame_idx = 0
        update_job_progress(job_id, 0, "processing")

        while True:
            ret, frame = cap.read()
            if not ret: break
            
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            faces = face_app.get(rgb)
            frame_dets = []
            for f in faces:
                bbox = f.bbox.astype(int).tolist()
                emb = getattr(f, "normed_embedding", getattr(f, "embedding", None))
                det = {"face": f, "bbox": bbox, "embedding": np.asarray(emb, dtype=np.float32) if emb is not None else None}
                frame_dets.append(det)

            used_ids = set()
            for det in sorted(frame_dets, key=lambda d: d["embedding"] is not None, reverse=True):
                bbox, emb = det["bbox"], det["embedding"]
                best_id, best_score = None, SIM_THRESH
                if emb is not None:
                    for tid, embs in track_embeddings.items():
                        if tid in used_ids: continue
                        for te in embs:
                            sim = _cosine_sim(emb, te)
                            if sim > best_score:
                                best_score, best_id = sim, tid
                if best_id is None and track_bbox:
                    for tid, last_box in track_bbox.items():
                        if tid in used_ids: continue
                        if iou_box(bbox, last_box) > 0.35:
                            best_id = tid; break
                if best_id is None:
                    best_id = max(list(track_embeddings.keys()) + list(track_bbox.keys()) + [-1]) + 1
                used_ids.add(best_id)
                det["trackId"] = best_id
                track_bbox[best_id] = bbox
                if emb is not None:
                    if best_id not in track_embeddings: track_embeddings[best_id] = []
                    if len(track_embeddings[best_id]) < 5: track_embeddings[best_id].append(emb)

            for det in frame_dets:
                if det["trackId"] == target_track_id:
                    rgb_swapped = swapper.get(rgb, det["face"], source_face, paste_back=True)
                    if req.enhance:
                        enhancer = get_enhancer()
                        if enhancer:
                            _, _, rgb_swapped = enhancer.enhance(rgb_swapped, has_aligned=False, only_center_face=False, paste_back=True)
                    frame = cv2.cvtColor(rgb_swapped, cv2.COLOR_RGB2BGR)
                    break
            
            cv2.imwrite(str(frames_dir / f"frame_{frame_idx:08d}.png"), frame)
            frame_idx += 1
            if frame_idx % 25 == 0:
                print(f"[{job_id}] Frame {frame_idx}/{total_frames}")
                update_job_progress(job_id, (frame_idx / total_frames) * 100)
                # Small memory cleanup for long videos
                if frame_idx % 100 == 0:
                    import gc
                    gc.collect()

        cap.release()
        update_job_progress(job_id, 99, "encoding")
        subprocess.run([
            "ffmpeg", "-y", "-framerate", str(fps), "-i", str(frames_dir / "frame_%08d.png"),
            "-i", str(video_path), "-map", "0:v", "-map", "1:a?", "-c:v", "libx264",
            "-pix_fmt", "yuv420p", "-preset", "fast", "-crf", "23", "-c:a", "aac", "-shortest",
            str(out_video_path)
        ], check=True, capture_output=True)

        update_job_progress(job_id, 100, "completed", {"output_path": str(out_video_path)})
    except Exception as e:
        import traceback
        traceback.print_exc()
        update_job_progress(job_id, 0, "failed", {"error": str(e)})
    finally:
        if frames_dir:
            import shutil
            shutil.rmtree(frames_dir, ignore_errors=True)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
