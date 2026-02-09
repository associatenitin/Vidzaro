# AI Enhancement Installation Guide

## Step-by-Step Instructions

### Current Situation
✅ Updated `requirements.txt` with Real-ESRGAN (easier to install than RealBasicVSR)
✅ Updated `main.py` to use Real-ESRGAN AI model
⚠️ Need to stop deblur service to install new dependencies

### Installation Steps

#### 1. Stop the Deblur Service

The deblur service is currently running and using OpenCV, which prevents pip from updating the packages. You need to stop it first.

**Option A: Find and stop the deblur service process**
```powershell
# Find the process
Get-Process python | Where-Object {$_.Path -like "*Python312*"} | Select-Object Id, ProcessName, Path

# Stop the deblur service (find the correct process ID from above)
# The one running on port 8002
Stop-Process -Id <PID> -Force

# OR stop all Python processes (nuclear option)
Get-Process python | Stop-Process -Force
```

**Option B: Close the terminal/window running the deblur service**
- If you started it in a separate terminal, just close that window or press Ctrl+C

#### 2. Install Dependencies

Once the service is stopped:

```powershell
cd c:\Users\nitin\source\repos\Vidzaro\deblur-service

# Install the new requirements
pip install -r requirements.txt
```

This will install:
- ✅ **realesrgan** - The AI enhancement library
- ✅ **basicsr** - Basic super-resolution toolkit
- ✅ **torch** - PyTorch (will auto-detect and install CPU or CUDA version)
- ✅ **torchvision** - PyTorch vision utilities
- ✅ Other dependencies

**Note:** The first installation will download:
- PyTorch (~800MB-2GB depending on CPU/CUDA)
- Real-ESRGAN model weights (~60MB, downloaded automatically on first use)
- Other dependencies (~200MB)

**Total download:** ~1-3 GB (one-time)
**Installation time:** ~5-10 minutes

#### 3. Verify Installation

Test if Real-ESRGAN is installed correctly:

```powershell
python -c "from realesrgan import RealESRGANer; print('✅ Real-ESRGAN installed successfully!')"
```

#### 4. Restart the Deblur Service

```powershell
cd c:\Users\nitin\source\repos\Vidzaro\deblur-service

# Start the service
python -m uvicorn main:app --host 0.0.0.0 --port 8002

# OR use the run script if you have one
.\run.ps1
```

You should see:
```
INFO:     Loading Real-ESRGAN AI model...
INFO:     Using device: cuda (or cpu)
INFO:     Real-ESRGAN model loaded successfully
INFO:     Application startup complete
```

#### 5. Test AI Enhancement

Once the service restarts:

1. Open Vidzaro in your browser
2. Upload a video or select an existing one
3. Click on the video clip on the timeline
4. Click "✨ AI Enhance" button
5. Select quality mode and click "Enhance Video"

You should see in the service logs:
```
INFO: Loading Real-ESRGAN AI model...
INFO: Using device: cuda
INFO: Real-ESRGAN model loaded successfully
INFO: Starting enhancement...
INFO: Processing frames with AI...
```

---

## What Changed?

### Before (RealBasicVSR)
- ❌ Package not available on PyPI
- ❌ Complex installation from GitHub
- ❌ Requires MMEditing framework
- ❌ Difficult to set up

### After (Real-ESRGAN)
- ✅ Available on PyPI (`pip install realesrgan`)
- ✅ Simple installation
- ✅ Well-maintained and actively developed
- ✅ Proven results on millions of images/videos
- ✅ Automatic model downloading
- ✅ Better GPU optimization

### Model Capabilities

**Real-ESRGAN (what you're getting now):**
- ✅ AI-powered super-resolution
- ✅ Noise reduction
- ✅ Detail enhancement
- ✅ Artifact removal
- ✅ 4x upscaling with smart downscaling to original size
- ✅ Excellent on real-world videos

---

## Troubleshooting

### "Permission denied" error during pip install
**Problem:** Python process using the files
**Solution:** Stop all Python processes first

```powershell
Get-Process python | Stop-Process -Force
pip install -r requirements.txt
```

### "CUDA not available" warning
**This is OK!** The service will use CPU mode which still works fine, just slower.

**To enable GPU acceleration:**
1. Ensure NVIDIA drivers are installed (`nvidia-smi` to check)
2. PyTorch will automatically use CUDA if available
3. No additional installation needed - torch will auto-detect your GPU

### Service won't start
**Check logs:**
```powershell
cd deblur-service
cat deblur_service.log
```

**Common issues:**
- Port 8002 already in use → Change port or kill the process
- Missing dependencies → Run `pip install -r requirements.txt` again
- Import errors → Check python version (`python --version` should be 3.10+)

---

## Alternative: Quick Install (All Commands)

Copy and paste this entire block after stopping the service:

```powershell
# Navigate to deblur service
cd c:\Users\nitin\source\repos\Vidzaro\deblur-service

# Install dependencies
pip install -r requirements.txt

# Test installation
python -c "from realesrgan import RealESRGANer; from basicsr.archs.rrdbnet_arch import RRDBNet; print('✅ All dependencies installed!')"

# Start service
python -m uvicorn main:app --host 0.0.0.0 --port 8002
```

---

## Expected Results

### Before (FFmpeg Fallback)
- Processing time: ~2 seconds per video
- Method: Simple sharpening filter
- Results: Basic enhancement

### After (Real-ESRGAN AI)
- Processing time: ~30-60 seconds per video (CPU) or ~10-15 seconds (GPU)
- Method: Deep learning super-resolution
- Results: Dramatic quality improvement
  - ✅ Much clearer details
  - ✅ Noise reduction
  - ✅ Better edge enhancement
  - ✅ Artifact removal

---

## Next Steps

1. **Stop the deblur service** (close its terminal or kill the process)
2. **Run:** `pip install -r requirements.txt`
3. **Wait for installation** (~5-10 minutes)
4. **Restart the service:** `python -m uvicorn main:app --host 0.0.0.0 --port 8002`
5. **Test** by enhancing a video in the UI

The AI model will be downloaded automatically on first use (~60MB).

---

**Questions?** Check the logs at `deblur-service/deblur_service.log`
