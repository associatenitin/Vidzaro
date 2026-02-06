import { useState, useRef, useEffect } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import Clip from './Clip';

const PIXELS_PER_SECOND = 50; // Base zoom level

export default function Timeline({
  project,
  currentTime,
  onTimeUpdate,
  onClipUpdate,
  onClipRemove,
  onReorder,
  onTrackUpdate,
  onDropAsset,
  onDetachAudio,
  activeTool,
  selectedClipId,
  onClipSelect,
  onAddTrack,
  onRemoveTrack
}) {
  const [zoom, setZoom] = useState(1);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const timelineRef = useRef(null);
  const [draggedClipId, setDraggedClipId] = useState(null);
  const [dragOverTrackId, setDragOverTrackId] = useState(null);
  const trackRefs = useRef({});
  const dropHandledRef = useRef(false); // Prevent duplicate drops

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Only activate dnd-kit after 8px movement to allow native drag to start
      activationConstraint: {
        distance: 8,
      },
    }),
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

  // Set up native drop listeners on track elements to bypass DndContext
  useEffect(() => {
    const trackElements = Object.values(trackRefs.current);

    const handleNativeDrop = (e) => {
      // Prevent duplicate handling
      if (dropHandledRef.current) {
        return;
      }

      // Only handle if this is a native HTML5 drag
      if (!e.dataTransfer || !e.dataTransfer.types || e.dataTransfer.types.length === 0) {
        return;
      }

      const hasDragData = e.dataTransfer.types.includes('application/json') ||
        e.dataTransfer.types.includes('text/plain');

      if (hasDragData) {
        dropHandledRef.current = true; // Mark as handled
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation(); // Prevent other handlers from firing

        // Reset the flag after a short delay
        setTimeout(() => {
          dropHandledRef.current = false;
        }, 100);

        // Find which track this element belongs to
        const trackId = Object.keys(trackRefs.current).find(
          id => trackRefs.current[id] === e.currentTarget
        );

        if (trackId !== undefined) {
          console.log('Native drop detected on track:', trackId);
          console.log('dataTransfer types:', e.dataTransfer.types);
          console.log('dataTransfer items:', e.dataTransfer.items?.length);

          // Get the current onDropAsset from the latest closure
          const currentOnDropAsset = onDropAsset;
          const currentTimelineRef = timelineRef.current;
          const currentZoom = zoom;

          console.log('Callback check:', {
            hasOnDropAsset: !!currentOnDropAsset,
            hasTimelineRef: !!currentTimelineRef,
            zoom: currentZoom
          });

          // Try to get data - must be called synchronously during drop event
          let json = null;
          try {
            json = e.dataTransfer.getData('application/json');
            if (!json) {
              json = e.dataTransfer.getData('text/plain');
            }
          } catch (dataError) {
            console.error('Error getting drag data:', dataError);
          }

          console.log('Drag data retrieved:', json ? 'Yes' : 'No', json ? json.substring(0, 100) : '');

          if (json) {
            try {
              const data = JSON.parse(json);
              console.log('Parsed drag data:', data);
              console.log('Drop conditions:', {
                isAsset: data.type === 'asset',
                isMediaAsset: (data.type === 'asset' || data.type === 'video' || data.type === 'audio' || data.type === 'image'),
                hasOnDropAsset: !!currentOnDropAsset,
                hasTimelineRef: !!currentTimelineRef,
                dataType: data.type,
                hasId: !!data.id,
                hasFilename: !!data.filename
              });

              // Accept asset type OR media types (video, audio, image) with required fields
              const isMediaAsset = (data.type === 'asset' ||
                (data.type && ['video', 'audio', 'image'].includes(data.type) && data.id && data.filename));

              if (isMediaAsset && currentOnDropAsset && currentTimelineRef) {
                const trackElement = e.currentTarget;
                const trackRect = trackElement.getBoundingClientRect();
                const scrollLeft = currentTimelineRef.scrollLeft;
                const relativeX = (e.clientX - trackRect.left) + scrollLeft;
                const time = Math.max(0, relativeX / (PIXELS_PER_SECOND * currentZoom));

                console.log(`Native drop: ${data.originalName || data.filename} at ${time.toFixed(2)}s on track ${trackId}, calling onDropAsset`);
                setDragOverTrackId(null);

                // Call the callback
                const position = { time, track: parseInt(trackId) };
                console.log('Calling onDropAsset with:', { asset: data, position });

                try {
                  currentOnDropAsset(data, position);
                  console.log('onDropAsset called successfully');
                } catch (dropError) {
                  console.error('Error calling onDropAsset:', dropError);
                  console.error('Error stack:', dropError.stack);
                }
              } else {
                console.warn('Drop conditions not met:', {
                  isMediaAsset: isMediaAsset,
                  hasOnDropAsset: !!currentOnDropAsset,
                  hasTimelineRef: !!currentTimelineRef,
                  dataType: data.type,
                  hasId: !!data.id,
                  hasFilename: !!data.filename
                });
              }
            } catch (err) {
              console.error('Native drop failed', err);
              console.error('Error stack:', err.stack);
            }
          } else {
            console.warn('No JSON data found in drop event');
          }
        }
      }
    };

    const handleNativeDragOver = (e) => {
      if (!e.dataTransfer || !e.dataTransfer.types || e.dataTransfer.types.length === 0) {
        return;
      }

      const hasDragData = e.dataTransfer.types.includes('application/json') ||
        e.dataTransfer.types.includes('text/plain');

      if (hasDragData) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';

        const trackId = Object.keys(trackRefs.current).find(
          id => trackRefs.current[id] === e.currentTarget
        );

        if (trackId !== undefined) {
          setDragOverTrackId(parseInt(trackId));
        }
      }
    };

    trackElements.forEach(element => {
      if (element) {
        element.addEventListener('drop', handleNativeDrop, true); // Use capture phase
        element.addEventListener('dragover', handleNativeDragOver, true);
      }
    });

    return () => {
      trackElements.forEach(element => {
        if (element) {
          element.removeEventListener('drop', handleNativeDrop, true);
          element.removeEventListener('dragover', handleNativeDragOver, true);
        }
      });
    };
  }, [tracks.length, zoom, onDropAsset]); // Include onDropAsset to get latest reference

  const totalDuration = sortedClips.reduce((max, clip) => {
    const clipEnd = (clip.startPos || 0) + (((clip.trimEnd || clip.endTime) - (clip.trimStart || 0)) / (clip.speed || 1));
    return Math.max(max, clipEnd);
  }, 10);

  const timelineWidth = Math.max(window.innerWidth - 192, totalDuration * PIXELS_PER_SECOND * zoom); // 192 is sidebar width

  const handleDragEnd = (event) => {
    const { active, over, delta } = event;
    setDraggedClipId(null);

    // Don't handle if this is a native HTML5 drag (from Media Library)
    if (!active || typeof active.id === 'undefined') return;

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

  const handleDragOver = (e, trackId = null) => {
    // Check if this is a native HTML5 drag (has dataTransfer types)
    const hasDragData = e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.length > 0 &&
      (e.dataTransfer.types.includes('application/json') ||
        e.dataTransfer.types.includes('text/plain'));

    if (!hasDragData) {
      // Not a native drag, might be dnd-kit drag, let it pass through
      return;
    }

    e.preventDefault();
    // Don't stop propagation - let it bubble so drop can fire
    e.dataTransfer.dropEffect = 'copy';

    // Update drag over track for visual feedback
    if (trackId !== null) {
      setDragOverTrackId(trackId);
    } else if (timelineRef.current) {
      // Detect track from Y position for visual feedback
      const rect = timelineRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const tracksStartY = 32; // Ruler height
      const scrollTop = timelineRef.current.scrollTop;
      const totalRelativeY = y - tracksStartY + scrollTop;

      let currentY = 0;
      for (const track of tracks) {
        const trackHeight = track.height || 80;
        if (totalRelativeY >= currentY && totalRelativeY < currentY + trackHeight) {
          setDragOverTrackId(track.id);
          break;
        }
        currentY += trackHeight;
      }
    }
  };

  const handleDragLeave = (e) => {
    // Only clear if we're actually leaving the timeline area
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverTrackId(null);
    }
  };

  const handleDrop = (e, trackId = null, trackElement = null) => {
    console.log('handleDrop called', { trackId, hasDataTransfer: !!e.dataTransfer });

    // Check if this is a native HTML5 drag first
    const hasDragData = e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.length > 0 &&
      (e.dataTransfer.types.includes('application/json') ||
        e.dataTransfer.types.includes('text/plain'));

    if (!hasDragData) {
      console.log('Not a native drag, ignoring drop');
      // Not a native drag, might be dnd-kit drag, let it pass through
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    // Try to get data from multiple formats (application/json or text/plain)
    let json = e.dataTransfer.getData('application/json');
    if (!json) {
      json = e.dataTransfer.getData('text/plain');
    }

    console.log('Drag data retrieved:', json ? 'Yes' : 'No', json?.substring(0, 100));

    if (!json) {
      console.log('No drag data found in drop handler');
      return;
    }

    try {
      const data = JSON.parse(json);
      console.log('Parsed drag data:', data);

      // Check for asset type and ensure onDropAsset exists
      if (data.type === 'asset' && onDropAsset) {
        if (!timelineRef.current) {
          console.error('timelineRef.current is null');
          return;
        }

        // If trackId is provided (from track-specific drop), use it
        let detectedTrackId = trackId;

        // Calculate drop position
        // If we have a track element, calculate relative to it, otherwise use timelineRef
        let relativeX;

        if (trackElement && trackId !== null) {
          // Dropping directly on track - calculate relative to track content area
          const trackRect = trackElement.getBoundingClientRect();
          const scrollLeft = timelineRef.current.scrollLeft;
          // Track content starts after sidebar (192px), so subtract that
          relativeX = (e.clientX - trackRect.left) + scrollLeft;
        } else {
          // Dropping on timeline container - calculate relative to timelineRef
          const rect = timelineRef.current.getBoundingClientRect();
          const scrollLeft = timelineRef.current.scrollLeft;
          const sidebarWidth = 192; // w-48
          relativeX = (e.clientX - rect.left) + scrollLeft - sidebarWidth;
        }

        const time = Math.max(0, relativeX / (PIXELS_PER_SECOND * zoom));

        // If trackId wasn't provided, detect it from Y position
        if (detectedTrackId === null) {
          const rect = timelineRef.current.getBoundingClientRect();
          const y = e.clientY - rect.top; // Relative to visible top of timelineRef
          const tracksStartY = 32; // Ruler height (h-8)
          const scrollTop = timelineRef.current.scrollTop;
          const totalRelativeY = y - tracksStartY + scrollTop;

          // Track Detection Loop
          detectedTrackId = tracks[0].id;
          let currentY = 0;

          for (const track of tracks) {
            const trackHeight = track.height || 80;
            // If we are within this track's vertical range, select it
            if (totalRelativeY >= currentY && totalRelativeY < currentY + trackHeight) {
              detectedTrackId = track.id;
              break;
            }
            currentY += trackHeight;
            detectedTrackId = track.id; // Fallback to last track if below all
          }
        }

        console.log(`Dropping asset ${data.originalName} at time ${time.toFixed(2)}s on track ${detectedTrackId}, X: ${relativeX.toFixed(0)}px`);
        setDragOverTrackId(null); // Clear drag over state

        // Call the drop handler
        console.log('Calling onDropAsset with:', { asset: data, position: { time, track: detectedTrackId } });
        onDropAsset(data, { time, track: detectedTrackId });
      } else {
        console.log('Drop conditions not met:', {
          isAsset: data.type === 'asset',
          hasOnDropAsset: !!onDropAsset,
          dataType: data.type
        });
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
      onDragLeave={handleDragLeave}
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
      <div
        className="flex-1 overflow-auto relative custom-scrollbar"
        ref={timelineRef}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragLeave={handleDragLeave}
      >
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
            onDragStart={(event) => {
              // Only handle dnd-kit drags, not native HTML5 drags
              // Check if this is a native drag by checking if active.id is a string (clip IDs are usually numbers/strings from clips)
              // Native drags won't have an active.id that matches our clip structure
              if (event.active && typeof event.active.id !== 'undefined') {
                // Check if this ID exists in our clips (dnd-kit drag)
                const isClipDrag = sortedClips.some(c => c.id === event.active.id);
                if (isClipDrag) {
                  setDraggedClipId(event.active.id);
                }
              }
            }}
            onDragEnd={handleDragEnd}
            // Prevent DndContext from capturing native drag events
            autoScroll={false}
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
                    <div className="flex items-center justify-between gap-2">
                      <button onClick={() => onTrackUpdate(track.id, { muted: !track.muted })} className={`text-[10px] ${track.muted ? 'text-red-400' : 'text-green-400'}`}>
                        {track.muted ? '🔇' : '🔊'}
                      </button>

                      {onRemoveTrack && (
                        <button
                          onClick={() => onRemoveTrack(track.id)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-900/50 text-slate-500 hover:text-red-400 text-[10px] transition-opacity"
                          title="Delete Track"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Track Content */}
                  <div
                    ref={(el) => {
                      if (el) trackRefs.current[track.id] = el;
                      else delete trackRefs.current[track.id];
                    }}
                    className={`relative flex-1 border-b border-slate-700/50 ${track.muted ? 'bg-slate-900/50' : 'bg-slate-800/30'
                      } ${track.locked ? 'stripes-diagonal' : ''
                      } ${dragOverTrackId === track.id ? 'bg-blue-500/20 border-blue-500' : ''
                      } transition-colors`}
                    style={{ minWidth: `${timelineWidth}px` }}
                    onDragOver={(e) => handleDragOver(e, track.id)}
                    onDrop={(e) => {
                      console.log('React onDrop fired on track', track.id);
                      handleDrop(e, track.id, e.currentTarget);
                    }}
                    onDragLeave={handleDragLeave}
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
                              onDetachAudio={() => onDetachAudio && onDetachAudio(clip.id)}
                              isDragging={draggedClipId === clip.id}
                              isSelected={selectedClipId === clip.id}
                              onSelect={() => onClipSelect && onClipSelect(clip.id)}
                            />
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>

            {/* Add Track Buttons */}
            <div className="flex h-12 bg-slate-900/50 border-b border-slate-700">
              <div className="w-48 flex-shrink-0 sticky left-0 z-20 flex items-center justify-center gap-2 px-2 border-r border-slate-700">
                <button
                  onClick={() => onAddTrack && onAddTrack('video')}
                  className="flex-1 py-1 px-2 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-400 hover:text-white border border-slate-700 transition-colors"
                >
                  + Video
                </button>
                <button
                  onClick={() => onAddTrack && onAddTrack('audio')}
                  className="flex-1 py-1 px-2 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-400 hover:text-white border border-slate-700 transition-colors"
                >
                  + Audio
                </button>
              </div>
              <div className="flex-1 border-b border-slate-700/50" style={{ minWidth: `${timelineWidth}px` }}></div>
            </div>
          </DndContext>
        </div>
      </div>
    </div>
  );
}
