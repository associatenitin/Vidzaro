# Start Wan 2.1 Gen AI Service
$port = if ($env:WAN_SERVICE_PORT) { $env:WAN_SERVICE_PORT } else { "8003" }
Write-Host "Starting Wan Gen AI Service on port $port..." -ForegroundColor Cyan
python -m uvicorn main:app --host 0.0.0.0 --port $port
