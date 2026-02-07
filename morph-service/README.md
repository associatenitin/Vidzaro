# Video Morph Service

Python service for face detection and face swap used by Vidzaro's Video Morph feature. Uses [InsightFace](https://github.com/deepinsight/insightface) (free, open source).

## Requirements

- **Python 3.10+**
- **FFmpeg** on PATH (same as main Vidzaro)
- **NVIDIA GPU** (optional but recommended): 8GB VRAM (e.g. RTX 4060) is sufficient. With GPU you need CUDA and cuDNN installed; then use `onnxruntime-gpu`.
- **CPU-only**: Install `onnxruntime` instead of `onnxruntime-gpu` in requirements; processing will be slower.

## Install

```bash
cd morph-service
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate

pip install -r requirements.txt
```

## Model download

Run once (recommended):

```bash
python download_models.py
```

This downloads the detection model (buffalo_s) and inswapper_128.onnx. If the official InsightFace download URL for inswapper fails (common), the script automatically falls back to **Hugging Face** (ezioruan/inswapper_128.onnx, ~554 MB).

- **Detection**: Models go to `{MODELS_ROOT}/models/buffalo_s/` (~125 MB).
- **InSwapper**: `{MODELS_ROOT}/models/inswapper_128.onnx` (~554 MB).

**Disk:** ~1–1.5 GB total. If you already have the file, place `inswapper_128.onnx` in `morph-service/models/` and the service will use it.

**Env (optional):**

- `MODELS_ROOT` – Directory that contains a `models/` folder (default: same folder as `main.py`).
- `TEMP_DIR` – Temp directory for frame output (default: system temp).
- `PORT` – HTTP port (default: 8000).
- `INSIGHTFACE_MODEL` – `buffalo_s` or `buffalo_l`.
- `USE_CPU=1` – Use CPU only (avoids CUDA load errors if CUDA 12 DLLs are missing).

## Run

```bash
# From morph-service with venv activated
uvicorn main:app --host 0.0.0.0 --port 8000
```

**To avoid CUDA DLL errors** (e.g. `cublasLt64_12.dll` missing), use CPU-only:

```powershell
# Windows PowerShell
.\run-cpu.ps1
```

```cmd
# Windows CMD
run-cpu.bat
```

```bash
# macOS/Linux
USE_CPU=1 uvicorn main:app --host 0.0.0.0 --port 8000
```

Or:

```bash
python main.py
```

## Endpoints

- **GET /health** – Health check.
- **POST /detect-faces** – Body: `{ "video_path": "/absolute/path/to/video.mp4" }`. Returns keyframes with face bboxes and `trackId` per person.
- **POST /swap** – Body: `{ "source_image_path": "...", "video_path": "...", "target_face_track_id": 0 }`. Returns `{ "output_path": "/path/to/output.mp4" }`.

The Node backend passes absolute paths (from Vidzaro uploads dir) and receives the output path, then copies the file to uploads and returns the new asset to the frontend.

## CUDA / GPU vs CPU

If you see an error like **"cublasLt64_12.dll which is missing"** or **"Error loading ... onnxruntime_providers_cuda.dll"**: ONNX Runtime tried the GPU and fell back to CPU. The service still works; processing will be slower.

**To use GPU (choose one):**

1. **CUDA via pip (recommended if the full toolkit fails to install)**  
   The project already depends on `nvidia-cublas-cu12` and `nvidia-cudnn-cu12`. When you `pip install -r requirements.txt`, these install the CUDA 12 runtime DLLs into your venv. The service adds their paths to `PATH` at startup so `onnxruntime-gpu` can find them. You still need an **NVIDIA driver** (check with `nvidia-smi`), but you do **not** need to install the full CUDA 12 Toolkit or set any system PATH. Just install the backend + morph deps and run the service.

2. **Full CUDA 12 Toolkit**  
   Install [CUDA 12](https://developer.nvidia.com/cuda-12-4-0-download-archive) and add its `bin` folder to your system PATH. Use this if you prefer the toolkit or if the pip-based approach does not work on your system.

**To use CPU only:** Set `USE_CPU=1` before running the service or `download_models.py`. Or uninstall GPU runtime and use CPU:  
  `pip uninstall onnxruntime-gpu nvidia-cublas-cu12 nvidia-cudnn-cu12` then `pip install onnxruntime`.

## Resource notes (8GB GPU, 32GB RAM)

- **VRAM**: buffalo_s + inswapper typically use 2–4 GB. If you hit OOM, set `INSIGHTFACE_MODEL=buffalo_s` (already default) and ensure no other heavy GPU apps are running.
- **RAM**: Frames are processed one-by-one; 32 GB is plenty.
- **Long videos**: Processing is frame-by-frame; for very long clips consider limiting duration in the app (e.g. first 2–5 minutes) or processing in chunks.
