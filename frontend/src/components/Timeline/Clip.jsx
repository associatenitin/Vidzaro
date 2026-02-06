import { useState, useEffect, useMemo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getVideoThumbnails, getThumbnailUrl, getWaveformUrl } from '../../services/api';

export default function Clip({ clip, left, width, pixelsPerSecond, onUpdate, onRemove, isDragging }) {
  const [isResizing, setIsResizing] = useState(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartTrim, setResizeStartTrim] = useState(0);
  const [thumbnails, setThumbnails] = useState([]);
  const [waveformUrl, setWaveformUrl] = useState(null);

  useEffect(() => {
    const fetchResources = async () => {
      try {
        const response = await getVideoThumbnails(clip.videoId);
        setThumbnails(response.data);
      } catch (error) {
        console.error('Failed to fetch thumbnails:', error);
      }

      // Wavform URL is predictable but we might want to check existence or just set it
      // Since backend generates on demand, simple GET works.
      setWaveformUrl(getWaveformUrl(clip.videoId));
    };
    fetchResources();
  }, [clip.videoId]);

  const visibleThumbnails = useMemo(() => {
    if (thumbnails.length === 0) return [];

    const clipStart = clip.trimStart || 0;
    const clipEnd = clip.trimEnd || clip.endTime;
    const duration = clipEnd - clipStart;

    // Calculate how many thumbnails we can fit
    const thumbWidth = 160; // Base width of thumbnail in pixels at 1:1
    const scaledThumbWidth = (thumbWidth / 160) * 90 * (pixelsPerSecond / 50); // Rough scaling
    const numThumbs = Math.max(1, Math.floor(width / 80)); // Show a thumb every 80px roughly

    const selectedThumbs = [];
    for (let i = 0; i < numThumbs; i++) {
      const timeOffset = clipStart + (i * (duration / numThumbs));
      const index = Math.floor(timeOffset); // Assuming 1 thumb per second
      if (thumbnails[index]) {
        selectedThumbs.push(thumbnails[index]);
      }
    }
    return selectedThumbs;
  }, [thumbnails, clip.trimStart, clip.trimEnd, clip.endTime, width]);

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

  const clipDuration = ((clip.trimEnd || clip.endTime) - (clip.trimStart || 0)) / (clip.speed || 1);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`absolute top-2 bottom-2 bg-slate-700/80 backdrop-blur rounded overflow-hidden border-2 cursor-move group ${isResizing ? 'cursor-ew-resize' : clip.filter ? 'border-yellow-500' : 'border-blue-400'
        }`}
      {...attributes}
      {...listeners}
    >
      {/* Thumbnails Background */}
      <div className="absolute inset-0 flex pointer-events-none opacity-40">
        {visibleThumbnails.map((thumb, i) => (
          <img
            key={i}
            src={getThumbnailUrl(thumb)}
            alt=""
            className="h-full object-cover"
            style={{ width: `${100 / visibleThumbnails.length}%` }}
          />
        ))}
      </div>

      {/* Waveform Overlay */}
      {waveformUrl && (
        <div className="absolute inset-0 pointer-events-none opacity-80 mix-blend-screen">
          <img
            src={waveformUrl}
            alt="waveform"
            className="w-full h-full object-fill opacity-80"
            draggable="false"
          />
        </div>
      )}

      {/* Left resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-2 bg-blue-400 hover:bg-blue-300 cursor-ew-resize z-10"
        onMouseDown={handleResizeStart('left')}
      />

      {/* Clip content */}
      <div className="absolute inset-2 flex flex-col items-center justify-between text-white text-[10px] font-medium pointer-events-none">
        <div className="truncate w-full text-center drop-shadow-md">
          {clip.originalName || clip.filename}
        </div>

        <div className="flex items-center gap-1">
          <span className="bg-black/50 px-1 rounded">{formatDuration(clipDuration)}</span>
          {clip.filter && (
            <span className="bg-yellow-500 text-black px-1 rounded uppercase text-[8px] font-bold">
              {clip.filter}
            </span>
          )}
        </div>
      </div>

      {/* Filter, Volume & Speed controls - visible on hover */}
      <div
        className="absolute top-1 left-2 pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1 z-20 bg-slate-900/90 p-1.5 rounded border border-slate-600 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()} // Prevent drag start
      >
        <div className="flex items-center gap-2">
          <select
            value={clip.filter || ''}
            onChange={(e) => onUpdate({ filter: e.target.value || null })}
            className="bg-slate-800 text-[10px] border border-slate-600 rounded px-1 py-0.5 outline-none focus:border-blue-400 w-20"
          >
            <option value="">No Filter</option>
            <option value="grayscale">Grayscale</option>
            <option value="sepia">Sepia</option>
            <option value="invert">Invert</option>
          </select>

          <select
            value={clip.speed || 1}
            onChange={(e) => onUpdate({ speed: parseFloat(e.target.value) })}
            className="bg-slate-800 text-[10px] border border-slate-600 rounded px-1 py-0.5 outline-none focus:border-blue-400"
          >
            <option value="0.5">0.5x</option>
            <option value="1">1.0x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2.0x</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[8px] text-slate-400 w-6">VOL</span>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={clip.volume || 1}
            onChange={(e) => onUpdate({ volume: parseFloat(e.target.value) })}
            className="w-24 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <span className="text-[8px] text-slate-400">{Math.round((clip.volume || 1) * 100)}%</span>
        </div>

        <div className="flex items-center gap-1 border-t border-slate-700 pt-1 mt-1">
          <input
            type="text"
            placeholder="Add text overlay..."
            value={clip.text || ''}
            onChange={(e) => onUpdate({ text: e.target.value || null })}
            className="bg-slate-800 text-[10px] border border-slate-600 rounded px-1 py-0.5 outline-none focus:border-blue-400 w-full"
          />
        </div>
      </div>

      {/* Right resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-2 bg-blue-400 hover:bg-blue-300 cursor-ew-resize z-10"
        onMouseDown={handleResizeStart('right')}
      />

      {/* Remove button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute top-1 right-1 w-4 h-4 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center text-white text-[10px] font-bold z-20 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Remove clip"
      >
        ×
      </button>
    </div>
  );
}
