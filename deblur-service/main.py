"""
Video Deblur service: AI-based video clarity enhancement using RealBasicVSR.
Endpoints: POST /enhance, GET /progress/:jobId
"""
import os
import sys
import json
import base64
import tempfile
import subprocess
import uuid
import traceback
from pathlib import Path
import logging
from fastapi import BackgroundTasks, FastAPI, HTTPException, Body
from pydantic import BaseModel
import cv2
import numpy as np

# Configure logging
deblur_log_file = Path(__file__).parent / "deblur_service.log"
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(deblur_log_file),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Video Deblur Service")

# Global state for tracking job progress
_jobs = {}

def update_job_progress(job_id: str, progress: float, status: str = "processing", result: dict = None):
    _jobs[job_id] = {
        "progress": round(progress, 2),
        "status": status,
        "result": result,
        "updated_at": os.times()[4] if hasattr(os, 'times') else 0
    }

# Lazy loading for RealBasicVSR
_realbasicvsr_model = None

def get_realbasicvsr():
    """Lazy load RealBasicVSR model"""
    global _realbasicvsr_model
    if _realbasicvsr_model is None:
        try:
            from realbasicvsr import RealBasicVSR
            logger.info("Loading RealBasicVSR model...")
            # Initialize with default settings
            # RealBasicVSR can be configured for different quality modes
            _realbasicvsr_model = RealBasicVSR()
            logger.info("RealBasicVSR model loaded successfully")
        except ImportError:
            logger.warning("RealBasicVSR not available, falling back to FFmpeg unsharp")
            return None
        except Exception as e:
            logger.error(f"Failed to load RealBasicVSR: {e}")
            return None
    return _realbasicvsr_model

def enhance_frame_with_ai(frame, model, quality_mode="balanced"):
    """Enhance a single frame using RealBasicVSR"""
    try:
        if model is None:
            # Fallback to simple sharpening if model not available
            return apply_unsharp_fallback(frame)
        
        # Convert BGR to RGB for RealBasicVSR
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # RealBasicVSR expects input in specific format
        # Process frame through model
        enhanced = model.enhance(rgb_frame)
        
        # Convert back to BGR
        if len(enhanced.shape) == 3:
            enhanced_bgr = cv2.cvtColor(enhanced, cv2.COLOR_RGB2BGR)
        else:
            enhanced_bgr = enhanced
        
        return enhanced_bgr
    except Exception as e:
        logger.error(f"AI enhancement failed: {e}")
        # Fallback to unsharp
        return apply_unsharp_fallback(frame)

def apply_unsharp_fallback(frame, strength=1.5):
    """Fallback sharpening using OpenCV unsharp mask"""
    try:
        # Create unsharp mask kernel
        gaussian = cv2.GaussianBlur(frame, (5, 5), 0)
        unsharp = cv2.addWeighted(frame, 1.0 + strength, gaussian, -strength, 0)
        return unsharp
    except Exception as e:
        logger.error(f"Unsharp fallback failed: {e}")
        return frame

class EnhanceRequest(BaseModel):
    video_path: str
    job_id: str | None = None
    use_cuda: bool = True
    quality_mode: str = "balanced"  # "fast", "balanced", "best"

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/progress/{job_id}")
def get_progress(job_id: str):
    logger.info(f"Progress check for job_id: {job_id}, available jobs: {list(_jobs.keys())}")
    job = _jobs.get(job_id)
    if not job:
        logger.warning(f"Job {job_id} not found in _jobs dictionary")
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@app.post("/enhance")
def enhance(background_tasks: BackgroundTasks, req: EnhanceRequest = Body(...)):
    job_id = req.job_id or str(uuid.uuid4())
    update_job_progress(job_id, 0, "starting")
    background_tasks.add_task(_do_enhance, job_id, req)
    return {"jobId": job_id, "status": "queued"}

def _do_enhance(job_id: str, req: EnhanceRequest):
    frames_dir = None
    try:
        # Ensure job is initialized immediately
        update_job_progress(job_id, 0, "starting")
        
        video_path = Path(req.video_path)
        if not video_path.exists():
            update_job_progress(job_id, 0, "error", {"error": "Video file not found"})
            return
        
        logger.info(f"Starting enhancement for {video_path} (quality: {req.quality_mode})")
        update_job_progress(job_id, 5, "loading_model")
        
        # Load model
        model = get_realbasicvsr()
        if model is None:
            logger.warning("RealBasicVSR not available, using FFmpeg unsharp filter")
            # Fallback to FFmpeg-based enhancement
            _do_ffmpeg_enhance(job_id, req)
            return
        
        update_job_progress(job_id, 10, "reading_video")
        
        # Open video
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            update_job_progress(job_id, 0, "error", {"error": "Failed to open video"})
            return
        
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        logger.info(f"Video: {width}x{height} @ {fps}fps, {total_frames} frames")
        
        # Create temporary directory for frames
        frames_dir = Path(tempfile.mkdtemp(prefix="deblur_"))
        logger.info(f"Using temp directory: {frames_dir}")
        
        update_job_progress(job_id, 15, "processing_frames")
        
        # Process frames
        frame_idx = 0
        enhanced_frames = []
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            # Enhance frame
            enhanced_frame = enhance_frame_with_ai(frame, model, req.quality_mode)
            enhanced_frames.append(enhanced_frame)
            
            # Save frame
            frame_path = frames_dir / f"frame_{frame_idx:08d}.png"
            cv2.imwrite(str(frame_path), enhanced_frame)
            
            frame_idx += 1
            
            # Update progress
            if frame_idx % 10 == 0 or frame_idx == total_frames:
                progress = 15 + int((frame_idx / total_frames) * 75)
                update_job_progress(job_id, progress, "processing_frames", {
                    "frames_processed": frame_idx,
                    "total_frames": total_frames
                })
                logger.info(f"Processed {frame_idx}/{total_frames} frames")
        
        cap.release()
        update_job_progress(job_id, 95, "encoding")
        
        # Encode video using FFmpeg
        output_path = frames_dir / "enhanced_output.mp4"
        
        # Determine encoding settings based on quality mode
        if req.quality_mode == "best":
            crf_value = "18"
            preset = "slow"
        elif req.quality_mode == "fast":
            crf_value = "28"
            preset = "veryfast"
        else:  # balanced
            crf_value = "23"
            preset = "fast"
        
        logger.info(f"Encoding video with preset={preset}, crf={crf_value}")
        
        # Get original video for audio
        audio_input = f"-i {video_path}"
        
        subprocess.run([
            "ffmpeg", "-y",
            "-framerate", str(fps),
            "-i", str(frames_dir / "frame_%08d.png"),
            "-i", str(video_path),
            "-map", "0:v",
            "-map", "1:a?",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-preset", preset,
            "-crf", crf_value,
            "-c:a", "aac",
            "-shortest",
            str(output_path)
        ], check=True, capture_output=True)
        
        update_job_progress(job_id, 100, "completed", {
            "output_path": str(output_path),
            "quality_mode": req.quality_mode,
            "frames_processed": frame_idx
        })
        
        logger.info(f"Enhancement complete: {output_path}")
        
    except Exception as e:
        logger.error(f"Enhancement error: {traceback.format_exc()}")
        update_job_progress(job_id, 0, "error", {"error": str(e)})
    finally:
        # Note: Don't delete frames_dir here - let the backend handle cleanup
        pass

def _do_ffmpeg_enhance(job_id: str, req: EnhanceRequest):
    """Fallback enhancement using FFmpeg unsharp filter"""
    try:
        video_path = Path(req.video_path)
        output_path = video_path.parent / f"enhanced_{video_path.stem}.mp4"
        
        logger.info(f"Using FFmpeg unsharp filter for enhancement")
        update_job_progress(job_id, 20, "ffmpeg_processing")
        
        # Determine unsharp strength based on quality mode
        if req.quality_mode == "best":
            la_value = "2.0"
        elif req.quality_mode == "fast":
            la_value = "1.0"
        else:  # balanced
            la_value = "1.5"
        
        subprocess.run([
            "ffmpeg", "-y",
            "-i", str(video_path),
            "-vf", f"unsharp=lx=5:ly=5:la={la_value}:cx=5:cy=5:ca=0.5",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-c:a", "copy",
            str(output_path)
        ], check=True, capture_output=True)
        
        update_job_progress(job_id, 100, "completed", {
            "output_path": str(output_path),
            "quality_mode": req.quality_mode,
            "method": "ffmpeg_unsharp"
        })
        
        logger.info(f"FFmpeg enhancement complete: {output_path}")
        
    except Exception as e:
        logger.error(f"FFmpeg enhancement error: {traceback.format_exc()}")
        update_job_progress(job_id, 0, "error", {"error": str(e)})

if __name__ == "__main__":
    import uvicorn
    # Default 8002 so morph (8000) and deblur don't conflict
    port = int(os.environ.get("DEBLUR_SERVICE_PORT", "8002"))
    uvicorn.run(app, host="0.0.0.0", port=port)
