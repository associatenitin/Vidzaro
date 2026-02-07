#!/usr/bin/env python3
"""
Quality Enhancement Installation Script for Vidzaro Morph Service
"""
import subprocess
import sys
import os
from pathlib import Path

def run_command(cmd, description=""):
    """Run a command and handle errors"""
    print(f"\n{'='*50}")
    print(f"🔧 {description}")
    print(f"{'='*50}")
    print(f"Running: {' '.join(cmd)}")
    
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
        print("✅ SUCCESS")
        if result.stdout.strip():
            print(f"Output: {result.stdout.strip()}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ FAILED: {e}")
        if e.stdout:
            print(f"STDOUT: {e.stdout}")
        if e.stderr:
            print(f"STDERR: {e.stderr}")
        return False

def check_gpu():
    """Check if CUDA GPU is available"""
    try:
        result = subprocess.run(["nvidia-smi"], capture_output=True, text=True)
        if result.returncode == 0:
            print("🚀 NVIDIA GPU detected - will use CUDA acceleration")
            return True
    except FileNotFoundError:
        pass
    print("💻 No NVIDIA GPU detected - will use CPU mode")
    return False

def main():
    print("🎬 Vidzaro Face Morphing Quality Enhancement Setup")
    print("=" * 60)
    
    # Check current directory
    if not Path("main.py").exists():
        print("❌ Please run this script from the morph-service directory")
        sys.exit(1)
    
    # Check GPU
    has_gpu = check_gpu()
    
    # 1. Upgrade pip
    success = run_command([
        sys.executable, "-m", "pip", "install", "--upgrade", "pip"
    ], "Upgrading pip")
    
    if not success:
        print("⚠️  Pip upgrade failed, continuing anyway...")
    
    # 2. Install PyTorch with CUDA support
    if has_gpu:
        torch_cmd = [
            sys.executable, "-m", "pip", "install", 
            "torch==2.6.0+cu124", "torchvision==0.21.0+cu124",
            "--index-url", "https://download.pytorch.org/whl/cu124"
        ]
    else:
        torch_cmd = [
            sys.executable, "-m", "pip", "install", 
            "torch==2.6.0", "torchvision==0.21.0",
            "--index-url", "https://download.pytorch.org/whl/cpu"
        ]
    
    success = run_command(torch_cmd, "Installing PyTorch")
    if not success:
        print("❌ PyTorch installation failed - cannot continue")
        sys.exit(1)
    
    # 3. Install main requirements
    success = run_command([
        sys.executable, "-m", "pip", "install", "-r", "requirements.txt"
    ], "Installing core requirements")
    
    if not success:
        print("❌ Core requirements failed")
        sys.exit(1)
    
    # 4. Install optional quality packages
    optional_packages = [
        "face-alignment>=1.3.5", 
        "scikit-image>=0.19.0",
        "torchmetrics>=0.11.0",
        "lpips>=0.1.4",
        "retinaface-pytorch>=0.0.12"
    ]
    
    print("\n🎨 Installing optional quality enhancement packages...")
    for package in optional_packages:
        success = run_command([
            sys.executable, "-m", "pip", "install", package
        ], f"Installing {package}")
        
        if not success:
            print(f"⚠️  {package} installation failed (optional)")
    
    # Try CodeFormer separately as it's more complex
    print("\n🔧 Attempting CodeFormer installation...")
    codeformer_success = run_command([
        sys.executable, "-m", "pip", "install", "codeformer>=0.0.11"
    ], "Installing CodeFormer")
    
    if not codeformer_success:
        print("⚠️  CodeFormer installation failed - will try alternative approach")
        # Try installing BasicSR first which is required for CodeFormer
        run_command([
            sys.executable, "-m", "pip", "install", "basicsr>=1.4.2"
        ], "Installing BasicSR (CodeFormer dependency)")
    
    # Try dlib separately as it often has issues
    print("\n🔧 Attempting dlib installation...")
    dlib_success = run_command([
        sys.executable, "-m", "pip", "install", "dlib"
    ], "Installing dlib")
    
    if not dlib_success:
        print("⚠️  dlib installation failed - face alignment will be limited")
        print("💡 Tip: You may need Visual Studio C++ Build Tools for dlib")
    
    # 5. Download models
    print("\n📦 Downloading enhanced AI models...")
    success = run_command([
        sys.executable, "download_models.py"
    ], "Downloading AI models")
    
    if not success:
        print("❌ Model download failed")
        sys.exit(1)
    
    # 6. Test installation
    print("\n🧪 Testing installation...")
    test_cmd = [
        sys.executable, "-c",
        "import insightface, cv2, gfpgan, torch; print('✅ Core packages working')"
    ]
    
    success = run_command(test_cmd, "Testing core packages")
    
    # 7. Test optional packages
    optional_test = [
        sys.executable, "-c",
        """
try:
    import face_alignment, skimage
    print('✅ Optional packages working')
except ImportError as e:
    print(f'⚠️  Some optional packages missing: {e}')
"""
    ]
    run_command(optional_test, "Testing optional packages")
    
    # Final status
    print("\n" + "="*60)
    print("🎉 INSTALLATION COMPLETE!")
    print("="*60)
    
    print("\n📊 Quality Enhancement Features Available:")
    print("  ✅ HD Face Detection (1024x1024)")
    print("  ✅ Enhanced Face Tracking")  
    print("  ✅ Multi-stage Enhancement (GFPGAN)")
    print("  ✅ Temporal Smoothing")
    print("  ✅ Advanced Post-processing")
    
    if has_gpu:
        print("  🚀 CUDA GPU Acceleration")
    
    # Test CodeFormer availability
    try:
        import basicsr
        print("  ✅ CodeFormer Support Available")
    except ImportError:
        print("  ⚠️  CodeFormer Support (install BasicSR manually if needed)")
    
    # Test face alignment
    try:
        import face_alignment
        print("  ✅ Advanced Face Alignment")
    except ImportError:
        print("  ⚠️  Face Alignment (optional, install face-alignment manually)")
    
    print("\n🚀 Ready to use enhanced face morphing!")
    print("\nNext Steps:")
    print("  1. Start the service: python main.py")
    print("  2. Use quality_mode='balanced' for best results")
    print("  3. Enable HD detection for higher quality")
    print("  4. See UPGRADE_QUALITY.md for detailed usage guide")
    
    print("\n💡 Recommended API settings for your hardware:")
    print("  {")
    print('    "quality_mode": "best",')
    print('    "use_hd_detection": true,')
    print('    "enhance": true,')
    print('    "use_codeformer": true,')
    print('    "temporal_smoothing": true')
    print("  }")

if __name__ == "__main__":
    main()