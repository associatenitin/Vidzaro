@echo off
REM Run morph-service in CPU-only mode (avoids CUDA DLL errors)
set USE_CPU=1
uvicorn main:app --host 0.0.0.0 --port 8000
