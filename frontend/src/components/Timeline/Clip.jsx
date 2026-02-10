import { useState, useEffect, useMemo, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getVideoThumbnails, getThumbnailUrl, getWaveformUrl, getVideoUrl } from '../../services/api';
import { getFilterDisplayName } from '../../utils/filterUtils';

export default function Clip({ clip, left, width, pixelsPerSecond, onUpdate, onRemove, onDetachAudio, isDragging, isSelected, onSelect, isMultiSelected, project, onOpenFilterEditor, onEditTextOverlayPosition }) {
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
            {clip.reversed && (
              <span className="bg-cyan-600 text-white px-1 rounded uppercase text-[8px] font-bold">
                REV
              </span>
            )}
            {clip.filter && (
              <span className="bg-yellow-500 text-black px-1 rounded uppercase text-[8px] font-bold">
                {getFilterDisplayName(clip.filter, project)}
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
          className="pointer-events-auto flex flex-col bg-slate-900/98 backdrop-blur-md rounded-lg border border-slate-600/80 shadow-xl w-64 overflow-hidden"
          onMouseEnter={() => setIsHoveringSettings(true)}
          onMouseLeave={() => setIsHoveringSettings(false)}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onDragStart={(e) => e.preventDefault()}
        >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 bg-slate-800/80 border-b border-slate-700/80">
          <span className="text-xs font-semibold text-slate-200 tracking-wide">Clip Settings</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUpdate({ audioEnabled: !((clip.audioEnabled === undefined) ? true : clip.audioEnabled) });
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className={`p-1.5 rounded-md transition-colors ${(clip.audioEnabled === false) ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}
              title={clip.audioEnabled === false ? 'Unmute' : 'Mute'}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {clip.audioEnabled === false ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                )}
              </svg>
            </button>
            {onDetachAudio && clip.videoEnabled !== false && (
              <button
                onClick={(e) => { e.stopPropagation(); onDetachAudio(); }}
                onMouseDown={(e) => e.stopPropagation()}
                className="p-1.5 rounded-md bg-slate-700/60 text-slate-400 hover:bg-slate-600 hover:text-white transition-colors"
                title="Detach Audio"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowSettings(false); }}
              onMouseDown={(e) => e.stopPropagation()}
              className="p-1.5 rounded-md hover:bg-slate-700/60 text-slate-500 hover:text-white transition-colors"
              title="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-col gap-3 p-3 overflow-y-auto max-h-[min(70vh,400px)]">
        {/* Filter */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-slate-300 uppercase tracking-wider">Filter</label>
          <select
            value={
              !clip.filter ? '' :
              typeof clip.filter === 'string' ? clip.filter :
              clip.filter.id || clip.filter.name || ''
            }
            onChange={(e) => {
              const value = e.target.value;
              if (value === '__custom__') {
                // Open filter editor
                if (onOpenFilterEditor) {
                  onOpenFilterEditor(clip.filter);
                }
                // Reset select to current value
                e.target.value = clip.filter 
                  ? (typeof clip.filter === 'string' ? clip.filter : (clip.filter.id || clip.filter.name || ''))
                  : '';
              } else if (value === '') {
                onUpdate({ filter: null });
              } else {
                // Check if it's a custom preset
                const preset = project?.customFilters?.find(f => f.id === value);
                if (preset) {
                  onUpdate({ filter: preset });
                } else {
                  onUpdate({ filter: value || null });
                }
              }
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full bg-slate-800 text-slate-100 text-[12px] border border-slate-600 rounded-md px-2 py-1.5 outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30"
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
            {project?.customFilters && project.customFilters.length > 0 && (
              <optgroup label="Custom Presets">
                {project.customFilters.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Actions">
              <option value="__custom__">Create/Edit Custom Filter...</option>
            </optgroup>
          </select>
        </div>

        {/* Playback */}
        <div className="space-y-2">
          <label className="text-[11px] font-medium text-slate-300 uppercase tracking-wider">Playback</label>
          <select
            value={clip.speed || 1}
            onChange={(e) => onUpdate({ speed: parseFloat(e.target.value) })}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full bg-slate-800 text-slate-100 text-[12px] border border-slate-600 rounded-md px-2 py-1.5 outline-none focus:border-cyan-500/60"
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

        {/* Volume */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-medium text-slate-300 uppercase tracking-wider">Volume</label>
            <span className="text-[12px] font-mono text-slate-200 tabular-nums">{Math.round((clip.volume || 1) * 100)}%</span>
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
            className="w-full h-1.5 bg-slate-700/80 rounded-full appearance-none cursor-pointer accent-cyan-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-500 [&::-webkit-slider-thumb]:cursor-pointer"
          />
        </div>

        {/* Fades */}
        <div className="space-y-2">
          <label className="text-[11px] font-medium text-slate-300 uppercase tracking-wider">Fades</label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-[11px] text-slate-300">In</span>
                <span className="text-[11px] font-mono text-slate-200">{(clip.fadeIn || 0).toFixed(1)}s</span>
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
                className="w-full h-1.5 bg-slate-700/80 rounded-full appearance-none cursor-pointer accent-cyan-500"
              />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-[11px] text-slate-300">Out</span>
                <span className="text-[11px] font-mono text-slate-200">{(clip.fadeOut || 0).toFixed(1)}s</span>
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
                className="w-full h-1.5 bg-slate-700/80 rounded-full appearance-none cursor-pointer accent-cyan-500"
              />
            </div>
          </div>
        </div>

        {/* Transitions */}
        <div className="space-y-2">
          <label className="text-[11px] font-medium text-slate-300 uppercase tracking-wider">Transitions</label>
          
          {/* Transition Out */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-slate-300">Out</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (clip.transitionOut) onUpdate({ transitionOut: null });
                  else onUpdate({ transitionOut: { type: 'crossfade', duration: 1 } });
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className={`text-[11px] font-medium px-2 py-1 rounded-md transition-colors ${clip.transitionOut ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-700 text-slate-400 hover:text-slate-200'}`}
              >
                {clip.transitionOut ? 'On' : 'Off'}
              </button>
            </div>
            {clip.transitionOut && (
              <div className="space-y-2 pl-3 ml-1 border-l-2 border-cyan-500/40">
                <select
                  value={clip.transitionOut.type || 'crossfade'}
                  onChange={(e) => onUpdate({ transitionOut: { ...clip.transitionOut, type: e.target.value } })}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="w-full bg-slate-800 text-slate-100 text-[11px] border border-slate-600 rounded-md px-2 py-1 outline-none focus:border-cyan-500/60"
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
                <div className="flex items-center gap-2">
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
                    className="flex-1 h-1.5 bg-slate-700/80 rounded-full appearance-none cursor-pointer accent-cyan-500"
                  />
                  <span className="text-[11px] font-mono text-slate-200 w-7 text-right tabular-nums">{(clip.transitionOut.duration || 1).toFixed(1)}s</span>
                </div>
              </div>
            )}
          </div>

          {/* Transition In */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-slate-300">In</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (clip.transitionIn) onUpdate({ transitionIn: null });
                  else onUpdate({ transitionIn: { type: 'crossfade', duration: 1 } });
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className={`text-[11px] font-medium px-2 py-1 rounded-md transition-colors ${clip.transitionIn ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-400 hover:text-slate-200'}`}
              >
                {clip.transitionIn ? 'On' : 'Off'}
              </button>
            </div>
            {clip.transitionIn && (
              <div className="space-y-2 pl-3 ml-1 border-l-2 border-emerald-500/40">
                <select
                  value={clip.transitionIn.type || 'crossfade'}
                  onChange={(e) => onUpdate({ transitionIn: { ...clip.transitionIn, type: e.target.value } })}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="w-full bg-slate-800 text-slate-100 text-[11px] border border-slate-600 rounded-md px-2 py-1 outline-none focus:border-cyan-500/60"
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
                <div className="flex items-center gap-2">
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
                    className="flex-1 h-1.5 bg-slate-700/80 rounded-full appearance-none cursor-pointer accent-emerald-500"
                  />
                  <span className="text-[11px] font-mono text-slate-200 w-7 text-right tabular-nums">{(clip.transitionIn.duration || 1).toFixed(1)}s</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Text Overlays */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-medium text-slate-300 uppercase tracking-wider">
              Text Overlays
            </label>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const overlays = clip.textOverlays || [];
                const newOverlay = {
                  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                  text: '',
                  x: 50,
                  y: 50,
                  size: '4xl',
                  color: '#ffffff',
                  animation: 'none',
                  positionMode: 'percentage',
                };
                onUpdate({ textOverlays: [...overlays, newOverlay] });
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="text-[11px] px-2 py-1 rounded-md bg-slate-700 text-slate-200 hover:bg-slate-600"
            >
              + Add
            </button>
          </div>

          {(clip.textOverlays && clip.textOverlays.length > 0) ? (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {clip.textOverlays.map((overlay, index) => (
                <div
                  key={overlay.id || index}
                  className="rounded-md border border-slate-700 bg-slate-900/80 px-2 py-2 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-400">
                      Overlay {index + 1}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Toggle positioning mode for this overlay (handled in parent via optional prop)
                          if (typeof onEditTextOverlayPosition === 'function') {
                            onEditTextOverlayPosition({
                              type: 'clip',
                              clipId: clip.id,
                              overlayId: overlay.id,
                            });
                          }
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="text-[10px] px-2 py-0.5 rounded bg-slate-700 text-slate-200 hover:bg-slate-600"
                      >
                        Position on Video
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = (clip.textOverlays || []).filter((ov) => ov.id !== overlay.id);
                          onUpdate({ textOverlays: next });
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="text-[11px] px-1.5 py-0.5 rounded bg-red-600 text-white hover:bg-red-500"
                        title="Remove overlay"
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    placeholder="Overlay text..."
                    value={overlay.text || ''}
                    onChange={(e) => {
                      const next = (clip.textOverlays || []).map((ov) =>
                        ov.id === overlay.id ? { ...ov, text: e.target.value } : ov
                      );
                      onUpdate({ textOverlays: next });
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="w-full bg-slate-800 text-slate-100 text-[12px] border border-slate-600 rounded-md px-2 py-1.5 outline-none focus:border-cyan-500/60 placeholder:text-slate-400"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-slate-400">X Position (%)</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={overlay.x ?? 50}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          const next = (clip.textOverlays || []).map((ov) =>
                            ov.id === overlay.id ? { ...ov, x: Math.max(0, Math.min(100, value || 0)) } : ov
                          );
                          onUpdate({ textOverlays: next });
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-full bg-slate-800 text-slate-100 text-[11px] border border-slate-600 rounded-md px-2 py-1 outline-none focus:border-cyan-500/60"
                      />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-slate-400">Y Position (%)</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={overlay.y ?? 50}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          const next = (clip.textOverlays || []).map((ov) =>
                            ov.id === overlay.id ? { ...ov, y: Math.max(0, Math.min(100, value || 0)) } : ov
                          );
                          onUpdate({ textOverlays: next });
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-full bg-slate-800 text-slate-100 text-[11px] border border-slate-600 rounded-md px-2 py-1 outline-none focus:border-cyan-500/60"
                      />
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-slate-400">Size</span>
                      <select
                        value={overlay.size || '4xl'}
                        onChange={(e) => {
                          const next = (clip.textOverlays || []).map((ov) =>
                            ov.id === overlay.id ? { ...ov, size: e.target.value } : ov
                          );
                          onUpdate({ textOverlays: next });
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="bg-slate-800 text-slate-100 text-[11px] border border-slate-600 rounded-md px-2 py-1 outline-none focus:border-cyan-500/60"
                      >
                        <option value="xl">Small</option>
                        <option value="2xl">Medium</option>
                        <option value="4xl">Large</option>
                        <option value="6xl">X-Large</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-slate-400">Animation</span>
                      <select
                        value={overlay.animation || 'none'}
                        onChange={(e) => {
                          const next = (clip.textOverlays || []).map((ov) =>
                            ov.id === overlay.id ? { ...ov, animation: e.target.value } : ov
                          );
                          onUpdate({ textOverlays: next });
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="bg-slate-800 text-slate-100 text-[11px] border border-slate-600 rounded-md px-2 py-1 outline-none focus:border-cyan-500/60"
                      >
                        <option value="none">None</option>
                        <option value="fade">Fade</option>
                        <option value="slide">Slide</option>
                        <option value="scale">Bounce</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-0.5 col-span-2">
                      <span className="text-[10px] text-slate-400">Color</span>
                      <input
                        type="color"
                        value={overlay.color || '#ffffff'}
                        onChange={(e) => {
                          const next = (clip.textOverlays || []).map((ov) =>
                            ov.id === overlay.id ? { ...ov, color: e.target.value } : ov
                          );
                          onUpdate({ textOverlays: next });
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-full h-5 bg-transparent border-none p-0 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">
              No text overlays yet. Click <span className="font-semibold">Add</span> to create one.
            </p>
          )}
        </div>

        {/* Reverse - at bottom */}
        {!isImage && (
          <div className="pt-2 mt-2 border-t border-slate-700">
            <button
              onClick={(e) => { e.stopPropagation(); onUpdate({ reversed: !clip.reversed }); }}
              onMouseDown={(e) => e.stopPropagation()}
              className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-[12px] font-medium transition-colors ${clip.reversed ? 'bg-cyan-500/25 text-cyan-300 ring-1 ring-cyan-500/50' : 'bg-slate-700/80 text-slate-300 hover:bg-slate-600 hover:text-white'}`}
              title="Reverse playback"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              Reverse
            </button>
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
