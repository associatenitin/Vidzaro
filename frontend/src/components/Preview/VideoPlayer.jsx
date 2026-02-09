import { useCallback, useEffect, useRef, useState } from 'react';
import { getVideoUrl } from '../../services/api';
import { convertFilterToCSS } from '../../utils/filterUtils';

export default function VideoPlayer({ project, currentTime, isPlaying, onTimeUpdate, onPlayPause, previewAsset }) {
  const videoRef = useRef(null);
  const isSeekingRef = useRef(false);
  const [previewTime, setPreviewTime] = useState(0);
  const progressRef = useRef(null);
  const displaySourceRef = useRef(null); // video or img element from the active layer (for Take Photo)
  const [hasDisplaySource, setHasDisplaySource] = useState(false);

  // Calculate total duration from clips
  const totalDuration = project.clips.reduce((max, clip) => {
    const clipEnd = (clip.startPos || 0) + (((clip.trimEnd || clip.endTime) - (clip.trimStart || 0)) / (clip.speed || 1));
    return Math.max(max, clipEnd);
  }, 0) || (previewAsset?.duration || 0);

  // Calculate which clips should be active based on currentTime
  const getActiveClips = () => {
    if (!project.clips || project.clips.length === 0) return [];

    return project.clips
      .filter(clip => {
        // Check if track is hidden
        const track = project.tracks?.find(t => t.id === (clip.track || 0));
        if (track?.hidden) return false;

        const clipDuration = ((clip.trimEnd || clip.endTime) - (clip.trimStart || 0)) / (clip.speed || 1);
        const start = clip.startPos || 0;
        return currentTime >= start && currentTime < start + clipDuration;
      })
      .sort((a, b) => (b.track || 0) - (a.track || 0)) // Higher track on top
      .map(clip => {
        const start = clip.startPos || 0;
        return {
          clip,
          clipStartTimeOnTimeline: start,
          clipLocalTime: (currentTime - start) * (clip.speed || 1) + (clip.trimStart || 0),
        };
      });
  };

  const activeClips = getActiveClips();

  // Detect transitions at current time
  const getTransitionInfo = () => {
    if (!project.clips || project.clips.length === 0) return null;

    // Sort clips by startPos and track
    const sortedClips = [...project.clips].sort((a, b) => {
      const trackDiff = (a.track || 0) - (b.track || 0);
      if (trackDiff !== 0) return trackDiff;
      return (a.startPos || 0) - (b.startPos || 0);
    });
    
    // Check all pairs of clips on the same track
    for (let i = 0; i < sortedClips.length; i++) {
      const clip1 = sortedClips[i];
      const track1 = project.tracks?.find(t => t.id === (clip1.track || 0));
      if (track1?.hidden || clip1.videoEnabled === false) continue;
      
      // Look for next clip on same track
      for (let j = i + 1; j < sortedClips.length; j++) {
        const clip2 = sortedClips[j];
        const track2 = project.tracks?.find(t => t.id === (clip2.track || 0));
        
        // If different track, stop searching (clips are sorted by track)
        if ((clip1.track || 0) !== (clip2.track || 0)) break;
        if (track2?.hidden || clip2.videoEnabled === false) continue;
        
        const clip1Duration = ((clip1.trimEnd || clip1.endTime) - (clip1.trimStart || 0)) / (clip1.speed || 1);
        const clip1End = (clip1.startPos || 0) + clip1Duration;
        const clip2Start = clip2.startPos || 0;
        
        // Check if we're in a transition zone
        const transition = clip1.transitionOut || clip2.transitionIn;
        if (!transition || !transition.type || !transition.duration) continue;
        
        // Calculate transition boundaries
        // Transition happens at the boundary between clips
        // If clips overlap, transition happens during overlap
        // If clips don't overlap, transition happens centered at the boundary
        let transitionStart, transitionEnd;
        
        if (clip1End > clip2Start) {
          // Clips overlap - transition happens during overlap period
          transitionStart = Math.max(clip1End - transition.duration, clip2Start);
          transitionEnd = Math.min(clip1End, clip2Start + transition.duration);
        } else {
          // Clips don't overlap - transition happens centered at boundary
          const boundary = clip1End;
          transitionStart = Math.max(0, boundary - transition.duration / 2);
          transitionEnd = boundary + transition.duration / 2;
        }
        
        // Check if currentTime is within transition zone
        if (currentTime >= transitionStart && currentTime <= transitionEnd) {
          const progress = (transitionEnd - transitionStart) > 0 
            ? (currentTime - transitionStart) / (transitionEnd - transitionStart)
            : 0;
          const transitionResult = {
            fromClip: clip1,
            toClip: clip2,
            transition,
            progress: Math.max(0, Math.min(1, progress)),
            transitionStart,
            transitionEnd
          };
          // Debug logging
          console.log('Transition detected:', {
            type: transition.type,
            duration: transition.duration,
            progress: transitionResult.progress,
            currentTime,
            transitionStart,
            transitionEnd,
            clip1End,
            clip2Start
          });
          return transitionResult;
        }
        
        // If clip2 starts after clip1 ends, no need to check further clips
        if (clip2Start >= clip1End) break;
      }
    }
    
    return null;
  };

  const transitionInfo = getTransitionInfo();

  // Helper to create clip info object
  const createClipInfo = (clip, time) => {
    const start = clip.startPos || 0;
    const clipDuration = ((clip.trimEnd || clip.endTime) - (clip.trimStart || 0)) / (clip.speed || 1);
    const clipEnd = start + clipDuration;
    
    // Calculate local time within the clip's trimmed range
    let clipLocalTime;
    if (time < start) {
      // Before clip starts - use trimStart (beginning of visible portion)
      clipLocalTime = clip.trimStart || 0;
    } else if (time > clipEnd) {
      // After clip ends - use trimEnd (end of visible portion)
      clipLocalTime = clip.trimEnd || clip.endTime;
    } else {
      // Within clip - calculate based on timeline position
      const relativeTime = time - start;
      clipLocalTime = (relativeTime * (clip.speed || 1)) + (clip.trimStart || 0);
    }
    
    // Clamp to valid range
    clipLocalTime = Math.max(clip.trimStart || 0, Math.min(clipLocalTime, clip.trimEnd || clip.endTime));
    
    return {
      clip,
      clipStartTimeOnTimeline: start,
      clipLocalTime,
    };
  };

  // If in transition, get both clips (even if they're not in activeClips)
  let transitionFromClip = null;
  let transitionToClip = null;
  
  if (transitionInfo) {
    // Get fromClip - might not be in activeClips if transition is happening at clip end
    const fromClip = transitionInfo.fromClip;
    const track = project.tracks?.find(t => t.id === (fromClip.track || 0));
    if (!track?.hidden && fromClip.videoEnabled !== false) {
      transitionFromClip = createClipInfo(fromClip, currentTime);
      console.log('Transition fromClip:', {
        id: fromClip.id,
        clipLocalTime: transitionFromClip.clipLocalTime,
        currentTime,
        startPos: fromClip.startPos
      });
    }
    
    // Get toClip - might not be in activeClips if transition is happening before clip start
    const toClip = transitionInfo.toClip;
    const toTrack = project.tracks?.find(t => t.id === (toClip.track || 0));
    if (!toTrack?.hidden && toClip.videoEnabled !== false) {
      transitionToClip = createClipInfo(toClip, currentTime);
      console.log('Transition toClip:', {
        id: toClip.id,
        clipLocalTime: transitionToClip.clipLocalTime,
        currentTime,
        startPos: toClip.startPos
      });
    }
    
    if (!transitionFromClip || !transitionToClip) {
      console.warn('Transition detected but clips not found:', {
        hasFromClip: !!transitionFromClip,
        hasToClip: !!transitionToClip,
        fromClipHidden: track?.hidden,
        toClipHidden: toTrack?.hidden,
        fromClipVideoEnabled: fromClip.videoEnabled,
        toClipVideoEnabled: toClip.videoEnabled
      });
    }
  }

  // Separation of concerns: Handle layers
  const videoClips = activeClips.filter(c => c.clip.videoEnabled !== false);
  const topVideoClip = videoClips[0] || null;

  // Show selected library asset in player whenever one is selected (from Media Library)
  const showPreview = !!previewAsset;

  // Reset preview time when asset changes
  useEffect(() => {
    if (previewAsset) {
      setPreviewTime(0);
    }
  }, [previewAsset?.id]);

  // Format time as mm:ss
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle progress bar click for seeking
  const handleProgressClick = (e) => {
    if (!progressRef.current || !onTimeUpdate) return;
    const rect = progressRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = ratio * totalDuration;
    onTimeUpdate(newTime);
  };

  const displayTime = showPreview ? previewTime : currentTime;
  const displayDuration = showPreview ? (previewAsset?.duration || 0) : totalDuration;
  const progress = displayDuration > 0 ? (displayTime / displayDuration) * 100 : 0;

  const registerDisplaySource = useCallback((el) => {
    displaySourceRef.current = el;
    setHasDisplaySource(!!el);
  }, []);

  const takePhoto = useCallback(() => {
    const el = displaySourceRef.current;
    if (!el) return;
    const tag = el.tagName.toUpperCase();
    const canvas = document.createElement('canvas');
    let w, h;
    if (tag === 'VIDEO') {
      w = el.videoWidth;
      h = el.videoHeight;
      if (w === 0 || h === 0) return;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(el, 0, 0, w, h);
    } else if (tag === 'IMG') {
      w = el.naturalWidth;
      h = el.naturalHeight;
      if (w === 0 || h === 0) return;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(el, 0, 0, w, h);
    } else return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `frame-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }, []);

  return (
    <div className="w-full max-w-4xl relative group bg-black rounded-lg shadow-2xl overflow-hidden aspect-video">
      {showPreview ? (
        // Preview Mode: Show selected asset from Media Library
        <PreviewAssetLayer
          asset={previewAsset}
          isPlaying={isPlaying}
          currentTime={previewTime}
          onTimeUpdate={(time) => {
            setPreviewTime(time);
            // Also update main timeline time when previewing (if timeline is empty)
            if (project.clips.length === 0 && onTimeUpdate) {
              onTimeUpdate(time);
            }
          }}
          registerDisplaySource={registerDisplaySource}
        />
      ) : (
        <>
          {/* 1. All Audio Elements (Hidden) */}
          {activeClips.map((info, index) => {
            const isImage = info.clip.type === 'image' || info.clip.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i);
            if (info.clip.audioEnabled === false || isImage) return null;

            // Define who drives the timeline: 
            // 1. If there's a top video, let IT drive (VideoLayer will handle it)
            // 2. If NO video, let the first audio clip drive
            const hasVideo = !!topVideoClip;
            const isFirstAudio = index === activeClips.findIndex(c => c.clip.audioEnabled !== false && !(c.clip.type === 'image' || c.clip.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i)));
            const shouldDrive = !hasVideo && isFirstAudio;

            return (
              <AudioLayer
                key={info.clip.id + '-audio'}
                clipInfo={info}
                isPlaying={isPlaying}
                currentTime={currentTime}
                onTimeUpdate={shouldDrive ? onTimeUpdate : null}
                onPlayPause={onPlayPause}
                project={project}
                transitionInfo={transitionInfo && (transitionInfo.fromClip.id === info.clip.id || transitionInfo.toClip.id === info.clip.id) ? transitionInfo : null}
              />
            );
          })}
          
          {/* Audio for transition clips */}
          {transitionInfo && transitionToClip && (
            <>
              {transitionFromClip && transitionFromClip.clip.audioEnabled !== false && !(transitionFromClip.clip.type === 'image' || transitionFromClip.clip.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i)) && (
                <AudioLayer
                  key={transitionFromClip.clip.id + '-audio-transition'}
                  clipInfo={transitionFromClip}
                  isPlaying={isPlaying}
                  currentTime={currentTime}
                  onTimeUpdate={null}
                  onPlayPause={onPlayPause}
                  project={project}
                  transitionInfo={transitionInfo}
                />
              )}
              {transitionToClip.clip.audioEnabled !== false && !(transitionToClip.clip.type === 'image' || transitionToClip.clip.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i)) && (
                <AudioLayer
                  key={transitionToClip.clip.id + '-audio-transition'}
                  clipInfo={transitionToClip}
                  isPlaying={isPlaying}
                  currentTime={currentTime}
                  onTimeUpdate={onTimeUpdate}
                  onPlayPause={onPlayPause}
                  project={project}
                  transitionInfo={transitionInfo}
                />
              )}
            </>
          )}

          {/* 2. Primary Video/Image Display */}
          {transitionInfo && transitionFromClip && transitionToClip ? (
            <div className="w-full h-full flex items-center justify-center relative overflow-hidden">
              <TransitionLayer
                fromClipInfo={transitionFromClip}
                toClipInfo={transitionToClip}
                transitionInfo={transitionInfo}
                isPlaying={isPlaying}
                currentTime={currentTime}
                onTimeUpdate={onTimeUpdate}
                project={project}
                registerDisplaySource={registerDisplaySource}
              />
            </div>
          ) : topVideoClip && !transitionInfo ? (
            <div className="w-full h-full flex items-center justify-center">
              <VideoLayer
                clipInfo={topVideoClip}
                isPlaying={isPlaying}
                currentTime={currentTime}
                onTimeUpdate={onTimeUpdate} // Top video ALWAYS drives if it exists
                project={project}
                registerDisplaySource={registerDisplaySource}
              />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-500 font-medium">No active video</div>
          )}

          {/* 3. Global Overlays */}
          {topVideoClip?.clip.text && (
            <div className={`absolute inset-0 flex pointer-events-none z-50 p-10 ${topVideoClip.clip.textPos === 'top' ? 'items-start justify-center' :
              topVideoClip.clip.textPos === 'bottom' ? 'items-end justify-center' :
                'items-center justify-center'
              }`}>
              <span
                key={`${topVideoClip.clip.id}-${topVideoClip.clip.text}-${topVideoClip.clip.textAnim}`}
                className={`font-bold drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] text-center px-6 leading-tight ${topVideoClip.clip.textSize === 'xl' ? 'text-xl' :
                  topVideoClip.clip.textSize === '2xl' ? 'text-2xl' :
                    topVideoClip.clip.textSize === '6xl' ? 'text-6xl' :
                      'text-4xl'
                  } ${topVideoClip.clip.textAnim === 'fade' ? 'anim-fade' :
                    topVideoClip.clip.textAnim === 'slide' ? 'anim-slide' :
                      topVideoClip.clip.textAnim === 'scale' ? 'anim-scale' :
                        ''
                  }`}
                style={{ color: topVideoClip.clip.textColor || '#ffffff' }}
              >
                {topVideoClip.clip.text}
              </span>
            </div>
          )}
        </>
      )}

      {/* Playback Controls Overlay - appears on hover */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-4">
        {/* Progress Bar */}
        <div
          ref={progressRef}
          className="w-full h-1.5 bg-slate-600/70 rounded-full mb-3 cursor-pointer hover:h-2 transition-all"
          onClick={handleProgressClick}
        >
          <div
            className="h-full bg-blue-500 rounded-full relative transition-all"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"></div>
          </div>
        </div>

        {/* Controls Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Skip to Start */}
            <button
              onClick={() => onTimeUpdate && onTimeUpdate(0)}
              className="p-1.5 text-white/80 hover:text-white transition-colors"
              title="Skip to start (Home)"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M3 5a1 1 0 011-1h2a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V5zm6 0a1 1 0 01.707.293l4 4a1 1 0 010 1.414l-4 4A1 1 0 019 14V6a1 1 0 01.707-.707z" transform="scale(-1,1) translate(-20,0)" />
              </svg>
            </button>

            {/* Previous Frame */}
            <button
              onClick={() => onTimeUpdate && onTimeUpdate(Math.max(0, displayTime - 1 / 30))}
              className="p-1.5 text-white/80 hover:text-white transition-colors"
              title="Previous frame (←)"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </button>

            {/* Play/Pause */}
            <button
              onClick={() => onPlayPause && onPlayPause(!isPlaying)}
              className="p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors"
              title={isPlaying ? "Pause (Space)" : "Play (Space)"}
            >
              {isPlaying ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
              )}
            </button>

            {/* Next Frame */}
            <button
              onClick={() => onTimeUpdate && onTimeUpdate(Math.min(displayDuration, displayTime + 1 / 30))}
              className="p-1.5 text-white/80 hover:text-white transition-colors"
              title="Next frame (→)"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>

            {/* Skip to End */}
            <button
              onClick={() => onTimeUpdate && onTimeUpdate(displayDuration)}
              className="p-1.5 text-white/80 hover:text-white transition-colors"
              title="Skip to end (End)"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M3 5a1 1 0 011-1h2a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V5zm6 0a1 1 0 01.707.293l4 4a1 1 0 010 1.414l-4 4A1 1 0 019 14V6a1 1 0 01.707-.707z" transform="translate(8,0)" />
              </svg>
            </button>
          </div>

          {/* Time Display */}
          <div className="text-white/90 text-sm font-mono">
            {formatTime(displayTime)} / {formatTime(displayDuration)}
          </div>

          {/* Take Photo */}
          <button
            onClick={takePhoto}
            disabled={!hasDisplaySource}
            className="p-2 text-white/80 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Take photo (capture current frame)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 13v7a2 2 0 01-2 2H7a2 2 0 01-2-2v-7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// Sub-components for better isolation

function AudioLayer({ clipInfo, isPlaying, currentTime, onTimeUpdate, project, transitionInfo }) {
  const audioRef = useRef(null);
  const { clip, clipLocalTime } = clipInfo;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Play/Pause
    if (isPlaying) audio.play().catch(() => { });
    else audio.pause();

    // Sync Time
    if (Math.abs(audio.currentTime - clipLocalTime) > 0.15) {
      audio.currentTime = clipLocalTime;
    }

    // Apply Props
    audio.playbackRate = clip.speed || 1;

    // Calculate Fade/Volume
    const track = project.tracks?.find(t => t.id === (clip.track || 0));
    if (track?.hidden || track?.muted) {
      audio.volume = 0;
    } else {
      let volume = clip.volume === undefined ? 1 : clip.volume;

      // Fades
      const clipDuration = ((clip.trimEnd || clip.endTime) - (clip.trimStart || 0)) / (clip.speed || 1);
      const relativeTime = currentTime - (clip.startPos || 0);

      if (clip.fadeIn && relativeTime < clip.fadeIn) {
        volume *= (relativeTime / clip.fadeIn);
      } else if (clip.fadeOut && relativeTime > (clipDuration - clip.fadeOut)) {
        const fadeOutStart = clipDuration - clip.fadeOut;
        volume *= (1 - (relativeTime - fadeOutStart) / clip.fadeOut);
      }

      // Transition crossfade for audio
      if (transitionInfo) {
        const isFromClip = transitionInfo.fromClip.id === clip.id;
        const isToClip = transitionInfo.toClip.id === clip.id;
        
        if (isFromClip && transitionInfo.transition.type === 'crossfade') {
          // Fade out during transition
          volume *= (1 - transitionInfo.progress);
        } else if (isToClip && transitionInfo.transition.type === 'crossfade') {
          // Fade in during transition
          volume *= transitionInfo.progress;
        }
      }

      audio.volume = Math.max(0, Math.min(1, volume));
    }
  }, [isPlaying, currentTime, clip, project, transitionInfo]);

  return (
    <audio
      ref={audioRef}
      src={getVideoUrl(clip.videoId)}
      onTimeUpdate={onTimeUpdate ? (e) => {
        const newLocalTime = e.target.currentTime;
        // Convert local video time back to timeline time
        const newTimelineTime = (newLocalTime - (clip.trimStart || 0)) / (clip.speed || 1) + (clip.startPos || 0);
        if (Math.abs(newTimelineTime - currentTime) > 0.05) {
          onTimeUpdate(newTimelineTime);
        }
      } : null}
      preload="auto"
    />
  );
}

function VideoLayer({ clipInfo, currentTime, isPlaying, onTimeUpdate, project, registerDisplaySource }) {
  const videoRef = useRef(null);
  const mediaRef = useRef(null); // same element as video or img, for Take Photo
  const { clip, clipLocalTime } = clipInfo;
  const isImage = clip.type === 'image' || clip.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i);
  const videoUrl = getVideoUrl(clip.videoId);

  useEffect(() => {
    if (registerDisplaySource) {
      registerDisplaySource(mediaRef.current);
      return () => registerDisplaySource(null);
    }
  }, [registerDisplaySource, isImage]);

  const getFilterStyle = (filter) => {
    return convertFilterToCSS(filter);
  };

  // Sync video playback with timeline
  useEffect(() => {
    if (isImage) return;
    const video = videoRef.current;
    if (!video) return;

    // Play/Pause sync
    if (isPlaying) {
      video.play().catch(() => { });
    } else {
      video.pause();
    }

    // Time sync - seek if difference is significant
    if (Math.abs(video.currentTime - clipLocalTime) > 0.15) {
      video.currentTime = clipLocalTime;
    }

    // Apply playback rate
    video.playbackRate = clip.speed || 1;
  }, [isPlaying, clipLocalTime, clip.speed, isImage]);

  if (isImage) {
    return (
      <img
        ref={mediaRef}
        src={videoUrl}
        className="max-w-full max-h-full object-contain"
        style={{ filter: getFilterStyle(clip.filter) }}
        alt=""
      />
    );
  }

  return (
    <video
      ref={(el) => { videoRef.current = el; mediaRef.current = el; }}
      src={videoUrl}
      className="max-w-full max-h-full"
      style={{ filter: getFilterStyle(clip.filter) }}
      muted // We handle audio in AudioLayer
      onTimeUpdate={onTimeUpdate ? (e) => {
        const newLocalTime = e.target.currentTime;
        const newTimelineTime = (newLocalTime - (clip.trimStart || 0)) / (clip.speed || 1) + (clip.startPos || 0);
        if (Math.abs(newTimelineTime - currentTime) > 0.05) {
          onTimeUpdate(newTimelineTime);
        }
      } : null}
      preload="auto"
    />
  );
}

// Transition Layer for rendering transitions between clips
function TransitionLayer({ fromClipInfo, toClipInfo, transitionInfo, isPlaying, currentTime, onTimeUpdate, project, registerDisplaySource }) {
  const { transition, progress } = transitionInfo;
  const { clip: fromClip, clipLocalTime: fromLocalTime } = fromClipInfo;
  const { clip: toClip, clipLocalTime: toLocalTime } = toClipInfo;
  
  const isFromImage = fromClip.type === 'image' || fromClip.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i);
  const isToImage = toClip.type === 'image' || toClip.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i);
  const fromVideoUrl = getVideoUrl(fromClip.videoId);
  const toVideoUrl = getVideoUrl(toClip.videoId);

  const getFilterStyle = (filter) => {
    return convertFilterToCSS(filter);
  };

  // Calculate transition styles based on type
  const getTransitionStyles = () => {
    const fromStyle = { filter: getFilterStyle(fromClip.filter) };
    const toStyle = { filter: getFilterStyle(toClip.filter) };

    switch (transition.type) {
      case 'crossfade':
        fromStyle.opacity = 1 - progress;
        toStyle.opacity = progress;
        break;
      
      case 'wipe-left':
        fromStyle.clipPath = `inset(0 ${progress * 100}% 0 0)`;
        toStyle.clipPath = `inset(0 0 0 ${progress * 100}%)`;
        break;
      
      case 'wipe-right':
        fromStyle.clipPath = `inset(0 0 0 ${progress * 100}%)`;
        toStyle.clipPath = `inset(0 ${progress * 100}% 0 0)`;
        break;
      
      case 'wipe-up':
        fromStyle.clipPath = `inset(${progress * 100}% 0 0 0)`;
        toStyle.clipPath = `inset(0 0 ${progress * 100}% 0)`;
        break;
      
      case 'wipe-down':
        fromStyle.clipPath = `inset(0 0 ${progress * 100}% 0)`;
        toStyle.clipPath = `inset(${progress * 100}% 0 0 0)`;
        break;
      
      case 'slide-left':
        fromStyle.transform = `translateX(${-progress * 100}%)`;
        toStyle.transform = `translateX(${(1 - progress) * 100}%)`;
        break;
      
      case 'slide-right':
        fromStyle.transform = `translateX(${progress * 100}%)`;
        toStyle.transform = `translateX(${-(1 - progress) * 100}%)`;
        break;
      
      case 'slide-up':
        fromStyle.transform = `translateY(${-progress * 100}%)`;
        toStyle.transform = `translateY(${(1 - progress) * 100}%)`;
        break;
      
      case 'slide-down':
        fromStyle.transform = `translateY(${progress * 100}%)`;
        toStyle.transform = `translateY(${-(1 - progress) * 100}%)`;
        break;
      
      case 'zoom-in':
        fromStyle.transform = `scale(${1 + progress})`;
        fromStyle.opacity = 1 - progress;
        toStyle.transform = `scale(${1 - (1 - progress)})`;
        toStyle.opacity = progress;
        break;
      
      case 'zoom-out':
        fromStyle.transform = `scale(${1 - progress})`;
        fromStyle.opacity = 1 - progress;
        toStyle.transform = `scale(${progress})`;
        toStyle.opacity = progress;
        break;
      
      case 'blur':
        fromStyle.filter = `${getFilterStyle(fromClip.filter)} blur(${(1 - progress) * 10}px)`;
        fromStyle.opacity = 1 - progress;
        toStyle.filter = `${getFilterStyle(toClip.filter)} blur(${progress * 10}px)`;
        toStyle.opacity = progress;
        break;
      
      default:
        fromStyle.opacity = 1 - progress;
        toStyle.opacity = progress;
    }

    return { fromStyle, toStyle };
  };

  const { fromStyle, toStyle } = getTransitionStyles();

  // Render from clip
  const renderFromClip = () => {
    if (isFromImage) {
      return (
        <img
          src={fromVideoUrl}
          alt=""
          className="max-w-full max-h-full object-contain"
        />
      );
    }
    
    return (
      <TransitionVideoLayer
        clip={fromClip}
        clipLocalTime={fromLocalTime}
        isPlaying={isPlaying}
        onTimeUpdate={null}
        project={project}
      />
    );
  };

  // Render to clip
  const renderToClip = () => {
    if (isToImage) {
      return (
        <img
          src={toVideoUrl}
          alt=""
          className="max-w-full max-h-full object-contain"
        />
      );
    }
    
    return (
      <TransitionVideoLayer
        clip={toClip}
        clipLocalTime={toLocalTime}
        isPlaying={isPlaying}
        onTimeUpdate={onTimeUpdate}
        project={project}
        registerDisplaySource={registerDisplaySource}
      />
    );
  };

  return (
    <>
      {/* Debug indicator - remove in production */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute top-2 left-2 bg-blue-600/80 text-white text-xs px-2 py-1 rounded z-50">
          Transition: {transition.type} ({Math.round(progress * 100)}%)
        </div>
      )}
      
      {/* From Clip */}
      <div className="absolute inset-0 flex items-center justify-center" style={fromStyle}>
        {renderFromClip()}
      </div>

      {/* To Clip */}
      <div className="absolute inset-0 flex items-center justify-center" style={toStyle}>
        {renderToClip()}
      </div>
    </>
  );
}

// Helper component for rendering video in transitions
function TransitionVideoLayer({ clip, clipLocalTime, isPlaying, onTimeUpdate, project, registerDisplaySource }) {
  const videoRef = useRef(null);
  const mediaRef = useRef(null);
  const isImage = clip.type === 'image' || clip.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i);
  const videoUrl = getVideoUrl(clip.videoId);

  useEffect(() => {
    if (registerDisplaySource) {
      registerDisplaySource(mediaRef.current);
      return () => registerDisplaySource(null);
    }
  }, [registerDisplaySource, isImage]);

  const getFilterStyle = (filter) => {
    return convertFilterToCSS(filter);
  };

  useEffect(() => {
    if (isImage) return;
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.play().catch(() => { });
    } else {
      video.pause();
    }

    if (Math.abs(video.currentTime - clipLocalTime) > 0.15) {
      video.currentTime = clipLocalTime;
    }

    video.playbackRate = clip.speed || 1;
  }, [isPlaying, clipLocalTime, clip.speed, isImage]);

  if (isImage) {
    return (
      <img
        ref={mediaRef}
        src={videoUrl}
        className="max-w-full max-h-full object-contain"
        style={{ filter: getFilterStyle(clip.filter) }}
        alt=""
      />
    );
  }

  return (
    <video
      ref={(el) => { videoRef.current = el; mediaRef.current = el; }}
      src={videoUrl}
      className="max-w-full max-h-full"
      style={{ filter: getFilterStyle(clip.filter) }}
      muted
      onTimeUpdate={onTimeUpdate ? (e) => {
        const newLocalTime = e.target.currentTime;
        const newTimelineTime = (newLocalTime - (clip.trimStart || 0)) / (clip.speed || 1) + (clip.startPos || 0);
        if (Math.abs(newTimelineTime - (clip.startPos || 0) - clipLocalTime) > 0.05) {
          onTimeUpdate(newTimelineTime);
        }
      } : null}
      preload="auto"
    />
  );
}

// Preview Asset Layer for Media Library preview
function PreviewAssetLayer({ asset, isPlaying, currentTime, onTimeUpdate, registerDisplaySource }) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const mediaRef = useRef(null); // img or video for Take Photo
  const isImage = asset.type === 'image' || asset.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i);
  const isAudio = asset.type === 'audio' || asset.filename.match(/\.(mp3|wav|ogg|m4a)$/i);
  const videoUrl = getVideoUrl(asset.filename);

  useEffect(() => {
    if (registerDisplaySource) {
      registerDisplaySource(mediaRef.current);
      return () => registerDisplaySource(null);
    }
  }, [registerDisplaySource, isImage, isAudio]);

  // Handle video playback
  useEffect(() => {
    if (isImage || isAudio) return;
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.play().catch(() => { });
    } else {
      video.pause();
    }

    // Sync time
    if (Math.abs(video.currentTime - currentTime) > 0.15) {
      video.currentTime = currentTime;
    }
  }, [isPlaying, currentTime, isImage, isAudio]);

  // Handle audio playback
  useEffect(() => {
    if (!isAudio) return;
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.play().catch(() => { });
    } else {
      audio.pause();
    }

    // Sync time
    if (Math.abs(audio.currentTime - currentTime) > 0.15) {
      audio.currentTime = currentTime;
    }
  }, [isPlaying, currentTime, isAudio]);

  // Handle time updates from video/audio elements
  const handleTimeUpdate = (e) => {
    const newTime = e.target.currentTime;
    if (onTimeUpdate && Math.abs(newTime - currentTime) > 0.1) {
      onTimeUpdate(newTime);
    }
  };

  if (isImage) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <img
          ref={mediaRef}
          src={videoUrl}
          alt={asset.originalName}
          className="max-w-full max-h-full object-contain"
        />
      </div>
    );
  }

  if (isAudio) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
        <div className="text-6xl mb-4">🎵</div>
        <div className="text-lg font-medium">{asset.originalName}</div>
        <div className="text-sm text-slate-500 mt-2">
          {Math.floor(currentTime)}s / {Math.floor(asset.duration || 0)}s
        </div>
        <audio
          ref={audioRef}
          src={videoUrl}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => {
            if (onTimeUpdate) onTimeUpdate(0);
          }}
          preload="auto"
        />
      </div>
    );
  }

  // Video
  return (
    <div className="w-full h-full flex items-center justify-center relative">
      <video
        ref={(el) => { videoRef.current = el; mediaRef.current = el; }}
        src={videoUrl}
        className="max-w-full max-h-full"
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => {
          if (onTimeUpdate) onTimeUpdate(0);
        }}
        preload="metadata"
      />
      {/* Preview indicator */}
      <div className="absolute top-2 left-2 bg-blue-600/80 px-2 py-1 rounded text-xs text-white">
        Preview
      </div>
    </div>
  );
}
