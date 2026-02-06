import { useState } from 'react';
import { useProject } from './hooks/useProject';
import MediaLibrary from './components/Library/MediaLibrary';
import Toolbar from './components/Toolbar/Toolbar';
import VideoPlayer from './components/Preview/VideoPlayer';
import Timeline from './components/Timeline/Timeline';
import ExportPanel from './components/Export/ExportPanel';
import FileDialog from './components/Project/FileDialog';
import SaveDialog from './components/Project/SaveDialog';
import Recorder from './components/Recorder/Recorder';
import ShareDialog from './components/Share/ShareDialog';
import { useEffect } from 'react';
import { saveProject, uploadVideo, finalizeRecording } from './services/api';

function App() {
  const {
    project,
    addClip,
    removeClip,
    updateClip,
    reorderClips,
    splitClip,
    detachAudio,
    setProjectName,
    updateTrack,
    addAsset,
    removeAsset,
    renameAsset,
    addTrack,
    removeTrack,
    loadProjectData,
    loadAutoSave,
    clearAutoSave,
    activeTool,
    setActiveTool,
    undo,
    redo,
    canUndo,
    canRedo
  } = useProject();

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);
  const [shareDialogAsset, setShareDialogAsset] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null); // Asset selected for preview
  const [selectedClipId, setSelectedClipId] = useState(null); // Clip selected on timeline

  // Initial load check for autosave
  useEffect(() => {
    const recovered = loadAutoSave();
    if (recovered) {
      console.log('Project recovered from auto-save');
    }
  }, [loadAutoSave]);

  // Layout state
  const [timelineHeight, setTimelineHeight] = useState(300); // Initial height in pixels
  const [isResizing, setIsResizing] = useState(false);

  const handleTimeUpdate = (time) => {
    setCurrentTime(time);
  };

  const handlePlayPause = (playing) => {
    setIsPlaying(playing);
  };

  const handleSplit = () => {
    if (project.clips.length === 0) return;

    // If a clip is selected, split that clip
    if (selectedClipId) {
      const selectedClip = project.clips.find(c => c.id === selectedClipId);
      if (selectedClip) {
        const start = selectedClip.startPos || 0;
        const end = start + ((selectedClip.trimEnd || selectedClip.endTime) - (selectedClip.trimStart || 0)) / (selectedClip.speed || 1);
        // Only split if playhead is within the selected clip
        if (currentTime > start && currentTime < end) {
          splitClip(selectedClipId, currentTime);
          return;
        }
      }
    }

    // Otherwise, split top-most visible clip under playhead
    const clipsUnderPlayhead = project.clips.filter(clip => {
      const start = clip.startPos || 0;
      const end = start + ((clip.trimEnd || clip.endTime) - (clip.trimStart || 0)) / (clip.speed || 1);
      return currentTime > start && currentTime < end;
    }).sort((a, b) => (b.track || 0) - (a.track || 0));

    if (clipsUnderPlayhead.length > 0) {
      splitClip(clipsUnderPlayhead[0].id, currentTime);
    }
  };

  // Resize Handlers
  const startResizing = (e) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e) => {
      // Calculate new height from bottom
      const newHeight = window.innerHeight - e.clientY;
      setTimelineHeight(Math.max(150, Math.min(newHeight, window.innerHeight - 150)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
      }

      // Space - Play/Pause
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(!isPlaying);
      }

      // Ctrl+Z - Undo
      if (e.ctrlKey && !e.shiftKey && e.code === 'KeyZ') {
        e.preventDefault();
        if (canUndo) undo();
      }

      // Ctrl+Y or Ctrl+Shift+Z - Redo
      if ((e.ctrlKey && e.code === 'KeyY') || (e.ctrlKey && e.shiftKey && e.code === 'KeyZ')) {
        e.preventDefault();
        if (canRedo) redo();
      }

      // V - Select tool
      if (e.code === 'KeyV' && !e.ctrlKey) {
        setActiveTool('select');
      }

      // B - Ripple tool
      if (e.code === 'KeyB' && !e.ctrlKey) {
        setActiveTool('ripple');
      }

      // S - Split at playhead
      if (e.code === 'KeyS' && !e.ctrlKey) {
        handleSplit();
      }

      // Left/Right arrows - Seek by small amount
      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 1 / 30; // 1 second if shift, else 1 frame (30fps)
        setCurrentTime(Math.max(0, currentTime - step));
      }

      if (e.code === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 1 / 30;
        setCurrentTime(currentTime + step);
      }

      // Home - Go to start
      if (e.code === 'Home') {
        e.preventDefault();
        setCurrentTime(0);
      }

      // Delete or Backspace - Remove selected clip
      if ((e.code === 'Delete' || e.code === 'Backspace') && selectedClipId) {
        e.preventDefault();
        removeClip(selectedClipId);
        setSelectedClipId(null);
      }

      // Escape - Deselect clip
      if (e.code === 'Escape') {
        setSelectedClipId(null);
        setSelectedAsset(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, canUndo, canRedo, undo, redo, setActiveTool, currentTime, selectedClipId, removeClip]);

  const handleSave = () => {
    setShowSaveDialog(true);
  };

  const handleSaveProject = () => {
    // Return the project data to save
    return {
      ...project,
      updatedAt: new Date().toISOString(),
    };
  };

  const handleSaveComplete = async (projectData, fileName) => {
    // Update project name if it was changed
    if (projectData.name !== project.name) {
      setProjectName(projectData.name);
    }

    // Optionally also save to server for backup/cloud sync
    try {
      await saveProject(projectData);
    } catch (error) {
      console.error('Failed to save project to server:', error);
      // Don't show error to user as local save succeeded
    }
  };

  const handleLoad = () => {
    setShowLoadDialog(true);
  };

  const handleFileSelected = async (projectData, fileName, filePath) => {
    try {
      loadProjectData(projectData);
      setProjectName(projectData.name || 'Untitled Project');
      alert(`Project loaded successfully!\n\nFile: ${fileName}`);
    } catch (error) {
      console.error('Load failed:', error);
      alert('Failed to load project. Please ensure it is a valid project file.');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100 overflow-hidden">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-2 flex-shrink-0 h-14">
        <div className="flex items-center justify-between h-full">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-white">Vidzaro</h1>
            <input
              type="text"
              value={project.name}
              onChange={(e) => setProjectName(e.target.value)}
              className="bg-slate-900 border border-slate-700 px-3 py-1 rounded text-sm focus:outline-none focus:border-blue-500 w-48"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleLoad}
              className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium border border-slate-600"
            >
              Load
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium border border-slate-600"
            >
              Save
            </button>
            <button
              onClick={() => setShowRecorder(true)}
              className="px-4 py-1.5 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium"
            >
              Record
            </button>
            <button
              onClick={() => setShowExportPanel(true)}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium"
              disabled={project.clips.length === 0}
            >
              Export
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area (Upper Section) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Media Library Panel */}
        <div className="w-80 flex-shrink-0 flex flex-col border-r border-slate-700 bg-slate-900">
          <MediaLibrary
            project={project}
            onAddAsset={addAsset}
            onUpload={addAsset} // Unified
            onRemoveAsset={removeAsset}
            onRenameAsset={renameAsset}
            onAddToTimeline={(asset, trackId) => {
              // If trackId is provided, add at start of that track
              // Otherwise, add at end of track 0
              const position = trackId !== undefined ? { track: trackId, time: 0 } : null;
              addClip(asset, position);
            }}
            onAssetSelect={setSelectedAsset}
            selectedAssetId={selectedAsset?.id}
            onShare={(asset) => setShareDialogAsset(asset)}
          />
        </div>

        {/* Center/Preview Area */}
        <div className="flex-1 flex flex-col bg-slate-950 min-w-0">
          <Toolbar
            onSplit={handleSplit}
            currentTime={currentTime}
            isPlaying={isPlaying}
            onPlayPause={handlePlayPause}
            activeTool={activeTool}
            onToolChange={setActiveTool}
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
          />
          <div className="flex-1 flex items-center justify-center p-4 overflow-hidden relative">
            <VideoPlayer
              project={project}
              currentTime={currentTime}
              isPlaying={isPlaying}
              onTimeUpdate={handleTimeUpdate}
              onPlayPause={handlePlayPause}
              previewAsset={selectedAsset}
            />
          </div>
        </div>
      </div>

      {/* Resizer Handle */}
      <div
        className="h-2 bg-slate-800 border-y border-slate-700 cursor-row-resize hover:bg-blue-500/50 flex items-center justify-center z-50 flex-shrink-0"
        onMouseDown={startResizing}
      >
        <div className="w-10 h-1 bg-slate-600 rounded-full"></div>
      </div>

      {/* Timeline (Lower Section) */}
      <div style={{ height: `${timelineHeight}px` }} className="flex-shrink-0 bg-slate-800">
        <Timeline
          project={project}
          currentTime={currentTime}
          onTimeUpdate={setCurrentTime}
          onClipUpdate={updateClip}
          onClipRemove={removeClip}
          onReorder={reorderClips}
          onTrackUpdate={updateTrack}
          onDropAsset={(asset, pos) => addClip(asset, pos)}
          onDetachAudio={detachAudio}
          activeTool={activeTool}
          selectedClipId={selectedClipId}
          onClipSelect={setSelectedClipId}
          onAddTrack={addTrack}
          onRemoveTrack={removeTrack}
        />
      </div>

      {/* Export Panel Modal */}
      {showExportPanel && (
        <ExportPanel
          project={project}
          onClose={() => setShowExportPanel(false)}
        />
      )}

      {/* File Dialog for Loading Projects */}
      <FileDialog
        isOpen={showLoadDialog}
        onClose={() => setShowLoadDialog(false)}
        onSelectFile={handleFileSelected}
        title="Load Project"
      />

      {/* Save Dialog for Saving Projects */}
      <SaveDialog
        isOpen={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        projectName={project.name}
        onSave={handleSaveProject}
        onSaveComplete={handleSaveComplete}
        title="Save Project"
      />

      {shareDialogAsset && (
        <ShareDialog
          asset={shareDialogAsset}
          onClose={() => setShareDialogAsset(null)}
        />
      )}

      {showRecorder && (
        <Recorder
          onClose={() => setShowRecorder(false)}
          onRecordingComplete={async (blob, saveOptions) => {
            const file = new File([blob], 'recording.webm', { type: 'video/webm' });
            try {
              const response = saveOptions
                ? await finalizeRecording(file, saveOptions)
                : await uploadVideo(file);
              const assetData = response.data;
              addAsset(assetData);
              addClip(assetData, null);
            } catch (err) {
              console.error('Upload recording failed:', err);
              alert('Failed to upload recording');
            }
          }}
        />
      )}
    </div>
  );
}

export default App;
