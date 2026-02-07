# Video Morph Service

Python service for face detection and face swap used by Vidzaro's Video Morph feature. Uses [InsightFace](https://github.com/deepinsight/insightface) for swapping and [GFPGAN](https://github.com/TencentARC/GFPGAN) for high-definition face restoration.

## Features

- **Face Detection & Tracking**: Automatically identifies and tracks faces throughout the video.
- **High-Quality Swap**: Uses InSwapper-128 for seamless face replacement.
- **Face Enhancement**: Integrated GFPGAN for sharpening and restoring high-frequency details (eyes, teeth, skin texture) in the swapped faces.
- **Audio Preservation**: Automatically carries over the original video's audio to the morphed result.
- **Async Job Architecture**: Handles long processing tasks in the background without timing out.
- **Full GPU Acceleration**: Optimized for NVIDIA RTX GPUs using CUDA 12.

## Requirements

- **Python 3.10+**
- **FFmpeg** on PATH (essential for audio merging and video encoding)
- **NVIDIA GPU** (RTX 30-series or 40-series recommended): 8GB+ VRAM is ideal.
- **NVIDIA Drivers**: Latest Game Ready or Studio drivers.

## Install

1. Create a virtual environment:
   ```bash
   cd morph-service
   python -m venv .venv
   .venv\Scripts\activate  # Windows
   ```

2. Install the core dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. **IMPORTANT: Proper CUDA Support for Enhancement**  
   To ensure GFPGAN uses your GPU, you must install the CUDA-enabled version of PyTorch:
   ```bash
   pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124 --force-reinstall
   ```

## Model Download

Run the download script once to fetch necessary AI models:
```bash
python download_models.py
```
This script downloads:
- **InsightFace (buffalo_s)**: Detection model.
- **InSwapper-128**: Swapping model (fallback to Hugging Face if official link is down).
- **GFPGAN v1.4**: Restoration model (downloaded automatically on first use if not present).

## Run

```bash
# Activation
.\.venv\Scripts\Activate.ps1

# Start the service
python main.py
```
The service will listen on `http://localhost:8000`.

## Architecture & Integration

### Async Flow
When a morph request is sent, the service returns a `jobId` immediately and starts processing in a background thread. The Vidzaro backend polls the `/progress/:jobId` endpoint. Once progress reaches 100%, the backend ingests the final file from the temp directory into the Vidzaro library.

### Development Utilities
- `test_detect.py`: Verifies that the model can load and utilize CUDA on your local machine.
- `morph_service.log`: Tracks detailed processing logs and errors.

## Troubleshooting

- **Missing DLLs (cublasLt64_12.dll)**: The service automatically maps the CUDA libraries installed via pip. If you still see errors, ensure you are running `python main.py` within the activated `.venv`.
- **GFPGAN Load Error**: We use a custom monkey-patch for `torchvision` compatibility. If you see `No module named torchvision.transforms.functional_tensor`, ensure you are using the latest `main.py` which includes the fix.
- **OOM (Out of Memory)**: For very long videos (2000+ frames), the service runs `gc.collect()` every 100 frames to keep RAM usage stable. Ensure your system has at least 16GB RAM for long jobs.
