import { useState, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export default function Clip({ clip, left, width, pixelsPerSecond, onUpdate, onRemove, isDragging }) {
  const [isResizing, setIsResizing] = useState(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartTrim, setResizeStartTrim] = useState(0);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: clip.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    left: `${left}px`,
    width: `${width}px`,
    opacity: isSortableDragging ? 0.5 : 1,
  };

  const handleResizeStart = (side) => (e) => {
    e.stopPropagation();
    setIsResizing(side);
    setResizeStartX(e.clientX);
    setResizeStartTrim(side === 'left' ? clip.trimStart : clip.trimEnd);
  };

  // Add global mouse event listeners for resizing
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e) => {
      const deltaX = e.clientX - resizeStartX;
      const deltaTime = deltaX / pixelsPerSecond;

      if (isResizing === 'left') {
        const newTrimStart = Math.max(0, Math.min(resizeStartTrim + deltaTime, clip.trimEnd || clip.endTime));
        onUpdate({ trimStart: newTrimStart });
      } else {
        const newTrimEnd = Math.max(clip.trimStart || 0, Math.min(resizeStartTrim + deltaTime, clip.endTime));
        onUpdate({ trimEnd: newTrimEnd });
      }
    };

    const handleMouseUp = () => {
      setIsResizing(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeStartX, resizeStartTrim, pixelsPerSecond, clip, onUpdate]);

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const clipDuration = (clip.trimEnd || clip.endTime) - (clip.trimStart || 0);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`absolute top-2 bottom-2 bg-blue-600 rounded border-2 border-blue-400 cursor-move ${
        isResizing ? 'cursor-ew-resize' : ''
      }`}
      {...attributes}
      {...listeners}
    >
      {/* Left resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-2 bg-blue-400 hover:bg-blue-300 cursor-ew-resize z-10"
        onMouseDown={(e) => {
          e.stopPropagation();
          handleResizeStart('left')(e);
        }}
      />

      {/* Clip content */}
      <div className="absolute inset-2 flex items-center justify-center text-white text-xs font-medium pointer-events-none">
        <div className="text-center">
          <div className="truncate max-w-full">{clip.originalName || clip.filename}</div>
          <div className="text-blue-200">{formatDuration(clipDuration)}</div>
        </div>
      </div>

      {/* Right resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-2 bg-blue-400 hover:bg-blue-300 cursor-ew-resize z-10"
        onMouseDown={(e) => {
          e.stopPropagation();
          handleResizeStart('right')(e);
        }}
      />

      {/* Remove button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute -top-2 -right-2 w-5 h-5 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center text-white text-xs font-bold z-20"
        title="Remove clip"
      >
        ×
      </button>
    </div>
  );
}
