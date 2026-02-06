import { useState, useRef, useEffect } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import Clip from './Clip';

const PIXELS_PER_SECOND = 50; // Base zoom level

export default function Timeline({ project, currentTime, onTimeUpdate, onClipUpdate, onClipRemove, onReorder, onTrackUpdate, onDropAsset, activeTool }) {
  const [zoom, setZoom] = useState(1);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const timelineRef = useRef(null);
  const [draggedClipId, setDraggedClipId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const sortedClips = [...project.clips].sort((a, b) => a.order - b.order);

  // Ensure we have tracks, fallback for safety
  const tracks = project.tracks || [
    { id: 0, label: 'Video 1', type: 'video', muted: false, locked: false, hidden: false, height: 80 },
    { id: 1, label: 'Video 2', type: 'video', muted: false, locked: false, hidden: false, height: 80 },
    { id: 2, label: 'Audio 1', type: 'audio', muted: false, locked: false, hidden: false, height: 60 },
    { id: 3, label: 'Audio 2', type: 'audio', muted: false, locked: false, hidden: false, height: 60 },
  ];

  const totalDuration = sortedClips.reduce((max, clip) => {
    const clipEnd = (clip.startPos || 0) + (((clip.trimEnd || clip.endTime) - (clip.trimStart || 0)) / (clip.speed || 1));
    return Math.max(max, clipEnd);
  }, 10);

  const timelineWidth = Math.max(window.innerWidth - 192, totalDuration * PIXELS_PER_SECOND * zoom); // 192 is sidebar width

  const handleDragEnd = (event) => {
    const { active, over, delta } = event;
    setDraggedClipId(null);

    const activeClip = sortedClips.find(c => c.id === active.id);
    if (!activeClip) return;

    // Track switching logic
    const deltaY = delta.y;

    // Time update
    const deltaX = delta.x;
    const deltaTime = deltaX / (PIXELS_PER_SECOND * zoom);
    let newStartPos = Math.max(0, (activeClip.startPos || 0) + deltaTime);

    // Snapping Logic
    if (snapEnabled) {
      const SNAP_THRESHOLD = 10 / (PIXELS_PER_SECOND * zoom);
      let closestSnap = null;
      let minDiff = Infinity;

      const snapPoints = [currentTime];
      sortedClips.forEach(c => {
        if (c.id === active.id) return;
        snapPoints.push(c.startPos || 0);
        const cDuration = ((c.trimEnd || c.endTime) - (c.trimStart || 0)) / (c.speed || 1);
        snapPoints.push((c.startPos || 0) + cDuration);
      });

      // Check distance to snap points
      snapPoints.forEach(point => {
        const diff = Math.abs(newStartPos - point);
        if (diff < SNAP_THRESHOLD && diff < minDiff) {
          minDiff = diff;
          closestSnap = point;
        }
        // Also check snap of the CLIP END to the point
        const activeDuration = ((activeClip.trimEnd || activeClip.endTime) - (activeClip.trimStart || 0)) / (activeClip.speed || 1);
        const endDiff = Math.abs((newStartPos + activeDuration) - point);
        if (endDiff < SNAP_THRESHOLD && endDiff < minDiff) {
          minDiff = endDiff;
          closestSnap = point - activeDuration;
        }
      });

      if (closestSnap !== null) {
        newStartPos = closestSnap;
      }
    }

    // Track switching logic
    // Determine new Track
    // Simplified: Just use the delta to move N tracks up/down
    const trackChange = Math.round(deltaY / 80); // Assuming 80px height
    const currentTrackIndex = tracks.findIndex(t => t.id === (activeClip.track || 0));
    const newTrackIndex = Math.max(0, Math.min(tracks.length - 1, currentTrackIndex + trackChange));
    const newTrackId = tracks[newTrackIndex].id;

    if (activeTool === 'ripple' && newTrackId === (activeClip.track || 0)) {
      // Simple Ripple: Shift all clips starting after this clip on the same track by the delta amount
      const offset = newStartPos - (activeClip.startPos || 0);

      // Update dragged clip
      onClipUpdate(active.id, { startPos: newStartPos });

      // Find later clips on same track
      const laterClips = sortedClips.filter(c =>
        c.id !== active.id &&
        (c.track || 0) === newTrackId &&
        (c.startPos || 0) > (activeClip.startPos || 0)
      );

      laterClips.forEach(c => {
        onClipUpdate(c.id, { startPos: (c.startPos || 0) + offset });
      });
    } else {
      // Standard Overwrite / Move
      onClipUpdate(active.id, { startPos: newStartPos, track: newTrackId });
    }
  };

  const handleTimelineClick = (e) => {
    // Need to account for sidebar width and scrolling
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = (x / (PIXELS_PER_SECOND * zoom));
    onTimeUpdate(Math.max(0, Math.min(time, totalDuration)));
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * 30); // 30fps approx
    return `${mins}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  };

  const timeMarkers = [];
  const markerInterval = zoom < 0.5 ? 10 : zoom < 1 ? 5 : 1;
  for (let i = 0; i <= totalDuration; i += markerInterval) {
    timeMarkers.push(i);
  }

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const json = e.dataTransfer.getData('application/json');
    if (!json) return;

    try {
      const data = JSON.parse(json);
      if (data.type === 'asset' && onClipUpdate) { // onClipUpdate checks if we are in valid context, actually we need a new prop onDropAsset
        // Calculate drop position
        const rect = timelineRef.current.getBoundingClientRect();

        // X coordinate -> Time
        // Adjust for scroll if necessary (timelineRef overflow-x)
        // The event clientX is relative to viewport.
        // timelineRef.current is the scrolling container.
        // The inner div has the width.

        const scrollLeft = timelineRef.current.scrollLeft;
        const x = e.clientX - rect.left + scrollLeft;
        // Timeline starts at some left padding usually? In our case, Tracks Content is "relative" inside.
        // Let's look at structure:
        // <div className="flex-1 overflow-x-auto" ref={timelineRef}>
        //   <div relative minWidth ...> 
        //      <div absolute top-8 ... tracks container>

        const time = Math.max(0, x / (PIXELS_PER_SECOND * zoom));

        // Y coordinate -> Track
        // We need y relative to the Tracks Container top.
        // The tracks container is top-8 (32px) down.
        const y = e.clientY - rect.top; // Relative to visible top
        // Adjust for scrollY if we had vertical scroll (which we do in main area)

        // We need to match the track structure
        // The track container: <div className="absolute top-8 ..."> 
        // Header height is 40px (10rem class? no h-10 is 40px). Ruler is h-8 (32px).
        // So tracks start at 32px relative to timelineRef content.

        const tracksStartY = 32;
        const relativeY = y - tracksStartY + timelineRef.current.scrollTop;

        const trackHeight = 80; // Approximate
        const trackIndex = Math.floor(relativeY / trackHeight);

        // Bounds check
        if (trackIndex >= 0 && trackIndex < tracks.length) {
          const trackId = tracks[trackIndex].id;
          if (onDropAsset) {
            onDropAsset(data, { time, track: trackId });
          }
        }
      }
    } catch (err) {
      console.error('Drop failed', err);
    }
  };

  return (
    <div
      className="h-full flex flex-col bg-slate-900 border-t border-slate-700 select-none"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Timeline Toolbar (Zoom, Snap, etc.) */}
      <div className="h-10 px-4 flex items-center justify-between border-b border-slate-700 bg-slate-800">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Zoom</span>
            <button onClick={() => setZoom(Math.max(0.25, zoom - 0.25))} className="p-1 hover:bg-slate-700 rounded">➖</button>
            <span className="text-xs w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(Math.min(4, zoom + 0.25))} className="p-1 hover:bg-slate-700 rounded">➕</button>
          </div>
          <div className="h-4 w-px bg-slate-700"></div>
          <button
            onClick={() => setSnapEnabled(!snapEnabled)}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${snapEnabled ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`}
          >
            🧲 Snap {snapEnabled ? 'On' : 'Off'}
          </button>
        </div>
        <div className="text-xs text-slate-400 font-mono">
          TC: {formatTime(currentTime)}
        </div>
      </div>

      {/* Main Timeline Area (Sidebar + Ruler + Tracks) */}
      <div className="flex-1 overflow-auto relative custom-scrollbar">
        <div className="min-w-full inline-block relative">

          {/* Top Ruler & Corner */}
          <div className="flex sticky top-0 z-30 h-8 bg-slate-800 border-b border-slate-700">
            {/* Corner */}
            <div className="w-48 flex-shrink-0 sticky left-0 z-40 bg-slate-800 border-r border-slate-700 flex items-center px-2">
              <span className="text-xs font-bold text-slate-500">TRACKS</span>
            </div>

            {/* Ruler Content */}
            <div
              className="flex-1 relative cursor-pointer"
              style={{ width: `${timelineWidth}px`, minWidth: '100%' }}
              onClick={handleTimelineClick}
            >
              {timeMarkers.map((time) => (
                <div
                  key={time}
                  className="absolute top-0 bottom-0 border-l border-slate-600 h-full group"
                  style={{ left: `${time * PIXELS_PER_SECOND * zoom}px` }}
                >
                  <span className="absolute top-1 left-1 text-[10px] text-slate-500 font-mono group-hover:text-white">
                    {formatTime(time).split(':')[0]}:{formatTime(time).split(':')[1]}
                  </span>
                </div>
              ))}

              {/* Playhead Head */}
              <div
                className="absolute top-0 bottom-0 w-px bg-red-500 z-50 pointer-events-none"
                style={{ left: `${currentTime * PIXELS_PER_SECOND * zoom}px` }}
              >
                <div className="absolute -top-0 -translate-x-1/2 text-red-500">▼</div>
              </div>
            </div>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={(event) => setDraggedClipId(event.active.id)}
            onDragEnd={handleDragEnd}
          >
            {/* Tracks List */}
            <div className="flex flex-col">
              {tracks.map((track) => (
                <div key={track.id} className="flex relative" style={{ height: `${track.height}px` }}>

                  {/* Track Header (Sidebar) */}
                  <div className="w-48 flex-shrink-0 sticky left-0 z-20 bg-slate-800 border-b border-r border-slate-700 flex flex-col justify-center px-2 gap-1 group">
                    <div className="flex items-center justify-between">
                      <input
                        type="text"
                        value={track.label}
                        onChange={(e) => onTrackUpdate(track.id, { label: e.target.value })}
                        className="bg-transparent text-xs font-medium text-slate-300 focus:text-white outline-none w-24"
                      />
                      <div className="flex gap-1">
                        <button onClick={() => onTrackUpdate(track.id, { hidden: !track.hidden })} className={`p-1 rounded ${track.hidden ? 'text-slate-500' : 'text-slate-300 hover:text-white'}`}>
                          {track.hidden ? '👁️‍🗨️' : '👁️'}
                        </button>
                        <button onClick={() => onTrackUpdate(track.id, { locked: !track.locked })} className={`p-1 rounded ${track.locked ? 'text-red-400' : 'text-slate-300 hover:text-white'}`}>
                          {track.locked ? '🔒' : '🔓'}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => onTrackUpdate(track.id, { muted: !track.muted })} className={`text-xs ${track.muted ? 'text-red-400' : 'text-green-400'}`}>
                        {track.muted ? '🔇' : '🔊'}
                      </button>
                      {/* Height Resizer (Simulated) */}
                      <div className="flex-1 h-1 bg-slate-700 rounded overflow-hidden">
                        <div className="h-full bg-slate-600" style={{ width: '70%' }}></div>
                      </div>
                    </div>
                  </div>

                  {/* Track Content */}
                  <div
                    className={`relative flex-1 border-b border-slate-700/50 ${track.muted ? 'bg-slate-900/50' : 'bg-slate-800/30'} ${track.locked ? 'stripes-diagonal' : ''}`}
                    style={{ minWidth: `${timelineWidth}px` }}
                  >
                    {/* Grid lines inside track */}
                    <div className="absolute inset-0 pointer-events-none">
                      {timeMarkers.map(t => (
                        <div key={t} className="absolute top-0 bottom-0 border-l border-slate-700/20" style={{ left: `${t * PIXELS_PER_SECOND * zoom}px` }}></div>
                      ))}
                    </div>

                    {/* Playhead Line passing through */}
                    <div
                      className="absolute top-0 bottom-0 w-px bg-red-500/50 z-10 pointer-events-none"
                      style={{ left: `${currentTime * PIXELS_PER_SECOND * zoom}px` }}
                    ></div>

                    {/* Clips */}
                    {!track.hidden && sortedClips
                      .filter(clip => (clip.track || 0) === track.id)
                      .map(clip => {
                        const clipDuration = ((clip.trimEnd || clip.endTime) - (clip.trimStart || 0)) / (clip.speed || 1);
                        const clipWidth = clipDuration * PIXELS_PER_SECOND * zoom;
                        const clipLeft = (clip.startPos || 0) * PIXELS_PER_SECOND * zoom;
                        return (
                          <div key={clip.id} className={track.locked ? 'pointer-events-none opacity-70' : ''}>
                            <Clip
                              clip={clip}
                              left={clipLeft}
                              width={clipWidth}
                              pixelsPerSecond={PIXELS_PER_SECOND * zoom}
                              onUpdate={(updates) => onClipUpdate(clip.id, updates)}
                              onRemove={() => onClipRemove(clip.id)}
                              isDragging={draggedClipId === clip.id}
                            />
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          </DndContext>
        </div>
      </div>
    </div>
  );
}
