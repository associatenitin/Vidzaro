# Video Deblur Service

AI-powered video clarity enhancement service for Vidzaro.

## Features

- **FFmpeg-based sharpening** - Fast, real-time sharpening using unsharp filter (fallback)
- **AI-based enhancement** - Advanced video restoration using RealBasicVSR (when available)
- **Quality modes** - Fast, Balanced, Best
- **GPU acceleration** - CUDA support for faster processing

## Installation

### Prerequisites

- Python 3.10+
- FFmpeg installed and in PATH
- CUDA 12.4+ (optional, for GPU acceleration)

### Install Dependencies

```bash
cd deblur-service
pip install -r requirements.txt
```

### Download Models (Optional)

If using RealBasicVSR, download the models:

```bash
# RealBasicVSR models will be downloaded automatically on first use
# Or download manually from: https://github.com/ckkelvinchan/RealBasicVSR
```

## Running the Service

### Start the Service

```bash
python main.py
```

Or with custom port:

```bash
DEBLUR_SERVICE_PORT=8001 python main.py
```

The service will start on `http://localhost:8002` by default (morph service uses 8000).

### Environment Variables

- `DEBLUR_SERVICE_PORT` - Port to run the service on (default: 8002)

## API Endpoints

### POST /enhance

Enhance video clarity.

**Request Body:**
```json
{
  "video_path": "/path/to/video.mp4",
  "job_id": "optional-job-id",
  "use_cuda": true,
  "quality_mode": "balanced"
}
```

**Response:**
```json
{
  "jobId": "job-id",
  "status": "queued"
}
```

### GET /progress/:jobId

Get enhancement progress.

**Response:**
```json
{
  "progress": 45.5,
  "status": "processing_frames",
  "result": {
    "frames_processed": 450,
    "total_frames": 1000
  }
}
```

### GET /health

Health check endpoint.

## Quality Modes

- **fast** - Quick processing with basic sharpening
- **balanced** - Good quality/speed trade-off (recommended)
- **best** - Maximum quality with all enhancements

## GPU Requirements

- **Minimum**: 4GB VRAM for 720p videos
- **Recommended**: 8GB+ VRAM for 1080p+ videos
- **CPU fallback**: Available if GPU is not detected

## Notes

- The service falls back to FFmpeg unsharp filter if RealBasicVSR is not available
- Processing speed: ~0.1-0.5x real-time depending on quality mode and hardware
- Enhanced videos are saved to the same directory as the input video
