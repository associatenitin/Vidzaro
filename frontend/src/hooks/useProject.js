import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

export function useProject() {
  const [project, setProject] = useState({
    id: uuidv4(),
    name: 'Untitled Project',
    clips: [],
    assets: [], // Media/Workspace assets
    tracks: [
      { id: 0, label: 'Video 1', type: 'video', muted: false, locked: false, hidden: false, height: 80 },
      { id: 1, label: 'Video 2', type: 'video', muted: false, locked: false, hidden: false, height: 80 },
      { id: 2, label: 'Audio 1', type: 'audio', muted: false, locked: false, hidden: false, height: 60 },
      { id: 3, label: 'Audio 2', type: 'audio', muted: false, locked: false, hidden: false, height: 60 },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const [activeTool, setActiveTool] = useState('select'); // select, ripple, razor

  const addAsset = useCallback((assetData) => {
    setProject((prev) => ({
      ...prev,
      assets: [...(prev.assets || []), { ...assetData, id: uuidv4() }],
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const addClip = useCallback((asset, position = null) => {
    // position = { track: number, time: number }
    // If no position, append to end of track 0 like before

    let startPos = 0;
    let trackId = 0;

    if (position) {
      startPos = position.time;
      trackId = position.track;
    } else {
      const track0Clips = project.clips.filter(c => (c.track || 0) === 0);
      const lastClip = track0Clips.sort((a, b) => (a.startPos || 0) + a.duration - ((b.startPos || 0) + b.duration)).pop();
      startPos = lastClip ? (lastClip.startPos || 0) + ((lastClip.trimEnd || lastClip.endTime) - (lastClip.trimStart || 0)) / (lastClip.speed || 1) : 0;
    }

    const newClip = {
      id: uuidv4(),
      assetId: asset.id,
      videoId: asset.filename,
      videoPath: asset.path,
      filename: asset.filename,
      originalName: asset.originalName,
      duration: asset.duration, // Max duration of source
      startTime: 0,
      endTime: asset.duration,
      trimStart: 0,
      trimEnd: asset.duration,
      volume: 1,
      speed: 1,
      text: null,
      track: trackId,
      startPos: startPos,
      order: project.clips.length,
      filter: null
    };

    setProject((prev) => ({
      ...prev,
      clips: [...prev.clips, newClip],
      updatedAt: new Date().toISOString(),
    }));

    return newClip;
  }, [project.clips]);

  const removeClip = useCallback((clipId) => {
    setProject((prev) => ({
      ...prev,
      clips: prev.clips.filter((clip) => clip.id !== clipId),
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const updateClip = useCallback((clipId, updates) => {
    setProject((prev) => ({
      ...prev,
      clips: prev.clips.map((clip) =>
        clip.id === clipId ? { ...clip, ...updates } : clip
      ),
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const reorderClips = useCallback((newOrder) => {
    setProject((prev) => ({
      ...prev,
      clips: newOrder.map((clip, index) => ({
        ...clip,
        order: index,
      })),
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const splitClip = useCallback((clipId, splitTime) => {
    setProject((prev) => {
      const clipIndex = prev.clips.findIndex((c) => c.id === clipId);
      if (clipIndex === -1) return prev;

      const clip = prev.clips[clipIndex];
      // Calculate relative split time within the clip (accounting for speed)
      const relativeSplitTimeInClip = (splitTime - (clip.startPos || 0)) * (clip.speed || 1);

      if (relativeSplitTimeInClip <= 0 || relativeSplitTimeInClip >= (clip.trimEnd || clip.endTime) - (clip.trimStart || 0)) {
        return prev;
      }

      const firstClip = {
        ...clip,
        trimEnd: (clip.trimStart || 0) + relativeSplitTimeInClip,
        endTime: (clip.trimStart || 0) + relativeSplitTimeInClip,
      };

      const secondClip = {
        ...clip,
        id: uuidv4(),
        startPos: splitTime,
        trimStart: (clip.trimStart || 0) + relativeSplitTimeInClip,
        startTime: (clip.trimStart || 0) + relativeSplitTimeInClip,
        order: clip.order + 1,
      };

      const newClips = [...prev.clips];
      newClips[clipIndex] = firstClip;
      newClips.splice(clipIndex + 1, 0, secondClip);

      return {
        ...prev,
        clips: newClips,
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const setProjectName = useCallback((name) => {
    setProject((prev) => ({
      ...prev,
      name,
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const updateTrack = useCallback((trackId, updates) => {
    setProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((track) =>
        track.id === trackId ? { ...track, ...updates } : track
      ),
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const resetProject = useCallback(() => {
    setProject({
      id: uuidv4(),
      name: 'Untitled Project',
      clips: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }, []);

  return {
    project,
    addClip,
    removeClip,
    updateClip,
    reorderClips,
    splitClip,
    setProjectName,
    updateTrack,
    addAsset,
    activeTool,
    setActiveTool,
    resetProject,
  };
}
