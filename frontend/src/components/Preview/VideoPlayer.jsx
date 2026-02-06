import { useEffect, useRef } from 'react';
import { getVideoUrl } from '../../services/api';

export default function VideoPlayer({ project, currentTime, onTimeUpdate, onPlayPause }) {
  const videoRef = useRef(null);
  const isSeekingRef = useRef(false);

  // Calculate which clip should be playing based on currentTime
  const getCurrentClip = () => {
    if (!project.clips || project.clips.length === 0) return null;

    let accumulatedTime = 0;
    for (const clip of project.clips.sort((a, b) => a.order - b.order)) {
      const clipDuration = (clip.trimEnd || clip.endTime) - (clip.trimStart || 0);
      if (currentTime >= accumulatedTime && currentTime < accumulatedTime + clipDuration) {
        return {
          clip,
          clipStartTime: accumulatedTime,
          clipLocalTime: currentTime - accumulatedTime + (clip.trimStart || 0),
        };
      }
      accumulatedTime += clipDuration;
    }
    return null;
  };

  const currentClipInfo = getCurrentClip();

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
      setTimeout(() => {
        isSeekingRef.current = false;
      }, 100);
    }
  }, [currentTime, currentClipInfo]);

  if (!currentClipInfo) {
    return (
      <div className="w-full max-w-4xl aspect-video bg-slate-800 rounded-lg flex items-center justify-center">
        <p className="text-slate-500">No video loaded</p>
      </div>
    );
  }

  const videoUrl = getVideoUrl(currentClipInfo.clip.videoId);

  return (
    <div className="w-full max-w-4xl">
      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full rounded-lg shadow-2xl"
        controls
        preload="metadata"
      />
    </div>
  );
}
