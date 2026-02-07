# Vidzaro

**Edit videos. Zero limits.**

Vidzaro is a free, open-source, web-based video editor. No watermarks, no vendor lock-in—just upload, edit, and export. Record your screen with system audio, microphone, and webcam overlay, then edit on a multi-track timeline with filters, speed control, text overlays, and more.

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

### Export & share

- **Export** — Render timeline to video with resolution (1080p, 720p, 480p) and quality (High, Medium, Low); progress indicator and download when done
- **Share** — Create shareable links for media assets with configurable expiry (1 day, 7 days, 30 days, or never)

### Interface

- **Menu bar** — File (New, Open, Save, Save As), Edit (Undo, Redo, Delete, Deselect), View (Reset timeline height), Record (Start Recording), Export (Export Video), Help (Keyboard Shortcuts, About)
- **Keyboard shortcuts** — Playback (Space), Undo/Redo (Ctrl+Z / Ctrl+Shift+Z), tools (V, B, S), seek (←/→, Shift+←/→, Home), delete clip (Del), deselect (Esc), file (Ctrl+N, Ctrl+O, Ctrl+S)
- **Media library** — Upload videos (MP4, WebM, MOV, AVI, etc.); thumbnails and waveforms; filter by type; add to timeline by drag or “Add to track”; rename, remove, share
- **Resizable timeline** — Drag the divider to resize the timeline panel

---

## Tech stack

- **Backend** — Node.js, Express
- **Video engine** — FFmpeg (fluent-ffmpeg)
- **Frontend** — React 18, Vite
- **Styling** — Tailwind CSS
- **State** — React hooks (no global store)
- **Drag and drop** — @dnd-kit (timeline reorder, library → timeline)
- **Storage** — Local filesystem (uploads, exports, projects, thumbnails)

---

## Prerequisites

- **Node.js** 18+ and npm
- **FFmpeg** installed and on your PATH

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

**Windows**

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
git clone <repository-url>
cd Vidzaro
```

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

   Runs at `http://localhost:3001`.

2. **Frontend** (from `frontend/`):

   ```bash
   npm run dev
   ```

   Runs at `http://localhost:3000` and proxies `/api` to the backend.

3. Open **http://localhost:3000** in your browser.

### Production

1. Build the frontend:

   ```bash
   cd frontend
   npm run build
   ```

2. Serve via the backend (static files can be mounted from `frontend/dist` if configured):

   ```bash
   cd backend
   npm start
   ```

---

## Project structure

```
Vidzaro/
├── backend/
│   ├── src/
│   │   ├── routes/       # upload, video, export, projects, recordings, shares
│   │   ├── services/     # FFmpeg, project, share
│   │   ├── utils/        # errorHandler, fileHandler, validation
│   │   └── server.js
│   ├── uploads/          # Uploaded media
│   ├── projects/         # Saved project JSON (if saved to server)
│   ├── exports/          # Exported videos
│   └── thumbnails/       # Generated thumbnails
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Export/   # Export panel
│   │   │   ├── Library/  # Media library
│   │   │   ├── MenuBar/  # App menu (File, Edit, View, Record, Export, Help)
│   │   │   ├── Preview/  # Video player
│   │   │   ├── Project/  # FileDialog, SaveDialog
│   │   │   ├── Recorder/ # Recorder, RecorderOverlay, RegionSelector
│   │   │   ├── Share/    # Share dialog
│   │   │   ├── Timeline/ # Timeline, Clip
│   │   │   ├── Toolbar/  # Play, time, undo/redo, tools, split
│   │   │   └── Upload/   # Upload area
│   │   ├── hooks/        # useProject, useVideo, useRecording*
│   │   ├── services/     # api.js
│   │   └── App.jsx
│   └── package.json
├── README.md
└── TODO.md
```

---

## API overview

| Area        | Endpoints |
|------------|-----------|
| **Upload** | `POST /api/upload` |
| **Video**  | `GET /api/video/:id`, `GET /api/video/:id/info`, `GET /api/video/:id/thumbnails`, `GET /api/video/:id/waveform`, `POST /api/video/trim`, `POST /api/video/split` |
| **Export** | `POST /api/export`, `GET /api/export/:jobId/status`, `GET /api/export/:jobId/download` |
| **Projects** | `GET /api/projects`, `GET /api/projects/:id`, `POST /api/projects`, `POST /api/projects/load-from-content`, `DELETE /api/projects/:id` |
| **Recordings** | `POST /api/recordings/finalize` (upload WebM, optional trim/convert) |
| **Shares**  | `POST /api/shares`, `GET /api/shares/:id` |
| **Health** | `GET /api/health` |

---

## Usage (quick start)

1. **Upload or record** — Drag videos into the media library or use **Record** from the menu to capture screen + mic + webcam.
2. **Add to timeline** — Drag an asset from the library onto a track, or use “Add to track” for a specific track.
3. **Edit** — Trim (drag clip edges), split (place playhead, press **S** or click Split), reorder (drag clips). Right-click a clip for filters, speed, volume, fades, and text overlay.
4. **Preview** — Use Play/Pause and the scrubber; select an asset in the library to preview it in the player.
5. **Save** — **File → Save** (or Ctrl+S) to save the project as JSON.
6. **Export** — **Export → Export Video...** to render and download the final video.
7. **Share** — Use the share action on a library asset to create a shareable link.

---

## Keyboard shortcuts

| Action        | Shortcut        |
|---------------|-----------------|
| Play / Pause  | Space           |
| Undo         | Ctrl+Z          |
| Redo         | Ctrl+Shift+Z / Ctrl+Y |
| Select tool  | V               |
| Ripple tool  | B               |
| Split at playhead | S        |
| Seek 1 frame | ← / →           |
| Seek 1 second | Shift+← / Shift+→ |
| Go to start  | Home            |
| Delete clip  | Del / Backspace |
| Deselect     | Esc             |
| New project  | Ctrl+N          |
| Open         | Ctrl+O          |
| Save         | Ctrl+S          |
| Stop recording | Ctrl+Shift+R  |

Full list is available in the app under **Help → Keyboard Shortcuts**.

---

## Development

- **Backend:** ES modules; `npm run dev` uses `node --watch`.
- **Frontend:** Vite with HMR; Tailwind for styles; no TypeScript.
- **Proxy:** Frontend dev server proxies `/api` to `http://localhost:3001`.

---

## License

GPL-3.0 — see the [LICENSE](LICENSE) file.

---

## Contributing

Contributions are welcome. Open an issue or submit a pull request.

---

**Made with ❤️ for the open-source community**
