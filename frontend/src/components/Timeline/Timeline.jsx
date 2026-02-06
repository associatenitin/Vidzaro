import { useState, useRef, useEffect } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import Clip from './Clip';

const PIXELS_PER_SECOND = 50; // Base zoom level

export default function Timeline({ project, currentTime, onTimeUpdate, onClipUpdate, onClipRemove, onReorder }) {
  const [zoom, setZoom] = useState(1);
  const timelineRef = useRef(null);
  const [draggedClipId, setDraggedClipId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const sortedClips = [...project.clips].sort((a, b) => a.order - b.order);

  // Calculate total duration
  const totalDuration = sortedClips.reduce((sum, clip) => {
    return sum + ((clip.trimEnd || clip.endTime) - (clip.trimStart || 0));
  }, 0);

  const timelineWidth = totalDuration * PIXELS_PER_SECOND * zoom;

  // Handle drag end for reordering
  const handleDragEnd = (event) => {
    const { active, over } = event;
    setDraggedClipId(null);

    if (over && active.id !== over.id) {
      const oldIndex = sortedClips.findIndex((clip) => clip.id === active.id);
      const newIndex = sortedClips.findIndex((clip) => clip.id === over.id);

      const newOrder = arrayMove(sortedClips, oldIndex, newIndex);
      onReorder(newOrder);
    }
  };

  // Handle timeline click to seek
  const handleTimelineClick = (e) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = (x / (PIXELS_PER_SECOND * zoom));
    onTimeUpdate(Math.max(0, Math.min(time, totalDuration)));
  };

  // Format time for display
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Generate time markers
  const timeMarkers = [];
  const markerInterval = zoom < 1 ? 10 : zoom < 2 ? 5 : 1; // Show markers every N seconds
  for (let i = 0; i <= totalDuration; i += markerInterval) {
    timeMarkers.push(i);
  }

  return (
    <div className="h-full flex flex-col bg-slate-800">
      {/* Zoom Controls */}
      <div className="px-4 py-2 border-b border-slate-700 flex items-center gap-2">
        <button
          onClick={() => setZoom(Math.max(0.25, zoom - 0.25))}
          className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm"
        >
          −
        </button>
        <span className="text-sm text-slate-400 min-w-[60px] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom(Math.min(4, zoom + 0.25))}
          className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm"
        >
          +
        </button>
      </div>

      {/* Timeline Container */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden" ref={timelineRef}>
        <div className="relative" style={{ minWidth: `${timelineWidth}px`, height: '100%' }}>
          {/* Time Markers */}
          <div className="absolute top-0 left-0 right-0 h-8 border-b border-slate-700 bg-slate-900/50">
            {timeMarkers.map((time) => (
              <div
                key={time}
                className="absolute top-0 bottom-0 border-l border-slate-600"
                style={{ left: `${time * PIXELS_PER_SECOND * zoom}px` }}
              >
                <span className="absolute top-1 left-1 text-xs text-slate-400">
                  {formatTime(time)}
                </span>
              </div>
            ))}
          </div>

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
            style={{ left: `${currentTime * PIXELS_PER_SECOND * zoom}px` }}
          >
            <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-red-500"></div>
          </div>

          {/* Clips Track */}
          <div className="absolute top-8 left-0 right-0 bottom-0">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={(event) => setDraggedClipId(event.active.id)}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={sortedClips.map((clip) => clip.id)}
                strategy={horizontalListSortingStrategy}
              >
                <div className="relative h-full">
                  {sortedClips.map((clip, index) => {
                    // Calculate position
                    let clipStartTime = 0;
                    for (let i = 0; i < index; i++) {
                      const prevClip = sortedClips[i];
                      clipStartTime += (prevClip.trimEnd || prevClip.endTime) - (prevClip.trimStart || 0);
                    }

                    const clipDuration = (clip.trimEnd || clip.endTime) - (clip.trimStart || 0);
                    const clipWidth = clipDuration * PIXELS_PER_SECOND * zoom;
                    const clipLeft = clipStartTime * PIXELS_PER_SECOND * zoom;

                    return (
                      <Clip
                        key={clip.id}
                        clip={clip}
                        left={clipLeft}
                        width={clipWidth}
                        pixelsPerSecond={PIXELS_PER_SECOND * zoom}
                        onUpdate={(updates) => onClipUpdate(clip.id, updates)}
                        onRemove={() => onClipRemove(clip.id)}
                        isDragging={draggedClipId === clip.id}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>
      </div>
    </div>
  );
}
