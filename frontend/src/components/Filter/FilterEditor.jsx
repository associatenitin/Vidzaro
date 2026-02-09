import { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { convertFilterToCSS, getEffectDefaults, getEffectDisplayName, convertStringToFilter } from '../../utils/filterUtils';
import { getVideoUrl } from '../../services/api';
import EnhanceDialog from '../Deblur/EnhanceDialog';

const AVAILABLE_EFFECTS = [
  { type: 'brightness', icon: '☀️' },
  { type: 'contrast', icon: '🎨' },
  { type: 'saturate', icon: '🌈' },
  { type: 'blur', icon: '🌫️' },
  { type: 'sharpen', icon: '✨' },
  { type: 'grayscale', icon: '⚫' },
  { type: 'sepia', icon: '📸' },
  { type: 'hue-rotate', icon: '🎭' },
  { type: 'invert', icon: '🔄' },
];

export default function FilterEditor({ 
  initialFilter, 
  project, 
  selectedClipIds,
  onSave, 
  onApply, 
  onClose,
  onSavePreset,
  onAddAsset
}) {
  const [effects, setEffects] = useState([]);
  const [presetName, setPresetName] = useState('');
  const [showPresetSave, setShowPresetSave] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const [showEnhanceDialog, setShowEnhanceDialog] = useState(false);
  const previewVideoRef = useRef(null);
  const previewImageRef = useRef(null);

  // Initialize effects from initialFilter
  useEffect(() => {
    if (initialFilter) {
      if (typeof initialFilter === 'string') {
        // Convert legacy string filter
        const converted = convertStringToFilter(initialFilter);
        if (converted && converted.effects) {
          setEffects(converted.effects.map(e => ({ ...e, id: uuidv4() })));
        } else {
          setEffects([]);
        }
      } else if (initialFilter.effects && Array.isArray(initialFilter.effects)) {
        setEffects(initialFilter.effects.map(e => ({ ...e, id: e.id || uuidv4() })));
      } else {
        setEffects([]);
      }
    } else {
      setEffects([]);
    }
  }, [initialFilter]);

  // Get selected clips for preview
  const previewClips = selectedClipIds && project?.clips
    ? project.clips.filter(c => selectedClipIds.includes(c.id))
    : [];

  // Get the first clip for preview (or use first clip in project if none selected)
  const previewClip = previewClips.length > 0 
    ? previewClips[0] 
    : (project?.clips && project.clips.length > 0 ? project.clips[0] : null);

  const isImage = previewClip && (previewClip.type === 'image' || (previewClip.filename && previewClip.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i)));
  const videoUrl = previewClip ? getVideoUrl(previewClip.videoId) : null;

  // Update preview filter when effects change
  useEffect(() => {
    const filterObj = {
      type: 'custom',
      effects: effects.filter(e => e.enabled !== false)
    };
    const cssFilter = convertFilterToCSS(filterObj);
    
    if (previewVideoRef.current) {
      previewVideoRef.current.style.filter = cssFilter || 'none';
    }
    if (previewImageRef.current) {
      previewImageRef.current.style.filter = cssFilter || 'none';
    }
  }, [effects]);

  // Handle video playback
  useEffect(() => {
    if (isImage || !previewVideoRef.current) return;
    const video = previewVideoRef.current;

    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }

    // Sync time if clip has trim info
    if (previewClip) {
      const clipStart = previewClip.trimStart || 0;
      const clipDuration = ((previewClip.trimEnd || previewClip.endTime) - clipStart) / (previewClip.speed || 1);
      const targetTime = Math.min(clipStart + previewTime, clipStart + clipDuration);
      
      if (Math.abs(video.currentTime - targetTime) > 0.15) {
        video.currentTime = targetTime;
      }
      
      video.playbackRate = previewClip.speed || 1;
    }
  }, [isPlaying, previewTime, previewClip, isImage]);

  // Auto-update preview time from video
  useEffect(() => {
    if (isImage || !previewVideoRef.current) return;
    const video = previewVideoRef.current;
    
    const handleTimeUpdate = () => {
      if (previewClip) {
        const clipStart = previewClip.trimStart || 0;
        setPreviewTime(video.currentTime - clipStart);
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [previewClip, isImage]);

  const addEffect = (effectType) => {
    const defaults = getEffectDefaults();
    const def = defaults[effectType];
    if (!def) return;

    const newEffect = {
      id: uuidv4(),
      type: effectType,
      value: def.default,
      enabled: true
    };
    setEffects([...effects, newEffect]);
  };

  const removeEffect = (effectId) => {
    setEffects(effects.filter(e => e.id !== effectId));
  };

  const updateEffect = (effectId, updates) => {
    setEffects(effects.map(e => 
      e.id === effectId ? { ...e, ...updates } : e
    ));
  };

  const toggleEffect = (effectId) => {
    updateEffect(effectId, { enabled: !effects.find(e => e.id === effectId)?.enabled });
  };

  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    
    const filterPreset = {
      type: 'preset',
      name: presetName.trim(),
      effects: effects.filter(e => e.enabled !== false),
      id: uuidv4(),
      createdAt: new Date().toISOString()
    };

    if (onSavePreset) {
      onSavePreset(filterPreset);
    }
    setShowPresetSave(false);
    setPresetName('');
  };

  const handleApply = () => {
    const filterObj = {
      type: 'custom',
      effects: effects.filter(e => e.enabled !== false)
    };
    if (onApply) {
      onApply(filterObj);
    }
    onClose();
  };

  const getCurrentFilter = () => {
    return {
      type: 'custom',
      effects: effects.filter(e => e.enabled !== false)
    };
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10002]"
      onClick={onClose}
    >
      <div 
        className="bg-slate-800 border border-slate-700 rounded-lg shadow-2xl w-[90vw] max-w-5xl h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-slate-200">Filter Editor</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
          >
            ×
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Effect Library & Active Effects */}
          <div className="w-1/2 border-r border-slate-700 flex flex-col overflow-hidden">
            {/* Effect Library */}
            <div className="p-4 border-b border-slate-700">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Available Effects</h3>
              <div className="grid grid-cols-4 gap-2">
                {AVAILABLE_EFFECTS.map((effect) => {
                  const isAdded = effects.some(e => e.type === effect.type);
                  return (
                    <button
                      key={effect.type}
                      onClick={() => !isAdded && addEffect(effect.type)}
                      disabled={isAdded}
                      className={`p-3 rounded border transition-colors ${
                        isAdded
                          ? 'bg-slate-700 border-slate-600 text-slate-500 cursor-not-allowed'
                          : 'bg-slate-900 border-slate-600 hover:border-blue-500 hover:bg-slate-800 text-slate-300'
                      }`}
                      title={getEffectDisplayName(effect.type)}
                    >
                      <div className="text-2xl mb-1">{effect.icon}</div>
                      <div className="text-[10px]">{getEffectDisplayName(effect.type)}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active Effects */}
            <div className="flex-1 overflow-auto p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Active Effects</h3>
              {effects.length === 0 ? (
                <div className="text-center text-slate-500 text-sm py-8">
                  No effects added. Click an effect above to add it.
                </div>
              ) : (
                <div className="space-y-3">
                  {effects.map((effect) => {
                    const defaults = getEffectDefaults();
                    const def = defaults[effect.type];
                    if (!def) return null;

                    return (
                      <div
                        key={effect.id}
                        className={`bg-slate-900 border rounded p-3 ${
                          effect.enabled !== false
                            ? 'border-slate-600'
                            : 'border-slate-700 opacity-50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggleEffect(effect.id)}
                              className={`w-4 h-4 rounded border flex items-center justify-center ${
                                effect.enabled !== false
                                  ? 'bg-blue-600 border-blue-500'
                                  : 'bg-slate-700 border-slate-600'
                              }`}
                            >
                              {effect.enabled !== false && (
                                <span className="text-white text-[10px]">✓</span>
                              )}
                            </button>
                            <span className="text-sm font-medium text-slate-300">
                              {getEffectDisplayName(effect.type)}
                            </span>
                          </div>
                          <button
                            onClick={() => removeEffect(effect.id)}
                            className="text-slate-500 hover:text-red-400 text-xs"
                          >
                            Remove
                          </button>
                        </div>

                        {effect.enabled !== false && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="range"
                                min={def.min}
                                max={def.max}
                                step={def.step}
                                value={effect.value}
                                onChange={(e) => updateEffect(effect.id, { value: parseFloat(e.target.value) })}
                                className="flex-1 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                              />
                              <span className="text-xs text-slate-400 w-16 text-right font-mono">
                                {effect.value.toFixed(def.step < 1 ? 2 : 0)}{def.unit}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Preview */}
          <div className="w-1/2 flex flex-col p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-300">Preview</h3>
              {previewClip && !isImage && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-xs transition-colors"
                  >
                    {isPlaying ? '⏸️ Pause' : '▶️ Play'}
                  </button>
                  <button
                    onClick={() => {
                      if (previewClip) {
                        const clipStart = previewClip.trimStart || 0;
                        setPreviewTime(0);
                        if (previewVideoRef.current) {
                          previewVideoRef.current.currentTime = clipStart;
                        }
                      }
                    }}
                    className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-xs transition-colors"
                  >
                    ⏮️ Reset
                  </button>
                </div>
              )}
            </div>
            <div className="flex-1 bg-slate-900 rounded border border-slate-700 overflow-hidden flex items-center justify-center relative">
              {previewClip && videoUrl ? (
                <>
                  {isImage ? (
                    <img
                      ref={previewImageRef}
                      src={videoUrl}
                      className="max-w-full max-h-full object-contain"
                      alt="Preview"
                    />
                  ) : (
                    <video
                      ref={previewVideoRef}
                      src={videoUrl}
                      className="max-w-full max-h-full"
                      muted
                      preload="auto"
                      onLoadedMetadata={() => {
                        if (previewVideoRef.current && previewClip) {
                          const clipStart = previewClip.trimStart || 0;
                          previewVideoRef.current.currentTime = clipStart;
                        }
                      }}
                    />
                  )}
                  {previewClip.originalName && (
                    <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                      {previewClip.originalName}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center text-slate-500 text-sm py-8">
                  {selectedClipIds && selectedClipIds.length === 0 
                    ? 'Select clips on timeline to preview filters'
                    : 'No clips available for preview'}
                </div>
              )}
            </div>

            {/* Preset Save */}
            {showPresetSave && (
              <div className="mt-4 p-3 bg-slate-900 rounded border border-slate-700">
                <input
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Preset name..."
                  className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-blue-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSavePreset();
                    if (e.key === 'Escape') {
                      setShowPresetSave(false);
                      setPresetName('');
                    }
                  }}
                  autoFocus
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleSavePreset}
                    disabled={!presetName.trim()}
                    className="flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs rounded transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setShowPresetSave(false);
                      setPresetName('');
                    }}
                    className="flex-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between p-4 border-t border-slate-700">
          <div className="flex gap-2">
            <button
              onClick={() => setShowPresetSave(true)}
              disabled={effects.filter(e => e.enabled !== false).length === 0}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 text-slate-300 rounded transition-colors text-sm"
            >
              Save as Preset
            </button>
            {previewClip && !isImage && (
              <button
                onClick={() => setShowEnhanceDialog(true)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors text-sm"
                title="AI-powered video clarity enhancement"
              >
                ✨ AI Enhance
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors font-medium"
            >
              Apply Filter
            </button>
          </div>
        </div>
      </div>
      
      {/* AI Enhance Dialog */}
      {showEnhanceDialog && previewClip && (
        <EnhanceDialog
          videoAsset={previewClip}
          onClose={() => setShowEnhanceDialog(false)}
          onComplete={(asset) => {
            // Add enhanced video to project assets
            if (onAddAsset) {
              onAddAsset(asset);
            }
            setShowEnhanceDialog(false);
            onClose();
          }}
        />
      )}
    </div>
  );
}
