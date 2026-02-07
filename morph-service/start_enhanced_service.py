#!/usr/bin/env python3
"""
Enhanced Face Morphing Service Starter with improved progress tracking
"""
import subprocess
import sys
import os
import signal
import psutil
from pathlib import Path

def kill_existing_service():
    """Kill any existing face morphing service processes"""
    print("🔄 Checking for existing service processes...")
    
    killed_any = False
    for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            if proc.info['name'] == 'python.exe' and proc.info['cmdline']:
                cmdline = ' '.join(proc.info['cmdline'])
                if 'main.py' in cmdline and 'morph-service' in cmdline:
                    print(f"   Killing existing process {proc.info['pid']}")
                    proc.terminate()
                    killed_any = True
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    
    if killed_any:
        print("✅ Existing processes terminated")
    else:
        print("✅ No existing processes found")

def main():
    print("🎬 Enhanced Face Morphing Service")
    print("=" * 50)
    
    # Check current directory
    if not Path("main.py").exists():
        print("❌ Please run this script from the morph-service directory")
        sys.exit(1)
    
    # Kill existing services
    kill_existing_service()
    
    print("\n🚀 Starting enhanced face morphing service...")
    print("Features enabled:")
    print("  ✅ HD Face Detection (buffalo_l)")
    print("  ✅ Enhanced Progress Tracking") 
    print("  ✅ Better Error Handling")
    print("  ✅ CUDA GPU Acceleration")
    print("  ✅ Quality Modes (fast/balanced/best)")
    print("  ✅ Temporal Smoothing")
    
    # Start service on port 8001 (since 8000 might be in use)
    try:
        python_exe = Path("C:/Users/nitin/source/repos/Vidzaro/.venv/Scripts/python.exe")
        cmd = [str(python_exe), "main.py", "--host", "0.0.0.0", "--port", "8001"]
        
        print(f"\n🌐 Service will be available at: http://localhost:8001")
        print("📡 API endpoints:")
        print("   POST /detect-faces - Enhanced face detection")
        print("   POST /swap - Enhanced face swapping") 
        print("   GET /progress/{job_id} - Real-time progress")
        print("   GET /health - Service health check")
        
        print(f"\n💡 For best quality, use:")
        print("   {")
        print('     "quality_mode": "balanced",')
        print('     "use_hd_detection": true,')
        print('     "enhance": true,')
        print('     "temporal_smoothing": true')
        print("   }")
        
        print(f"\n▶️  Starting service now...")
        print("   (Press Ctrl+C to stop)")
        print("=" * 50)
        
        # Run the service
        subprocess.run(cmd, check=True)
        
    except KeyboardInterrupt:
        print(f"\n\n🛑 Service stopped by user")
    except subprocess.CalledProcessError as e:
        print(f"\n❌ Service failed to start: {e}")
        print("   Check if port 8001 is available")
        print("   Try: netstat -an | findstr 8001")
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")

if __name__ == "__main__":
    # Install psutil if not available
    try:
        import psutil
    except ImportError:
        print("📦 Installing psutil for process management...")
        subprocess.run([sys.executable, "-m", "pip", "install", "psutil"], check=True)
        import psutil
    
    main()