# Wan 2.1 Gen AI Service

AI-powered text-to-video generation using Wan 2.1 T2V-1.3B for Vidzaro.

## Features

- **Text-to-Video (T2V)** - Generate video clips from text prompts
- **480P output** - 832x480 resolution, ~5 seconds default
- **Consumer GPU support** - ~8GB VRAM (use Low VRAM mode for RTX 4060)
- **Diffusers** - Uses Hugging Face Diffusers WanPipeline

## Prerequisites

- Python 3.10+
- FFmpeg (for export_to_video)
- CUDA 12+ (optional, for GPU acceleration)
- ~8GB VRAM recommended; use Low VRAM mode for 8GB GPUs

## Installation

```bash
cd wan-service
pip install -r requirements.txt
```

Models are downloaded automatically from Hugging Face on first use (~2-3 GB).

## Running

```bash
python main.py
```

Or with custom port:

```bash
WAN_SERVICE_PORT=8003 python main.py
```

Default port: 8003 (morph=8000, deblur=8002)

## API Endpoints

### POST /generate

Start text-to-video generation.

**Body:**
```json
{
  "mode": "text-to-video",
  "prompt": "A cat walks on the grass, realistic",
  "negative_prompt": null,
  "duration": 5,
  "guidance_scale": 6.0,
  "use_cuda": true,
  "low_vram": true,
  "job_id": null
}
```

**Response:**
```json
{
  "jobId": "uuid",
  "status": "queued"
}
```

### GET /progress/:jobId

Get generation progress.

**Response:**
```json
{
  "progress": 45.5,
  "status": "generating",
  "result": null
}
```

On completion:
```json
{
  "progress": 100,
  "status": "completed",
  "result": {
    "output_path": "/tmp/wan_gen_xxx/output.mp4",
    "num_frames": 81
  }
}
```

### GET /health

Health check.

## Low VRAM Mode

For GPUs with 8GB VRAM (e.g. RTX 4060), set `low_vram: true` to enable model CPU offload. Generation will be slower but should avoid OOM.
