import { useState } from 'react';
import { getVideoUrl } from '../../services/api';
import { morphDetectFaces, morphRun, morphGetProgress } from '../../services/api';
import UploadArea from '../Upload/UploadArea';
import CharacterSelect from './CharacterSelect';

const STEPS = ['Source photo', 'Video', 'Select character', 'Apply'];

function isImage(asset) {
  const t = asset.type || (asset.filename?.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? 'image' : null);
  return t === 'image';
}

function isVideo(asset) {
  const t = asset.type || (asset.filename?.match(/\.(mp4|mov|webm|avi|mkv)$/i) ? 'video' : null);
  return t === 'video';
}

export default function MorphWizard({ project, onClose, onComplete }) {
  const [step, setStep] = useState(0);
  const [photoAsset, setPhotoAsset] = useState(null);
  const [videoAsset, setVideoAsset] = useState(null);
  const [detectResult, setDetectResult] = useState(null);
  const [selectedTrackId, setSelectedTrackId] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [jobProgress, setJobProgress] = useState(null);

  const assets = project?.assets ?? [];
  const imageAssets = assets.filter(isImage);
  const videoAssets = assets.filter(isVideo);

  const handleUploadPhoto = (asset) => {
    setPhotoAsset(asset);
    setError(null);
  };

  const getMorphUseCuda = () => typeof localStorage !== 'undefined' && localStorage.getItem('morphUseCuda') !== 'false';

  const handleDetect = async () => {
    if (!videoAsset?.filename) return;
    setLoading(true);
    setError(null);
    try {
      const useCuda = getMorphUseCuda();
      const data = await morphDetectFaces(videoAsset.filename, useCuda);
      setDetectResult(data);
      setSelectedTrackId(0);
      setStep(2);
    } catch (e) {
      setError(e.response?.data?.detail || e.response?.data?.error || e.message || 'Face detection failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRun = async () => {
    if (!photoAsset?.filename || !videoAsset?.filename) return;
    setLoading(true);
    setError(null);
    setJobProgress({ progress: 0, status: 'starting' });

    const jobId = crypto.randomUUID();
    let pollInterval = null;

    try {
      const useCuda = getMorphUseCuda();
      const targetEmbedding = detectResult?.trackEmbeddings?.[selectedTrackId];

      // Start polling and handle completion
      pollInterval = setInterval(async () => {
        try {
          const status = await morphGetProgress(jobId);
          setJobProgress(status);

          if (status.status === 'failed' || status.error || status.result?.error) {
            clearInterval(pollInterval);
            pollInterval = null;
            const msg = status.result?.error || status.error || 'Face swap failed';
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
      await morphRun(photoAsset.filename, videoAsset.filename, {
        faceTrackId: selectedTrackId,
        targetEmbedding,
        jobId,
        useCuda
      });

      // The poller takes it from here...
    } catch (e) {
      if (pollInterval) clearInterval(pollInterval);
      console.error('Morph run error:', e);
      setError(e.response?.data?.detail || e.response?.data?.error || e.message || 'Face swap failed');
      setLoading(false);
      setJobProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-xl border border-slate-700 shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-xl font-bold text-white">Video Morph</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-2 flex gap-2 border-b border-slate-700">
          {STEPS.map((label, i) => (
            <span
              key={label}
              className={`text-sm font-medium ${i === step ? 'text-blue-400' : i < step ? 'text-slate-400' : 'text-slate-500'}`}
            >
              {i + 1}. {label}
            </span>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-700 text-red-200 text-sm">
              {error}
            </div>
          )}

          {step === 0 && (
            <div className="space-y-4">
              <p className="text-slate-300 text-sm">Choose the photo that contains the face to use (source face).</p>
              <UploadArea onUpload={handleUploadPhoto} compact />
              <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                {imageAssets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => { setPhotoAsset(asset); setError(null); }}
                    className={`rounded border-2 overflow-hidden aspect-square ${photoAsset?.id === asset.id ? 'border-blue-500' : 'border-slate-600 hover:border-slate-500'}`}
                  >
                    <img
                      src={getVideoUrl(asset.filename)}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  </button>
                ))}
              </div>
              {photoAsset && (
                <p className="text-slate-400 text-sm">Selected: {photoAsset.originalName || photoAsset.filename}</p>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <p className="text-slate-300 text-sm">Choose the video. The selected character in the video will get the face from the photo.</p>
              {videoAssets.length === 0 ? (
                <p className="text-slate-500 text-sm">No videos in library. Upload a video first from the main library.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {videoAssets.map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => { setVideoAsset(asset); setError(null); }}
                      className={`rounded border-2 overflow-hidden ${videoAsset?.id === asset.id ? 'border-blue-500' : 'border-slate-600 hover:border-slate-500'}`}
                    >
                      <video
                        src={getVideoUrl(asset.filename)}
                        className="w-full aspect-video object-cover"
                        muted
                        preload="metadata"
                      />
                      <p className="p-2 text-xs text-slate-400 truncate">{asset.originalName || asset.filename}</p>
                    </button>
                  ))}
                </div>
              )}
              {videoAsset && (
                <p className="text-slate-400 text-sm">Selected: {videoAsset.originalName || videoAsset.filename}</p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {detectResult?.keyframes?.length > 0 ? (
                <CharacterSelect
                  keyframes={detectResult.keyframes}
                  selectedTrackId={selectedTrackId}
                  onSelect={setSelectedTrackId}
                />
              ) : (
                <p className="text-slate-400 text-sm">No keyframes. Run detection from the previous step.</p>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-slate-300 text-sm">
                Replace <strong>Person {selectedTrackId + 1}</strong> in the video with the face from your photo. This may take a few minutes.
              </p>
              <p className="text-slate-500 text-sm">Photo: {photoAsset?.originalName || photoAsset?.filename} · Video: {videoAsset?.originalName || videoAsset?.filename}</p>

              {loading && (
                <div className="mt-8 flex flex-col items-center justify-center p-8 border border-slate-700 bg-slate-900/50 rounded-lg">
                  <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4"></div>
                  <p className="text-blue-400 font-medium">
                    {jobProgress?.status === 'detecting' ? 'Analyzing Faces...' :
                      jobProgress?.status === 'encoding' ? 'Encoding Video...' :
                        'Processing Face Swap...'}
                  </p>

                  {jobProgress && (
                    <div className="w-full max-w-xs mt-4">
                      <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>Progress</span>
                        <span>{Math.round(jobProgress.progress)}%</span>
                      </div>
                      <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-blue-500 h-full transition-all duration-300"
                          style={{ width: `${jobProgress.progress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  <p className="text-slate-500 text-xs mt-4 text-center">
                    Please keep this window open. Total runtime depends on video length.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 px-6 py-4 border-t border-slate-700">
          <div>
            {step > 0 && step < 3 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="px-4 py-2 text-slate-300 hover:text-white"
              >
                Back
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {step === 0 && (
              <button
                type="button"
                disabled={!photoAsset}
                onClick={() => setStep(1)}
                className="px-4 py-2 rounded bg-blue-600 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            )}
            {step === 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="px-4 py-2 rounded border border-slate-600 text-slate-300"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={!videoAsset}
                  onClick={detectResult ? () => setStep(2) : handleDetect}
                  className="px-4 py-2 rounded bg-blue-600 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Detecting...' : detectResult ? 'Next' : 'Detect characters'}
                </button>
              </>
            )}
            {step === 2 && (
              <>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2 rounded border border-slate-600 text-slate-300"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="px-4 py-2 rounded bg-blue-600 text-white font-medium"
                >
                  Next
                </button>
              </>
            )}
            {step === 3 && (
              <>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-4 py-2 rounded border border-slate-600 text-slate-300"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleRun}
                  className="px-4 py-2 rounded bg-blue-600 text-white font-medium disabled:opacity-50"
                >
                  {loading ? 'Applying...' : 'Apply'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
