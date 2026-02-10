import { useState, useEffect, useRef, useCallback } from 'react';
import { motionTrackingTrack, motionTrackingGetProgress, adminGetServices, adminMorphStart } from '../../services/api';
import { getVideoUrl } from '../../services/api';
import { v4 as uuidv4 } from 'uuid';
import KeyframeEditor from './KeyframeEditor';

export default function MotionTrackingDialog({ clip, project, currentTime, onClose, onSave, onTimeUpdate }) {
  const [step, setStep] = useState(0); // 0: track list, 1: overlay type, 2: target selection, 3: tracking, 4: preview
  const [editingTrackId, setEditingTrackId] = useState(null); // null = new track, otherwise editing existing
  const [overlayType, setOverlayType] = useState('text');
  const [overlayContent, setOverlayContent] = useState('');
  const [targetRegion, setTargetRegion] = useState(null); // { x, y, width?, height? } normalized

  const [trackingProgress, setTrackingProgress] = useState(null);
  const [trackingKeyframes, setTrackingKeyframes] = useState(null);
  const [trackingQuality, setTrackingQuality] = useState(null); // { confidence, quality }
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [videoBox, setVideoBox] = useState(null);
  const [showKeyframeEditor, setShowKeyframeEditor] = useState(false);
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const videoBoxRef = useRef(null);
  const dragRef = useRef(null);
  const [isDraggingTarget, setIsDraggingTarget] = useState(false);
  const targetRegionRef = useRef(null);

  useEffect(() => {
    targetRegionRef.current = targetRegion;
  }, [targetRegion]);

  const updateVideoBox = useCallback(() => {
    if (!videoRef.current || !containerRef.current) return;
    const video = videoRef.current;
    const container = containerRef.current;

    const intrinsicWidth = video.videoWidth;
    const intrinsicHeight = video.videoHeight;
    const displayWidth = container.clientWidth;
    const displayHeight = container.clientHeight;

    if (!intrinsicWidth || !intrinsicHeight || !displayWidth || !displayHeight) return;

    const videoRatio = intrinsicWidth / intrinsicHeight;
    const containerRatio = displayWidth / displayHeight;

    let width, height, left, top;

    if (videoRatio > containerRatio) {
      width = displayWidth;
      height = displayWidth / videoRatio;
      left = 0;
      top = (displayHeight - height) / 2;
    } else {
      height = displayHeight;
      width = displayHeight * videoRatio;
      top = 0;
      left = (displayWidth - width) / 2;
    }

    const box = { left, top, width, height };
    setVideoBox(box);
    videoBoxRef.current = box;
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(updateVideoBox);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateVideoBox]);

  // Get existing tracks for this clip
  const existingTracks = clip.motionTracks || [];

  // Calculate tracking quality from keyframes
  const calculateQuality = (keyframes) => {
    if (!keyframes || keyframes.length < 2) return { confidence: 0, quality: 'unknown' };

    // Calculate average distance between consecutive keyframes (smoothness indicator)
    let totalDistance = 0;
    let maxDistance = 0;
    for (let i = 1; i < keyframes.length; i++) {
      const kf1 = keyframes[i - 1];
      const kf2 = keyframes[i];
      const dx = kf2.x - kf1.x;
      const dy = kf2.y - kf1.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      totalDistance += distance;
      maxDistance = Math.max(maxDistance, distance);
    }
    const avgDistance = totalDistance / (keyframes.length - 1);

    // Calculate time gaps (consistency indicator)
    let totalTimeGap = 0;
    let maxTimeGap = 0;
    for (let i = 1; i < keyframes.length; i++) {
      const gap = keyframes[i].time - keyframes[i - 1].time;
      totalTimeGap += gap;
      maxTimeGap = Math.max(maxTimeGap, gap);
    }
    const avgTimeGap = totalTimeGap / (keyframes.length - 1);

    // Quality metrics
    // Smooth tracking: low average distance, consistent time gaps
    // Good tracking: many keyframes, smooth path
    const smoothness = 1 - Math.min(1, avgDistance * 2); // Lower distance = smoother
    const consistency = 1 - Math.min(1, (maxTimeGap - avgTimeGap) / avgTimeGap); // Consistent gaps = better
    const density = Math.min(1, keyframes.length / 30); // More keyframes = better (up to 30)

    const confidence = (smoothness * 0.4 + consistency * 0.3 + density * 0.3) * 100;

    let quality = 'poor';
    if (confidence >= 80) quality = 'excellent';
    else if (confidence >= 60) quality = 'good';
    else if (confidence >= 40) quality = 'fair';
    else if (confidence >= 20) quality = 'poor';

    return { confidence: Math.round(confidence), quality };
  };

  // Check if Morph service is running
  const checkServiceStatus = async () => {
    try {
      const services = await adminGetServices();
      if (!services?.morph || services.morph.status !== 'running') {
        return { running: false, canStart: services?.morph?.startedByUs !== false };
      }
      return { running: true };
    } catch (err) {
      console.error('Failed to check service status:', err);
      return { running: false, canStart: false };
    }
  };

  // Handle service not running popup
  const handleServiceCheck = async () => {
    const status = await checkServiceStatus();
    if (!status.running) {
      if (status.canStart) {
        const shouldStart = window.confirm(
          'The Morph service is not running. Motion Tracking requires it.\n\nWould you like to start it now?'
        );
        if (shouldStart) {
          try {
            await adminMorphStart();
            // Wait a bit for service to start
            await new Promise(resolve => setTimeout(resolve, 2000));
            const recheck = await checkServiceStatus();
            if (!recheck.running) {
              setError('Failed to start Morph service. Please start it manually from Admin → Services.');
              return false;
            }
          } catch (err) {
            setError('Failed to start Morph service. Please start it manually from Admin → Services.');
            return false;
          }
        } else {
          setError('Motion Tracking requires the Morph service to be running. Please start it from Admin → Services.');
          return false;
        }
      } else {
        setError('The Morph service is not running. Please start it from Admin → Services.');
        return false;
      }
    }
    return true;
  };

  const clamp01 = (value) => Math.max(0, Math.min(1, value));

  const getPointerInfo = (clientX, clientY) => {
    const container = containerRef.current;
    const box = videoBoxRef.current;
    if (!container || !box) return null;
    const rect = container.getBoundingClientRect();
    const localX = clientX - rect.left - box.left;
    const localY = clientY - rect.top - box.top;
    const inside =
      localX >= 0 &&
      localX <= box.width &&
      localY >= 0 &&
      localY <= box.height;
    const normalized = {
      x: clamp01(localX / box.width),
      y: clamp01(localY / box.height),
    };
    return { inside, normalized };
  };

  const isPointInRegion = (point, region) => {
    if (!region) return false;
    const halfW = (region.width || 0) / 2;
    const halfH = (region.height || 0) / 2;
    return (
      point.x >= region.x - halfW &&
      point.x <= region.x + halfW &&
      point.y >= region.y - halfH &&
      point.y <= region.y + halfH
    );
  };

  const startDraw = (point) => {
    const minSize = 0.03;
    setTargetRegion({ x: point.x, y: point.y, width: minSize, height: minSize });
    dragRef.current = { type: 'draw', start: point };
    setIsDraggingTarget(true);
  };

  const startMove = (point, region) => {
    dragRef.current = {
      type: 'move',
      offsetX: point.x - region.x,
      offsetY: point.y - region.y,
      width: region.width || 0.05,
      height: region.height || 0.05,
    };
    setIsDraggingTarget(true);
  };

  const startResize = (handle, region) => {
    const halfW = (region.width || 0.05) / 2;
    const halfH = (region.height || 0.05) / 2;
    const corners = {
      nw: { x: region.x - halfW, y: region.y - halfH },
      ne: { x: region.x + halfW, y: region.y - halfH },
      sw: { x: region.x - halfW, y: region.y + halfH },
      se: { x: region.x + halfW, y: region.y + halfH },
    };
    const anchorMap = { nw: 'se', ne: 'sw', sw: 'ne', se: 'nw' };
    const anchorKey = anchorMap[handle];
    const anchor = corners[anchorKey];
    dragRef.current = { type: 'resize', handle, anchor };
    setIsDraggingTarget(true);
  };

  const handleTargetMouseDown = (e) => {
    if (e.button !== 0) return;
    const info = getPointerInfo(e.clientX, e.clientY);
    if (!info || !info.inside) return;
    const region = targetRegionRef.current;

    if (region && isPointInRegion(info.normalized, region)) {
      startMove(info.normalized, region);
      return;
    }

    startDraw(info.normalized);
  };

  useEffect(() => {
    if (!isDraggingTarget) return;

    const handleMove = (e) => {
      const info = getPointerInfo(e.clientX, e.clientY);
      if (!info) return;
      const drag = dragRef.current;
      if (!drag) return;

      if (drag.type === 'draw') {
        const start = drag.start;
        const end = info.normalized;
        const width = Math.abs(end.x - start.x);
        const height = Math.abs(end.y - start.y);
        const minSize = 0.02;
        const centerX = (start.x + end.x) / 2;
        const centerY = (start.y + end.y) / 2;
        setTargetRegion({
          x: clamp01(centerX),
          y: clamp01(centerY),
          width: Math.max(minSize, width),
          height: Math.max(minSize, height),
        });
        return;
      }

      if (drag.type === 'move') {
        const halfW = (drag.width || 0.05) / 2;
        const halfH = (drag.height || 0.05) / 2;
        const centerX = clamp01(info.normalized.x - drag.offsetX);
        const centerY = clamp01(info.normalized.y - drag.offsetY);
        const clampedX = Math.max(halfW, Math.min(1 - halfW, centerX));
        const clampedY = Math.max(halfH, Math.min(1 - halfH, centerY));
        setTargetRegion({
          x: clampedX,
          y: clampedY,
          width: drag.width,
          height: drag.height,
        });
        return;
      }

      if (drag.type === 'resize') {
        const anchor = drag.anchor;
        const end = info.normalized;
        const minSize = 0.02;
        const width = Math.max(minSize, Math.abs(end.x - anchor.x));
        const height = Math.max(minSize, Math.abs(end.y - anchor.y));
        const centerX = (end.x + anchor.x) / 2;
        const centerY = (end.y + anchor.y) / 2;
        setTargetRegion({
          x: clamp01(centerX),
          y: clamp01(centerY),
          width,
          height,
        });
      }
    };

    const handleUp = () => {
      setIsDraggingTarget(false);
      dragRef.current = null;
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDraggingTarget]);

  const handleStartTracking = async () => {
    if (!targetRegion) {
      setError('Please select a target object to track by clicking on the video.');
      return;
    }

    const serviceOk = await handleServiceCheck();
    if (!serviceOk) return;

    setLoading(true);
    setError(null);
    setStep(3);

    try {
      const clipStart = clip.trimStart || 0;
      const clipEnd = clip.trimEnd || clip.endTime || clip.duration || 0;
      const clipDuration = clipEnd - clipStart;

      const response = await motionTrackingTrack(videoId, {
        clipStart,
        clipEnd,
        target: targetRegion,
      });

      // If response has keyframes directly, use them
      if (response.keyframes && Array.isArray(response.keyframes)) {
        setTrackingKeyframes(response.keyframes);
        const quality = calculateQuality(response.keyframes);
        setTrackingQuality(quality);
        setStep(4);
      } else if (response.jobId) {
        // Otherwise poll for progress
        const jobId = response.jobId;
        const pollInterval = setInterval(async () => {
          try {
            const progress = await motionTrackingGetProgress(jobId);
            setTrackingProgress(progress);

            if (progress.status === 'completed' && progress.keyframes) {
              clearInterval(pollInterval);
              setTrackingKeyframes(progress.keyframes);
              const quality = calculateQuality(progress.keyframes);
              setTrackingQuality(quality);
              setStep(4);
            } else if (progress.status === 'failed' || progress.status === 'error') {
              clearInterval(pollInterval);
              setError(progress.error || 'Tracking failed');
              setStep(2);
            }
          } catch (err) {
            clearInterval(pollInterval);
            setError(err.response?.data?.error || err.message || 'Failed to get tracking progress');
            setStep(2);
          }
        }, 1000);

        // Cleanup on unmount
        return () => clearInterval(pollInterval);
      } else {
        throw new Error('Invalid response from tracking service');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.detail || err.message || 'Tracking failed');
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (!trackingKeyframes || trackingKeyframes.length === 0) {
      setError('No tracking data to save');
      return;
    }

    const clipStart = clip.trimStart || 0;
    const clipEnd = clip.trimEnd || clip.endTime || clip.duration || 0;

    const track = {
      id: editingTrackId || uuidv4(),
      type: overlayType,
      content: overlayContent,
      startTime: clipStart,
      endTime: clipEnd,
      keyframes: trackingKeyframes.map(kf => ({
        time: kf.time,
        x: kf.x,
        y: kf.y,
        scale: kf.scale !== undefined ? kf.scale : 1,
        rotation: kf.rotation !== undefined ? kf.rotation : 0,
      })),
    };

    // If editing, update existing track; otherwise add new one
    if (editingTrackId) {
      const updatedTracks = existingTracks.map(t => t.id === editingTrackId ? track : t);
      onSave({ action: 'updateAll', tracks: updatedTracks });
    } else {
      onSave(track);
    }
  };

  const clipDuration = ((clip.trimEnd || clip.endTime) - (clip.trimStart || 0)) / (clip.speed || 1);
  const clipStart = clip.startPos || 0;
  const clipEnd = clipStart + clipDuration;

  // Get videoId with fallback - try to resolve from project assets if missing
  let videoId = clip.videoId || clip.filename;
  if (!videoId && clip.assetId && project?.assets) {
    const asset = project.assets.find(a => a.id === clip.assetId);
    if (asset && asset.filename) {
      videoId = asset.filename;
    }
  }

  if (!videoId) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10001]">
        <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-2xl p-6">
          <h2 className="text-xl font-semibold text-slate-200 mb-4">Error</h2>
          <p className="text-slate-300 mb-4">
            This clip does not have a valid video source.{' '}
            {clip.assetId ? 'The asset may be missing from the project.' : 'Please ensure the clip is properly linked to a video asset.'}
          </p>
          <div className="text-xs text-slate-500 mt-2 font-mono">
            Clip ID: {clip.id}<br />
            Asset ID: {clip.assetId || 'none'}<br />
            Video ID: {clip.videoId || 'none'}<br />
            Filename: {clip.filename || 'none'}
          </div>
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10001]"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 border border-slate-700 rounded-lg shadow-2xl w-[90vw] max-w-4xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-slate-200">Motion Tracking</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-600 rounded text-red-200 text-sm">
              {error}
            </div>
          )}

          {step === 0 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium text-slate-200 mb-2">Motion Tracks</h3>
                <p className="text-sm text-slate-400 mb-4">
                  Manage motion tracking overlays for this clip. You can track multiple objects simultaneously.
                </p>
              </div>

              {existingTracks.length > 0 && (
                <div className="space-y-2">
                  {existingTracks.map((track, index) => (
                    <div
                      key={track.id}
                      className="bg-slate-900 rounded-lg p-3 border border-slate-700 flex items-center justify-between"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-slate-200">
                            Track {index + 1}: {track.type === 'text' ? 'Text' : track.type === 'sticker' ? 'Sticker' : 'Image'}
                          </span>
                          {track.type === 'text' && (
                            <span className="text-xs text-slate-400 truncate max-w-xs">
                              "{track.content}"
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">
                          {track.keyframes?.length || 0} keyframes •
                          {track.startTime !== undefined && track.endTime !== undefined
                            ? ` ${(track.endTime - track.startTime).toFixed(1)}s duration`
                            : ' Full clip'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingTrackId(track.id);
                            setOverlayType(track.type);
                            setOverlayContent(track.content || '');
                            setTrackingKeyframes(track.keyframes || []);
                            if (track.keyframes && track.keyframes.length > 0) {
                              setStep(4); // Go to preview/edit mode
                            } else {
                              setStep(1); // Start from overlay type
                            }
                          }}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm('Delete this motion track?')) {
                              // Call onSave with null to delete (or we need a delete callback)
                              // For now, we'll handle this by updating the clip
                              const updatedTracks = existingTracks.filter(t => t.id !== track.id);
                              onSave({ action: 'updateAll', tracks: updatedTracks });
                            }
                          }}
                          className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-white text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4">
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-slate-200"
                >
                  {existingTracks.length > 0 ? 'Done' : 'Cancel'}
                </button>
                <button
                  onClick={() => {
                    setEditingTrackId(null);
                    setOverlayType('text');
                    setOverlayContent('');
                    setTargetRegion(null);
                    setTrackingKeyframes(null);
                    setTrackingQuality(null);
                    setStep(1);
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
                >
                  + Add New Track
                </button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Overlay Type</label>
                <select
                  value={overlayType}
                  onChange={(e) => setOverlayType(e.target.value)}
                  className="w-full bg-slate-700 text-slate-100 border border-slate-600 rounded-md px-3 py-2"
                >
                  <option value="text">Text</option>
                  <option value="sticker">Sticker</option>
                  <option value="image">Image</option>
                </select>
              </div>

              {overlayType === 'text' && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Text Content</label>
                  <input
                    type="text"
                    value={overlayContent}
                    onChange={(e) => setOverlayContent(e.target.value)}
                    placeholder="Enter text to track..."
                    className="w-full bg-slate-700 text-slate-100 border border-slate-600 rounded-md px-3 py-2"
                  />
                </div>
              )}

              {(overlayType === 'sticker' || overlayType === 'image') && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    {overlayType === 'sticker' ? 'Sticker' : 'Image'} URL or Asset ID
                  </label>
                  <input
                    type="text"
                    value={overlayContent}
                    onChange={(e) => setOverlayContent(e.target.value)}
                    placeholder={`Enter ${overlayType} URL or select from assets...`}
                    className="w-full bg-slate-700 text-slate-100 border border-slate-600 rounded-md px-3 py-2"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    For now, enter a URL. Asset picker coming soon.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4">
                <button
                  onClick={() => {
                    setStep(0);
                    setEditingTrackId(null);
                  }}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-slate-200"
                >
                  Back
                </button>
                <button
                  onClick={() => {
                    if (overlayType === 'text' && !overlayContent.trim()) {
                      setError('Please enter text content');
                      return;
                    }
                    if ((overlayType === 'sticker' || overlayType === 'image') && !overlayContent.trim()) {
                      setError(`Please enter ${overlayType} URL or asset ID`);
                      return;
                    }
                    setStep(2);
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
                >
                  Next: Select Target
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium text-slate-200 mb-2">Select Target Object</h3>
                <p className="text-sm text-slate-400 mb-4">
                  Click and drag to draw a target box around the object. You can move or resize the box using the corners.
                </p>
              </div>

              <div
                ref={containerRef}
                className="relative bg-black rounded-lg overflow-hidden aspect-video cursor-crosshair"
                onMouseDown={handleTargetMouseDown}
              >
                <video
                  ref={videoRef}
                  src={getVideoUrl(videoId)}
                  className="w-full h-full object-contain"
                  onLoadedMetadata={() => {
                    updateVideoBox();
                    // Seek to clip start time
                    if (videoRef.current) {
                      const seekTime = clip.trimStart || 0;
                      videoRef.current.currentTime = seekTime;
                    }
                  }}
                />
                {!targetRegion && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-white bg-black/70 px-4 py-2 rounded">
                      Drag to draw a target box
                    </div>
                  </div>
                )}
                {videoBox && (
                  <div
                    className="absolute"
                    style={{
                      left: videoBox.left,
                      top: videoBox.top,
                      width: videoBox.width,
                      height: videoBox.height,
                    }}
                  >
                    {targetRegion && (
                      <div
                        className="absolute border-2 border-cyan-400 bg-cyan-400/20"
                        style={{
                          left: `${targetRegion.x * 100}%`,
                          top: `${targetRegion.y * 100}%`,
                          width: `${(targetRegion.width || 0.05) * 100}%`,
                          height: `${(targetRegion.height || 0.05) * 100}%`,
                          transform: 'translate(-50%, -50%)',
                          cursor: 'move',
                        }}
                      >
                        {['nw', 'ne', 'sw', 'se'].map(handle => (
                          <div
                            key={handle}
                            className="absolute w-3 h-3 bg-cyan-300 border border-cyan-900"
                            style={{
                              left: handle.includes('w') ? 0 : '100%',
                              top: handle.includes('n') ? 0 : '100%',
                              transform: 'translate(-50%, -50%)',
                              cursor: `${handle}-resize`,
                            }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              startResize(handle, targetRegion);
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {targetRegion && (
                <div className="text-sm text-slate-300">
                  Target selected at: ({Math.round(targetRegion.x * 100)}%, {Math.round(targetRegion.y * 100)}%)
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4">
                <button
                  onClick={() => {
                    setStep(1);
                    setTargetRegion(null);
                  }}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-slate-200"
                >
                  Back
                </button>
                <button
                  onClick={handleStartTracking}
                  disabled={!targetRegion || loading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-white"
                >
                  {loading ? 'Starting...' : 'Start Tracking'}
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-slate-200">Tracking in Progress...</h3>
              {trackingProgress ? (
                <div>
                  <div className="flex justify-between text-sm text-slate-300 mb-2">
                    <span>Progress</span>
                    <span>{Math.round(trackingProgress.progress || 0)}%</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all"
                      style={{ width: `${Math.min(100, Math.max(0, trackingProgress.progress || 0))}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-slate-400">Sending tracking request...</span>
                </div>
              )}
              <div className="text-sm text-slate-400">
                Analyzing video frames and tracking object movement...
              </div>
            </div>
          )}

          {step === 4 && trackingKeyframes && trackingKeyframes.length > 0 && (
            <div className="space-y-4">
              {showKeyframeEditor ? (
                <KeyframeEditor
                  track={{ keyframes: trackingKeyframes }}
                  clipDuration={((clip.trimEnd || clip.endTime) - (clip.trimStart || 0)) / (clip.speed || 1)}
                  onUpdate={(updates) => {
                    if (updates.keyframes) {
                      setTrackingKeyframes(updates.keyframes);
                      const quality = calculateQuality(updates.keyframes);
                      setTrackingQuality(quality);
                    }
                  }}
                  onClose={() => setShowKeyframeEditor(false)}
                />
              ) : (
                <>
                  <h3 className="text-lg font-medium text-slate-200">Tracking Complete!</h3>
                  <div className="text-sm text-slate-300 mb-3">
                    Found {trackingKeyframes.length} keyframes. The overlay will follow the tracked object.
                  </div>

                  {/* Tracking Quality Indicator */}
                  {trackingQuality && (
                    <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-slate-400 uppercase">Tracking Quality</span>
                        <span className={`text-xs font-semibold px-2 py-1 rounded ${trackingQuality.quality === 'excellent' ? 'bg-green-900/50 text-green-300' :
                          trackingQuality.quality === 'good' ? 'bg-blue-900/50 text-blue-300' :
                            trackingQuality.quality === 'fair' ? 'bg-yellow-900/50 text-yellow-300' :
                              'bg-red-900/50 text-red-300'
                          }`}>
                          {trackingQuality.quality.toUpperCase()}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">Confidence</span>
                          <span className="text-slate-200 font-mono">{trackingQuality.confidence}%</span>
                        </div>
                        <div className="w-full bg-slate-700 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${trackingQuality.confidence >= 80 ? 'bg-green-500' :
                              trackingQuality.confidence >= 60 ? 'bg-blue-500' :
                                trackingQuality.confidence >= 40 ? 'bg-yellow-500' :
                                  'bg-red-500'
                              }`}
                            style={{ width: `${trackingQuality.confidence}%` }}
                          />
                        </div>
                        {trackingQuality.quality === 'poor' && (
                          <div className="text-xs text-yellow-400 mt-2">
                            ⚠️ Tracking quality is low. Consider re-tracking or manually editing keyframes.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-4">
                    <button
                      onClick={() => {
                        setStep(2);
                        setTrackingKeyframes(null);
                        setTrackingQuality(null);
                        setTrackingProgress(null);
                        setTargetRegion(null);
                      }}
                      className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-slate-200"
                    >
                      Re-track
                    </button>
                    <button
                      onClick={() => setShowKeyframeEditor(true)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
                    >
                      Edit Keyframes
                    </button>
                    <button
                      onClick={() => {
                        handleSave();
                        setStep(0); // Return to track list
                        setEditingTrackId(null);
                        setTrackingKeyframes(null);
                        setTrackingQuality(null);
                      }}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white"
                    >
                      {editingTrackId ? 'Update Track' : 'Add Track'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
