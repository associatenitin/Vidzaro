
import os
import sys
import cv2
import numpy as np
from pathlib import Path

# Add the current directory to sys.path
sys.path.append(os.getcwd())

from main import get_face_app, MODELS_ROOT

def test():
    try:
        print(f"MODELS_ROOT: {MODELS_ROOT}")
        app = get_face_app()
        print("Model loaded successfully")
        
        # Try to detect on a dummy image or just exit
        print("SUCCESS")
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"FAILURE: {e}")

if __name__ == "__main__":
    test()
