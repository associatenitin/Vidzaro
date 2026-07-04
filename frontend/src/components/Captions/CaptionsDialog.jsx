import { useState, useEffect } from 'react';
import { captionsGenerate, captionsGetProgress, adminGetServices, getVideoUrl } from '../../services/api';

function formatTimestamp(seconds) {
  const s = Math.max(0, seconds || 0);
  const mins = Math.floor(s / 60);
  const secs = (s % 60).toFixed(2);
  return `${mins}:${secs.padStart(5, '0')}`;
}

function toSrtTimestamp(seconds) {
  const s = Math.max(0, seconds || 0);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return `${pad(hh)}:${pad(mm)}:${pad(ss)},${pad(ms, 3)}`;
}

function segmentsToSrt(segments) {
  return segments
    .map((seg, i) => `${i + 1}\n${toSrtTimestamp(seg.start)} --> ${toSrtTimestamp(seg.end)}\n${seg.text}\n`)
    .join('\n');
}

export default function CaptionsDialog({ clip, onClose, onApply, onRemoveAll }) {
  const [qualityMode, setQualityMode] = useState('balanced');
  const [useCuda, setUseCuda] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [jobProgress, setJobProgress] = useState(null);
  const [segments, setSegments] = useState(null);

  const getCaptionsUseCuda = () => typeof localStorage !== 'undefined' && localStorage.getItem('captionsUseCuda') !== 'false';

  useEffect(() => {
    setUseCuda(getCaptionsUseCuda());

    return () => {
      if (window._captionsPollInterval) {
        clearInterval(window._captionsPollInterval);
        window._captionsPollInterval = null;
      }
    };
  }, []);

  const handleUseCudaChange = (value) => {
    setUseCuda(value);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('captionsUseCuda', String(value));
    }
  };

  const handleGenerate = async () => {
    if (!clip?.videoId) return;

    setLoading(true);
    setError(null);
    setJobProgress({ progress: 0, status: 'starting' });

    const jobId = crypto.randomUUID();
    const clipStart = clip.trimStart || 0;
    const clipEnd = clip.trimEnd ?? clip.endTime ?? null;

    try {
      try {
        const services = await adminGetServices();
        if (!services?.caption || services.caption.status !== 'running') {
          setError(
            'The Auto Captions service is not running. Open Admin → Services and start "Auto Captions service" first, then try again.'
          );
          setLoading(false);
          setJobProgress(null);
          return;
        }
      } catch (checkError) {
        console.debug('Failed to check Caption service status', checkError);
      }

      const useCudaValue = getCaptionsUseCuda();

      const interval = setInterval(async () => {
        try {
          const status = await captionsGetProgress(jobId);
          setJobProgress(status);

          if (status.status === 'error' || status.error || status.result?.error) {
            clearInterval(interval);
            window._captionsPollInterval = null;
            const msg = status.result?.error || status.error || 'Transcription failed';
            setError(msg);
            setLoading(false);
            return;
          }

          if (status.status === 'completed' && status.result?.segments) {
            clearInterval(interval);
            window._captionsPollInterval = null;
            setSegments(status.result.segments);
            setLoading(false);
          }
        } catch (err) {
          console.debug('Polling progress...', err.message);
        }
      }, 2000);

      window._captionsPollInterval = interval;

      await captionsGenerate(clip.videoId, {
        clipStart,
        clipEnd,
        useCuda: useCudaValue,
        qualityMode,
        jobId,
      });
    } catch (e) {
      if (window._captionsPollInterval) {
        clearInterval(window._captionsPollInterval);
        window._captionsPollInterval = null;
      }
      setError(e.response?.data?.detail || e.response?.data?.error || e.message || 'Transcription failed');
      setLoading(false);
    }
  };

  const updateSegment = (index, updates) => {
    setSegments((prev) => prev.map((seg, i) => (i === index ? { ...seg, ...updates } : seg)));
  };

  const deleteSegment = (index) => {
    setSegments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleApply = () => {
    onApply?.(segments || []);
    onClose?.();
  };

  const handleDownloadSrt = () => {
    if (!segments || segments.length === 0) return;
    const blob = new Blob([segmentsToSrt(segments)], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(clip.originalName || clip.filename || 'captions').replace(/\.[^.]+$/, '')}.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isEditStage = Array.isArray(segments);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10002]"
      onClick={() => !loading && onClose()}
    >
      <div
        className="bg-slate-800 border border-slate-700 rounded-lg shadow-2xl w-[90vw] max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-slate-200">Auto Captions</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
            disabled={loading}
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {clip && (
            <div className="bg-slate-900 rounded border border-slate-700 p-4">
              <div className="flex items-center gap-4">
                <video
                  src={getVideoUrl(clip.videoId || clip.filename)}
                  className="w-32 h-20 object-cover rounded"
                  muted
                  preload="metadata"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-300">
                    {clip.originalName || clip.filename}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Clip range: {formatTimestamp(clip.trimStart || 0)} – {formatTimestamp(clip.trimEnd ?? clip.endTime ?? 0)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {!isEditStage && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Quality Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'fast', label: 'Fast', desc: 'tiny model' },
                    { value: 'balanced', label: 'Balanced', desc: 'Recommended' },
                    { value: 'best', label: 'Best', desc: 'small model' },
                  ].map((mode) => (
                    <button
                      key={mode.value}
                      onClick={() => setQualityMode(mode.value)}
                      disabled={loading}
                      className={`p-3 rounded border transition-colors ${qualityMode === mode.value
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-slate-900 border-slate-600 hover:border-blue-500 text-slate-300'
                        } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="font-medium">{mode.label}</div>
                      <div className="text-xs opacity-75">{mode.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-900 rounded border border-slate-700">
                <div>
                  <div className="text-sm font-medium text-slate-300">Use GPU (CUDA)</div>
                  <div className="text-xs text-slate-500">Faster transcription with GPU acceleration</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useCuda}
                    onChange={(e) => handleUseCudaChange(e.target.checked)}
                    disabled={loading}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {jobProgress && (
                <div className="bg-slate-900 rounded border border-slate-700 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-300">
                      {jobProgress.status === 'starting' && '🚀 Starting...'}
                      {jobProgress.status === 'extracting_audio' && '🎧 Extracting audio...'}
                      {jobProgress.status === 'loading_model' && '🤖 Loading AI model...'}
                      {jobProgress.status === 'transcribing' && '✨ Transcribing...'}
                      {jobProgress.status === 'completed' && '✅ Completed!'}
                      {jobProgress.status === 'error' && '❌ Error'}
                    </span>
                    <span className="text-sm font-semibold text-blue-400">
                      {Math.round(jobProgress.progress || 0)}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-blue-600 h-2.5 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${Math.min(100, Math.max(0, jobProgress.progress || 0))}%` }}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {isEditStage && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-300">
                  {segments.length} caption{segments.length !== 1 ? 's' : ''}
                </label>
                <button
                  onClick={() => setSegments(null)}
                  className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300"
                >
                  Regenerate
                </button>
              </div>
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {segments.map((seg, i) => (
                  <div key={i} className="bg-slate-900 border border-slate-700 rounded p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.1"
                        value={seg.start}
                        onChange={(e) => updateSegment(i, { start: parseFloat(e.target.value) || 0 })}
                        className="w-20 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200"
                      />
                      <span className="text-slate-500 text-xs">to</span>
                      <input
                        type="number"
                        step="0.1"
                        value={seg.end}
                        onChange={(e) => updateSegment(i, { end: parseFloat(e.target.value) || 0 })}
                        className="w-20 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200"
                      />
                      <span className="text-slate-500 text-xs">seconds</span>
                      <button
                        onClick={() => deleteSegment(i)}
                        className="ml-auto text-xs px-2 py-1 rounded bg-red-900/60 hover:bg-red-800 text-red-300"
                      >
                        Delete
                      </button>
                    </div>
                    <textarea
                      value={seg.text}
                      onChange={(e) => updateSegment(i, { text: e.target.value })}
                      rows={2}
                      className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200 resize-none"
                    />
                  </div>
                ))}
                {segments.length === 0 && (
                  <p className="text-sm text-slate-500">No captions left. Regenerate or close this dialog.</p>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-900/50 border border-red-700 rounded p-3 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-700">
          {onRemoveAll && (
            <button
              onClick={() => {
                onRemoveAll();
                onClose?.();
              }}
              disabled={loading}
              className="px-4 py-2 bg-red-900/60 hover:bg-red-800 disabled:opacity-50 text-red-300 rounded transition-colors mr-auto"
            >
              Remove Existing Captions
            </button>
          )}
          {isEditStage && (
            <button
              onClick={handleDownloadSrt}
              disabled={!segments || segments.length === 0}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-300 rounded transition-colors"
            >
              Download .srt
            </button>
          )}
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-300 rounded transition-colors"
          >
            Cancel
          </button>
          {!isEditStage && (
            <button
              onClick={handleGenerate}
              disabled={loading || !clip}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded transition-colors font-medium"
            >
              {loading ? 'Transcribing...' : 'Generate Captions'}
            </button>
          )}
          {isEditStage && (
            <button
              onClick={handleApply}
              disabled={!segments || segments.length === 0}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded transition-colors font-medium"
            >
              Apply to Timeline
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
