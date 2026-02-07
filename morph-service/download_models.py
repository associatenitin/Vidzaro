"""
Pre-download InsightFace models so the first API call doesn't wait.
Run from morph-service: python download_models.py
"""
import os
import sys
from pathlib import Path

# Hugging Face mirror (official GitHub release URL often fails)
INSWAPPER_HF_URL = "https://huggingface.co/ezioruan/inswapper_128.onnx/resolve/main/inswapper_128.onnx"


def download_inswapper_from_hf(models_dir: Path) -> Path:
    """Download inswapper_128.onnx from Hugging Face (fallback when InsightFace URL fails)."""
    out_path = models_dir / "inswapper_128.onnx"
    if out_path.exists():
        print("inswapper_128.onnx already exists, skipping download.")
        return out_path
    try:
        import urllib.request
        print("Downloading inswapper_128.onnx from Hugging Face (~554 MB)...")
        req = urllib.request.Request(INSWAPPER_HF_URL, headers={"User-Agent": "Vidzaro-Morph/1.0"})
        with urllib.request.urlopen(req) as resp:
            total = int(resp.headers.get("Content-Length", 0))
            downloaded = 0
            chunk_size = 1024 * 1024  # 1 MB
            with open(out_path, "wb") as f:
                while True:
                    chunk = resp.read(chunk_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total and total > 0:
                        pct = min(100, 100 * downloaded / total)
                        print(f"\r  {pct:.1f}% ({downloaded // (1024*1024)} / {total // (1024*1024)} MB)", end="", flush=True)
            print()
        print("InSwapper ready.")
        return out_path
    except Exception as e:
        if out_path.exists():
            out_path.unlink()
        raise RuntimeError(f"Failed to download inswapper_128.onnx: {e}") from e


def main():
    root = Path(__file__).resolve().parent
    models_root = os.environ.get("MODELS_ROOT", str(root))
    models_dir = Path(models_root) / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    os.environ["MODELS_ROOT"] = str(root)
    # CPU only so we don't print CUDA DLL errors when GPU isn't set up
    providers = ["CPUExecutionProvider"]

    from insightface.app import FaceAnalysis
    from insightface.model_zoo import get_model

    print("Downloading detection model (buffalo_s)...")
    app = FaceAnalysis(name="buffalo_s", root=models_root, providers=providers)
    app.prepare(ctx_id=0, det_size=(640, 640))
    print("Detection model ready.")

    print("Downloading inswapper_128.onnx...")
    inswapper_path = models_dir / "inswapper_128.onnx"
    if inswapper_path.exists():
        print("inswapper_128.onnx already exists.")
        get_model(str(inswapper_path), root=models_root, download=False, providers=providers)
    else:
        try:
            get_model("inswapper_128.onnx", root=models_root, download=True, providers=providers)
        except RuntimeError as e:
            if "Failed downloading" in str(e):
                download_inswapper_from_hf(models_dir)
                get_model(str(inswapper_path), root=models_root, download=False, providers=providers)
            else:
                raise
    print("InSwapper ready.")

    print("All models downloaded to", models_dir)

if __name__ == "__main__":
    main()
