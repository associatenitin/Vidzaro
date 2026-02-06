import { useState } from 'react';
import { useProject } from './hooks/useProject';
import MediaLibrary from './components/Library/MediaLibrary';
import Toolbar from './components/Toolbar/Toolbar';
import VideoPlayer from './components/Preview/VideoPlayer';
import Timeline from './components/Timeline/Timeline';
import ExportPanel from './components/Export/ExportPanel';
import { useEffect } from 'react';

function App() {
  const {
    project,
    addClip,
    removeClip,
    updateClip,
    reorderClips,
    splitClip,
    setProjectName,
    updateTrack,
    addAsset,
    activeTool,
    setActiveTool,
  } = useProject();

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showExportPanel, setShowExportPanel] = useState(false);

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
    // Find clip at current time
    // This logic needs to be updated for multitrack but works for active track usually
    // For now simple implementation: split all clips under playhead

    // Better: Only split selected clip or top clip
    // Reusing existing split logic for now, but extending to scan all tracks?
    // The current splitClip takes an ID. We need to find the ID.

    // Simple heuristic: Split top-most visible clip under playhead
    const clipsUnderPlayhead = project.clips.filter(clip => {
      const start = clip.startPos || 0;
      const end = start + ((clip.trimEnd || clip.endTime) - (clip.trimStart || 0)) / (clip.speed || 1);
      return currentTime > start && currentTime < end;
    }).sort((a, b) => (b.track || 0) - (a.track || 0));

    if (clipsUnderPlayhead.length > 0) {
      // Split the top one
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

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100 overflow-hidden">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-2 flex-shrink-0 h-14">
        <div className="flex items-center justify-between h-full">
          <div>
            <h1 className="text-xl font-bold text-white">Vidzaro</h1>
          </div>
          <div className="flex gap-2">
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
          />
          <div className="flex-1 flex items-center justify-center p-4 overflow-hidden relative">
            <VideoPlayer
              project={project}
              currentTime={currentTime}
              onTimeUpdate={handleTimeUpdate}
              onPlayPause={handlePlayPause}
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
          activeTool={activeTool}
        />
      </div>

      {/* Export Panel Modal */}
      {showExportPanel && (
        <ExportPanel
          project={project}
          onClose={() => setShowExportPanel(false)}
        />
      )}
    </div>
  );
}

export default App;
