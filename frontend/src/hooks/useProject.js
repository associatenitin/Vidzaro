import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

export function useProject() {
  const [project, setProject] = useState({
    id: uuidv4(),
    name: 'Untitled Project',
    clips: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const addClip = useCallback((videoData) => {
    const newClip = {
      id: uuidv4(),
      videoId: videoData.filename, // Use filename as videoId for API routes
      videoPath: videoData.path,
      filename: videoData.filename,
      originalName: videoData.originalName,
      duration: videoData.duration,
      startTime: 0,
      endTime: videoData.duration,
      trimStart: 0,
      trimEnd: videoData.duration,
      order: project.clips.length,
    };

    setProject((prev) => ({
      ...prev,
      clips: [...prev.clips, newClip],
      updatedAt: new Date().toISOString(),
    }));

    return newClip;
  }, [project.clips.length]);

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
      const relativeSplitTime = splitTime - (clip.trimStart || 0);

      if (relativeSplitTime <= 0 || relativeSplitTime >= (clip.trimEnd || clip.endTime) - (clip.trimStart || 0)) {
        return prev;
      }

      const firstClip = {
        ...clip,
        trimEnd: (clip.trimStart || 0) + relativeSplitTime,
        endTime: (clip.trimStart || 0) + relativeSplitTime,
      };

      const secondClip = {
        ...clip,
        id: uuidv4(),
        trimStart: (clip.trimStart || 0) + relativeSplitTime,
        startTime: (clip.trimStart || 0) + relativeSplitTime,
        order: clip.order + 1,
      };

      const newClips = [...prev.clips];
      newClips[clipIndex] = firstClip;
      newClips.splice(clipIndex + 1, 0, secondClip);

      // Update order for subsequent clips
      newClips.forEach((c, idx) => {
        if (idx > clipIndex + 1) {
          c.order = idx;
        }
      });

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
    resetProject,
  };
}
