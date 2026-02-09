# Stop Deblur Service and Install AI Enhancement
Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " AI Enhancement Installation Script" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Step 1: Stop Python processes
Write-Host "[1/4] Stopping deblur service..." -ForegroundColor Yellow
try {
    $pythonProcesses = Get-Process python -ErrorAction SilentlyContinue | Where-Object {
        $_.MainWindowTitle -like "*uvicorn*" -or $_.Path -like "*deblur*"
    }
    
    if ($pythonProcesses) {
        Write-Host "   Found $($pythonProcesses.Count) Python process(es)" -ForegroundColor Gray
        $pythonProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
        Write-Host "   ✅ Service stopped" -ForegroundColor Green
        Start-Sleep -Seconds 2
    } else {
        Write-Host "   ℹ️  No deblur service found running" -ForegroundColor Gray
    }
} catch {
    Write-Host "   ⚠️  Could not stop process automatically" -ForegroundColor Yellow
    Write-Host "   Please manually stop the deblur service and press Enter..." -ForegroundColor Yellow
    Read-Host
}

Write-Host ""

# Step 2: Install dependencies
Write-Host "[2/4] Installing AI enhancement dependencies..." -ForegroundColor Yellow
Write-Host "   This may take 5-10 minutes (downloading ~1-3 GB)" -ForegroundColor Gray
Write-Host ""

try {
    pip install -r requirements.txt
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "   ✅ Dependencies installed successfully!" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "   ❌ Installation failed! Check errors above." -ForegroundColor Red
        Write-Host "   Try running manually: pip install -r requirements.txt" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "   ❌ Installation error: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 3: Verify installation
Write-Host "[3/4] Verifying installation..." -ForegroundColor Yellow
try {
    python -c "from realesrgan import RealESRGANer; from basicsr.archs.rrdbnet_arch import RRDBNet; import torch; print('✅ All components ready!')"
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ Real-ESRGAN is ready!" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Verification failed" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠️  Verification error: $_" -ForegroundColor Yellow
}

Write-Host ""

# Step 4: Prompt to restart service
Write-Host "[4/4] Ready to start!" -ForegroundColor Yellow
Write-Host ""
Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " Installation Complete!" -ForegroundColor Green
Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Start the deblur service:" -ForegroundColor Gray
Write-Host "     python -m uvicorn main:app --host 0.0.0.0 --port 8002" -ForegroundColor Cyan
Write-Host ""
Write-Host "  2. Test AI enhancement in Vidzaro UI:" -ForegroundColor Gray
Write-Host "     - Upload a video" -ForegroundColor Gray
Write-Host "     - Click 'AI Enhance' button" -ForegroundColor Gray
Write-Host "     - Watch the magic! ✨" -ForegroundColor Gray
Write-Host ""
Write-Host "Start service now? (Y/n): " -ForegroundColor Yellow -NoNewline
$response = Read-Host

if ($response -eq "" -or $response -eq "Y" -or $response -eq "y") {
    Write-Host ""
    Write-Host "Starting deblur service..." -ForegroundColor Green
    Write-Host ""
    python -m uvicorn main:app --host 0.0.0.0 --port 8002
} else {
    Write-Host ""
    Write-Host "Service not started. Run manually when ready:" -ForegroundColor Yellow
    Write-Host "  python -m uvicorn main:app --host 0.0.0.0 --port 8002" -ForegroundColor Cyan
    Write-Host ""
}
