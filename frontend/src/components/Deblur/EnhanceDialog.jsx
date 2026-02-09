import { useState, useEffect } from 'react';
import { deblurEnhance, deblurGetProgress } from '../../services/api';
import { getVideoUrl } from '../../services/api';

export default function EnhanceDialog({ videoAsset, onClose, onComplete }) {
  const [qualityMode, setQualityMode] = useState('balanced');
  const [useCuda, setUseCuda] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [jobProgress, setJobProgress] = useState(null);

  const getDeblurUseCuda = () => typeof localStorage !== 'undefined' && localStorage.getItem('deblurUseCuda') !== 'false';

  useEffect(() => {
    setUseCuda(getDeblurUseCuda());
  }, []);

  const handleEnhance = async () => {
    if (!videoAsset?.filename) return;
    
    setLoading(true);
    setError(null);
    setJobProgress({ progress: 0, status: 'starting' });

    const jobId = crypto.randomUUID();
    let pollInterval = null;

    try {
      const useCudaValue = getDeblurUseCuda();
      
      // Start polling and handle completion
      pollInterval = setInterval(async () => {
        try {
          const status = await deblurGetProgress(jobId);
          setJobProgress(status);

          if (status.status === 'failed' || status.error || status.result?.error) {
            clearInterval(pollInterval);
            pollInterval = null;
            const msg = status.result?.error || status.error || 'Enhancement failed';
            setError(msg);
            setLoading(false);
            return;
          }

          if (status.status === 'completed' && status.asset) {
            clearInterval(pollInterval);
            pollInterval = null;
            onComplete?.(status.asset);
            onClose?.();
          }
        } catch (err) {
          console.debug('Polling progress...', err.message);
        }
      }, 2000);

      // Trigger the job
      await deblurEnhance(videoAsset.filename, {
        useCuda: useCudaValue,
        qualityMode,
        jobId,
      });

    } catch (e) {
      if (pollInterval) clearInterval(pollInterval);
      setError(e.response?.data?.detail || e.response?.data?.error || e.message || 'Enhancement failed');
      setLoading(false);
    }
  };

  const handleUseCudaChange = (value) => {
    setUseCuda(value);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('deblurUseCuda', String(value));
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10002]"
      onClick={onClose}
    >
      <div 
        className="bg-slate-800 border border-slate-700 rounded-lg shadow-2xl w-[90vw] max-w-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-slate-200">Enhance Video Clarity (AI)</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
            disabled={loading}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {videoAsset && (
            <div className="bg-slate-900 rounded border border-slate-700 p-4">
              <div className="flex items-center gap-4">
                <video
                  src={getVideoUrl(videoAsset.videoId || videoAsset.filename)}
                  className="w-32 h-20 object-cover rounded"
                  muted
                  preload="metadata"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-300">
                    {videoAsset.originalName || videoAsset.filename}
                  </div>
                  {videoAsset.duration && (
                    <div className="text-xs text-slate-500 mt-1">
                      Duration: {Math.round(videoAsset.duration)}s
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Quality Mode */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Quality Mode
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'fast', label: 'Fast', desc: 'Quick processing' },
                { value: 'balanced', label: 'Balanced', desc: 'Recommended' },
                { value: 'best', label: 'Best', desc: 'Maximum quality' },
              ].map((mode) => (
                <button
                  key={mode.value}
                  onClick={() => setQualityMode(mode.value)}
                  disabled={loading}
                  className={`p-3 rounded border transition-colors ${
                    qualityMode === mode.value
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

          {/* GPU Option */}
          <div className="flex items-center justify-between p-3 bg-slate-900 rounded border border-slate-700">
            <div>
              <div className="text-sm font-medium text-slate-300">Use GPU (CUDA)</div>
              <div className="text-xs text-slate-500">Faster processing with GPU acceleration</div>
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

          {/* Progress */}
          {jobProgress && (
            <div className="bg-slate-900 rounded border border-slate-700 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-300">
                  {jobProgress.status === 'starting' && 'Starting...'}
                  {jobProgress.status === 'loading_model' && 'Loading AI model...'}
                  {jobProgress.status === 'reading_video' && 'Reading video...'}
                  {jobProgress.status === 'processing_frames' && 'Processing frames...'}
                  {jobProgress.status === 'encoding' && 'Encoding video...'}
                  {jobProgress.status === 'completed' && 'Completed!'}
                  {jobProgress.status === 'error' && 'Error'}
                </span>
                <span className="text-sm text-slate-400">
                  {Math.round(jobProgress.progress || 0)}%
                </span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${jobProgress.progress || 0}%` }}
                />
              </div>
              {jobProgress.result?.frames_processed && (
                <div className="text-xs text-slate-500 mt-2">
                  Processed {jobProgress.result.frames_processed} frames
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-900/50 border border-red-700 rounded p-3 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-700">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-300 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleEnhance}
            disabled={loading || !videoAsset}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded transition-colors font-medium"
          >
            {loading ? 'Processing...' : 'Enhance Video'}
          </button>
        </div>
      </div>
    </div>
  );
}
