# Quick Test and Start Script

Write-Host "Testing AI Enhancement Setup..." -ForegroundColor Cyan
Write-Host ""

# Test the service startup
Write-Host "Starting deblur service with AI enhancement..." -ForegroundColor Yellow
Write-Host "Watch for these success messages:" -ForegroundColor Gray
Write-Host "  ✅ Loading Real-ESRGAN AI model..." -ForegroundColor Gray  
Write-Host "  ✅ Using device: cuda (or cpu)" -ForegroundColor Gray
Write-Host "  ✅ Real-ESRGAN model loaded successfully" -ForegroundColor Gray
Write-Host ""
Write-Host "Press Ctrl+C to stop the service" -ForegroundColor Yellow
Write-Host ""
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Start the service
python -m uvicorn main:app --host 0.0.0.0 --port 8002
