import { useState } from 'react';
import { useProject } from './hooks/useProject';
import MediaLibrary from './components/Library/MediaLibrary';
import MenuBar from './components/MenuBar/MenuBar';
import HeaderBrand from './components/Logo/HeaderBrand';
import ArcaneMistBg from './components/Logo/MagicWandBg';
import Toolbar from './components/Toolbar/Toolbar';
import VideoPlayer from './components/Preview/VideoPlayer';
import Timeline from './components/Timeline/Timeline';
import ExportPanel from './components/Export/ExportPanel';
import FileDialog from './components/Project/FileDialog';
import SaveDialog from './components/Project/SaveDialog';
import Recorder from './components/Recorder/Recorder';
import ShareDialog from './components/Share/ShareDialog';
import MorphWizard from './components/Morph/MorphWizard';
import PreferencesDialog from './components/Preferences/PreferencesDialog';
import { ToastContainer } from './components/Toast';
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
    resetProject,
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
  const [showMorphWizard, setShowMorphWizard] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
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

  // When user selects a clip on the timeline, seek playhead into it so the player shows that clip
  useEffect(() => {
    if (!selectedClipId || !project.clips.length) return;
    const clip = project.clips.find(c => c.id === selectedClipId);
    if (!clip) return;
    const start = clip.startPos ?? 0;
    const duration = ((clip.trimEnd ?? clip.endTime) - (clip.trimStart ?? 0)) / (clip.speed || 1);
    const end = start + duration;
    if (currentTime < start || currentTime > end) {
      setCurrentTime(start);
    }
  }, [selectedClipId, project.clips]);

  // Pause playback when switching between preview mode and timeline mode
  useEffect(() => {
    // When switching modes (selectedAsset changes), pause playback to avoid confusion
    if (isPlaying) {
      setIsPlaying(false);
    }
  }, [selectedAsset?.id]); // Only trigger when the selected asset ID changes (switching modes)

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

  const handleNewProject = () => {
    if (project.clips.length > 0 || project.assets.length > 0) {
      if (!window.confirm('Start a new project? Unsaved changes will be lost.')) return;
    }
    resetProject();
    setCurrentTime(0);
    setIsPlaying(false);
    setSelectedClipId(null);
    setSelectedAsset(null);
  };

  const handleResetTimelineHeight = () => {
    setTimelineHeight(300);
  };

  const handleDeleteSelected = () => {
    if (selectedClipId) {
      removeClip(selectedClipId);
      setSelectedClipId(null);
    }
  };

  const handleDeselect = () => {
    setSelectedClipId(null);
    setSelectedAsset(null);
  };

  const handleKeyboardShortcuts = () => {
    alert(
      'Playback: Space — Play/Pause\n' +
      'Edit: Ctrl+Z — Undo | Ctrl+Shift+Z — Redo\n' +
      'Tools: V — Select | B — Ripple | S — Split at playhead\n' +
      'Navigate: ←/→ — Seek 1 frame | Shift+←/→ — Seek 1 sec | Home — Start\n' +
      'Clip: Del/Backspace — Delete selected | Esc — Deselect\n' +
      'File: Ctrl+N — New | Ctrl+O — Open | Ctrl+S — Save'
    );
  };

  const handleAbout = () => {
    alert('Vidzaro — Edit videos. Zero limits.\n\nA video editor in the browser.');
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

      if (e.code === 'Space') { e.preventDefault(); setIsPlaying(!isPlaying); }
      if (e.ctrlKey && e.code === 'KeyN') { e.preventDefault(); handleNewProject(); }
      if (e.ctrlKey && e.code === 'KeyO') { e.preventDefault(); handleLoad(); }
      if (e.ctrlKey && e.code === 'KeyS') { e.preventDefault(); handleSave(); }
      if (e.ctrlKey && !e.shiftKey && e.code === 'KeyZ') { e.preventDefault(); if (canUndo) undo(); }
      if ((e.ctrlKey && e.code === 'KeyY') || (e.ctrlKey && e.shiftKey && e.code === 'KeyZ')) { e.preventDefault(); if (canRedo) redo(); }
      if (e.code === 'KeyV' && !e.ctrlKey) setActiveTool('select');
      if (e.code === 'KeyB' && !e.ctrlKey) setActiveTool('ripple');
      if (e.code === 'KeyS' && !e.ctrlKey) handleSplit();
      if (e.code === 'ArrowLeft') { e.preventDefault(); const step = e.shiftKey ? 1 : 1 / 30; setCurrentTime(Math.max(0, currentTime - step)); }
      if (e.code === 'ArrowRight') { e.preventDefault(); const step = e.shiftKey ? 1 : 1 / 30; setCurrentTime(currentTime + step); }
      if (e.code === 'Home') { e.preventDefault(); setCurrentTime(0); }
      if ((e.code === 'Delete' || e.code === 'Backspace') && selectedClipId) { e.preventDefault(); removeClip(selectedClipId); setSelectedClipId(null); }
      if (e.code === 'Escape') { setSelectedClipId(null); setSelectedAsset(null); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, canUndo, canRedo, undo, redo, setActiveTool, currentTime, selectedClipId, removeClip, handleNewProject, handleLoad, handleSave]);

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
      {/* Menu bar & header */}
      <header className="relative overflow-hidden bg-slate-800 border-b border-slate-700 px-4 py-0 flex-shrink-0 h-12 flex items-center gap-6">
        <ArcaneMistBg />
        <div className="relative z-10 flex items-center gap-6 flex-1 min-w-0">
          <HeaderBrand />
        <MenuBar
          onNewProject={handleNewProject}
          onOpen={handleLoad}
          onSave={handleSave}
          onSaveAs={handleSave}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          onDeleteSelected={handleDeleteSelected}
          onDeselect={handleDeselect}
          hasSelection={!!selectedClipId}
          onStartRecording={() => setShowRecorder(true)}
          onVideoMorph={() => setShowMorphWizard(true)}
          onOpenPreferences={() => setShowPreferences(true)}
          onExport={() => setShowExportPanel(true)}
          canExport={project.clips.length > 0}
          onKeyboardShortcuts={handleKeyboardShortcuts}
          onAbout={handleAbout}
          onResetTimelineHeight={handleResetTimelineHeight}
        />
          <input
            type="text"
            value={project.name}
            onChange={(e) => setProjectName(e.target.value)}
            className="ml-auto bg-slate-900 border border-slate-700 px-3 py-1.5 rounded text-sm focus:outline-none focus:border-blue-500 w-52 placeholder-slate-500"
            placeholder="Project name"
          />
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
            onAssetSelect={(asset) => {
              setSelectedAsset(asset);
              if (asset) setSelectedClipId(null); // single selection: library takes precedence
            }}
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
            onOpenPreferences={() => setShowPreferences(true)}
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
          onClipSelect={(clipId) => {
            setSelectedClipId(clipId);
            if (clipId != null) setSelectedAsset(null); // single selection: timeline takes precedence
          }}
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

      <PreferencesDialog
        isOpen={showPreferences}
        onClose={() => setShowPreferences(false)}
      />

      {showMorphWizard && (
        <MorphWizard
          project={project}
          onClose={() => setShowMorphWizard(false)}
          onComplete={(asset) => {
            addAsset(asset);
            addClip(asset, null);
          }}
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
              // Error toast will be shown by axios interceptor
            }
          }}
        />
      )}
      
      {/* Toast notifications for errors */}
      <ToastContainer />
    </div>
  );
}

export default App;
