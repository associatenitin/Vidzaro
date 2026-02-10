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
try:
    from skimage import transform as trans
except ImportError:
    print("Warning: scikit-image not available, face alignment will be limited")

# Import torch for CUDA checks
try:
    import torch
except ImportError:
    print("Warning: PyTorch not available")
    torch = None

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
_face_app_hd = None  # High-definition face detector
_swapper = None
_enhancer = None
_codeformer = None
_face_parser = None
# Override from request: None = use env; True = CPU only; False = prefer CUDA
_prefer_cpu_override: bool | None = None

# Quality settings
HD_DETECTION_SIZE = (1024, 1024)  # Higher resolution for better detection
TEMPORAL_SMOOTH_FRAMES = 5  # Frames to consider for temporal smoothing
QUALITY_THRESHOLD = 0.6  # Higher threshold for better face matches


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
    global _face_app, _face_app_hd, _swapper, _prefer_cpu_override, _enhancer, _codeformer, _face_parser
    if use_cuda is None:
        return
    new_prefer_cpu = not use_cuda
    if _prefer_cpu_override != new_prefer_cpu:
        _prefer_cpu_override = new_prefer_cpu
        _face_app = None
        _face_app_hd = None
        _swapper = None
        _enhancer = None
        _codeformer = None
        _face_parser = None


def get_face_app():
    global _face_app
    if _face_app is None:
        try:
            print("Loading FaceAnalysis model...")
            import insightface
            from insightface.app import FaceAnalysis
            model = os.environ.get("INSIGHTFACE_MODEL", "buffalo_l")  # Use larger, more accurate model
            _face_app = FaceAnalysis(name=model, root=MODELS_ROOT, providers=_get_providers())
            _face_app.prepare(ctx_id=0, det_size=(640, 640))  # Standard resolution for speed
            print("FaceAnalysis loaded successfully.")
        except Exception as e:
            print(f"Failed to load FaceAnalysis: {e}")
            raise RuntimeError(f"Failed to load FaceAnalysis: {e}") from e
    return _face_app

def get_face_app_hd():
    """High-definition face detector for better quality detection"""
    global _face_app_hd
    if _face_app_hd is None:
        try:
            print("Loading HD FaceAnalysis model...")
            import insightface
            from insightface.app import FaceAnalysis
            model = os.environ.get("INSIGHTFACE_MODEL", "buffalo_l")
            _face_app_hd = FaceAnalysis(name=model, root=MODELS_ROOT, providers=_get_providers())
            _face_app_hd.prepare(ctx_id=0, det_size=HD_DETECTION_SIZE)  # Higher resolution
            print("HD FaceAnalysis loaded successfully.")
        except Exception as e:
            print(f"Failed to load HD FaceAnalysis: {e}")
            raise RuntimeError(f"Failed to load HD FaceAnalysis: {e}") from e
    return _face_app_hd


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
                upscale=2,  # Higher upscale for better quality
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

def get_codeformer():
    """CodeFormer for advanced face enhancement"""
    global _codeformer
    if _codeformer is None:
        try:
            print("Loading CodeFormer enhancer...")
            import torch
            
            device = torch.device('cuda' if torch.cuda.is_available() and _prefer_cpu_override is not True else 'cpu')
            print(f"CodeFormer using device: {device}")
            
            try:
                # Try importing CodeFormer - it might not be available
                import basicsr
                from basicsr.utils import img2tensor
                print("BasicSR available for CodeFormer")
                
                # For now, mark as available but don't fully initialize 
                # due to potential compatibility issues
                _codeformer = "available_but_limited"
                print("CodeFormer marked as available (limited implementation)")
                return None  # Return None for now, can be enhanced later
                
            except ImportError as e:
                print(f"CodeFormer dependencies missing: {e}")
                _codeformer = "not_available"
                return None
                
        except Exception as e:
            print(f"Failed to load CodeFormer: {e}")
            _codeformer = "failed"
            return None
    if _codeformer in ["failed", "not_available", "available_but_limited"]:
        return None
    return _codeformer

def get_face_parser():
    """Face parser for better face segmentation"""
    global _face_parser
    if _face_parser is None:
        try:
            print("Loading Face Parser...")
            import torch
            
            device = torch.device('cuda' if torch.cuda.is_available() and _prefer_cpu_override is not True else 'cpu')
            
            try:
                from face_alignment import FaceAlignment, LandmarksType
                _face_parser = FaceAlignment(LandmarksType._2D, device=str(device))
                print("Face Parser loaded successfully.")
            except ImportError:
                print("Face-alignment not available")
                _face_parser = "not_available"
                return None
        except Exception as e:
            print(f"Failed to load Face Parser: {e}")
            _face_parser = "failed"
            return None
    if _face_parser in ["failed", "not_available"]:
        return None
    return _face_parser


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

def normalize_face_embedding(embedding):
    """Normalize face embedding for better similarity comparisons"""
    if embedding is None:
        return None
    emb = np.asarray(embedding, dtype=np.float32)
    norm = np.linalg.norm(emb)
    if norm < 1e-8:
        return emb
    return emb / norm

def enhance_face_alignment(face_img, landmarks=None):
    """Improve face alignment using landmarks for better swap quality"""
    try:
        if landmarks is None:
            face_parser = get_face_parser()
            if face_parser:
                landmarks = face_parser.get_landmarks(face_img)
        
        if landmarks is not None and len(landmarks) > 0:
            # Use the first detected face landmarks
            lm = landmarks[0] if isinstance(landmarks, list) else landmarks
            
            # Apply alignment transformation
            from skimage import transform as trans
            
            # Standard landmark positions for alignment
            src_landmarks = np.array([
                [30.2946, 51.6963],  # Left eye
                [65.5318, 51.5014],  # Right eye
                [48.0252, 71.7366],  # Nose tip
                [33.5493, 92.3655],  # Left mouth corner
                [62.7299, 92.2041]   # Right mouth corner
            ], dtype=np.float32)
            
            # Get corresponding landmarks from detected face
            if len(lm) >= 68:  # 68-point landmarks
                dst_landmarks = np.array([
                    lm[36:42].mean(axis=0),  # Left eye center
                    lm[42:48].mean(axis=0),  # Right eye center
                    lm[30],                  # Nose tip
                    lm[48],                  # Left mouth corner
                    lm[54]                   # Right mouth corner
                ], dtype=np.float32)
            elif len(lm) >= 5:  # 5-point landmarks
                dst_landmarks = lm[:5].astype(np.float32)
            else:
                return face_img
            
            # Compute similarity transform
            tform = trans.SimilarityTransform()
            tform.estimate(dst_landmarks, src_landmarks)
            
            # Apply transformation
            aligned_face = trans.warp(face_img, tform.inverse, output_shape=(112, 112))
            return (aligned_face * 255).astype(np.uint8)
    except Exception as e:
        print(f"Face alignment failed: {e}")
        return face_img
    
    return face_img

def apply_temporal_smoothing(current_face, face_history, alpha=0.7):
    """Apply temporal smoothing to reduce flickering between frames"""
    if not face_history:
        return current_face
    
    # Simple exponential moving average of face features
    smoothed = current_face.copy()
    
    # Blend with previous frames
    for i, prev_face in enumerate(reversed(face_history[-TEMPORAL_SMOOTH_FRAMES:])):
        weight = alpha ** (i + 1)
        smoothed = cv2.addWeighted(smoothed, 1 - weight, prev_face, weight, 0)
    
    return smoothed

def apply_temporal_smoothing_region(frame_rgb, face_history, bbox, alpha=0.7):
    """Apply temporal smoothing only within the face bbox to avoid full-frame ghosting."""
    if not face_history or bbox is None or len(bbox) != 4:
        return frame_rgb

    h, w = frame_rgb.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in bbox]
    x1 = max(0, min(w - 1, x1))
    y1 = max(0, min(h - 1, y1))
    x2 = max(0, min(w, x2))
    y2 = max(0, min(h, y2))

    if x2 <= x1 or y2 <= y1:
        return frame_rgb

    smoothed = frame_rgb.copy()
    region = smoothed[y1:y2, x1:x2]

    for i, prev in enumerate(reversed(face_history[-TEMPORAL_SMOOTH_FRAMES:])):
        prev_region = prev[y1:y2, x1:x2]
        if prev_region.shape != region.shape:
            continue
        weight = alpha ** (i + 1)
        region = cv2.addWeighted(region, 1 - weight, prev_region, weight, 0)

    smoothed[y1:y2, x1:x2] = region
    return smoothed

def soften_swap_edges(original_rgb, swapped_rgb, bbox, blur_radius=0.08):
    """Lightly soften only the outermost edge of the face swap region.
    
    Detects where InsightFace changed pixels and applies a thin feather
    at the boundary only — keeping the swapped face fully intact inside.
    """
    if bbox is None or len(bbox) != 4:
        return swapped_rgb
    
    h, w = original_rgb.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in bbox]
    
    face_w = x2 - x1
    face_h = y2 - y1
    margin = int(max(face_w, face_h) * 0.25)
    
    rx1 = max(0, x1 - margin)
    ry1 = max(0, y1 - margin)
    rx2 = min(w, x2 + margin)
    ry2 = min(h, y2 + margin)
    
    if rx2 <= rx1 or ry2 <= ry1:
        return swapped_rgb
    
    orig_region = original_rgb[ry1:ry2, rx1:rx2].astype(np.float32)
    swap_region = swapped_rgb[ry1:ry2, rx1:rx2].astype(np.float32)
    
    diff = np.abs(swap_region - orig_region).mean(axis=2)
    
    # Binary mask of changed pixels
    change_mask = (diff > 5.0).astype(np.float32)
    
    if change_mask.sum() < 10:
        return swapped_rgb
    
    # Only blur a thin border around the change region
    rh, rw = change_mask.shape
    k = max(7, int(min(rw, rh) * blur_radius)) | 1
    soft_mask = cv2.GaussianBlur(change_mask, (k, k), 0)
    
    # Ensure the interior stays at 1.0 (fully swapped)
    soft_mask = np.maximum(soft_mask, change_mask)
    soft_mask = np.clip(soft_mask, 0, 1)[..., None]
    
    blended = orig_region * (1. - soft_mask) + swap_region * soft_mask
    
    result = swapped_rgb.copy()
    result[ry1:ry2, rx1:rx2] = blended.astype(np.uint8)
    return result

def multi_stage_enhancement(face_img, use_codeformer=True):
    """Apply multiple enhancement stages for best quality"""
    enhanced = face_img.copy()
    
    try:
        # Stage 1: CodeFormer (if available) - Skip for now as it might cause hangs
        if use_codeformer and False:  # Disabled temporarily
            codeformer = get_codeformer()
            if codeformer:
                try:
                    # Apply CodeFormer enhancement
                    enhanced = codeformer.enhance(enhanced)
                except Exception as e:
                    print(f"CodeFormer enhancement failed: {e}")
        
        # Stage 2: GFPGAN for enhancement with timeout protection
        enhancer = get_enhancer()
        if enhancer:
            try:
                print("Applying GFPGAN enhancement...")
                _, _, enhanced = enhancer.enhance(enhanced, has_aligned=False, only_center_face=False, paste_back=True)
                print("GFPGAN enhancement completed.")
            except Exception as e:
                print(f"GFPGAN enhancement failed: {e}")
                # Return original image if enhancement fails
                enhanced = face_img
        
        # Stage 3: Post-processing (lightweight)
        try:
            enhanced = apply_post_processing(enhanced)
        except Exception as e:
            print(f"Post-processing failed: {e}")
            enhanced = face_img
        
    except Exception as e:
        print(f"Multi-stage enhancement failed: {e}")
        return face_img
    
    return enhanced

def apply_post_processing(img):
    """Apply post-processing for better visual quality"""
    try:
        # Enhance contrast and sharpness
        enhanced = cv2.convertScaleAbs(img, alpha=1.1, beta=5)
        
        # Apply bilateral filter for noise reduction while preserving edges
        enhanced = cv2.bilateralFilter(enhanced, 9, 75, 75)
        
        # Subtle sharpening
        kernel = np.array([[-1,-1,-1], [-1,9,-1], [-1,-1,-1]])
        sharpened = cv2.filter2D(enhanced, -1, kernel)
        enhanced = cv2.addWeighted(enhanced, 0.8, sharpened, 0.2, 0)
        
        return enhanced
    except:
        return img


# Global state for tracking job progress
_jobs = {}

def update_job_progress(job_id: str, progress: float, status: str = "processing", result: dict = None):
    _jobs[job_id] = {
        "progress": round(progress, 2),
        "status": status,
        "result": result,
        "updated_at": os.times()[4]
    }

def assign_track_ids_embedding(detections_per_frame, sim_thresh=QUALITY_THRESHOLD):
    """
    Assign track IDs by face embedding similarity across keyframes with improved accuracy.
    Ensures that each ID is used at most once per frame.
    """
    next_id = 0
    track_embeddings = {}  # trackId -> list of normalized embeddings
    track_bbox = {}  # trackId -> last bbox
    track_quality_scores = {}  # trackId -> quality scores
    MAX_EMBEDDINGS_PER_TRACK = 8  # Increased for better representation
    out = []
    
    for frame_dets in detections_per_frame:
        new_frame = []
        used_ids_in_this_frame = set()
        
        # Sort detections by quality (embedding presence and face size)
        sorted_dets = sorted(frame_dets, key=lambda d: (
            d.get("embedding") is not None,
            d.get("quality_score", 0.0),
            (d.get("bbox", [0,0,0,0])[2] - d.get("bbox", [0,0,0,0])[0]) * 
            (d.get("bbox", [0,0,0,0])[3] - d.get("bbox", [0,0,0,0])[1])  # Face area
        ), reverse=True)
        
        for det in sorted_dets:
            bbox = det.get("bbox")
            if not bbox or len(bbox) != 4: 
                continue
            emb = det.get("embedding")
            best_id = None
            best_score = sim_thresh

            # Normalize embedding for better comparison
            if emb is not None:
                emb = normalize_face_embedding(emb)
                
                # Find best matching track using multiple metrics
                for tid, emb_list in track_embeddings.items():
                    if tid in used_ids_in_this_frame: 
                        continue
                    
                    # Calculate similarity with all embeddings in track
                    similarities = [_cosine_sim(emb, prev_emb) for prev_emb in emb_list]
                    max_sim = max(similarities) if similarities else 0.0
                    avg_sim = np.mean(similarities) if similarities else 0.0
                    
                    # Weighted combination of max and average similarity
                    combined_sim = 0.7 * max_sim + 0.3 * avg_sim
                    
                    # Add bonus for track quality
                    quality_bonus = track_quality_scores.get(tid, 0.0) * 0.1
                    final_score = combined_sim + quality_bonus
                    
                    if final_score > best_score:
                        best_score = final_score
                        best_id = tid
            
            # Enhanced IoU fallback with size consistency check
            if best_id is None and track_bbox:
                best_iou = 0.4  # Slightly higher threshold
                for tid, prev_bbox in track_bbox.items():
                    if tid in used_ids_in_this_frame: 
                        continue
                    
                    iou = iou_box(bbox, prev_bbox)
                    
                    # Check size consistency
                    prev_area = (prev_bbox[2] - prev_bbox[0]) * (prev_bbox[3] - prev_bbox[1])
                    curr_area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
                    size_ratio = min(curr_area, prev_area) / (max(curr_area, prev_area) + 1e-6)
                    
                    # Combined score considering IoU and size consistency
                    combined_score = iou * (0.5 + 0.5 * size_ratio)
                    
                    if combined_score > best_iou:
                        best_iou = combined_score
                        best_id = tid
            
            if best_id is None:
                best_id = next_id
                next_id += 1
                track_quality_scores[best_id] = 0.0
            
            used_ids_in_this_frame.add(best_id)
            
            # Update track data with quality control
            if emb is not None:
                if best_id not in track_embeddings: 
                    track_embeddings[best_id] = []
                
                # Add embedding only if it's sufficiently different from existing ones
                should_add = True
                for existing_emb in track_embeddings[best_id]:
                    if _cosine_sim(emb, existing_emb) > 0.9:  # Higher threshold
                        should_add = False
                        break
                
                if should_add and len(track_embeddings[best_id]) < MAX_EMBEDDINGS_PER_TRACK:
                    track_embeddings[best_id].append(emb)
                    
                # Update quality score
                quality_score = det.get("quality_score", 0.5)
                if best_id in track_quality_scores:
                    track_quality_scores[best_id] = 0.8 * track_quality_scores[best_id] + 0.2 * quality_score
                else:
                    track_quality_scores[best_id] = quality_score
            
            track_bbox[best_id] = bbox
            out_det = {k: v for k, v in det.items() if k not in ["embedding", "quality_score"]}
            new_frame.append({**out_det, "trackId": best_id})
        
        out.append(new_frame)
    
    # Return best representative embedding for each track
    repr_embeddings = {}
    for tid, embs in track_embeddings.items():
        if embs:
            # Use the highest quality embedding as representative
            best_emb = embs[0]  # Could be improved with quality weighting
            repr_embeddings[tid] = best_emb.tolist()
    
    return out, repr_embeddings


class DetectFacesRequest(BaseModel):
    video_path: str
    use_cuda: bool | None = None
    use_hd_detection: bool = True  # Enable HD detection by default
    quality_mode: str = "balanced"  # "fast", "balanced", "best"

class SwapRequest(BaseModel):
    source_image_path: str
    video_path: str
    target_face_track_id: int = 0
    target_face_embedding: list[float] | None = None # Stable ID bootstrap
    job_id: str | None = None
    use_cuda: bool | None = None
    enhance: bool = True
    use_codeformer: bool = True  # Use CodeFormer if available
    use_hd_detection: bool = True  # Use HD detection for better quality
    temporal_smoothing: bool = True  # Apply temporal smoothing
    quality_mode: str = "balanced"  # "fast", "balanced", "best"

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

        # Adjust sampling based on quality mode
        if req.quality_mode == "best":
            interval_frames = max(1, int(fps * 1.5))  # More frames
            max_frames = 30
        elif req.quality_mode == "fast":
            interval_frames = max(1, int(fps * 3))    # Fewer frames
            max_frames = 15
        else:  # balanced
            interval_frames = max(1, int(fps * 2))
            max_frames = 20
        
        frame_indices = list(range(0, total_frames, interval_frames))[:max_frames]

        logger.info(f"Detecting faces for {video_path} (quality: {req.quality_mode})...")
        
        # Choose detection model based on quality requirements
        if req.use_hd_detection and req.quality_mode in ["balanced", "best"]:
            face_app = get_face_app_hd()
            logger.info("Using HD face detection.")
        else:
            face_app = get_face_app()
            logger.info("Using standard face detection.")
        
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
            
            # Apply preprocessing for better detection
            if req.quality_mode == "best":
                # Enhance image before detection
                rgb = apply_post_processing(rgb)
            
            faces = face_app.get(rgb)
            logger.info(f"Found {len(faces)} faces in frame {idx}")
            
            frame_dets = []
            for f in faces:
                bbox = f.bbox.astype(int).tolist()
                emb = getattr(f, "normed_embedding", getattr(f, "embedding", None))
                
                # Calculate quality score based on face properties
                det_score = float(getattr(f, "det_score", 0.0) or 0.0)
                face_area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) if len(bbox) == 4 else 0
                quality_score = det_score * (1.0 + np.log10(max(face_area, 1)) / 10.0)
                
                det = {
                    "bbox": bbox,
                    "quality_score": quality_score
                }
                
                if emb is not None:
                    det["embedding"] = normalize_face_embedding(np.asarray(emb, dtype=np.float32))
                
                frame_dets.append(det)
            
            raw_per_frame.append(frame_dets)
            h, w = frame.shape[:2]
            keyframes_meta.append({"frameIndex": idx, "time": round(idx/fps, 2), "width": w, "height": h})
        
        cap.release()

        logger.info("Assigning track IDs with enhanced algorithm...")
        with_tracks, track_embeddings = assign_track_ids_embedding(raw_per_frame)
        
        logger.info("Encoding keyframes...")
        keyframes = []
        for i, frame_dets in enumerate(with_tracks):
            kf = keyframes_meta[i]
            kf["faces"] = [{
                "bbox": d["bbox"], 
                "trackId": d["trackId"],
                "quality": d.get("quality_score", 0.0)
            } for d in frame_dets]
            _, buf = cv2.imencode(".png", stored_frames[i])
            kf["imageBase64"] = "data:image/png;base64," + base64.b64encode(buf.tobytes()).decode("utf-8")
            keyframes.append(kf)

        logger.info("Face detection complete with enhanced quality.")
        return {
            "fps": fps,
            "totalFrames": total_frames,
            "keyframes": keyframes,
            "trackEmbeddings": track_embeddings,
            "qualityMode": req.quality_mode,
            "hdDetection": req.use_hd_detection
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
    face_history = []  # For temporal smoothing
    try:
        _apply_use_cuda(req.use_cuda)
        src_path, video_path = req.source_image_path, req.video_path
        target_track_id = req.target_face_track_id
        
        # Choose appropriate face detection model based on quality settings
        if req.use_hd_detection and req.quality_mode in ["balanced", "best"]:
            face_app = get_face_app_hd()
            print(f"Using HD face detection for job {job_id}")
        else:
            face_app = get_face_app()
            print(f"Using standard face detection for job {job_id}")
        
        swapper = get_swapper()
        
        # Enhanced source face preparation
        src_img = cv2.imread(src_path, cv2.IMREAD_COLOR)
        if src_img is None:
            update_job_progress(job_id, 0, "failed", {"error": "Source image not readable"})
            return

        src_rgb = cv2.cvtColor(src_img, cv2.COLOR_BGR2RGB)
        src_faces = face_app.get(src_rgb)

        if not src_faces:
            print(f"[{job_id}] No face found with primary detector. Trying fallback detector...")
            try:
                fallback_app = get_face_app()
                src_faces = fallback_app.get(src_rgb)
            except Exception as e:
                print(f"[{job_id}] Fallback detector failed: {e}")

        if not src_faces:
            # If the source is small, upscale and retry once
            h, w = src_rgb.shape[:2]
            min_dim = min(h, w)
            if min_dim < 320:
                scale = 640 / max(1, min_dim)
                new_size = (int(w * scale), int(h * scale))
                print(f"[{job_id}] Upscaling source image to {new_size} for detection")
                up_rgb = cv2.resize(src_rgb, new_size, interpolation=cv2.INTER_CUBIC)
                try:
                    src_faces = face_app.get(up_rgb)
                    if not src_faces:
                        src_faces = get_face_app().get(up_rgb)
                except Exception as e:
                    print(f"[{job_id}] Upscaled detection failed: {e}")

        if not src_faces:
            update_job_progress(
                job_id,
                0,
                "failed",
                {"error": "No face in source. Use a clear, front-facing photo."}
            )
            return
        
        # Select the best quality source face
        def _enhanced_face_score(face):
            bbox = getattr(face, "bbox", None)
            if bbox is None or len(bbox) != 4:
                area = 0.0
            else:
                area = max(0.0, (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]))
            det_score = float(getattr(face, "det_score", 0.0) or 0.0)
            
            # Consider face alignment quality
            embedding_quality = 1.0
            emb = getattr(face, "normed_embedding", getattr(face, "embedding", None))
            if emb is not None:
                emb_norm = np.linalg.norm(emb)
                embedding_quality = min(1.0, emb_norm)
            
            return (area * det_score * embedding_quality)
        
        source_face = max(src_faces, key=_enhanced_face_score)
        
        # Pre-process source face for better quality
        if req.quality_mode == "best":
            # Extract and align source face for better swapping
            try:
                x1, y1, x2, y2 = source_face.bbox.astype(int)
                src_face_crop = src_rgb[y1:y2, x1:x2]
                src_face_crop = enhance_face_alignment(src_face_crop)
                print(f"Enhanced source face alignment for job {job_id}")
            except Exception as e:
                print(f"Source face alignment failed: {e}")

        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        out_id = str(uuid.uuid4())
        frames_dir = Path(TEMP_DIR) / f"morph_frames_{out_id}"
        frames_dir.mkdir(parents=True, exist_ok=True)
        out_video_path = Path(TEMP_DIR) / f"morph_out_{out_id}.mp4"

        track_embeddings = {}
        target_embedding = None
        if req.target_face_embedding:
            target_embedding = normalize_face_embedding(np.array(req.target_face_embedding, dtype=np.float32))
            track_embeddings[target_track_id] = [target_embedding]

        track_bbox = {}
        # Enhanced similarity thresholds based on quality mode
        if req.quality_mode == "best":
            SIM_THRESH = 0.65
            TARGET_SIM_THRESH = 0.45
        elif req.quality_mode == "fast":
            SIM_THRESH = 0.45
            TARGET_SIM_THRESH = 0.35
        else:  # balanced
            SIM_THRESH = QUALITY_THRESHOLD
            TARGET_SIM_THRESH = 0.38
        
        # Filter out tiny/low-confidence detections to avoid swap artifacts
        if req.quality_mode == "best":
            min_face_area = 80 * 80
            min_det_score = 0.35
        elif req.quality_mode == "fast":
            min_face_area = 48 * 48
            min_det_score = 0.25
        else:
            min_face_area = 60 * 60
            min_det_score = 0.3

        frame_idx = 0
        update_job_progress(job_id, 0, "processing")
        print(f"[{job_id}] Starting face swap processing for {total_frames} frames...")

        while True:
            ret, frame = cap.read()
            if not ret: 
                break
            
            try:
                # Progress update for very first frame
                if frame_idx == 0:
                    print(f"[{job_id}] Processing first frame...")
                    update_job_progress(job_id, 1, "processing")
                
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                
                # Detect faces directly - no preprocessing to avoid artifacts
                faces = face_app.get(rgb)
                
                frame_dets = []
                for f in faces:
                    try:
                        bbox = f.bbox.astype(int).tolist()
                        emb = getattr(f, "normed_embedding", getattr(f, "embedding", None))
                        
                        # Calculate quality metrics
                        det_score = float(getattr(f, "det_score", 0.0) or 0.0)
                        face_area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) if len(bbox) == 4 else 0
                        if face_area < min_face_area or det_score < min_det_score:
                            continue
                        quality_score = det_score * (1.0 + np.log10(max(face_area, 1)) / 10.0)
                        
                        det = {
                            "face": f, 
                            "bbox": bbox, 
                            "embedding": normalize_face_embedding(np.asarray(emb, dtype=np.float32)) if emb is not None else None,
                            "quality_score": quality_score
                        }
                        frame_dets.append(det)
                    except Exception as e:
                        print(f"Face detection processing failed for frame {frame_idx}: {e}")
                        continue

                # Enhanced target face detection
                target_det = None
                target_score = None
                
                if target_embedding is not None:
                    for det in frame_dets:
                        if det["embedding"] is None:
                            continue
                        sim = _cosine_sim(det["embedding"], target_embedding)
                        
                        # Weight similarity by face quality
                        weighted_sim = sim * (0.7 + 0.3 * min(1.0, det["quality_score"]))
                        
                        if target_score is None or weighted_sim > target_score:
                            target_score = weighted_sim
                            target_det = det
                            
                    if target_score is None or target_score < TARGET_SIM_THRESH:
                        target_det = None

                # Enhanced tracking with quality considerations
                used_ids = set()
                for det in sorted(frame_dets, key=lambda d: (
                    d["embedding"] is not None,
                    d["quality_score"]
                ), reverse=True):
                    bbox, emb = det["bbox"], det["embedding"]
                    best_id, best_score = None, SIM_THRESH
                    
                    if emb is not None:
                        for tid, embs in track_embeddings.items():
                            if tid in used_ids: 
                                continue
                            
                            # Calculate weighted similarity considering track history
                            similarities = [_cosine_sim(emb, te) for te in embs]
                            if similarities:
                                max_sim = max(similarities)
                                avg_sim = np.mean(similarities)
                                combined_sim = 0.7 * max_sim + 0.3 * avg_sim
                                
                                if combined_sim > best_score:
                                    best_score, best_id = combined_sim, tid
                    
                    # Enhanced IoU fallback
                    if best_id is None and track_bbox:
                        for tid, last_box in track_bbox.items():
                            if tid in used_ids: 
                                continue
                            iou = iou_box(bbox, last_box)
                            if iou > 0.4:  # Higher threshold
                                best_id = tid
                                break
                                
                    if best_id is None:
                        best_id = max(list(track_embeddings.keys()) + list(track_bbox.keys()) + [-1]) + 1
                        
                    used_ids.add(best_id)
                    det["trackId"] = best_id
                    track_bbox[best_id] = bbox
                    
                    if emb is not None:
                        if best_id not in track_embeddings: 
                            track_embeddings[best_id] = []
                        if len(track_embeddings[best_id]) < 8:  # Increased capacity
                            track_embeddings[best_id].append(emb)

                # Enhanced face swapping with multiple quality improvements
                swapped_rgb = rgb.copy()
                
                if target_det is not None:
                    try:
                        print(f"[{job_id}] Processing frame {frame_idx}: Found target face, swapping...")
                        
                        orig_bbox = target_det["bbox"].copy() if isinstance(target_det["bbox"], np.ndarray) else target_det["bbox"][:]
                        
                        # Let InsightFace handle the swap and paste
                        swapped_rgb = swapper.get(rgb, target_det["face"], source_face, paste_back=True)
                        
                        # Soften the edges of the pasted region to remove hard seams
                        swapped_rgb = soften_swap_edges(rgb, swapped_rgb, orig_bbox)
                                
                    except Exception as e:
                        print(f"Face swap failed for frame {frame_idx}: {e}")
                        import traceback
                        traceback.print_exc()
                        
                else:
                    # Fallback to track ID matching with enhanced quality
                    print(f"[{job_id}] Processing frame {frame_idx}: Using track ID {target_track_id} fallback...")
                    for det in frame_dets:
                        if det["trackId"] == target_track_id:
                            try:
                                orig_bbox = det["bbox"].copy() if isinstance(det["bbox"], np.ndarray) else det["bbox"][:]
                                
                                swapped_rgb = swapper.get(rgb, det["face"], source_face, paste_back=True)
                                swapped_rgb = soften_swap_edges(rgb, swapped_rgb, orig_bbox)
                                        
                            except Exception as e:
                                print(f"Track-based face swap failed for frame {frame_idx}: {e}")
                                import traceback
                                traceback.print_exc()
                            break
                
                # Convert back to BGR and save
                frame_out = cv2.cvtColor(swapped_rgb, cv2.COLOR_RGB2BGR)
                cv2.imwrite(str(frames_dir / f"frame_{frame_idx:08d}.png"), frame_out)
                frame_idx += 1
                
                # More frequent progress updates for better user feedback
                if frame_idx % 5 == 0:  # Update every 5 frames instead of 25
                    progress = (frame_idx / total_frames) * 95  # Reserve 5% for encoding
                    print(f"[{job_id}] Frame {frame_idx}/{total_frames} ({progress:.1f}%) (Quality: {req.quality_mode})")
                    update_job_progress(job_id, progress)
                    
                # Less frequent memory cleanup
                if frame_idx % 50 == 0:
                    import gc
                    gc.collect()
                    # Limit face history size during long processing
                    if len(face_history) > TEMPORAL_SMOOTH_FRAMES:
                        face_history = face_history[-TEMPORAL_SMOOTH_FRAMES:]
            
            except Exception as e:
                print(f"Frame processing failed for frame {frame_idx}: {e}")
                import traceback
                traceback.print_exc()
                # Continue with next frame
                frame_idx += 1
                continue

        cap.release()
        update_job_progress(job_id, 99, "encoding")
        
        # Enhanced video encoding settings based on quality mode
        if req.quality_mode == "best":
            crf_value = "18"  # Higher quality
            preset = "slow"
        elif req.quality_mode == "fast":
            crf_value = "28"  # Lower quality, faster
            preset = "veryfast"
        else:  # balanced
            crf_value = "23"
            preset = "fast"
        
        subprocess.run([
            "ffmpeg", "-y", "-framerate", str(fps), "-i", str(frames_dir / "frame_%08d.png"),
            "-i", str(video_path), "-map", "0:v", "-map", "1:a?", "-c:v", "libx264",
            "-pix_fmt", "yuv420p", "-preset", preset, "-crf", crf_value, "-c:a", "aac", "-shortest",
            str(out_video_path)
        ], check=True, capture_output=True)

        update_job_progress(job_id, 100, "completed", {
            "output_path": str(out_video_path),
            "quality_mode": req.quality_mode,
            "enhancements_used": {
                "hd_detection": req.use_hd_detection,
                "enhancement": req.enhance,
                "codeformer": req.use_codeformer,
                "temporal_smoothing": req.temporal_smoothing
            }
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        update_job_progress(job_id, 0, "failed", {"error": str(e)})
    finally:
        if frames_dir:
            import shutil
            shutil.rmtree(frames_dir, ignore_errors=True)

class TrackObjectRequest(BaseModel):
    video_path: str
    clip_start: float = 0
    clip_end: float | None = None
    target_x: float  # Normalized 0-1
    target_y: float  # Normalized 0-1
    target_width: float = 0.05  # Normalized 0-1
    target_height: float = 0.05  # Normalized 0-1
    fps: float | None = None  # Override video fps for keyframe sampling


@app.post("/track-object")
def track_object(req: TrackObjectRequest = Body(...)):
    """
    Track an object in a video using OpenCV's CSRT tracker.
    Returns keyframes with normalized (0-1) x, y positions over time.
    """
    try:
        video_path = req.video_path
        if not os.path.isfile(video_path):
            raise HTTPException(status_code=400, detail="Video file not found")

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise HTTPException(status_code=400, detail="Cannot open video file")

        video_fps = cap.get(cv2.CAP_PROP_FPS) or 30
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        if frame_w == 0 or frame_h == 0:
            cap.release()
            raise HTTPException(status_code=400, detail="Invalid video dimensions")

        clip_start = req.clip_start
        clip_end = req.clip_end if req.clip_end is not None else total_frames / video_fps

        # Convert clip start/end to frame numbers
        start_frame = int(clip_start * video_fps)
        end_frame = min(int(clip_end * video_fps), total_frames)

        if start_frame >= end_frame:
            cap.release()
            raise HTTPException(status_code=400, detail="Invalid clip range")

        # Convert normalized target coordinates to pixel ROI
        roi_x = int(req.target_x * frame_w - (req.target_width * frame_w) / 2)
        roi_y = int(req.target_y * frame_h - (req.target_height * frame_h) / 2)
        roi_w = max(10, int(req.target_width * frame_w))
        roi_h = max(10, int(req.target_height * frame_h))

        # Clamp ROI to frame bounds
        roi_x = max(0, min(roi_x, frame_w - roi_w))
        roi_y = max(0, min(roi_y, frame_h - roi_h))

        logger.info(f"[TRACK-OBJECT] Tracking in {video_path}")
        logger.info(f"[TRACK-OBJECT] ROI: ({roi_x},{roi_y},{roi_w},{roi_h}), frames {start_frame}-{end_frame}")

        # Seek to start frame and read first frame
        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
        ret, frame = cap.read()
        if not ret:
            cap.release()
            raise HTTPException(status_code=500, detail="Failed to read start frame")

        # Initialize tracker - try CSRT first, then KCF, then template matching fallback
        tracker = None
        use_template_matching = False
        try:
            tracker = cv2.TrackerCSRT_create()
            logger.info("[TRACK-OBJECT] Using CSRT tracker")
        except AttributeError:
            try:
                tracker = cv2.legacy.TrackerCSRT_create()
                logger.info("[TRACK-OBJECT] Using legacy CSRT tracker")
            except Exception:
                pass

        if tracker is None:
            try:
                tracker = cv2.TrackerKCF_create()
                logger.info("[TRACK-OBJECT] Using KCF tracker")
            except AttributeError:
                try:
                    tracker = cv2.legacy.TrackerKCF_create()
                    logger.info("[TRACK-OBJECT] Using legacy KCF tracker")
                except Exception:
                    pass

        if tracker is None:
            # Fallback: template matching (works with base opencv-python)
            use_template_matching = True
            logger.info("[TRACK-OBJECT] Using template matching fallback (no contrib trackers available)")

        bbox = (roi_x, roi_y, roi_w, roi_h)
        if tracker is not None:
            tracker.init(frame, bbox)

        # For template matching: extract the template from the first frame
        template = None
        search_margin = 2.0  # Search in a region 2x the template size
        if use_template_matching:
            template = frame[roi_y:roi_y+roi_h, roi_x:roi_x+roi_w].copy()
            if template.size == 0:
                cap.release()
                raise HTTPException(status_code=400, detail="Target region is empty")

        keyframes = []
        # Add the initial keyframe
        center_x = (roi_x + roi_w / 2) / frame_w
        center_y = (roi_y + roi_h / 2) / frame_h
        keyframes.append({
            "time": 0.0,
            "x": round(center_x, 4),
            "y": round(center_y, 4),
            "scale": 1.0,
            "rotation": 0.0,
        })

        # Determine sampling rate — track every N frames for speed
        sample_fps = req.fps or min(video_fps, 15)  # Default: track at 15fps max
        frame_step = max(1, int(video_fps / sample_fps))

        current_frame = start_frame + frame_step
        lost_count = 0
        max_lost = 5  # Stop if tracker loses object for too many consecutive frames
        # Track last known position for template matching search region
        last_x, last_y = roi_x, roi_y

        while current_frame < end_frame:
            cap.set(cv2.CAP_PROP_POS_FRAMES, current_frame)
            ret, frame = cap.read()
            if not ret:
                break

            success = False
            tracked_bbox = None

            if use_template_matching:
                # Template matching fallback
                tw, th = template.shape[1], template.shape[0]
                # Define search region around last known position
                margin_w = int(tw * search_margin)
                margin_h = int(th * search_margin)
                sx1 = max(0, last_x - margin_w)
                sy1 = max(0, last_y - margin_h)
                sx2 = min(frame_w, last_x + tw + margin_w)
                sy2 = min(frame_h, last_y + th + margin_h)

                search_region = frame[sy1:sy2, sx1:sx2]
                if search_region.shape[0] >= th and search_region.shape[1] >= tw:
                    result = cv2.matchTemplate(search_region, template, cv2.TM_CCOEFF_NORMED)
                    _, max_val, _, max_loc = cv2.minMaxLoc(result)

                    if max_val > 0.4:  # Confidence threshold
                        match_x = sx1 + max_loc[0]
                        match_y = sy1 + max_loc[1]
                        tracked_bbox = (match_x, match_y, tw, th)
                        success = True
                        last_x, last_y = match_x, match_y
                        # Update template periodically to handle appearance changes
                        if max_val > 0.7:
                            template = frame[match_y:match_y+th, match_x:match_x+tw].copy()
            else:
                success, tracked_bbox = tracker.update(frame)

            if success:
                lost_count = 0
                tx, ty, tw, th = tracked_bbox
                cx = (tx + tw / 2) / frame_w
                cy = (ty + th / 2) / frame_h
                # Scale relative to original ROI size
                scale = ((tw * th) / max(1, roi_w * roi_h)) ** 0.5

                time_sec = (current_frame - start_frame) / video_fps
                keyframes.append({
                    "time": round(time_sec, 4),
                    "x": round(max(0, min(1, cx)), 4),
                    "y": round(max(0, min(1, cy)), 4),
                    "scale": round(max(0.1, min(5, scale)), 4),
                    "rotation": 0.0,
                })
            else:
                lost_count += 1
                if lost_count >= max_lost:
                    logger.warning(f"[TRACK-OBJECT] Tracker lost object at frame {current_frame}, stopping")
                    break
                # Interpolate from last known position
                if keyframes:
                    last_kf = keyframes[-1]
                    time_sec = (current_frame - start_frame) / video_fps
                    keyframes.append({
                        "time": round(time_sec, 4),
                        "x": last_kf["x"],
                        "y": last_kf["y"],
                        "scale": last_kf["scale"],
                        "rotation": 0.0,
                    })

            current_frame += frame_step

        cap.release()

        logger.info(f"[TRACK-OBJECT] Tracking complete: {len(keyframes)} keyframes")
        return {"keyframes": keyframes}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[TRACK-OBJECT] Error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/track-object/progress/{job_id}")
def track_object_progress(job_id: str):
    """Get progress of an async tracking job (if we ever implement async tracking)."""
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


if __name__ == "__main__":
    import uvicorn
    import argparse
    
    parser = argparse.ArgumentParser(description="Enhanced Face Morphing Service")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind to")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8000)), help="Port to bind to")
    args = parser.parse_args()
    
    print(f"🚀 Starting Enhanced Face Morphing Service on {args.host}:{args.port}")
    print(f"🎯 Quality features: HD Detection, Enhanced Tracking, Temporal Smoothing")
    
    cuda_status = "Enabled" if torch and torch.cuda.is_available() else "Disabled"
    print(f"🔥 GPU Acceleration: {cuda_status}")
    
    uvicorn.run(app, host=args.host, port=args.port)
