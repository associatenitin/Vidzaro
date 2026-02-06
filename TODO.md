# Vidzaro Enhancement & Bug Fix TODO

Track all enhancements and bug fixes for the Vidzaro video editor.

## 🐛 Bug Fixes (High Priority)

### 1. Video Playback Sync Issue ✅ FIXED
- [x] **VideoPlayer doesn't sync video playback with timeline position**
  - The `VideoLayer` component only renders a `<video>` element but doesn't sync its `currentTime` with the clip's local time
  - The video element is muted and static - it doesn't actually play or seek
  - **File:** `frontend/src/components/Preview/VideoPlayer.jsx` (lines 174-210)
  - **Solution:** Added useEffect to sync video.currentTime with clipLocalTime and handle play/pause

### 2. Audio Layer Time Sync Not Driving Timeline
- [ ] **Audio onTimeUpdate callback is incomplete**
  - The `AudioLayer` component has an empty implementation for `onTimeUpdate`
  - This means audio playback doesn't properly drive the timeline position
  - **File:** `frontend/src/components/Preview/VideoPlayer.jsx` (lines 166-168)
  - **Solution:** Implement proper time update logic similar to PreviewAssetLayer

### 3. Play/Pause State Not Persisting
- [ ] **Play button state resets when switching between preview and timeline mode**
  - When clicking on an asset in the library vs having clips on timeline
  - The isPlaying state needs to be coordinated properly

### 4. Keyboard Shortcuts ✅ IMPLEMENTED
- [x] **Missing keyboard shortcuts for common actions**
  - ✅ Ctrl+Z for undo
  - ✅ Ctrl+Y/Ctrl+Shift+Z for redo
  - ✅ Space for play/pause
  - ✅ V for select tool, B for ripple tool
  - ✅ S for split at playhead
  - ✅ Arrow keys for frame navigation
  - ✅ Home for go to start
  - **File:** `frontend/src/App.jsx`

---

## 🎨 UI/UX Enhancements (Medium Priority)

### 5. Playback Controls ✅ ADDED
- [x] **Added timeline scrubbing/seeking controls**
  - ✅ Skip to start/end buttons
  - ✅ Frame-by-frame navigation
  - ✅ Clickable progress bar for seeking
  - **File:** `frontend/src/components/Preview/VideoPlayer.jsx`

### 6. No Visual Feedback for Clip Selection
- [ ] **Clips cannot be selected on the timeline**
  - No selection highlighting
  - No selection-based actions
  - **File:** `frontend/src/components/Timeline/Clip.jsx`
  - **Solution:** Add selectedClipId state and visual indicator

### 7. Progress Indicator on Video Preview ✅ ADDED
- [x] **Added scrubber/progress bar on the video preview**
  - ✅ Shows current position relative to total duration
  - ✅ Clickable progress bar for seeking
  - ✅ Time display (current / total)
  - **File:** `frontend/src/components/Preview/VideoPlayer.jsx`

### 8. Timeline Track Management
- [ ] **Cannot add/remove tracks dynamically**
  - Tracks are fixed at 4 (2 video, 2 audio)
  - No way to add more tracks or remove unused ones
  - **Files:** `frontend/src/hooks/useProject.js`, `frontend/src/components/Timeline/Timeline.jsx`

### 9. Clip Settings Panel Positioning
- [ ] **Settings panel can overflow viewport**
  - When right-clicking clips near edges, the settings panel may be cut off
  - **File:** `frontend/src/components/Timeline/Clip.jsx` (line 223)
  - **Solution:** Add boundary detection and adjust position

---

## ⚡ Feature Enhancements (Phase 2)

### 10. Text Overlay Improvements
- [ ] **Text overlays need styling options**
  - Currently only plain text supported
  - Need: font size, color, position (top/center/bottom), animation
  - **Files:** `frontend/src/components/Timeline/Clip.jsx`, `frontend/src/components/Preview/VideoPlayer.jsx`

### 11. Transitions Between Clips
- [ ] **No transition support**
  - No fade, dissolve, wipe, etc.
  - Requires timeline UI updates to show transition zones
  - **Status:** Not started - Phase 2 feature

### 12. More Filters/Effects ✅ ADDED
- [x] **Added more filter options**
  - ✅ Basic: Grayscale, Sepia, Invert
  - ✅ Adjustments: Blur, Brighten, Darken, High Contrast, Saturate, Desaturate
  - ✅ Color Effects: Hue Shift, Vintage, Cool Tone, Warm Tone
  - ✅ More speed options: 0.25x, 0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x, 3x, 4x
  - **Files:** `frontend/src/components/Timeline/Clip.jsx`, `frontend/src/components/Preview/VideoPlayer.jsx`

### 13. Multi-Track Audio Mixing
- [ ] **No audio level meters**
  - Can't visualize audio levels in real-time
  - Need visual feedback during playback

### 14. Project Auto-Save
- [ ] **No auto-save functionality**
  - Risk of losing work on browser crash
  - **Solution:** Implement LocalStorage/IndexedDB auto-save with periodic saves

### 15. Export Options
- [ ] **Limited export configuration**
  - No resolution selection
  - No frame rate selection  
  - No quality/bitrate options
  - **Files:** `frontend/src/components/Export/ExportPanel.jsx`, `backend/src/routes/export.js`

---

## 🔧 Code Quality & Performance

### 16. Memory Management
- [ ] **Video elements may not be properly cleaned up**
  - Multiple video/audio elements created for each clip
  - Need to ensure proper cleanup on unmount
  - **File:** `frontend/src/components/Preview/VideoPlayer.jsx`

### 17. Large Project Performance
- [ ] **Performance may degrade with many clips**
  - All clips are rendered regardless of visibility
  - Consider virtualization for timeline with many clips

### 18. Error Handling
- [ ] **Missing error boundaries**
  - No React Error Boundaries for graceful error handling
  - Backend errors not always displayed clearly to user

### 19. TypeScript Migration (Nice to Have)
- [ ] **Convert to TypeScript for better type safety**
  - Would help catch bugs at compile time
  - Improve IDE support

---

## 📋 Implementation Order

1. **Critical Fixes:**
   - [x] Fix VideoPlayer playback sync (#1) ✅
   - [x] Implement keyboard shortcuts (#4) ✅
   
2. **High Impact UX:**
   - [ ] Add clip selection (#6)
   - [x] Add playback controls (#5) ✅
   - [x] Add progress bar on preview (#7) ✅
   
3. **Features:**
   - [ ] Enhance text overlays (#10)
   - [x] Add more filters (#12) ✅
   - [ ] Export options (#15)

4. **Polish:**
   - [ ] Auto-save (#14)
   - [ ] Track management (#8)
   - [ ] Error handling (#18)

---

## Progress Tracking

| Task | Status | Date Started | Date Completed |
|------|--------|--------------|----------------|
| Video Playback Sync | ✅ Complete | 2026-02-06 | 2026-02-06 |
| Keyboard Shortcuts | ✅ Complete | 2026-02-06 | 2026-02-06 |
| Playback Controls | ✅ Complete | 2026-02-06 | 2026-02-06 |
| Progress Bar | ✅ Complete | 2026-02-06 | 2026-02-06 |
| More Filters | ✅ Complete | 2026-02-06 | 2026-02-06 |
| Clip Selection | ⏳ Pending | - | - |
| Text Overlays | ⏳ Pending | - | - |
| Export Options | ⏳ Pending | - | - |

---

*Last Updated: 2026-02-06*
