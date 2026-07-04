# Vidzaro — Twitter / X Marketing Copy

Ready-to-post content for X/Twitter. Standalone posts are sized to ~280 chars;
threads are numbered. Pair each with an image from this `marketing/` folder
(suggested image noted per section). Replace `[repo link]` with your actual URL.

---

## 1. Pinned / launch tweet
*(image: `vidzaro-hero.png` or `vidzaro-banner-lockup.png`)*

🎬 Meet **Vidzaro** — a free, open-source, browser-based video editor.

No watermarks. No vendor lock-in. No subscriptions.

Record your screen + mic + webcam, edit on a multi-track timeline, and export.
Plus optional on-device AI: face swap, deblur & text-to-video.

⭐ GPL-3.0

---

## 2. The "why it's different" hook

Most "free" video editors slap a watermark on your export or upsell you at checkout.

Vidzaro doesn't. It runs in your browser, stores everything on your own machine,
and the code is fully open (GPL-3.0).

Edit videos. Zero limits. 🚀

---

## 3. Feature thread (8 tweets)

**1/** I built Vidzaro — a free & open-source web video editor that doesn't hold
your work hostage. 🧵
No watermarks, no lock-in, no cloud upload required. Here's everything it does 👇

**2/ 🎞 Multi-track timeline**
Drag-and-drop video + audio tracks, trim, split (S key), ripple edit, reorder clips,
detach audio, add/remove/rename tracks. Real editing, in a browser tab.

**3/ 🎚 Per-clip control**
Playback speed 0.25x–4x, volume, fade in/out, and 12+ filters: grayscale, sepia,
blur, vintage, hue shift, cool/warm tone & more.

**4/ 🔤 Text & motion**
Add text overlays with position, color, and Fade/Slide/Bounce animations — then
motion-track them so the overlay follows an object through the clip.

**5/ 🖥 Screen recording, built in**
Capture screen/window/tab + system audio + mic, with a picture-in-picture webcam
(circle or square, blurred bg). Live preview, cursor highlight & click effects.
Export MP4/WebM/MKV up to 4K @ 60fps.

**6/ 🤖 Optional on-device AI**
• Face swap (InsightFace + InSwapper + GFPGAN)
• AI deblur / upscale (Real-ESRGAN x4)
• Text-to-video (Wan 2.1)
Runs locally on your GPU. Fully optional — the editor works 100% without them.

**7/ 💾 Your files stay yours**
Projects save as plain JSON to your disk. Uploads, exports & thumbnails live on
local storage. Auto-save recovers your work on reload. Nothing forced to a server.

**8/** Free. Open-source. GPL-3.0.
Built with React + FFmpeg.
⭐ Star it, fork it, ship with it 👇
[repo link]

---

## 4. Tech stack post

🛠 What powers **Vidzaro**:

• Frontend: React 18 + Vite 7 + Tailwind CSS
• Drag & drop: @dnd-kit
• Backend: Node.js 18+ + Express
• Video engine: FFmpeg (fluent-ffmpeg)
• Storage: local filesystem
• AI microservices: Python + FastAPI

Clean split: browser → API → FFmpeg. #buildinpublic

---

## 5. AI models post
*(image: `vidzaro-ai-infographic.png`)*

The optional AI layer in Vidzaro runs **on your own hardware** — no API keys,
no per-render fees:

🧑 Face swap → InsightFace buffalo_l + InSwapper-128 + GFPGAN v1.4
✨ Deblur/upscale → Real-ESRGAN x4plus
🎥 Text-to-video → Wan2.1-T2V-1.3B

Each is a self-contained FastAPI service.

---

## 6. Hardware / system requirements

**Tweet version:**

💻 Running Vidzaro AI features? Here's what you need:

Core editor: any modern PC + Chrome/Edge. That's it.
Face swap (CPU): works, just slower.
Face swap (GPU): NVIDIA + CUDA 12.
Text-to-video: ~8 GB VRAM (Low-VRAM mode for consumer GPUs).

No cloud GPU rental. Your machine, your render.

**Long version (image caption / GitHub / reply):**

| Component | Core editor | AI features (optional) |
|---|---|---|
| CPU | Any modern x64 | Multi-core recommended |
| GPU | None required | NVIDIA + CUDA 12 (CPU fallback available) |
| VRAM | — | ~8 GB for Wan 2.1 text-to-video (Low-VRAM mode supported) |
| Disk | A few hundred MB | +~1 GB face models, +60 MB Real-ESRGAN, +2–3 GB Wan 2.1 |
| OS | Windows / macOS / Linux | Same + Python 3.10+ |
| Runtime | Node.js 18+, FFmpeg | FastAPI services |
| Browser | Chrome/Edge (recommended), Firefox | — |

Models download automatically on first use. CUDA optional — flip a toggle to run
face swap on CPU and avoid DLL setup entirely.

---

## 7. Short punchy one-liners (filler / quote-tweets)

> Screen recorder + multi-track editor + local AI face swap + text-to-video — in a
> browser tab, watermark-free. Vidzaro. 🎬

> Your video editor shouldn't own your footage. Vidzaro saves projects as JSON to
> your disk and runs AI on your GPU. Open-source. GPL-3.0.

> 4K screen recording with webcam PiP, system audio, cursor highlights & click
> effects — free, no watermark. ✅

> Generated this clip from a text prompt, locally, no API bill. Wan 2.1 inside Vidzaro. 🎥

---

## Image asset reference (this folder)

| File | Suggested use |
|---|---|
| `vidzaro-hero.png` | Launch / pinned tweet |
| `vidzaro-hero-with-logo.png` | Launch / profile-branded post |
| `vidzaro-banner-lockup.png` | Header / launch tweet |
| `vidzaro-features.png` | Feature thread (1/) |
| `vidzaro-infographic.png` | Tech stack post |
| `vidzaro-ai-infographic.png` | AI models post |
| `vidzaro-badge.png` / `vidzaro-badge-premium.png` | Quote-tweets, replies |
| `vidzaro-square-social.png` | Square crops, IG/X profile grid |
