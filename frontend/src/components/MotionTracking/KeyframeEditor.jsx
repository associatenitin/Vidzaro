import { useState, useRef, useEffect, useMemo } from 'react';

export default function KeyframeEditor({ track, clipDuration, onUpdate, onClose }) {
  const [selectedKeyframeIndex, setSelectedKeyframeIndex] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // Sort keyframes by time
  const sortedKeyframes = useMemo(() => {
    if (!track.keyframes || track.keyframes.length === 0) return [];
    return [...track.keyframes].sort((a, b) => a.time - b.time);
  }, [track.keyframes]);

  // Convert normalized coordinates (0-1) to canvas coordinates
  const normalizedToCanvas = (x, y, canvasWidth, canvasHeight) => {
    return {
      x: x * canvasWidth,
      y: y * canvasHeight,
    };
  };

  // Convert canvas coordinates to normalized (0-1)
  const canvasToNormalized = (x, y, canvasWidth, canvasHeight) => {
    return {
      x: Math.max(0, Math.min(1, x / canvasWidth)),
      y: Math.max(0, Math.min(1, y / canvasHeight)),
    };
  };

  // Draw the tracking path on canvas
  const drawPath = () => {
    const canvas = canvasRef.current;
    if (!canvas || sortedKeyframes.length === 0) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      const x = (i / 10) * width;
      const y = (i / 10) * height;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw path
    if (sortedKeyframes.length > 1) {
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const first = sortedKeyframes[0];
      const firstPos = normalizedToCanvas(first.x, first.y, width, height);
      ctx.moveTo(firstPos.x, firstPos.y);

      for (let i = 1; i < sortedKeyframes.length; i++) {
        const kf = sortedKeyframes[i];
        const pos = normalizedToCanvas(kf.x, kf.y, width, height);
        ctx.lineTo(pos.x, pos.y);
      }
      ctx.stroke();
    }

    // Draw keyframe points
    sortedKeyframes.forEach((kf, index) => {
      const pos = normalizedToCanvas(kf.x, kf.y, width, height);
      const isSelected = selectedKeyframeIndex === index;

      // Draw point
      ctx.fillStyle = isSelected ? '#22d3ee' : '#06b6d4';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, isSelected ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();

      // Draw outline
      ctx.strokeStyle = isSelected ? '#ffffff' : '#1e293b';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();

      // Draw time label
      if (isSelected || index === 0 || index === sortedKeyframes.length - 1) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${kf.time.toFixed(2)}s`, pos.x, pos.y - 10);
      }
    });
  };

  useEffect(() => {
    drawPath();
  }, [sortedKeyframes, selectedKeyframeIndex]);

  const handleCanvasClick = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const normalized = canvasToNormalized(x, y, canvas.width, canvas.height);

    // Check if clicking near an existing keyframe
    let nearestIndex = null;
    let nearestDist = Infinity;

    sortedKeyframes.forEach((kf, index) => {
      const pos = normalizedToCanvas(kf.x, kf.y, canvas.width, canvas.height);
      const dist = Math.sqrt(Math.pow(x - pos.x, 2) + Math.pow(y - pos.y, 2));
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIndex = index;
      }
    });

    const HIT_RADIUS = 15;
    if (nearestIndex !== null && nearestDist <= HIT_RADIUS) {
      // Select existing keyframe
      setSelectedKeyframeIndex(nearestIndex);
    } else {
      // Create new keyframe at clicked position
      // Find the time based on timeline position (for now, use middle of clip)
      const newTime = clipDuration / 2; // Default to middle, could be improved with timeline interaction
      const newKeyframe = {
        time: newTime,
        x: normalized.x,
        y: normalized.y,
        scale: 1,
        rotation: 0,
      };

      const updated = [...sortedKeyframes, newKeyframe].sort((a, b) => a.time - b.time);
      onUpdate({ keyframes: updated });
      setSelectedKeyframeIndex(updated.findIndex(kf => kf.time === newTime && kf.x === normalized.x));
    }
  };

  const handleCanvasMouseMove = (e) => {
    if (!isDragging || selectedKeyframeIndex === null) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const normalized = canvasToNormalized(x, y, canvas.width, canvas.height);

    const updated = [...sortedKeyframes];
    updated[selectedKeyframeIndex] = {
      ...updated[selectedKeyframeIndex],
      x: normalized.x,
      y: normalized.y,
    };

    onUpdate({ keyframes: updated });
  };

  const handleCanvasMouseDown = (e) => {
    if (selectedKeyframeIndex !== null) {
      setIsDragging(true);
    }
  };

  const handleCanvasMouseUp = () => {
    setIsDragging(false);
  };

  const handleDeleteKeyframe = () => {
    if (selectedKeyframeIndex === null || sortedKeyframes.length <= 1) return;
    const updated = sortedKeyframes.filter((_, index) => index !== selectedKeyframeIndex);
    onUpdate({ keyframes: updated });
    setSelectedKeyframeIndex(null);
  };

  const handleTimeChange = (index, newTime) => {
    const updated = [...sortedKeyframes];
    updated[index] = { ...updated[index], time: Math.max(0, Math.min(clipDuration, newTime)) };
    updated.sort((a, b) => a.time - b.time);
    onUpdate({ keyframes: updated });
    setSelectedKeyframeIndex(updated.findIndex(kf => kf === sortedKeyframes[index]));
  };

  const handleScaleChange = (index, newScale) => {
    const updated = [...sortedKeyframes];
    updated[index] = { ...updated[index], scale: Math.max(0.1, Math.min(5, newScale)) };
    onUpdate({ keyframes: updated });
  };

  const handleRotationChange = (index, newRotation) => {
    const updated = [...sortedKeyframes];
    updated[index] = { ...updated[index], rotation: newRotation };
    onUpdate({ keyframes: updated });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-slate-200">Edit Tracking Path</h3>
        <button
          onClick={onClose}
          className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-200 text-sm"
        >
          Done
        </button>
      </div>

      <div className="bg-slate-900 rounded-lg p-4">
        <div className="text-sm text-slate-400 mb-2">
          Click to add keyframes, drag to move them. Right-click to delete.
        </div>
        <div
          ref={containerRef}
          className="relative bg-black rounded border border-slate-700"
          style={{ aspectRatio: '16/9' }}
        >
          <canvas
            ref={canvasRef}
            width={800}
            height={450}
            className="w-full h-full cursor-crosshair"
            onClick={handleCanvasClick}
            onMouseMove={handleCanvasMouseMove}
            onMouseDown={handleCanvasMouseDown}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
            onContextMenu={(e) => {
              e.preventDefault();
              if (selectedKeyframeIndex !== null) {
                handleDeleteKeyframe();
              }
            }}
          />
        </div>
      </div>

      {selectedKeyframeIndex !== null && sortedKeyframes[selectedKeyframeIndex] && (
        <div className="bg-slate-800 rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-medium text-slate-200">Selected Keyframe</h4>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Time (s)</label>
              <input
                type="number"
                value={sortedKeyframes[selectedKeyframeIndex].time.toFixed(2)}
                onChange={(e) => handleTimeChange(selectedKeyframeIndex, parseFloat(e.target.value) || 0)}
                step="0.1"
                min="0"
                max={clipDuration}
                className="w-full bg-slate-700 text-slate-100 border border-slate-600 rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">X Position</label>
              <input
                type="number"
                value={(sortedKeyframes[selectedKeyframeIndex].x * 100).toFixed(1)}
                onChange={(e) => {
                  const updated = [...sortedKeyframes];
                  updated[selectedKeyframeIndex] = {
                    ...updated[selectedKeyframeIndex],
                    x: Math.max(0, Math.min(1, (parseFloat(e.target.value) || 0) / 100)),
                  };
                  onUpdate({ keyframes: updated });
                }}
                step="0.1"
                min="0"
                max="100"
                className="w-full bg-slate-700 text-slate-100 border border-slate-600 rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Y Position</label>
              <input
                type="number"
                value={(sortedKeyframes[selectedKeyframeIndex].y * 100).toFixed(1)}
                onChange={(e) => {
                  const updated = [...sortedKeyframes];
                  updated[selectedKeyframeIndex] = {
                    ...updated[selectedKeyframeIndex],
                    y: Math.max(0, Math.min(1, (parseFloat(e.target.value) || 0) / 100)),
                  };
                  onUpdate({ keyframes: updated });
                }}
                step="0.1"
                min="0"
                max="100"
                className="w-full bg-slate-700 text-slate-100 border border-slate-600 rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Scale</label>
              <input
                type="number"
                value={sortedKeyframes[selectedKeyframeIndex].scale?.toFixed(2) || '1.00'}
                onChange={(e) => handleScaleChange(selectedKeyframeIndex, parseFloat(e.target.value) || 1)}
                step="0.1"
                min="0.1"
                max="5"
                className="w-full bg-slate-700 text-slate-100 border border-slate-600 rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Rotation (°)</label>
              <input
                type="number"
                value={sortedKeyframes[selectedKeyframeIndex].rotation?.toFixed(1) || '0.0'}
                onChange={(e) => handleRotationChange(selectedKeyframeIndex, parseFloat(e.target.value) || 0)}
                step="1"
                min="-180"
                max="180"
                className="w-full bg-slate-700 text-slate-100 border border-slate-600 rounded px-2 py-1 text-sm"
              />
            </div>
          </div>

          <button
            onClick={handleDeleteKeyframe}
            disabled={sortedKeyframes.length <= 1}
            className="w-full px-3 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-white text-sm"
          >
            Delete Keyframe
          </button>
        </div>
      )}

      <div className="text-xs text-slate-400">
        {sortedKeyframes.length} keyframe{sortedKeyframes.length !== 1 ? 's' : ''} • 
        Duration: {clipDuration.toFixed(2)}s
      </div>
    </div>
  );
}
