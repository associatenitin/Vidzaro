# Vidzaro

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL%203.0-blue.svg)](https://opensource.org/licenses/GPL-3.0)
[![Node.js 18+](https://img.shields.io/badge/node-18%2B-green.svg)](https://nodejs.org/)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-required-orange.svg)](https://ffmpeg.org/)

**Edit videos. Zero limits.**

Vidzaro is a free, open-source, web-based video editor. No watermarks, no vendor lock-in—just upload, edit, and export. Record your screen with system audio, microphone, and webcam overlay, then edit on a multi-track timeline with filters, speed control, text overlays, motion tracking, and more.

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Running the application](#running-the-application)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)
- [API overview](#api-overview)
- [Usage (quick start)](#usage-quick-start)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Development](#development)
- [Optional AI services](#optional-ai-services)
  - [AI models and service mapping](#ai-models-and-service-mapping)
- [Troubleshooting](#troubleshooting)
- [Browser support](#browser-support)
- [License](#license)
- [Contributing](#contributing)

---

## Features

### Editing

- **Timeline** — Multi-track timeline (video and audio tracks) with drag-and-drop reordering
- **Trim** — Drag clip edges to trim in/out points
- **Split** — Split clips at the playhead (toolbar or **S** key)
- **Reorder** — Drag clips horizontally; drop assets from the library onto any track
- **Tools** — Select tool (**V**) and Ripple edit (**B**)
- **Clip settings** (right-click clip) — Filters, playback speed (0.25x–4x), volume, fade in/out, text overlay
- **Text overlays** — Per-clip text with position (top/center/bottom), size, color, and animations (Fade, Slide, Bounce)
- **Video filters** — Grayscale, Sepia, Invert, Blur, Brighten, Darken, Contrast, Saturate, Hue Shift, Vintage, Cool/Warm tone
- **Motion tracking** — Attach text, stickers, or images to an object in a clip; the overlay follows the object during preview and export (requires morph-service for tracking)
- **Detach audio** — Extract audio from a video clip to a separate audio track
- **Dynamic tracks** — Add or remove video and audio tracks; rename tracks

### Project & File

- **Save project** — Save as JSON to disk (File System Access API or download)
- **Load project** — Open a saved project file (JSON)
- **New project** — Start fresh (with optional confirmation)
- **Auto-save** — Project state is auto-saved to the browser; recovered on reload

### Screen recording

- **Capture** — Full screen, window, or browser tab (with optional custom region)
- **System audio** — Capture desktop audio (with volume control)
- **Microphone** — Optional mic with volume and noise suppression
- **Webcam overlay** — Picture-in-picture webcam with position (corners), size, shape (circle/square), and optional background blur; **live preview** while recording
- **Overlays** (when recording this tab) — Cursor highlight, click effect, keyboard shortcut display
- **Output** — MP4, WebM, or MKV; 720p / 1080p / 4K; 15–60 fps; configurable bitrate
- **Preview & trim** — After recording, preview and optionally trim before adding to the project

### Video Morph (face swap)

- **Face swap** — Replace a person's face in a video with a face from a photo. **Tools → Video Morph...** then: pick a source photo, pick a video, detect characters, select which person to replace, and apply. The result is added to the library and timeline.
- **Character selection** — Keyframes with face boxes and labels (Person 1, Person 2, …); click to choose who gets the new face.
- **CPU / GPU preference** — Toolbar **Preferences** (gear icon): toggle **Video Morph: Use GPU (CUDA)**. When off, the morph service uses CPU only (slower; avoids CUDA DLL errors if the toolkit isn't installed). Stored in the browser and sent with each morph request.

### AI Enhance (Video Deblur)

- **AI-based enhancement** — Optional AI deblur service that can enhance video clarity using Real-ESRGAN.
- **Quality modes** — Fast, Balanced, and Best presets to trade speed vs quality.
- **GPU acceleration** — Uses CUDA when available and falls back to CPU when not.

### Gen AI (Text-to-Video)

- **Text-to-video** — Optional Wan 2.1 service to generate short clips from prompts (e.g. *"A cat walks on the grass, realistic"*).
- **Low VRAM mode** — Supports 8GB consumer GPUs using model offload, with slower but more memory-efficient generation.
- **Integration** — Generated clips are saved to disk and can be imported back into Vidzaro like any other media.

### Royalty-free assets (Pixabay)

- **Pixabay dropdown** — In the main toolbar, next to **Gen AI**, a Pixabay button opens a dropdown with **Royalty Free Images** and **Royalty Free Music** options. Choosing an option shows a confirmation dialog and then opens the corresponding royalty-free content page on [Pixabay](https://pixabay.com/) in a new browser tab.

### Export & share

- **Export** — Render timeline to video with resolution (1080p, 720p, 480p) and quality (High, Medium, Low); progress indicator and download when done
- **Share** — Create shareable links for media assets with configurable expiry (1 day, 7 days, 30 days, or never)

### Interface

- **Menu bar** — File (New, Open, Save, Save As), Edit (Undo, Redo, Delete, Deselect), View (Reset timeline height), Record (Start Recording), **Tools** (Video Morph, Motion Tracking), Export (Export Video), Help (Keyboard Shortcuts, About)
- **Toolbar** — Play/Pause, time, undo/redo, tools (Select, Ripple), **Gen AI**, **Pixabay** royalty-free shortcuts, **Preferences** (gear: Video Morph CPU/GPU toggle), Split
- **Keyboard shortcuts** — Playback (Space), Undo/Redo (Ctrl+Z / Ctrl+Shift+Z), tools (V, B, S), seek (←/→, Shift+←/→, Home), delete clip (Del), deselect (Esc), file (Ctrl+N, Ctrl+O, Ctrl+S)
- **Media library** — Upload videos (MP4, WebM, MOV, AVI, etc.); thumbnails and waveforms; filter by type; add to timeline by drag or "Add to track"; rename, remove, share
- **Resizable timeline** — Drag the divider to resize the timeline panel

---

## Tech stack

| Layer   | Technology |
|--------|------------|
| **Backend** | Node.js 18+, Express |
| **Video engine** | FFmpeg (fluent-ffmpeg) |
| **Frontend** | React 18, Vite |
| **Styling** | Tailwind CSS |
| **State** | React hooks (no global store) |
| **Drag and drop** | @dnd-kit (timeline reorder, library → timeline) |
| **Storage** | Local filesystem (uploads, exports, projects, thumbnails) |

---

## Prerequisites

- **Node.js** 18+ and npm
- **FFmpeg** installed and on your PATH
- **AI services (optional):** Python 3.10+ for the Morph (face swap + motion tracking), Deblur, and Wan Gen AI services (see [Video Morph setup](#video-morph-setup), [Video Deblur setup](#video-deblur-setup), and [Gen AI (Wan 2.1) setup](#gen-ai-wan-21-setup)). For Morph GPU acceleration: NVIDIA driver + **CUDA 12** Toolkit with its `bin` folder on PATH (e.g. `cublasLt64_12.dll`). Without CUDA 12, use the toolbar preference to run morph on CPU.

### Installing FFmpeg

**macOS:**

```bash
brew install ffmpeg
```

**Ubuntu/Debian:**

```bash
sudo apt-get update
sudo apt-get install ffmpeg
```

**Windows:**

- **Chocolatey:** `choco install ffmpeg` (run PowerShell as Administrator)
- **winget:** `winget install ffmpeg`
- **Manual:** Download from [ffmpeg.org](https://ffmpeg.org/download.html), extract, and add the `bin` folder to your system PATH.

Verify:

```bash
ffmpeg -version
```

---

## Installation

```bash
git clone https://github.com/YOUR_USERNAME/Vidzaro.git
cd Vidzaro
```

Replace `YOUR_USERNAME` with your GitHub username, or use your fork’s URL.

**Backend:**

```bash
cd backend
npm install
```

**Frontend:**

```bash
cd ../frontend
npm install
```

---

## Running the application

### Development

1. **Backend** (from `backend/`):

   ```bash
   npm run dev
   ```

   Runs at `http://localhost:3001` (or the port set by `PORT`).

2. **Frontend** (from `frontend/`):

   ```bash
   npm run dev
   ```

   Runs at `http://localhost:3000` and proxies `/api` to the backend.

3. Open **http://localhost:3000** in your browser.

4. **AI services (optional):** Start whichever Python services you want to use—see [Optional AI services](#optional-ai-services) below.

### Production

1. Build the frontend:

   ```bash
   cd frontend
   npm run build
   ```

2. Serve via the backend (mount static files from `frontend/dist` if your backend is configured to do so):

   ```bash
   cd backend
   npm start
   ```

---

## Environment variables

| Variable | Where | Default | Description |
|----------|--------|---------|-------------|
| `PORT` | Backend | `3001` | Backend server port |
| `MORPH_SERVICE_URL` | Backend | `http://localhost:8000` | Video Morph & motion tracking service base URL |
| `DEBLUR_SERVICE_URL` | Backend | `http://localhost:8002` | AI Deblur (Real-ESRGAN) service base URL |
| `WAN_SERVICE_URL` | Backend | `http://localhost:8003` | Wan 2.1 text-to-video service base URL |
| `VITE_API_URL` | Frontend (build) | `''` (same origin) | API base URL; use e.g. `http://localhost:3001` if frontend is served from another origin |

---

## Project structure

```
Vidzaro/
├── backend/
│   ├── src/
│   │   ├── routes/       # upload, video, export, projects, recordings, shares, morph, motionTracking, deblur, wan, admin
│   │   ├── services/     # FFmpeg, project, share
│   │   ├── utils/        # errorHandler, fileHandler, validation
│   │   └── server.js
│   ├── uploads/          # Uploaded media
│   ├── projects/         # Saved project JSON (if saved to server)
│   ├── exports/          # Exported videos
│   └── thumbnails/       # Generated thumbnails
├── morph-service/        # Optional: Python face detection, face swap & object tracking (InsightFace)
│   ├── main.py           # FastAPI: /detect-faces, /swap, /track-object
│   ├── requirements.txt
│   ├── download_models.py
│   └── README.md
├── deblur-service/       # Optional: AI-based video clarity enhancement (Real-ESRGAN)
│   ├── main.py           # FastAPI: /enhance, /progress/:jobId, /health
│   ├── requirements.txt
│   └── README.md
├── wan-service/          # Optional: Wan 2.1 text-to-video Gen AI
│   ├── main.py           # FastAPI: /generate, /progress/:jobId, /health
│   ├── requirements.txt
│   └── README.md
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Export/   # Export panel
│   │   │   ├── Library/  # Media library
│   │   │   ├── MenuBar/  # File, Edit, View, Record, Tools, Export, Help
│   │   │   ├── Morph/    # MorphWizard, CharacterSelect
│   │   │   ├── MotionTracking/  # MotionTrackingDialog, KeyframeEditor
│   │   │   ├── Preview/  # Video player
│   │   │   ├── Project/  # FileDialog, SaveDialog
│   │   │   ├── Recorder/ # Recorder, RecorderOverlay, RegionSelector
│   │   │   ├── Share/    # Share dialog
│   │   │   ├── Timeline/ # Timeline, Clip
│   │   │   ├── Toolbar/  # Play, time, undo/redo, tools, preferences, split
│   │   │   └── Upload/   # Upload area
│   │   ├── hooks/        # useProject, useVideo, useRecording*
│   │   ├── services/     # api.js
│   │   └── App.jsx
│   └── package.json
├── README.md
├── LICENSE
└── TODO.md
```

---

## API overview

| Area | Endpoints |
|------|-----------|
| **Upload** | `POST /api/upload` |
| **Video** | `GET /api/video/:id`, `GET /api/video/:id/info`, `GET /api/video/:id/thumbnails`, `GET /api/video/:id/waveform`, `POST /api/video/trim`, `POST /api/video/split` |
| **Export** | `POST /api/export`, `GET /api/export/:jobId/status`, `GET /api/export/:jobId/download` |
| **Projects** | `GET /api/projects`, `GET /api/projects/:id`, `POST /api/projects`, `POST /api/projects/load-from-content`, `DELETE /api/projects/:id` |
| **Recordings** | `POST /api/recordings/finalize` (upload WebM, optional trim/convert) |
| **Morph** | `POST /api/morph/detect-faces`, `POST /api/morph/run` (face detection & swap; requires morph-service) |
| **Motion tracking** | `POST /api/motion-tracking/track`, `GET /api/motion-tracking/progress/:jobId` (object tracking; requires morph-service) |
| **Deblur** | `POST /api/deblur/enhance`, `GET /api/deblur/progress/:jobId` (AI enhance; requires deblur-service) |
| **Wan (Gen AI)** | `POST /api/wan/generate`, `GET /api/wan/progress/:jobId` (text-to-video; requires wan-service) |
| **Shares** | `POST /api/shares`, `GET /api/shares/:id` |
| **Health** | `GET /api/health` |

---

## Usage (quick start)

1. **Upload or record** — Drag videos into the media library or use **Record** from the menu to capture screen + mic + webcam.
2. **Add to timeline** — Drag an asset from the library onto a track, or use "Add to track" for a specific track.
3. **Edit** — Trim (drag clip edges), split (place playhead, press **S** or click Split), reorder (drag clips). Right-click a clip for filters, speed, volume, fades, text overlay, and motion tracking.
4. **Preview** — Use Play/Pause and the scrubber; select an asset in the library to preview it in the player.
5. **Save** — **File → Save** (or Ctrl+S) to save the project as JSON.
6. **Export** — **Export → Export Video...** to render and download the final video.
7. **Share** — Use the share action on a library asset to create a shareable link.
8. **Video Morph** — **Tools → Video Morph...** to replace a person’s face in a video with a face from a photo (requires the morph-service running). Use the toolbar **Preferences** (gear) to switch between GPU (CUDA) and CPU.
9. **Motion tracking** — Select a clip and use the motion tracking workflow to attach text/sticker/image to an object; the overlay follows the object in preview and export (requires morph-service).

---

## Keyboard shortcuts

| Action | Shortcut |
|--------|----------|
| Play / Pause | Space |
| Undo | Ctrl+Z |
| Redo | Ctrl+Shift+Z / Ctrl+Y |
| Select tool | V |
| Ripple tool | B |
| Split at playhead | S |
| Seek 1 frame | ← / → |
| Seek 1 second | Shift+← / Shift+→ |
| Go to start | Home |
| Delete clip | Del / Backspace |
| Deselect | Esc |
| New project | Ctrl+N |
| Open | Ctrl+O |
| Save | Ctrl+S |
| Stop recording | Ctrl+Shift+R |

Full list is available in the app under **Help → Keyboard Shortcuts**.

---

## Development

- **Backend:** ES modules; `npm run dev` uses `node --watch`.
- **Frontend:** Vite with HMR; Tailwind for styles; no TypeScript.
- **Proxy:** Frontend dev server proxies `/api` to `http://localhost:3001` (or `PORT`).
- **Morph / motion tracking:** Backend calls morph-service at `MORPH_SERVICE_URL` (default `http://localhost:8000`). Set the env var to point to another host/port if needed.

---

## Optional AI services

These services are **optional**. The core editor works without them.

### AI models and service mapping

Start only the services for the features you use. The backend expects them on the ports below (override with env vars; see [Environment variables](#environment-variables)).

| App feature | Service | Default port | Env variable | AI models & specifications |
|-------------|---------|--------------|--------------|-----------------------------|
| **Video Morph** (face swap) | morph-service | 8000 | `MORPH_SERVICE_URL` | **InsightFace buffalo_l** — face detection (640×640 standard; 1024×1024 HD). **InSwapper-128** — face swap (128×128 latent). **GFPGAN v1.4** — face restoration (sharpening, detail). Optional: CUDA 12 for GPU. |
| **Motion tracking** (attach overlay to object) | morph-service | 8000 | `MORPH_SERVICE_URL` | Same service as Video Morph. **OpenCV CSRT/KCF** — object tracking (no extra model). Runs in same process; start morph-service once for both features. |
| **AI Enhance** (video deblur/clarity) | deblur-service | 8002 | `DEBLUR_SERVICE_URL` | **Real-ESRGAN x4plus** — RRDBNet (x4 upscale), ~60 MB; auto-downloaded on first use. CUDA or CPU. Quality modes: Fast, Balanced, Best. |
| **Gen AI** (text-to-video) | wan-service | 8003 | `WAN_SERVICE_URL` | **Wan2.1-T2V-1.3B** (Hugging Face: `Wan-AI/Wan2.1-T2V-1.3B-Diffusers`). ~2–3 GB, 832×480, ~5 s clips. Low VRAM mode for ~8 GB GPUs (model CPU offload). |

**How to start services by feature:**

- **Video Morph and/or Motion Tracking** → From repo root: `cd morph-service`, activate venv, run `python download_models.py` once (InsightFace, InSwapper, GFPGAN; ~1 GB), then `python main.py`. Service listens on 8000.
- **AI Enhance (deblur)** → `cd deblur-service`, activate venv, `python main.py`. Service listens on 8002. Real-ESRGAN model downloads on first enhance request (~60 MB).
- **Gen AI (text-to-video)** → `cd wan-service`, activate venv, `python main.py`. Service listens on 8003. Wan 2.1 model downloads from Hugging Face on first generation (~2–3 GB).

You can run any combination of these services (e.g. only morph-service, or morph + wan). The app will use whichever are running; features that need a stopped service will show as unavailable.

### Video Morph setup

Video Morph (face swap) and **motion tracking** use the same Python service. Full details: [morph-service/README.md](morph-service/README.md).

**Quick setup:**

1. **Python 3.10+** and **FFmpeg** on PATH (same as main app).
2. From repo root: `cd morph-service`, create a venv, `pip install -r requirements.txt`, then `python download_models.py` (downloads ~1 GB of models; uses Hugging Face if the default URL fails).
3. Run the service: `uvicorn main:app --host 0.0.0.0 --port 8000`.
4. In the app, use **Tools → Video Morph...** and **Tools → Motion Tracking** (per clip). Use **Preferences** (toolbar gear) to choose **Video Morph: Use GPU (CUDA)** or CPU only.

**GPU (CUDA):** For GPU acceleration you need an **NVIDIA driver** (check with `nvidia-smi`). You do **not** need to install the full CUDA Toolkit if you use the built-in pip option:

- **Option A — CUDA via pip (recommended):** The morph service already depends on `nvidia-cublas-cu12` and `nvidia-cudnn-cu12`. When you `pip install -r requirements.txt` in the morph-service venv, these install the CUDA 12 runtime DLLs; the service adds them to `PATH` at startup. No system PATH or Toolkit install needed.
- **Option B — Full CUDA 12 Toolkit:** If Option A does not work, download from [NVIDIA CUDA 12 archive](https://developer.nvidia.com/cuda-12-4-0-download-archive) (Windows → x86_64 → exe), install it, then add the toolkit **bin** folder to your system PATH (see below).

**Adding CUDA to PATH (Windows):**

1. Note your CUDA install path, e.g. `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.4`. The folder to add is **`bin`** inside it: `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.4\bin`.
2. Press **Win + R**, type `sysdm.cpl`, press Enter.
3. Open the **Advanced** tab, then **Environment Variables**.
4. Under **System variables** (or **User variables**), select **Path**, then **Edit**.
5. Click **New** and paste the `bin` path. Use your actual version number if different from `v12.4`.
6. Click **OK** on all dialogs. Close and reopen any terminal (and Cursor) so the new PATH is picked up.

Alternatively, in **PowerShell** (adds to your user PATH):

```powershell
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.4\bin", "User")
```

Replace `v12.4` with your installed version (e.g. `v12.6`). Then close and reopen the terminal.

If the toolkit isn’t installed or PATH isn’t set, turn off **Video Morph: Use GPU (CUDA)** in Preferences to use CPU and avoid DLL errors.

### Video Deblur setup

The optional Video Deblur service provides AI-based video clarity enhancement using Real-ESRGAN. Full details: [deblur-service/README.md](deblur-service/README.md).

**Quick setup:**

1. **Python 3.10+** and **FFmpeg** on PATH.
2. From repo root:

   ```bash
   cd deblur-service
   python -m venv .venv
   .venv\Scripts\activate        # Windows
   # source .venv/bin/activate   # macOS/Linux
   pip install -r requirements.txt
   python main.py                # or: DEBLUR_SERVICE_PORT=8002 python main.py
   ```

3. The backend will call this service on `DEBLUR_SERVICE_URL` (default port `8002`) when you trigger AI enhance from the app.

### Gen AI (Wan 2.1) setup

The optional Wan 2.1 Gen AI service provides text-to-video generation using the Wan2.1-T2V-1.3B Diffusers pipeline. Full details: [wan-service/README.md](wan-service/README.md).

**Quick setup:**

1. **Python 3.10+**, **FFmpeg**, and an NVIDIA GPU with ~8GB VRAM (or use Low VRAM mode).
2. From repo root:

   ```bash
   cd wan-service
   python -m venv .venv
   .venv\Scripts\activate        # Windows
   # source .venv/bin/activate   # macOS/Linux
   pip install -r requirements.txt
   python main.py               # or: WAN_SERVICE_PORT=8003 python main.py
   ```

3. The backend will call this service on `WAN_SERVICE_URL` (default port `8003`) for text-to-video jobs.

---

## Troubleshooting

| Issue | What to try |
|-------|--------------|
| **FFmpeg not found** | Ensure FFmpeg is on your PATH. Run `ffmpeg -version` in a new terminal. On Windows, restart the terminal after adding FFmpeg to PATH. |
| **Backend won’t start (port in use)** | Set `PORT` to another port (e.g. `3002`) and ensure the frontend proxy in `vite.config.js` points to that port if needed. |
| **Video Morph / motion tracking fails or CUDA errors** | Turn off **Video Morph: Use GPU (CUDA)** in **Preferences**. The morph-service will use CPU. See [morph-service/README.md](morph-service/README.md). |
| **CORS or API errors in browser** | In development, use the frontend dev server (`npm run dev` in `frontend/`); it proxies `/api` to the backend. For a custom backend URL, set `VITE_API_URL` and rebuild. |
| **Export fails or no output** | Check backend logs for FFmpeg errors. Ensure the timeline has at least one clip and the export path is writable. |
| **AI service “unavailable”** | Start the corresponding Python service (morph, deblur, wan) and ensure the URL/port matches the backend env vars (`MORPH_SERVICE_URL`, `DEBLUR_SERVICE_URL`, `WAN_SERVICE_URL`). |

---

## Browser support

Vidzaro is tested on modern Chromium-based browsers (Chrome, Edge) and Firefox. It uses:

- **File System Access API** (optional) for saving projects to disk—supported in Chrome/Edge; in other browsers you can still save via download.
- **getDisplayMedia** for screen/window/tab capture.
- **MediaRecorder** for recording.

For the best experience, use a recent version of Chrome or Edge.

---

## License

This project is licensed under the **GNU General Public License v3.0**. See the [LICENSE](LICENSE) file for the full text.

---

## Contributing

Contributions are welcome. Here’s how to get started:

1. **Fork** the repository and clone your fork.
2. **Create a branch** for your change: `git checkout -b feature/your-feature` or `fix/your-fix`.
3. **Install** dependencies (backend and frontend) and ensure the app runs locally.
4. **Make your changes** and test (manual or automated tests if present).
5. **Commit** with clear messages (e.g. “Add motion tracking to README”, “Fix export progress for long timelines”).
6. **Push** to your fork and open a **Pull Request** against the default branch. Describe what you changed and why.

For larger features or API changes, consider opening an **Issue** first to discuss.

---

**Made with ❤️ for the open-source community**
