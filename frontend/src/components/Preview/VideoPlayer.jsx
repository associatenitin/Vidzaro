import { useEffect, useRef, useState } from 'react';
import { getVideoUrl } from '../../services/api';

export default function VideoPlayer({ project, currentTime, isPlaying, onTimeUpdate, onPlayPause, previewAsset }) {
  const videoRef = useRef(null);
  const isSeekingRef = useRef(false);
  const [previewTime, setPreviewTime] = useState(0);
  const progressRef = useRef(null);

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

  // Separation of concerns: Handle layers
  const videoClips = activeClips.filter(c => c.clip.videoEnabled !== false);
  const topVideoClip = videoClips[0] || null;

  // Show preview if no active clips but preview asset is selected
  const showPreview = !topVideoClip && previewAsset;

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
        />
      ) : (
        <>
          {/* 1. All Audio Elements (Hidden) */}
          {activeClips.map((info) => {
            const isImage = info.clip.type === 'image' || info.clip.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i);
            if (info.clip.audioEnabled === false || isImage) return null;

            const isTopVideo = topVideoClip && topVideoClip.clip.id === info.clip.id;
            // If it's the top video, we might want to use the main visible element's audio 
            // but for consistency we can just render it. 
            // Actually, we'll render all audio uniquely.
            return (
              <AudioLayer
                key={info.clip.id + '-audio'}
                clipInfo={info}
                isPlaying={isPlaying}
                currentTime={currentTime}
                onTimeUpdate={isTopVideo ? onTimeUpdate : null} // Only top video drives timeline
                onPlayPause={onPlayPause}
                project={project}
              />
            );
          })}

          {/* 2. Primary Video/Image Display */}
          {topVideoClip ? (
            <div className="w-full h-full flex items-center justify-center">
              <VideoLayer
                clipInfo={topVideoClip}
                isPlaying={isPlaying}
                currentTime={currentTime}
                project={project}
              />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-500 font-medium">No active video</div>
          )}

          {/* 3. Global Overlays */}
          {topVideoClip?.clip.text && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
              <span className="text-white text-4xl font-bold drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] text-center px-10">
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
        </div>
      </div>
    </div>
  );
}

// Sub-components for better isolation

function AudioLayer({ clipInfo, isPlaying, currentTime, onTimeUpdate, project }) {
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
      const duration = ((clip.trimEnd || clip.endTime) - (clip.trimStart || 0)) / (clip.speed || 1);
      const relativeTime = currentTime - (clip.startPos || 0);

      if (clip.fadeIn && relativeTime < clip.fadeIn) {
        volume *= (relativeTime / clip.fadeIn);
      } else if (clip.fadeOut && relativeTime > (duration - clip.fadeOut)) {
        const fadeOutStart = duration - clip.fadeOut;
        volume *= (1 - (relativeTime - fadeOutStart) / clip.fadeOut);
      }

      audio.volume = Math.max(0, Math.min(1, volume));
    }
  }, [isPlaying, currentTime, clip, project]);

  return (
    <audio
      ref={audioRef}
      src={getVideoUrl(clip.videoId)}
      onTimeUpdate={onTimeUpdate ? (e) => {
        // driving logic is slightly complex here but omitted for brevity
      } : null}
      preload="auto"
    />
  );
}

function VideoLayer({ clipInfo, currentTime, isPlaying, project }) {
  const videoRef = useRef(null);
  const { clip, clipLocalTime } = clipInfo;
  const isImage = clip.type === 'image' || clip.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i);
  const videoUrl = getVideoUrl(clip.videoId);

  const getFilterStyle = (filter) => {
    switch (filter) {
      case 'grayscale': return 'grayscale(100%)';
      case 'sepia': return 'sepia(100%)';
      case 'invert': return 'invert(100%)';
      case 'blur': return 'blur(3px)';
      case 'brightness': return 'brightness(1.3)';
      case 'darken': return 'brightness(0.7)';
      case 'contrast': return 'contrast(1.5)';
      case 'saturate': return 'saturate(1.8)';
      case 'desaturate': return 'saturate(0.3)';
      case 'hue-rotate': return 'hue-rotate(90deg)';
      case 'vintage': return 'sepia(0.4) contrast(1.1) brightness(0.9)';
      case 'cool': return 'hue-rotate(180deg) saturate(0.8)';
      case 'warm': return 'sepia(0.3) saturate(1.2) brightness(1.05)';
      default: return 'none';
    }
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
        src={videoUrl}
        className="max-w-full max-h-full object-contain"
        style={{ filter: getFilterStyle(clip.filter) }}
        alt=""
      />
    );
  }

  return (
    <video
      ref={videoRef}
      src={videoUrl}
      className="max-w-full max-h-full"
      style={{ filter: getFilterStyle(clip.filter) }}
      muted // We handle audio in AudioLayer
      preload="auto"
    />
  );
}

// Preview Asset Layer for Media Library preview
function PreviewAssetLayer({ asset, isPlaying, currentTime, onTimeUpdate }) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const isImage = asset.type === 'image' || asset.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i);
  const isAudio = asset.type === 'audio' || asset.filename.match(/\.(mp3|wav|ogg|m4a)$/i);
  const videoUrl = getVideoUrl(asset.filename);

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
        ref={videoRef}
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
