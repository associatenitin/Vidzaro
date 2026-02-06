# Vidzaro

**Edit videos. Zero limits.**

Vidzaro is a FREE, open-source, web-based video editor inspired by CapCut. Built with zero cost, no watermarks, and no vendor lock-in.

## Features

### MVP Features
- ✅ Upload video files (MP4, WebM, MOV, AVI)
- ✅ Timeline-based editing UI
- ✅ Trim video clips
- ✅ Split clips at playhead
- ✅ Reorder clips on timeline (drag & drop)
- ✅ Real-time preview using HTML5 video
- ✅ Export final video as MP4 (H.264)

### Coming Soon (Phase 2)
- Text overlays (titles, captions)
- Audio control (mute, volume, background music)
- Transitions (fade, slide)
- Filters (brightness, contrast, grayscale)
- Speed control (slow / fast)
- Save & load projects as JSON

## Tech Stack

- **Backend**: Node.js + Express
- **Video Engine**: FFmpeg (via fluent-ffmpeg)
- **Frontend**: React + Vite
- **Styling**: Tailwind CSS
- **State**: React Hooks + Context API
- **Storage**: Local filesystem

## Prerequisites

- **Node.js** 18+ and npm
- **FFmpeg** installed system-wide

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

**Option 1: Using Chocolatey (Recommended)**
```powershell
# Run PowerShell as Administrator, then:
choco install ffmpeg
```

**Option 2: Using winget**
```powershell
winget install ffmpeg
```

**Option 3: Manual Installation**
1. Download from [ffmpeg.org](https://ffmpeg.org/download.html)
2. Extract the ZIP file
3. Add the `bin` folder to your system PATH:
   - Open System Properties → Environment Variables
   - Add the path to `ffmpeg\bin` to the PATH variable
4. Restart your terminal

**Verify installation:**
```bash
ffmpeg -version
```

**Troubleshooting Chocolatey Installation:**

If you encounter errors when installing with Chocolatey:

1. **"Not running from an elevated command shell"** - You must run PowerShell as Administrator:
   - Right-click on PowerShell → "Run as Administrator"
   - Then run `choco install ffmpeg`

2. **Lock file access errors** - If you see lock file errors, a previous installation may have crashed:
   ```powershell
   # Run PowerShell as Administrator, then remove the lock file:
   Remove-Item "C:\ProgramData\chocolatey\lib\c00565a56f0e64a50f2ea5badcb97694d43e0755" -Force -ErrorAction SilentlyContinue
   # Then try installing again:
   choco install ffmpeg
   ```

3. **Access denied errors** - Ensure you're running as Administrator and no other Chocolatey processes are running.

**Note:** If FFmpeg is not recognized after installation, make sure it's added to your PATH and restart your terminal/PowerShell window.

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd Vidzaro
```

2. Install backend dependencies:
```bash
cd backend
npm install
```

3. Install frontend dependencies:
```bash
cd ../frontend
npm install
```

## Running the Application

### Development Mode

1. Start the backend server (from `backend/` directory):
```bash
npm run dev
```
Backend runs on `http://localhost:3001`

2. Start the frontend dev server (from `frontend/` directory):
```bash
npm run dev
```
Frontend runs on `http://localhost:3000`

3. Open your browser to `http://localhost:3000`

### Production Build

1. Build the frontend:
```bash
cd frontend
npm run build
```

2. Serve the backend (which will also serve the frontend static files):
```bash
cd backend
npm start
```

## Project Structure

```
Vidzaro/
├── backend/
│   ├── src/
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic (FFmpeg, projects)
│   │   ├── utils/           # Utilities (file handling, validation)
│   │   └── server.js        # Express server
│   ├── uploads/             # Uploaded video files
│   ├── projects/            # JSON project files
│   └── exports/             # Exported videos
├── frontend/
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── hooks/           # Custom React hooks
│   │   ├── services/        # API service layer
│   │   └── App.jsx          # Main app component
│   └── package.json
└── README.md
```

## API Endpoints

### Upload
- `POST /api/upload` - Upload a video file

### Video Operations
- `GET /api/video/:id` - Stream video file
- `GET /api/video/:id/info` - Get video metadata
- `POST /api/video/trim` - Trim a video clip
- `POST /api/video/split` - Split video at timestamp

### Projects
- `GET /api/projects` - List all projects
- `GET /api/projects/:id` - Load a project
- `POST /api/projects` - Save a project
- `DELETE /api/projects/:id` - Delete a project

### Export
- `POST /api/export` - Start video export job
- `GET /api/export/:jobId/status` - Check export status
- `GET /api/export/:jobId/download` - Download exported video

## Usage

1. **Upload a video**: Drag and drop or click to select a video file
2. **Add to timeline**: Uploaded videos automatically appear on the timeline
3. **Trim clips**: Drag the left/right edges of clips to trim
4. **Split clips**: Position playhead and click "Split" button
5. **Reorder clips**: Drag clips horizontally on the timeline
6. **Preview**: Use the play button to preview your edits
7. **Export**: Click "Export" to generate final MP4 video

## Development

### Backend Development
- Uses ES modules (`type: "module"`)
- FFmpeg commands are logged for debugging
- Error handling with user-friendly messages

### Frontend Development
- Hot module replacement with Vite
- Tailwind CSS for styling
- React hooks for state management
- Drag & drop with @dnd-kit

## License

GPL-3.0 - See LICENSE file for details

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Roadmap

- [ ] Phase 2 features (text, audio, transitions, filters)
- [ ] Project save/load UI
- [ ] Video thumbnails on timeline
- [ ] Keyboard shortcuts
- [ ] Undo/redo functionality
- [ ] Multi-track audio
- [ ] Video effects library

---

**Made with ❤️ for the open-source community**
