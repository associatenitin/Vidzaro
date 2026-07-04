"""
Auto Captions service: speech-to-text transcription using faster-whisper.
Endpoints: POST /transcribe, GET /progress/:jobId, GET /health
"""
import os
import sys
import json
import tempfile
import subprocess
import shutil
import uuid
import traceback
from pathlib import Path
import logging

from fastapi import BackgroundTasks, FastAPI, HTTPException, Body
from pydantic import BaseModel

# Configure logging
caption_log_file = Path(__file__).parent / "caption_service.log"
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(caption_log_file),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Auto Captions Service")

# Global state for tracking job progress
_jobs = {}

def update_job_progress(job_id: str, progress: float, status: str = "processing", result: dict = None):
    _jobs[job_id] = {
        "progress": round(progress, 2),
        "status": status,
        "result": result,
        "updated_at": os.times()[4] if hasattr(os, 'times') else 0
    }

# Quality mode -> faster-whisper model size (kept small/CPU-friendly by default)
QUALITY_TO_MODEL_SIZE = {
    "fast": "tiny",
    "balanced": "base",
    "best": "small",
}

# Lazy-loaded, cached faster-whisper models keyed by (model_size, device, compute_type)
_models = {}

def get_whisper_model(quality_mode: str, use_cuda: bool):
    """Lazy load (and cache) a faster-whisper model for the requested quality/device."""
    model_size = QUALITY_TO_MODEL_SIZE.get(quality_mode, "base")
    device = "cuda" if use_cuda else "cpu"
    compute_type = "float16" if device == "cuda" else "int8"
    cache_key = (model_size, device, compute_type)

    if cache_key not in _models:
        from faster_whisper import WhisperModel
        try:
            logger.info(f"Loading faster-whisper model '{model_size}' on {device} ({compute_type})...")
            _models[cache_key] = WhisperModel(model_size, device=device, compute_type=compute_type)
        except Exception as e:
            if device == "cuda":
                logger.warning(f"CUDA model load failed ({e}); falling back to CPU")
                cache_key = (model_size, "cpu", "int8")
                if cache_key not in _models:
                    _models[cache_key] = WhisperModel(model_size, device="cpu", compute_type="int8")
            else:
                raise

    return _models[cache_key]

class TranscribeRequest(BaseModel):
    video_path: str
    job_id: str | None = None
    start: float = 0.0
    end: float | None = None  # None = transcribe to end of file
    use_cuda: bool = True
    quality_mode: str = "balanced"  # "fast", "balanced", "best"
    language: str | None = None  # None = auto-detect

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/progress/{job_id}")
def get_progress(job_id: str):
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@app.post("/transcribe")
def transcribe(background_tasks: BackgroundTasks, req: TranscribeRequest = Body(...)):
    job_id = req.job_id or str(uuid.uuid4())
    update_job_progress(job_id, 0, "starting")
    background_tasks.add_task(_do_transcribe, job_id, req)
    return {"jobId": job_id, "status": "queued"}

def _do_transcribe(job_id: str, req: TranscribeRequest):
    audio_dir = None
    try:
        video_path = Path(req.video_path)
        if not video_path.exists():
            update_job_progress(job_id, 0, "error", {"error": "Video file not found"})
            return

        start = max(0.0, req.start or 0.0)
        end = req.end if (req.end is not None and req.end > start) else None
        duration = (end - start) if end is not None else None

        logger.info(f"Extracting audio for {video_path} [{start}, {end}] (quality: {req.quality_mode})")
        update_job_progress(job_id, 5, "extracting_audio")

        audio_dir = Path(tempfile.mkdtemp(prefix="captions_"))
        audio_path = audio_dir / "audio.wav"

        ffmpeg_cmd = ["ffmpeg", "-y", "-i", str(video_path), "-ss", str(start)]
        if duration is not None:
            ffmpeg_cmd += ["-t", str(duration)]
        ffmpeg_cmd += ["-vn", "-ac", "1", "-ar", "16000", str(audio_path)]

        subprocess.run(ffmpeg_cmd, check=True, capture_output=True)

        update_job_progress(job_id, 15, "loading_model")
        model = get_whisper_model(req.quality_mode, req.use_cuda)

        update_job_progress(job_id, 25, "transcribing")
        segments_iter, info = model.transcribe(
            str(audio_path),
            language=req.language,
            vad_filter=True,
        )

        total_duration = duration if duration is not None else (info.duration or 1)
        segments = []
        for seg in segments_iter:
            segments.append({
                "start": round(seg.start, 3),
                "end": round(seg.end, 3),
                "text": seg.text.strip(),
            })
            progress = 25 + min(70, int((seg.end / total_duration) * 70)) if total_duration else 25
            update_job_progress(job_id, progress, "transcribing", {"segments_so_far": len(segments)})

        update_job_progress(job_id, 100, "completed", {
            "segments": segments,
            "language": info.language,
            "quality_mode": req.quality_mode,
        })

        logger.info(f"Transcription complete: {len(segments)} segments")

    except subprocess.CalledProcessError as e:
        stderr = e.stderr.decode(errors="ignore") if e.stderr else str(e)
        logger.error(f"FFmpeg audio extraction failed: {stderr}")
        update_job_progress(job_id, 0, "error", {"error": f"Audio extraction failed: {stderr[-500:]}"})
    except Exception as e:
        logger.error(f"Transcription error: {traceback.format_exc()}")
        update_job_progress(job_id, 0, "error", {"error": str(e)})
    finally:
        if audio_dir is not None:
            shutil.rmtree(audio_dir, ignore_errors=True)

if __name__ == "__main__":
    import uvicorn
    # Default 8004 so morph (8000), deblur (8002), and wan (8003) don't conflict
    port = int(os.environ.get("CAPTION_SERVICE_PORT", "8004"))
    uvicorn.run(app, host="0.0.0.0", port=port)
