# Auto Captions Service

Speech-to-text transcription service for Vidzaro, powered by [faster-whisper](https://github.com/SYSTRAN/faster-whisper) (a CTranslate2 reimplementation of OpenAI Whisper).

## Features

- **Speech-to-text** - Transcribes a clip's audio into timed segments (start, end, text)
- **Quality modes** - Fast (`tiny`), Balanced (`base`), Best (`small`) model sizes
- **GPU acceleration** - CUDA support, with automatic fallback to CPU
- **Language auto-detect** - Or pass an explicit language code

## Installation

### Prerequisites

- Python 3.10+
- FFmpeg installed and in PATH (used to extract the audio slice)
- CUDA 12+ (optional, for GPU acceleration)

### Install Dependencies

```bash
cd caption-service
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
```

Whisper model weights are downloaded automatically (and cached) by faster-whisper on first use for each quality mode.

## Running the Service

```bash
python main.py
```

Or with a custom port:

```bash
CAPTION_SERVICE_PORT=8005 python main.py
```

The service starts on `http://localhost:8004` by default (morph=8000, deblur=8002, wan=8003).

### Environment Variables

- `CAPTION_SERVICE_PORT` - Port to run the service on (default: 8004)

## API Endpoints

### POST /transcribe

Transcribe a slice of a video's audio track.

**Request Body:**
```json
{
  "video_path": "/path/to/video.mp4",
  "job_id": "optional-job-id",
  "start": 0,
  "end": 12.5,
  "use_cuda": true,
  "quality_mode": "balanced",
  "language": null
}
```

`start`/`end` are seconds within the source file; omit `end` (or pass `null`) to transcribe to the end of the file.

**Response:**
```json
{
  "jobId": "job-id",
  "status": "queued"
}
```

### GET /progress/:jobId

Get transcription progress.

**Response (completed):**
```json
{
  "progress": 100,
  "status": "completed",
  "result": {
    "segments": [
      { "start": 0.0, "end": 2.4, "text": "Hello and welcome." }
    ],
    "language": "en",
    "quality_mode": "balanced"
  }
}
```

### GET /health

Health check endpoint.

## Quality Modes

- **fast** - `tiny` model, quickest, lower accuracy
- **balanced** - `base` model, good quality/speed trade-off (recommended)
- **best** - `small` model, higher accuracy, slower

## Notes

- Segment timestamps are relative to `start` (i.e. 0-based within the requested slice), not the original file.
- If CUDA is requested but unavailable, the service automatically falls back to CPU.
