import { useState, useEffect } from 'react';

const TRANSITION_COLORS = {
  'crossfade': 'bg-blue-500/30 border-blue-400',
  'wipe-left': 'bg-purple-500/30 border-purple-400',
  'wipe-right': 'bg-purple-500/30 border-purple-400',
  'wipe-up': 'bg-purple-500/30 border-purple-400',
  'wipe-down': 'bg-purple-500/30 border-purple-400',
  'slide-left': 'bg-green-500/30 border-green-400',
  'slide-right': 'bg-green-500/30 border-green-400',
  'slide-up': 'bg-green-500/30 border-green-400',
  'slide-down': 'bg-green-500/30 border-green-400',
  'zoom-in': 'bg-orange-500/30 border-orange-400',
  'zoom-out': 'bg-orange-500/30 border-orange-400',
  'blur': 'bg-yellow-500/30 border-yellow-400',
};

const TRANSITION_ICONS = {
  'crossfade': '↔',
  'wipe-left': '←',
  'wipe-right': '→',
  'wipe-up': '↑',
  'wipe-down': '↓',
  'slide-left': '◄',
  'slide-right': '►',
  'slide-up': '▲',
  'slide-down': '▼',
  'zoom-in': '⊕',
  'zoom-out': '⊖',
  'blur': '○',
};

export default function Transition({
  transition,
  left,
  width,
  pixelsPerSecond,
  onUpdate,
  onEdit,
  fromClip,
  toClip
}) {
  const [isHovering, setIsHovering] = useState(false);
  const [isResizing, setIsResizing] = useState(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);

  if (!transition || !transition.type) return null;

  const colorClass = TRANSITION_COLORS[transition.type] || TRANSITION_COLORS.crossfade;
  const icon = TRANSITION_ICONS[transition.type] || TRANSITION_ICONS.crossfade;

  const handleMouseDown = (side) => (e) => {
    e.stopPropagation();
    setIsResizing(side);
    setResizeStartX(e.clientX);
    setResizeStartWidth(width);
  };

  // Handle resize
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e) => {
      const deltaX = e.clientX - resizeStartX;
      const deltaTime = deltaX / pixelsPerSecond;
      const newDuration = Math.max(0.1, Math.min(5, transition.duration + (isResizing === 'right' ? deltaTime : -deltaTime)));
      
      if (onUpdate && Math.abs(newDuration - transition.duration) > 0.05) {
        onUpdate({ duration: newDuration });
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
  }, [isResizing, resizeStartX, pixelsPerSecond, transition.duration, onUpdate]);

  return (
    <div
      className={`absolute top-2 bottom-2 ${colorClass} border-2 border-dashed rounded cursor-pointer group transition-all ${
        isHovering ? 'opacity-100 z-30' : 'opacity-80 z-20'
      }`}
      style={{
        left: `${left}px`,
        width: `${width}px`,
      }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onClick={(e) => {
        e.stopPropagation();
        if (onEdit) onEdit();
      }}
      title={`${transition.type} (${transition.duration.toFixed(2)}s)`}
    >
      {/* Diagonal stripe pattern */}
      <div 
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.1) 10px, rgba(255,255,255,0.1) 20px)'
        }}
      />
      
      {/* Content */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-white text-xs font-bold drop-shadow-lg">
          {icon}
        </div>
      </div>

      {/* Resize handles */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 bg-white/50 hover:bg-white cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity"
        onMouseDown={handleMouseDown('left')}
      />
      <div
        className="absolute right-0 top-0 bottom-0 w-1 bg-white/50 hover:bg-white cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity"
        onMouseDown={handleMouseDown('right')}
      />

      {/* Duration label on hover */}
      {isHovering && (
        <div className="absolute top-0 left-0 bg-black/80 text-white text-[8px] px-1 rounded-br">
          {transition.duration.toFixed(2)}s
        </div>
      )}
    </div>
  );
}
