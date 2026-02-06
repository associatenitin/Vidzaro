import { useState } from 'react';
import { useProject } from './hooks/useProject';
import Toolbar from './components/Toolbar/Toolbar';
import VideoPlayer from './components/Preview/VideoPlayer';
import Timeline from './components/Timeline/Timeline';
import ExportPanel from './components/Export/ExportPanel';
import UploadArea from './components/Upload/UploadArea';

function App() {
  const {
    project,
    addClip,
    removeClip,
    updateClip,
    reorderClips,
    splitClip,
    setProjectName,
  } = useProject();

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showExportPanel, setShowExportPanel] = useState(false);

  const handleTimeUpdate = (time) => {
    setCurrentTime(time);
  };

  const handlePlayPause = (playing) => {
    setIsPlaying(playing);
  };

  const handleSplit = () => {
    if (project.clips.length === 0) return;

    // Find clip at current time
    let accumulatedTime = 0;
    for (const clip of project.clips) {
      const clipDuration = (clip.trimEnd || clip.endTime) - (clip.trimStart || 0);
      if (currentTime >= accumulatedTime && currentTime <= accumulatedTime + clipDuration) {
        const splitTime = accumulatedTime + (clip.trimStart || 0);
        splitClip(clip.id, splitTime);
        break;
      }
      accumulatedTime += clipDuration;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Vidzaro</h1>
            <p className="text-sm text-slate-400">Edit videos. Zero limits.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowExportPanel(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium"
              disabled={project.clips.length === 0}
            >
              Export
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {project.clips.length === 0 ? (
          <UploadArea onUpload={addClip} />
        ) : (
          <>
            {/* Toolbar */}
            <Toolbar
              onSplit={handleSplit}
              currentTime={currentTime}
              isPlaying={isPlaying}
              onPlayPause={handlePlayPause}
            />

            {/* Preview Player */}
            <div className="flex-1 flex items-center justify-center bg-slate-950 p-6">
              <VideoPlayer
                project={project}
                currentTime={currentTime}
                onTimeUpdate={handleTimeUpdate}
                onPlayPause={handlePlayPause}
              />
            </div>

            {/* Timeline */}
            <div className="h-64 bg-slate-800 border-t border-slate-700">
              <Timeline
                project={project}
                currentTime={currentTime}
                onTimeUpdate={setCurrentTime}
                onClipUpdate={updateClip}
                onClipRemove={removeClip}
                onReorder={reorderClips}
              />
            </div>
          </>
        )}
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
