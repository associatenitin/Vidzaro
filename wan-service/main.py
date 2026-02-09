"""
Wan 2.1 Gen AI service: Text-to-Video generation using Wan2.1-T2V-1.3B.
Endpoints: POST /generate, GET /progress/:jobId, GET /health
"""
import os
import sys
import uuid
import tempfile
import threading
import traceback
from pathlib import Path
import logging

from fastapi import BackgroundTasks, FastAPI, HTTPException, Body
from pydantic import BaseModel

# Configure logging
wan_log_file = Path(__file__).parent / "wan_service.log"
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler(wan_log_file),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Wan 2.1 Gen AI Service")

# Global state for tracking job progress
_jobs = {}
_jobs_lock = threading.Lock()

# Duration (seconds) -> num_frames at 15 fps (Wan default)
DURATION_TO_FRAMES = {3: 45, 5: 81, 8: 129}

DEFAULT_NEGATIVE_PROMPT = (
    "Bright tones, overexposed, static, blurred details, subtitles, style, works, "
    "paintings, images, static, overall gray, worst quality, low quality, JPEG compression "
    "residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, "
    "deformed, disfigured, misshapen limbs, fused fingers, still picture, messy background, "
    "three legs, many people in the background, walking backwards"
)


def update_job_progress(job_id: str, progress: float, status: str = "processing", result: dict = None):
    with _jobs_lock:
        _jobs[job_id] = {
            "progress": round(progress, 2),
            "status": status,
            "result": result,
            "updated_at": os.times()[4] if hasattr(os, "times") else 0,
        }


class GenerateRequest(BaseModel):
    mode: str = "text-to-video"  # text-to-video | image-to-video
    prompt: str
    negative_prompt: str | None = None
    image_path: str | None = None  # For I2V
    duration: int = 5  # 3, 5, 8 seconds
    guidance_scale: float = 6.0
    use_cuda: bool = True
    low_vram: bool = False  # offload_model + t5_cpu for 8GB GPUs
    job_id: str | None = None


def _run_t2v_inference(job_id: str, req: GenerateRequest):
    """Run T2V inference in background."""
    output_path = None
    try:
        update_job_progress(job_id, 0, "starting")
        logger.info(f"Starting T2V generation for job {job_id}")

        num_frames = DURATION_TO_FRAMES.get(req.duration, 81)
        negative = req.negative_prompt or DEFAULT_NEGATIVE_PROMPT

        if req.mode == "image-to-video":
            update_job_progress(job_id, 0, "error", {"error": "Image-to-Video requires 14B model. Use Text-to-Video for now."})
            return

        update_job_progress(job_id, 5, "loading_model")

        import torch
        from diffusers import AutoencoderKLWan, WanPipeline
        from diffusers.utils import export_to_video

        model_id = "Wan-AI/Wan2.1-T2V-1.3B-Diffusers"
        device = "cuda" if (req.use_cuda and torch.cuda.is_available()) else "cpu"
        dtype = torch.bfloat16 if device == "cuda" else torch.float32

        logger.info(f"Loading Wan 2.1 T2V model: {model_id}, device={device}")

        vae = AutoencoderKLWan.from_pretrained(model_id, subfolder="vae", torch_dtype=torch.float32)
        pipe = WanPipeline.from_pretrained(model_id, vae=vae, torch_dtype=dtype)

        if device == "cuda":
            if req.low_vram:
                pipe.enable_model_cpu_offload()
                logger.info("Low VRAM mode: model CPU offload enabled")
            else:
                pipe = pipe.to("cuda")

        update_job_progress(job_id, 15, "generating")

        output_dir = Path(tempfile.mkdtemp(prefix="wan_gen_"))
        output_path = output_dir / "output.mp4"

        num_inference_steps = 50  # WanPipeline default
        progress_range = (15, 90)  # generating phase: 15% -> 90%

        def progress_callback(pipe, step_index, timestep, callback_kwargs):
            # Update progress from 15% to 90% across denoising steps
            step_progress = (step_index + 1) / num_inference_steps
            pct = progress_range[0] + step_progress * (progress_range[1] - progress_range[0])
            update_job_progress(job_id, pct, "generating")
            return callback_kwargs

        logger.info(f"Generating: {req.prompt[:80]}...")
        output = pipe(
            prompt=req.prompt,
            negative_prompt=negative,
            height=480,
            width=832,
            num_frames=num_frames,
            guidance_scale=req.guidance_scale,
            num_inference_steps=num_inference_steps,
            callback_on_step_end=progress_callback,
        ).frames[0]

        update_job_progress(job_id, 90, "encoding")
        export_to_video(output, str(output_path), fps=15)

        update_job_progress(
            job_id,
            100,
            "completed",
            {"output_path": str(output_path), "num_frames": num_frames},
        )
        logger.info(f"T2V generation complete: {output_path}")

    except Exception as e:
        logger.error(f"T2V generation error: {traceback.format_exc()}")
        update_job_progress(job_id, 0, "error", {"error": str(e)})


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/progress/{job_id}")
def get_progress(job_id: str):
    with _jobs_lock:
        job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.post("/generate")
def generate(background_tasks: BackgroundTasks, req: GenerateRequest = Body(...)):
    job_id = req.job_id or str(uuid.uuid4())
    update_job_progress(job_id, 0, "queued")
    background_tasks.add_task(_run_t2v_inference, job_id, req)
    return {"jobId": job_id, "status": "queued"}


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("WAN_SERVICE_PORT", "8003"))
    uvicorn.run(app, host="0.0.0.0", port=port)
