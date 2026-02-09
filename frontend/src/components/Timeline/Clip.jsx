import { useState, useEffect, useMemo, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getVideoThumbnails, getThumbnailUrl, getWaveformUrl, getVideoUrl } from '../../services/api';

export default function Clip({ clip, left, width, pixelsPerSecond, onUpdate, onRemove, onDetachAudio, isDragging, isSelected, onSelect, isMultiSelected }) {
  const [isResizing, setIsResizing] = useState(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartTrim, setResizeStartTrim] = useState(0);
  const [thumbnails, setThumbnails] = useState([]);
  const [waveformUrl, setWaveformUrl] = useState(null);
  const settingsPanelRef = useRef(null);
  const clipContainerRef = useRef(null);
  const [isHoveringSettings, setIsHoveringSettings] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ top: 0, left: 0, position: 'fixed' });
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });

  const isImage = clip.type === 'image' || (clip.filename && clip.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i));
  const isAudio = clip.type === 'audio' || (clip.filename && clip.filename.match(/\.(mp3|wav|ogg|m4a)$/i));

  useEffect(() => {
    if (isImage || isAudio) return;

    const fetchResources = async () => {
      try {
        const response = await getVideoThumbnails(clip.videoId);
        setThumbnails(response.data);
      } catch (error) {
        console.error('Failed to fetch thumbnails:', error);
      }

      setWaveformUrl(getWaveformUrl(clip.videoId));
    };
    fetchResources();
  }, [clip.videoId, isImage]);

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

  const handleContextMenu = (e) => {
    // If this clip is part of a multi-selection, allow event to bubble to Timeline
    // The Timeline component will handle multi-selection context menu
    if (isMultiSelected) {
      // Don't prevent default or stop propagation - let it bubble to track handler
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    // Store the click position for panel positioning
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setShowSettings((prev) => !prev);
  };

  // Calculate panel position to avoid viewport overflow using fixed positioning
  useEffect(() => {
    if (!showSettings || !settingsPanelRef.current) return;

    const updatePanelPosition = () => {
      const panel = settingsPanelRef.current;
      if (!panel) return;

      const panelRect = panel.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Panel dimensions (w-56 = 224px)
      const panelWidth = 224;
      const panelHeight = panelRect.height || 300;

      // Start with right-click position, offset slightly
      let top = contextMenuPos.y + 8;
      let left = contextMenuPos.x + 8;
      let transform = 'none';

      // Check horizontal overflow - prefer right side, flip to left if needed
      const spaceOnRight = viewportWidth - contextMenuPos.x;
      const spaceOnLeft = contextMenuPos.x;

      if (spaceOnRight < panelWidth && spaceOnLeft > panelWidth) {
        // Not enough space on right, but enough on left - flip to left side
        left = contextMenuPos.x - panelWidth - 8;
      } else if (spaceOnRight < panelWidth && spaceOnLeft < panelWidth) {
        // Not enough space on either side - align to viewport edge
        if (contextMenuPos.x < viewportWidth / 2) {
          left = 8; // Align to left edge
        } else {
          left = viewportWidth - panelWidth - 8; // Align to right edge
        }
      }

      // Check vertical overflow - prefer below, flip above if needed
      const spaceBelow = viewportHeight - contextMenuPos.y;
      const spaceAbove = contextMenuPos.y;

      if (spaceBelow < panelHeight && spaceAbove > panelHeight) {
        // Not enough space below, but enough above - flip above
        top = contextMenuPos.y - panelHeight - 8;
      } else if (spaceBelow < panelHeight && spaceAbove < panelHeight) {
        // Not enough space on either side - align to viewport edge
        if (contextMenuPos.y < viewportHeight / 2) {
          top = 8; // Align to top edge
        } else {
          top = viewportHeight - panelHeight - 8; // Align to bottom edge
        }
      }

      // Ensure panel stays within viewport bounds
      top = Math.max(8, Math.min(top, viewportHeight - panelHeight - 8));
      left = Math.max(8, Math.min(left, viewportWidth - panelWidth - 8));

      setPanelPosition({ top, left, transform, position: 'fixed' });
    };

    // Small delay to ensure panel is rendered and measured
    setTimeout(updatePanelPosition, 0);
    
    // Update on window resize
    window.addEventListener('resize', updatePanelPosition);
    window.addEventListener('scroll', updatePanelPosition, true);

    return () => {
      window.removeEventListener('resize', updatePanelPosition);
      window.removeEventListener('scroll', updatePanelPosition, true);
    };
  }, [showSettings, contextMenuPos]);

  // Close settings when clicking outside the panel (e.g. on the clip thumbnail or elsewhere)
  useEffect(() => {
    if (!showSettings) return;
    const handleClickOutside = (e) => {
      if (settingsPanelRef.current && !settingsPanelRef.current.contains(e.target)) {
        setShowSettings(false);
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') setShowSettings(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showSettings]);

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        clipContainerRef.current = node;
      }}
      style={style}
      className={`absolute top-2 bottom-2 cursor-move group ${isResizing ? 'cursor-ew-resize' : ''}`}
      {...attributes}
      {...(isHoveringSettings || showSettings ? {} : listeners)}
      onContextMenu={(e) => {
        // If this clip is part of a multi-selection, allow event to bubble to Timeline
        if (isMultiSelected) {
          // Don't prevent default or stop propagation - let it bubble to track handler
          return;
        }
        handleContextMenu(e);
      }}
      onClick={(e) => {
        e.stopPropagation();
        const isMultiSelect = e.ctrlKey || e.metaKey;
        onSelect && onSelect(isMultiSelect);
      }}
    >
      {/* Clip container with overflow-hidden for content */}
      <div className={`absolute inset-0 bg-slate-700/80 backdrop-blur rounded border-2 overflow-hidden transition-all ${isSelected || isMultiSelected
        ? 'border-cyan-400 ring-2 ring-cyan-400/50 shadow-lg shadow-cyan-500/30'
        : clip.filter
          ? 'border-yellow-500'
          : 'border-blue-400'
        }`}>
        {/* Thumbnails Background */}
        <div className="absolute inset-0 flex pointer-events-none opacity-40">
          {isImage ? (
            <img
              src={getVideoUrl(clip.videoId)}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : isAudio ? (
            <div className="w-full h-full bg-slate-800/50"></div>
          ) : (
            visibleThumbnails.map((thumb, i) => (
              <img
                key={i}
                src={getThumbnailUrl(thumb)}
                alt=""
                className="h-full object-cover"
                style={{ width: `${100 / visibleThumbnails.length}%` }}
              />
            ))
          )}
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
            {clip.originalName || clip.filename || 'Untitled'}
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

        {/* Right resize handle */}
        <div
          className="absolute right-0 top-0 bottom-0 w-2 bg-blue-400 hover:bg-blue-300 cursor-ew-resize z-10"
          onMouseDown={handleResizeStart('right')}
        />
      </div>

      {/* Filter, Audio & Speed controls - visible on right-click only - positioned as fixed overlay */}
      {showSettings && (
        <div
          ref={settingsPanelRef}
          style={{
            position: panelPosition.position || 'fixed',
            top: `${panelPosition.top}px`,
            left: `${panelPosition.left}px`,
            transform: panelPosition.transform || 'none',
            zIndex: 9999,
          }}
          className="pointer-events-auto transition-opacity flex flex-col gap-2 bg-slate-900/95 backdrop-blur-sm p-2 rounded border border-slate-600 shadow-2xl w-56"
          onMouseEnter={() => setIsHoveringSettings(true)}
          onMouseLeave={() => setIsHoveringSettings(false)}
          onMouseDown={(e) => e.stopPropagation()} // Prevent drag start
          onPointerDown={(e) => e.stopPropagation()} // Prevent drag start (for dnd-kit)
          onDragStart={(e) => e.preventDefault()} // Prevent drag start
        >
        <div className="flex items-center justify-between border-b border-slate-700 pb-1 mb-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase">Clip Settings</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowSettings(false); }}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-0.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white text-[10px]"
            title="Close"
          >
            ×
          </button>
          <div className="flex gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUpdate({ audioEnabled: !((clip.audioEnabled === undefined) ? true : clip.audioEnabled) });
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className={`p-1 rounded text-[8px] ${(clip.audioEnabled === false) ? 'bg-red-900 text-red-200' : 'bg-green-900 text-green-200'}`}
            >
              {clip.audioEnabled === false ? '🔇' : '🔊'}
            </button>
            {onDetachAudio && clip.videoEnabled !== false && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDetachAudio();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="p-1 rounded bg-slate-700 text-white text-[8px] hover:bg-slate-600"
                title="Detach Audio"
              >
                🔗 Detach
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={clip.filter || ''}
            onChange={(e) => onUpdate({ filter: e.target.value || null })}
            onMouseDown={(e) => e.stopPropagation()}
            className="bg-slate-800 text-[10px] border border-slate-600 rounded px-1 py-0.5 outline-none focus:border-blue-400 flex-1"
          >
            <optgroup label="Basic">
              <option value="">No Filter</option>
              <option value="grayscale">Grayscale</option>
              <option value="sepia">Sepia</option>
              <option value="invert">Invert</option>
            </optgroup>
            <optgroup label="Adjustments">
              <option value="blur">Blur</option>
              <option value="brightness">Brighten</option>
              <option value="darken">Darken</option>
              <option value="contrast">High Contrast</option>
              <option value="saturate">Saturate</option>
              <option value="desaturate">Desaturate</option>
            </optgroup>
            <optgroup label="Color Effects">
              <option value="hue-rotate">Hue Shift</option>
              <option value="vintage">Vintage</option>
              <option value="cool">Cool Tone</option>
              <option value="warm">Warm Tone</option>
            </optgroup>
          </select>

          <select
            value={clip.speed || 1}
            onChange={(e) => onUpdate({ speed: parseFloat(e.target.value) })}
            onMouseDown={(e) => e.stopPropagation()}
            className="bg-slate-800 text-[10px] border border-slate-600 rounded px-1 py-0.5 outline-none focus:border-blue-400"
          >
            <option value="0.25">0.25x</option>
            <option value="0.5">0.5x</option>
            <option value="0.75">0.75x</option>
            <option value="1">1.0x</option>
            <option value="1.25">1.25x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2.0x</option>
            <option value="3">3.0x</option>
            <option value="4">4.0x</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-slate-400">VOLUME</span>
            <span className="text-[9px] text-slate-500">{Math.round((clip.volume || 1) * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={clip.volume || 1}
            onChange={(e) => onUpdate({ volume: parseFloat(e.target.value) })}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onDragStart={(e) => e.preventDefault()}
            className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-[8px] text-slate-400">FADE IN</span>
              <span className="text-[8px] font-mono">{(clip.fadeIn || 0).toFixed(1)}s</span>
            </div>
            <input
              type="range"
              min="0"
              max="5"
              step="0.1"
              value={clip.fadeIn || 0}
              onChange={(e) => onUpdate({ fadeIn: parseFloat(e.target.value) })}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onDragStart={(e) => e.preventDefault()}
              className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-400"
            />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-[8px] text-slate-400">FADE OUT</span>
              <span className="text-[8px] font-mono">{(clip.fadeOut || 0).toFixed(1)}s</span>
            </div>
            <input
              type="range"
              min="0"
              max="5"
              step="0.1"
              value={clip.fadeOut || 0}
              onChange={(e) => onUpdate({ fadeOut: parseFloat(e.target.value) })}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onDragStart={(e) => e.preventDefault()}
              className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-400"
            />
          </div>
        </div>

        {/* Transitions */}
        <div className="border-t border-slate-700 pt-1.5 mt-1.5 space-y-2">
          <div className="text-[8px] text-slate-400 uppercase font-bold">Transitions</div>
          
          {/* Transition Out */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-[8px] text-slate-400">TRANSITION OUT</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (clip.transitionOut) {
                    onUpdate({ transitionOut: null });
                  } else {
                    onUpdate({ transitionOut: { type: 'crossfade', duration: 1 } });
                  }
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className={`text-[8px] px-1 py-0.5 rounded ${clip.transitionOut ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}
              >
                {clip.transitionOut ? 'ON' : 'OFF'}
              </button>
            </div>
            {clip.transitionOut && (
              <div className="space-y-1 pl-2 border-l-2 border-blue-500/50">
                <select
                  value={clip.transitionOut.type || 'crossfade'}
                  onChange={(e) => onUpdate({ transitionOut: { ...clip.transitionOut, type: e.target.value } })}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="bg-slate-800 text-[9px] border border-slate-600 rounded px-1 py-0.5 outline-none focus:border-blue-400 w-full"
                >
                  <optgroup label="Fade">
                    <option value="crossfade">Crossfade</option>
                  </optgroup>
                  <optgroup label="Wipe">
                    <option value="wipe-left">Wipe Left</option>
                    <option value="wipe-right">Wipe Right</option>
                    <option value="wipe-up">Wipe Up</option>
                    <option value="wipe-down">Wipe Down</option>
                  </optgroup>
                  <optgroup label="Slide">
                    <option value="slide-left">Slide Left</option>
                    <option value="slide-right">Slide Right</option>
                    <option value="slide-up">Slide Up</option>
                    <option value="slide-down">Slide Down</option>
                  </optgroup>
                  <optgroup label="Zoom">
                    <option value="zoom-in">Zoom In</option>
                    <option value="zoom-out">Zoom Out</option>
                  </optgroup>
                  <optgroup label="Effects">
                    <option value="blur">Blur</option>
                  </optgroup>
                </select>
                <div className="flex items-center gap-1">
                  <span className="text-[8px] text-slate-500">Duration:</span>
                  <input
                    type="range"
                    min="0.1"
                    max="5"
                    step="0.1"
                    value={clip.transitionOut.duration || 1}
                    onChange={(e) => onUpdate({ transitionOut: { ...clip.transitionOut, duration: parseFloat(e.target.value) } })}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onDragStart={(e) => e.preventDefault()}
                    className="flex-1 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-400"
                  />
                  <span className="text-[8px] font-mono w-8 text-right">{(clip.transitionOut.duration || 1).toFixed(1)}s</span>
                </div>
              </div>
            )}
          </div>

          {/* Transition In */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-[8px] text-slate-400">TRANSITION IN</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (clip.transitionIn) {
                    onUpdate({ transitionIn: null });
                  } else {
                    onUpdate({ transitionIn: { type: 'crossfade', duration: 1 } });
                  }
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className={`text-[8px] px-1 py-0.5 rounded ${clip.transitionIn ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}
              >
                {clip.transitionIn ? 'ON' : 'OFF'}
              </button>
            </div>
            {clip.transitionIn && (
              <div className="space-y-1 pl-2 border-l-2 border-green-500/50">
                <select
                  value={clip.transitionIn.type || 'crossfade'}
                  onChange={(e) => onUpdate({ transitionIn: { ...clip.transitionIn, type: e.target.value } })}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="bg-slate-800 text-[9px] border border-slate-600 rounded px-1 py-0.5 outline-none focus:border-blue-400 w-full"
                >
                  <optgroup label="Fade">
                    <option value="crossfade">Crossfade</option>
                  </optgroup>
                  <optgroup label="Wipe">
                    <option value="wipe-left">Wipe Left</option>
                    <option value="wipe-right">Wipe Right</option>
                    <option value="wipe-up">Wipe Up</option>
                    <option value="wipe-down">Wipe Down</option>
                  </optgroup>
                  <optgroup label="Slide">
                    <option value="slide-left">Slide Left</option>
                    <option value="slide-right">Slide Right</option>
                    <option value="slide-up">Slide Up</option>
                    <option value="slide-down">Slide Down</option>
                  </optgroup>
                  <optgroup label="Zoom">
                    <option value="zoom-in">Zoom In</option>
                    <option value="zoom-out">Zoom Out</option>
                  </optgroup>
                  <optgroup label="Effects">
                    <option value="blur">Blur</option>
                  </optgroup>
                </select>
                <div className="flex items-center gap-1">
                  <span className="text-[8px] text-slate-500">Duration:</span>
                  <input
                    type="range"
                    min="0.1"
                    max="5"
                    step="0.1"
                    value={clip.transitionIn.duration || 1}
                    onChange={(e) => onUpdate({ transitionIn: { ...clip.transitionIn, duration: parseFloat(e.target.value) } })}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onDragStart={(e) => e.preventDefault()}
                    className="flex-1 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-green-400"
                  />
                  <span className="text-[8px] font-mono w-8 text-right">{(clip.transitionIn.duration || 1).toFixed(1)}s</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-slate-700 pt-1.5 mt-1.5 space-y-2">
          <div className="flex items-center gap-1">
            <input
              type="text"
              placeholder="Text Overlay..."
              value={clip.text || ''}
              onChange={(e) => onUpdate({ text: e.target.value || null })}
              onMouseDown={(e) => e.stopPropagation()}
              className="bg-slate-800 text-[10px] border border-slate-600 rounded px-1.5 py-1 outline-none focus:border-blue-400 w-full"
            />
          </div>

          {(clip.text) && (
            <div className="grid grid-cols-2 gap-2 animate-in fade-in slide-in-from-top-1">
              <div className="flex flex-col gap-1">
                <span className="text-[8px] text-slate-500 uppercase font-bold">Position</span>
                <select
                  value={clip.textPos || 'center'}
                  onChange={(e) => onUpdate({ textPos: e.target.value })}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="bg-slate-800 text-[9px] border border-slate-600 rounded px-1 py-0.5 outline-none focus:border-blue-400"
                >
                  <option value="top">Top</option>
                  <option value="center">Center</option>
                  <option value="bottom">Bottom</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[8px] text-slate-500 uppercase font-bold">Animation</span>
                <select
                  value={clip.textAnim || 'none'}
                  onChange={(e) => onUpdate({ textAnim: e.target.value })}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="bg-slate-800 text-[9px] border border-slate-600 rounded px-1 py-0.5 outline-none focus:border-blue-400"
                >
                  <option value="none">None</option>
                  <option value="fade">Fade</option>
                  <option value="slide">Slide</option>
                  <option value="scale">Bounce</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[8px] text-slate-500 uppercase font-bold">Size</span>
                <select
                  value={clip.textSize || '4xl'}
                  onChange={(e) => onUpdate({ textSize: e.target.value })}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="bg-slate-800 text-[9px] border border-slate-600 rounded px-1 py-0.5 outline-none focus:border-blue-400"
                >
                  <option value="xl">Small</option>
                  <option value="2xl">Medium</option>
                  <option value="4xl">Large</option>
                  <option value="6xl">X-Large</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[8px] text-slate-500 uppercase font-bold">Color</span>
                <div className="flex items-center gap-1">
                  <input
                    type="color"
                    value={clip.textColor || '#ffffff'}
                    onChange={(e) => onUpdate({ textColor: e.target.value })}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="w-full h-4 bg-transparent border-none p-0 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
        </div>
      )}

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
