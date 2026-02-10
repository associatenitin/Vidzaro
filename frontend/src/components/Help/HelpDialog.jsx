export default function HelpDialog({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-lg border border-slate-700 shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-700 flex-shrink-0">
          <h2 className="text-xl font-bold text-white">Vidzaro Help</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">
            ×
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-6 text-sm">
          {/* Overview */}
          <section>
            <h3 className="text-base font-semibold text-white mb-2">What is Vidzaro?</h3>
            <p className="text-slate-300">
              Vidzaro is a free, web-based video editor. Upload or record video, edit on a multi-track timeline with filters, text overlays, and speed control, then export or share. Optional AI services add face swap, video enhancement, and text-to-video generation.
            </p>
          </section>

          {/* Features & use cases */}
          <section>
            <h3 className="text-base font-semibold text-white mb-2">Features & use cases</h3>
            <ul className="space-y-2 text-slate-300 list-disc list-inside">
              <li><strong className="text-slate-200">Timeline editing</strong> — Multi-track video and audio timeline with comprehensive editing tools. See "Timeline facilities" section below for details.</li>
              <li><strong className="text-slate-200">Clip options</strong> — Right‑click a clip for filters (including blur/motion blur, brightness, contrast, saturation, grayscale, sepia, hue shift, invert, sharpen), playback speed (0.25×–4×), volume, fade in/out, and text overlay (position, size, color, animations).</li>
              <li><strong className="text-slate-200">Screen recording</strong> — Record full screen, window, or tab; system audio, microphone, and webcam overlay; optional cursor/click/shortcut overlays; preview and trim before adding to the project.</li>
              <li><strong className="text-slate-200">Motion tracking</strong> — Attach overlays (e.g. images or text) to a moving region in a video; add keyframes from the toolbar or via the motion-tracking dialog.</li>
              <li><strong className="text-slate-200">Export & share</strong> — Render the timeline to video (resolution and quality options); create shareable links for library assets with configurable expiry.</li>
              <li><strong className="text-slate-200">Royalty-free content</strong> — Use the Pixabay button in the toolbar to open royalty-free images and music on Pixabay in a new tab.</li>
            </ul>
          </section>

          {/* Timeline facilities */}
          <section>
            <h3 className="text-base font-semibold text-white mb-2">Timeline facilities</h3>
            <div className="space-y-3 text-slate-300">
              <div>
                <h4 className="font-medium text-slate-200 mb-1">Timeline toolbar</h4>
                <ul className="text-xs space-y-1 ml-4 list-disc">
                  <li><strong className="text-slate-200">Zoom</strong> — Adjust timeline zoom from 25% to 400% for precise editing</li>
                  <li><strong className="text-slate-200">Snap On/Off</strong> (🧲) — When enabled, clips snap to playhead and edges of other clips when dragging</li>
                  <li><strong className="text-slate-200">Split</strong> (✂️) — Split clips at the current playhead position</li>
                  <li><strong className="text-slate-200">Trim Start/End</strong> (⏪/⏩) — Set trim points at the playhead; drag clip edges to adjust</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-slate-200 mb-1">Clip operations</h4>
                <ul className="text-xs space-y-1 ml-4 list-disc">
                  <li><strong className="text-slate-200">Drag & drop</strong> — Drag clips horizontally to reposition or vertically to move between tracks</li>
                  <li><strong className="text-slate-200">Trim</strong> — Drag clip left/right edges to trim in/out points</li>
                  <li><strong className="text-slate-200">Multi-select</strong> — Click multiple clips (with modifier) to select and edit together</li>
                  <li><strong className="text-slate-200">Copy/Paste</strong> — Right‑click clips → Copy, then right‑click empty area → Paste</li>
                  <li><strong className="text-slate-200">Delete</strong> — Select clips and press Delete, or right‑click → Delete</li>
                  <li><strong className="text-slate-200">Detach audio</strong> — Right‑click video clip → Detach audio to separate audio track</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-slate-200 mb-1">Right‑click clip menu</h4>
                <ul className="text-xs space-y-1 ml-4 list-disc">
                  <li><strong className="text-slate-200">Filters</strong> — Apply visual effects (blur, brightness, contrast, saturation, grayscale, sepia, hue shift, invert, sharpen)</li>
                  <li><strong className="text-slate-200">Speed</strong> — Set playback speed (0.25×–4×)</li>
                  <li><strong className="text-slate-200">Volume</strong> — Adjust clip volume (0–2×)</li>
                  <li><strong className="text-slate-200">Fade in/out</strong> — Add fade transitions at clip start/end</li>
                  <li><strong className="text-slate-200">Text overlay</strong> — Add text with position, size, color, and animations</li>
                  <li><strong className="text-slate-200">Transitions</strong> — Add transitions (crossfade, wipe, slide, zoom, blur) at clip start/end</li>
                  <li><strong className="text-slate-200">Motion tracking</strong> — Attach overlays to moving regions</li>
                  <li><strong className="text-slate-200">Enhance</strong> — AI video enhancement (requires deblur service)</li>
                  <li><strong className="text-slate-200">Apply filter to all</strong> — Apply current filter to all selected clips</li>
                  <li><strong className="text-slate-200">Create custom filter</strong> — Build and save custom filter presets</li>
                  <li><strong className="text-slate-200">Align to start/end</strong> — Align selected clips to earliest start or latest end</li>
                  <li><strong className="text-slate-200">Reverse</strong> — Reverse playback of selected video clips</li>
                  <li><strong className="text-slate-200">Set volume/speed for all</strong> — Apply volume or speed to all selected clips</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-slate-200 mb-1">Right‑click empty timeline</h4>
                <ul className="text-xs space-y-1 ml-4 list-disc">
                  <li><strong className="text-slate-200">Add clip at position</strong> — Insert a clip from the library at the clicked time</li>
                  <li><strong className="text-slate-200">Split at playhead</strong> — Split any clip at the current playhead position</li>
                  <li><strong className="text-slate-200">Add Video Track / Add Audio Track</strong> — Create new tracks</li>
                  <li><strong className="text-slate-200">Paste</strong> — Paste copied clips at the clicked position</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-slate-200 mb-1">Tracks</h4>
                <ul className="text-xs space-y-1 ml-4 list-disc">
                  <li><strong className="text-slate-200">Add/remove tracks</strong> — Right‑click empty timeline or use track controls</li>
                  <li><strong className="text-slate-200">Rename tracks</strong> — Double‑click track label to rename</li>
                  <li><strong className="text-slate-200">Mute/lock/hide</strong> — Use track controls to mute audio, lock editing, or hide video</li>
                  <li><strong className="text-slate-200">Resize</strong> — Drag the divider between preview and timeline to adjust timeline height</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-slate-200 mb-1">Editing tools</h4>
                <ul className="text-xs space-y-1 ml-4 list-disc">
                  <li><strong className="text-slate-200">Select tool</strong> — Default tool for selecting and moving clips</li>
                  <li><strong className="text-slate-200">Ripple edit tool</strong> — Edit tool that automatically adjusts subsequent clips when trimming</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-slate-200 mb-1">Visual aids</h4>
                <ul className="text-xs space-y-1 ml-4 list-disc">
                  <li><strong className="text-slate-200">Playhead</strong> — Vertical line showing current playback position; click timeline to seek</li>
                  <li><strong className="text-slate-200">Thumbnails</strong> — Video clips show thumbnails for visual reference</li>
                  <li><strong className="text-slate-200">Waveforms</strong> — Audio clips display waveform visualization</li>
                  <li><strong className="text-slate-200">Transitions</strong> — Overlapping clips show transition indicators</li>
                </ul>
              </div>
            </div>
          </section>

          {/* AI services */}
          <section>
            <h3 className="text-base font-semibold text-white mb-2">AI services (which AI for which)</h3>
            <p className="text-slate-300 mb-3">
              These features use optional backend services. Each runs in a separate process; start the ones you need.
            </p>
            <div className="space-y-3">
              <div className="bg-slate-900/80 rounded-lg p-3 border border-slate-700">
                <h4 className="font-medium text-slate-200 mb-1">Video Morph (face swap)</h4>
                <p className="text-slate-400 text-xs mb-1">Tools → Video Morph...</p>
                <p className="text-slate-300">
                  Replaces a person’s face in a video with a face from a photo. Uses <strong className="text-slate-200">InsightFace</strong> for face detection and identity embedding, and a face-swap model for the replacement. Optional <strong className="text-slate-200">CUDA</strong> acceleration (toggle in Preferences).
                </p>
              </div>
              <div className="bg-slate-900/80 rounded-lg p-3 border border-slate-700">
                <h4 className="font-medium text-slate-200 mb-1">AI Enhance (video deblur)</h4>
                <p className="text-slate-400 text-xs mb-1">Right‑click a video clip → Enhance, or use toolbar AI Enhance</p>
                <p className="text-slate-300">
                  Improves video clarity and reduces blur. Uses <strong className="text-slate-200">Real-ESRGAN</strong> for super-resolution and restoration. Quality presets: Fast, Balanced, Best. Uses CUDA when available.
                </p>
              </div>
              <div className="bg-slate-900/80 rounded-lg p-3 border border-slate-700">
                <h4 className="font-medium text-slate-200 mb-1">Gen AI (text-to-video)</h4>
                <p className="text-slate-400 text-xs mb-1">Toolbar → Gen AI</p>
                <p className="text-slate-300 mb-2">
                  Generates short video clips from a text prompt. Uses <strong className="text-slate-200">Wan 2.1</strong> (Wan2.1-T2V) via Diffusers. Generated clips can be added to the library and timeline.
                </p>
                <p className="text-slate-300 text-xs">
                  <strong className="text-slate-200">Options:</strong> Duration (seconds), guidance scale, negative prompt, CUDA toggle, and <strong className="text-slate-200">Low VRAM mode</strong> for 8GB GPUs (uses model offload for memory efficiency).
                </p>
              </div>
            </div>
          </section>

          {/* Options */}
          <section>
            <h3 className="text-base font-semibold text-white mb-2">Meaningful options</h3>
            <ul className="space-y-2 text-slate-300 list-disc list-inside">
              <li><strong className="text-slate-200">Preferences</strong> (toolbar gear) — Video Morph: Use GPU (CUDA) on/off; when off, morph runs on CPU to avoid CUDA DLL issues.</li>
              <li><strong className="text-slate-200">Timeline toolbar</strong> — Zoom controls, <strong className="text-slate-200">Snap On/Off button</strong> (🧲) for clip alignment, Split, Trim Start/End.</li>
              <li><strong className="text-slate-200">Export</strong> — Resolution (e.g. 1080p, 720p, 480p), quality (High / Medium / Low), and download when render finishes.</li>
              <li><strong className="text-slate-200">Share</strong> — Expiry for share links: 1 day, 7 days, 30 days, or never.</li>
              <li><strong className="text-slate-200">Recording</strong> — Output format (MP4, WebM, MKV), resolution (720p–4K), frame rate (15–60 fps), bitrate; optional region; system audio and mic levels; webcam position, size, shape, and blur.</li>
              <li><strong className="text-slate-200">View</strong> — Reset timeline height from the menu if the timeline panel was resized.</li>
            </ul>
          </section>

          <p className="text-slate-500 text-xs pt-2 border-t border-slate-700">
            Vidzaro — Edit videos. Zero limits. Free and open-source. Created by{' '}
            <a href="https://github.com/associatenitin" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">Nitin Verma</a>.
          </p>
        </div>

        <div className="p-4 border-t border-slate-700 flex justify-end flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium text-white">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
