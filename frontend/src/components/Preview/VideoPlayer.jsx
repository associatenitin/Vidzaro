import { useEffect, useRef } from 'react';
import { getVideoUrl } from '../../services/api';

export default function VideoPlayer({ project, currentTime, onTimeUpdate, onPlayPause }) {
  const videoRef = useRef(null);
  const isSeekingRef = useRef(false);

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
  const currentClipInfo = activeClips[0] || null;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentClipInfo) return;

    const handleTimeUpdate = () => {
      if (!isSeekingRef.current) {
        const clipLocalTime = video.currentTime;
        const timelineTime = currentClipInfo.clipStartTime + (clipLocalTime - (currentClipInfo.clip.trimStart || 0));
        onTimeUpdate(timelineTime);
      }
    };

    const handlePlay = () => onPlayPause(true);
    const handlePause = () => onPlayPause(false);

    // Apply speed and volume
    video.playbackRate = currentClipInfo.clip.speed || 1;

    // Check track mute
    const track = project.tracks?.find(t => t.id === (currentClipInfo.clip.track || 0));
    const isTrackMuted = track?.muted || false;
    video.volume = isTrackMuted ? 0 : (currentClipInfo.clip.volume === undefined ? 1 : currentClipInfo.clip.volume);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [currentClipInfo, onTimeUpdate, onPlayPause]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentClipInfo) return;

    // Seek to the correct position in the clip
    const targetTime = currentClipInfo.clipLocalTime;
    if (Math.abs(video.currentTime - targetTime) > 0.1) {
      isSeekingRef.current = true;
      video.currentTime = targetTime;
      // Re-apply playback rate after seek as some browsers reset it
      video.playbackRate = currentClipInfo.clip.speed || 1;
      setTimeout(() => {
        isSeekingRef.current = false;
      }, 100);
    }

    // Always sync volume and speed even if not seeking
    const track = project.tracks?.find(t => t.id === (currentClipInfo.clip.track || 0));
    const isTrackMuted = track?.muted || false;
    video.volume = isTrackMuted ? 0 : (currentClipInfo.clip.volume === undefined ? 1 : currentClipInfo.clip.volume);
    video.playbackRate = currentClipInfo.clip.speed || 1;
  }, [currentTime, currentClipInfo]);

  if (!currentClipInfo) {
    return (
      <div className="w-full max-w-4xl aspect-video bg-slate-800 rounded-lg flex items-center justify-center">
        <p className="text-slate-500">No video loaded</p>
      </div>
    );
  }

  const videoUrl = getVideoUrl(currentClipInfo.clip.videoId);

  const getFilterStyle = (filter) => {
    switch (filter) {
      case 'grayscale': return 'grayscale(100%)';
      case 'sepia': return 'sepia(100%)';
      case 'invert': return 'invert(100%)';
      default: return 'none';
    }
  };

  return (
    <div className="w-full max-w-4xl relative group">
      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full rounded-lg shadow-2xl"
        style={{ filter: getFilterStyle(currentClipInfo.clip.filter) }}
        controls
        preload="metadata"
      />

      {currentClipInfo.clip.text && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-white text-4xl font-bold drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] text-center px-10">
            {currentClipInfo.clip.text}
          </span>
        </div>
      )}
    </div>
  );
}
