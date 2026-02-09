import { useState, useEffect } from 'react';
import { genAIGenerate, genAIGetProgress } from '../../services/api';

const DEFAULT_NEGATIVE_PROMPT =
  'Bright tones, overexposed, static, blurred details, subtitles, style, works, paintings, images, static, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, misshapen limbs, fused fingers, still picture, messy background, three legs, many people in the background, walking backwards';

function getGenAIUseCuda() {
  return typeof localStorage !== 'undefined' && localStorage.getItem('genAIUseCuda') !== 'false';
}

function getGenAILowVram() {
  return typeof localStorage !== 'undefined' && localStorage.getItem('genAILowVram') === 'true';
}

export default function GenAIDialog({ onClose, onComplete, onProgress }) {
  const [mode, setMode] = useState('text-to-video');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState(DEFAULT_NEGATIVE_PROMPT);
  const [showNegativePrompt, setShowNegativePrompt] = useState(false);
  const [duration, setDuration] = useState(5);
  const [guidanceScale, setGuidanceScale] = useState(6);
  const [useCuda, setUseCuda] = useState(true);
  const [lowVram, setLowVram] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [jobProgress, setJobProgress] = useState(null);

  useEffect(() => {
    setUseCuda(getGenAIUseCuda());
    setLowVram(getGenAILowVram());
    return () => {
      if (window._genAIPollInterval) {
        clearInterval(window._genAIPollInterval);
        window._genAIPollInterval = null;
      }
    };
  }, []);

  const handleUseCudaChange = (value) => {
    setUseCuda(value);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('genAIUseCuda', String(value));
    }
  };

  const handleLowVramChange = (value) => {
    setLowVram(value);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('genAILowVram', String(value));
    }
  };

  useEffect(() => {
    onProgress?.(jobProgress);
  }, [jobProgress, onProgress]);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }

    setLoading(true);
    setError(null);
    setJobProgress({ progress: 0, status: 'starting' });

    const jobId = crypto.randomUUID();

    try {
      const interval = setInterval(async () => {
        try {
          const status = await genAIGetProgress(jobId);
          setJobProgress(status);

          if (status.status === 'failed' || status.error || status.result?.error) {
            clearInterval(interval);
            window._genAIPollInterval = null;
            const msg = status.result?.error || status.error || 'Generation failed';
            setError(msg);
            setLoading(false);
            onProgress?.(null);
            return;
          }

          if (status.status === 'completed' && status.asset) {
            clearInterval(interval);
            window._genAIPollInterval = null;
            onProgress?.(null);
            onComplete?.(status.asset);
            onClose?.();
          }
        } catch (err) {
          console.debug('Gen AI polling...', err.message);
        }
      }, 2500);

      window._genAIPollInterval = interval;

      await genAIGenerate({
        mode: 'text-to-video',
        prompt: prompt.trim(),
        negativePrompt: negativePrompt.trim() || undefined,
        duration,
        guidanceScale,
        useCuda: getGenAIUseCuda(),
        lowVram: getGenAILowVram(),
        jobId,
      });
    } catch (e) {
      if (window._genAIPollInterval) {
        clearInterval(window._genAIPollInterval);
        window._genAIPollInterval = null;
      }
      setError(e.response?.data?.detail || e.response?.data?.error || e.message || 'Generation failed');
      setLoading(false);
      onProgress?.(null);
    }
  };

  const canGenerate = !loading && prompt.trim().length > 0 && mode === 'text-to-video';

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10002]"
      onClick={() => !loading && onClose()}
    >
      <div
        className="bg-slate-800 border border-slate-700 rounded-lg shadow-2xl w-[90vw] max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-slate-200">Gen AI Video (Wan 2.1)</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
            disabled={loading}
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Mode */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Mode</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('text-to-video')}
                disabled={loading}
                className={`px-4 py-2 rounded-lg border transition-colors ${
                  mode === 'text-to-video'
                    ? 'bg-emerald-600 border-emerald-500 text-white'
                    : 'bg-slate-900 border-slate-600 hover:border-slate-500 text-slate-300'
                } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Text-to-Video
              </button>
              <button
                type="button"
                onClick={() => setMode('image-to-video')}
                disabled={loading}
                className={`px-4 py-2 rounded-lg border transition-colors ${
                  mode === 'image-to-video'
                    ? 'bg-emerald-600 border-emerald-500 text-white'
                    : 'bg-slate-900 border-slate-600 hover:border-slate-500 text-slate-300'
                } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Image-to-Video
              </button>
            </div>
            {mode === 'image-to-video' && (
              <p className="text-xs text-amber-500 mt-2">
                Image-to-Video requires the 14B model. Use Text-to-Video for now.
              </p>
            )}
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the video you want to generate, e.g. A cat walks on the grass, realistic"
              rows={4}
              disabled={loading}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
            />
          </div>

          {/* Negative prompt (collapsible) */}
          <div>
            <button
              type="button"
              onClick={() => setShowNegativePrompt(!showNegativePrompt)}
              className="text-sm font-medium text-slate-400 hover:text-slate-300 flex items-center gap-1"
            >
              {showNegativePrompt ? '▼' : '▶'} Negative prompt
            </button>
            {showNegativePrompt && (
              <textarea
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="What to avoid in the generated video"
                rows={3}
                disabled={loading}
                className="mt-2 w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 focus:border-emerald-500 text-sm disabled:opacity-50"
              />
            )}
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Duration</label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              disabled={loading}
              className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 focus:border-emerald-500 disabled:opacity-50"
            >
              <option value={3}>3 seconds</option>
              <option value={5}>5 seconds</option>
              <option value={8}>8 seconds</option>
            </select>
          </div>

          {/* Guidance scale */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Guidance scale: {guidanceScale}
            </label>
            <input
              type="range"
              min={4}
              max={8}
              step={0.5}
              value={guidanceScale}
              onChange={(e) => setGuidanceScale(Number(e.target.value))}
              disabled={loading}
              className="w-full accent-emerald-500"
            />
            <p className="text-xs text-slate-500 mt-1">Recommended: 6 for 1.3B model</p>
          </div>

          {/* GPU & Low VRAM */}
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-slate-900 rounded border border-slate-700">
              <div>
                <div className="text-sm font-medium text-slate-300">Use GPU (CUDA)</div>
                <div className="text-xs text-slate-500">Faster with GPU acceleration</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={useCuda}
                  onChange={(e) => handleUseCudaChange(e.target.checked)}
                  disabled={loading}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-900 rounded border border-slate-700">
              <div>
                <div className="text-sm font-medium text-slate-300">Low VRAM mode</div>
                <div className="text-xs text-slate-500">For 8GB GPUs (e.g. RTX 4060)</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={lowVram}
                  onChange={(e) => handleLowVramChange(e.target.checked)}
                  disabled={loading}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>
          </div>

          {/* Progress */}
          {jobProgress && (
            <div className="bg-slate-900 rounded border border-slate-700 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {['starting', 'queued'].includes(jobProgress.status) && (
                    <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                  )}
                  {jobProgress.status === 'loading_model' && (
                    <div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
                  )}
                  {['generating', 'encoding'].includes(jobProgress.status) && (
                    <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                  )}
                  {jobProgress.status === 'completed' && <div className="text-green-500">✓</div>}
                  {jobProgress.status === 'error' && <div className="text-red-500">✗</div>}
                  <span className="text-sm font-medium text-slate-300">
                    {jobProgress.status === 'starting' && '🚀 Starting...'}
                    {jobProgress.status === 'queued' && '⏳ Queued...'}
                    {jobProgress.status === 'loading_model' && '🤖 Loading model...'}
                    {jobProgress.status === 'generating' && '✨ Generating video...'}
                    {jobProgress.status === 'encoding' && '🎬 Encoding...'}
                    {jobProgress.status === 'completed' && '✅ Completed!'}
                    {jobProgress.status === 'error' && '❌ Error'}
                    {!['starting', 'queued', 'loading_model', 'generating', 'encoding', 'completed', 'error'].includes(
                      jobProgress.status
                    ) && jobProgress.status}
                  </span>
                </div>
                <span className="text-sm font-semibold text-emerald-400">
                  {Math.round(jobProgress.progress || 0)}%
                </span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-2.5 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${Math.min(100, Math.max(0, jobProgress.progress || 0))}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-900/50 border border-red-700 rounded p-3 text-sm text-red-300">{error}</div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-700">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-300 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded transition-colors font-medium"
          >
            {loading ? 'Generating...' : 'Generate Video'}
          </button>
        </div>
      </div>
    </div>
  );
}
