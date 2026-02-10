import { useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { convertStringToFilter } from '../utils/filterUtils';

export function useProject() {
  const [project, setProject] = useState({
    id: uuidv4(),
    name: 'Untitled Project',
    clips: [],
    assets: [], // Media/Workspace assets
    customFilters: [], // Custom filter presets
    textOverlays: [], // Global text overlays (independent of clips)
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

  // History State
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);

  // Wrapped setProject to handle history
  const setProjectWithHistory = useCallback((projectOrUpdater) => {
    setProject((prev) => {
      const newProject = typeof projectOrUpdater === 'function' ? projectOrUpdater(prev) : projectOrUpdater;

      // Push current state to history
      setHistory((prevHistory) => {
        const newHistory = [...prevHistory, prev];
        // Limit history size to 50
        if (newHistory.length > 50) return newHistory.slice(newHistory.length - 50);
        return newHistory;
      });

      // Clear future
      setFuture([]);

      return newProject;
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((prevHistory) => {
      if (prevHistory.length === 0) return prevHistory;

      const previousState = prevHistory[prevHistory.length - 1];
      const newHistory = prevHistory.slice(0, -1);

      setProject((currentProject) => {
        setFuture((prevFuture) => [currentProject, ...prevFuture]);
        return previousState;
      });

      return newHistory;
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((prevFuture) => {
      if (prevFuture.length === 0) return prevFuture;

      const nextState = prevFuture[0];
      const newFuture = prevFuture.slice(1);

      setProject((currentProject) => {
        setHistory((prevHistory) => [...prevHistory, currentProject]);
        return nextState;
      });

      return newFuture;
    });
  }, []);

  const addAsset = useCallback((assetData) => {
    setProjectWithHistory((prev) => ({
      ...prev,
      assets: [...(prev.assets || []), { ...assetData, id: uuidv4() }],
      updatedAt: new Date().toISOString(),
    }));
  }, [setProjectWithHistory]);

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
      type: asset.type, // Include asset type for easier identification
      duration: asset.duration, // Max duration of source
      startTime: 0,
      endTime: asset.duration,
      trimStart: 0,
      trimEnd: asset.duration,
      volume: 1,
      speed: 1,
      text: null, // legacy single text field (migrated into textOverlays on load)
      textOverlays: [], // array of per-clip text overlays
      track: trackId,
      startPos: startPos,
      order: project.clips.length,
      filter: null,
      videoEnabled: true,
      audioEnabled: asset.type !== 'image',
      fadeIn: 0,
      fadeOut: 0,
      transitionOut: null, // { type: 'crossfade' | 'wipe-left' | 'wipe-right' | 'wipe-up' | 'wipe-down' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down' | 'zoom-in' | 'zoom-out' | 'blur', duration: number }
      transitionIn: null, // same structure
      // Per-clip volume automation keyframes (time in seconds relative to clip, value 0–2)
      volumeAutomation: null
    };

    setProjectWithHistory((prev) => ({
      ...prev,
      clips: [...prev.clips, newClip],
      updatedAt: new Date().toISOString(),
    }));

    return newClip;
  }, [project.clips, setProjectWithHistory]);

  const removeClip = useCallback((clipId) => {
    setProjectWithHistory((prev) => ({
      ...prev,
      clips: prev.clips.filter((clip) => clip.id !== clipId),
      updatedAt: new Date().toISOString(),
    }));
  }, [setProjectWithHistory]);

  const updateClip = useCallback((clipId, updates) => {
    setProjectWithHistory((prev) => ({
      ...prev,
      clips: prev.clips.map((clip) =>
        clip.id === clipId ? { ...clip, ...updates } : clip
      ),
      updatedAt: new Date().toISOString(),
    }));
  }, [setProjectWithHistory]);

  const updateClipsBatch = useCallback((clipUpdates) => {
    setProjectWithHistory((prev) => {
      const byId = new Map(clipUpdates.map(u => [u.clipId, u.updates]));
      return {
        ...prev,
        clips: prev.clips.map((clip) => {
          const u = byId.get(clip.id);
          return u ? { ...clip, ...u } : clip;
        }),
        updatedAt: new Date().toISOString(),
      };
    });
  }, [setProjectWithHistory]);

  // Per-clip text overlay management
  const addTextOverlay = useCallback((clipId, overlay) => {
    setProjectWithHistory((prev) => ({
      ...prev,
      clips: prev.clips.map((clip) => {
        if (clip.id !== clipId) return clip;
        const existing = clip.textOverlays || [];
        const newOverlay = {
          id: uuidv4(),
          text: '',
          x: 50,
          y: 50,
          size: '4xl',
          color: '#ffffff',
          animation: 'none',
          positionMode: 'percentage',
          ...overlay,
        };
        return {
          ...clip,
          textOverlays: [...existing, newOverlay],
        };
      }),
      updatedAt: new Date().toISOString(),
    }));
  }, [setProjectWithHistory]);

  const updateTextOverlay = useCallback((clipId, overlayId, updates) => {
    setProjectWithHistory((prev) => ({
      ...prev,
      clips: prev.clips.map((clip) => {
        if (clip.id !== clipId) return clip;
        const existing = clip.textOverlays || [];
        return {
          ...clip,
          textOverlays: existing.map((ov) =>
            ov.id === overlayId ? { ...ov, ...updates } : ov
          ),
        };
      }),
      updatedAt: new Date().toISOString(),
    }));
  }, [setProjectWithHistory]);

  const removeTextOverlay = useCallback((clipId, overlayId) => {
    setProjectWithHistory((prev) => ({
      ...prev,
      clips: prev.clips.map((clip) => {
        if (clip.id !== clipId) return clip;
        const existing = clip.textOverlays || [];
        return {
          ...clip,
          textOverlays: existing.filter((ov) => ov.id !== overlayId),
        };
      }),
      updatedAt: new Date().toISOString(),
    }));
  }, [setProjectWithHistory]);

  const reorderClips = useCallback((newOrder) => {
    setProjectWithHistory((prev) => ({
      ...prev,
      clips: newOrder.map((clip, index) => ({
        ...clip,
        order: index,
      })),
      updatedAt: new Date().toISOString(),
    }));
  }, [setProjectWithHistory]);

  const splitClip = useCallback((clipId, splitTime) => {
    setProjectWithHistory((prev) => {
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
  }, [setProjectWithHistory]);

  const detachAudio = useCallback((clipId) => {
    setProject((prev) => {
      const clip = prev.clips.find(c => c.id === clipId);
      if (!clip) return prev;

      // Disable audio on original clip
      const updatedClips = prev.clips.map(c =>
        c.id === clipId ? { ...c, audioEnabled: false } : c
      );

      // Create new audio-only clip
      const audioTrack = prev.tracks.find(t => t.type === 'audio') || prev.tracks[prev.tracks.length - 1];

      const audioClip = {
        ...clip,
        id: uuidv4(),
        videoEnabled: false,
        audioEnabled: true,
        track: audioTrack.id,
        order: prev.clips.length,
        label: `Audio: ${clip.originalName}`
      };

      return {
        ...prev,
        clips: [...updatedClips, audioClip],
        updatedAt: new Date().toISOString()
      };
    });
  }, []);

  const removeAsset = useCallback((assetId) => {
    setProjectWithHistory((prev) => ({
      ...prev,
      // Remove the asset from the media library
      assets: (prev.assets || []).filter(a => a.id !== assetId),
      // Also remove any clips on the timeline that reference this asset
      clips: (prev.clips || []).filter(c => c.assetId !== assetId),
      updatedAt: new Date().toISOString(),
    }));
  }, [setProjectWithHistory]);

  const renameAsset = useCallback((assetId, newName) => {
    setProjectWithHistory((prev) => ({
      ...prev,
      assets: (prev.assets || []).map(a => a.id === assetId ? { ...a, originalName: newName } : a),
      updatedAt: new Date().toISOString(),
    }));
  }, [setProjectWithHistory]);

  const loadProjectData = useCallback((projectData) => {
    // Default tracks if not present
    const defaultTracks = [
      { id: 0, label: 'Video 1', type: 'video', muted: false, locked: false, hidden: false, height: 80 },
      { id: 1, label: 'Video 2', type: 'video', muted: false, locked: false, hidden: false, height: 80 },
      { id: 2, label: 'Audio 1', type: 'audio', muted: false, locked: false, hidden: false, height: 60 },
      { id: 3, label: 'Audio 2', type: 'audio', muted: false, locked: false, hidden: false, height: 60 },
    ];

    // Ensure clips have all required fields with defaults
    // Also migrate legacy string filters to new structure (but keep as string for backward compatibility)
    const loadedClips = (projectData.clips || []).map(clip => {
      // Migrate filter if it's a string and we want to convert it
      // For now, we'll keep string filters as-is for backward compatibility
      // but ensure they work with the new system
      let filter = clip.filter;
      if (filter && typeof filter === 'string' && filter.trim() !== '') {
        // Keep as string for now - conversion happens at display/export time
        // This maintains backward compatibility
      }

      // Migrate legacy single text overlay fields into textOverlays array
      let textOverlays = Array.isArray(clip.textOverlays) ? clip.textOverlays : null;
      if (!textOverlays) {
        if (clip.text && typeof clip.text === 'string' && clip.text.trim() !== '') {
          let y = 50;
          if (clip.textPos === 'top') y = 20;
          else if (clip.textPos === 'bottom') y = 80;
          textOverlays = [{
            id: uuidv4(),
            text: clip.text,
            x: 50,
            y,
            size: clip.textSize || '4xl',
            color: clip.textColor || '#ffffff',
            animation: clip.textAnim || 'none',
            positionMode: 'percentage',
          }];
        } else {
          textOverlays = [];
        }
      }

      return {
        ...clip,
        videoEnabled: clip.videoEnabled !== undefined ? clip.videoEnabled : true,
        audioEnabled: clip.audioEnabled !== undefined ? clip.audioEnabled : true,
        volume: clip.volume !== undefined ? clip.volume : 1,
        speed: clip.speed !== undefined ? clip.speed : 1,
        trimStart: clip.trimStart !== undefined ? clip.trimStart : 0,
        trimEnd: clip.trimEnd !== undefined ? clip.trimEnd : clip.endTime || clip.duration || 0,
        startPos: clip.startPos !== undefined ? clip.startPos : 0,
        fadeIn: clip.fadeIn !== undefined ? clip.fadeIn : 0,
        fadeOut: clip.fadeOut !== undefined ? clip.fadeOut : 0,
        transitionOut: clip.transitionOut !== undefined ? clip.transitionOut : null,
        transitionIn: clip.transitionIn !== undefined ? clip.transitionIn : null,
        // Ensure volume automation is always present (or null) for backward compatibility
        volumeAutomation: Array.isArray(clip.volumeAutomation) ? clip.volumeAutomation : null,
        filter: filter || null, // Keep filter as-is (string or object)
        textOverlays,
      };
    });

    // Merge loaded data with defaults to ensure all required fields are present
    const loadedProject = {
      id: projectData.id || uuidv4(),
      name: projectData.name || 'Untitled Project',
      clips: loadedClips,
      assets: projectData.assets || [], // Restore media library assets
      customFilters: projectData.customFilters || [], // Restore custom filter presets
      tracks: projectData.tracks && projectData.tracks.length > 0
        ? projectData.tracks
        : defaultTracks, // Use saved tracks or defaults
      textOverlays: projectData.textOverlays || [], // Global text overlays
      createdAt: projectData.createdAt || new Date().toISOString(),
      updatedAt: projectData.updatedAt || new Date().toISOString(),
    };

    setProject(loadedProject);
    setHistory([]);
    setFuture([]);
  }, []);

  const setProjectName = useCallback((name) => {
    setProjectWithHistory((prev) => ({
      ...prev,
      name,
      updatedAt: new Date().toISOString(),
    }));
  }, [setProjectWithHistory]);

  const updateTrack = useCallback((trackId, updates) => {
    setProjectWithHistory((prev) => ({
      ...prev,
      tracks: prev.tracks.map((track) =>
        track.id === trackId ? { ...track, ...updates } : track
      ),
      updatedAt: new Date().toISOString(),
    }));
  }, [setProjectWithHistory]);

  const addTrack = useCallback((type = 'video') => {
    setProjectWithHistory((prev) => {
      const newId = Math.max(...prev.tracks.map(t => t.id), -1) + 1;
      const videoCount = prev.tracks.filter(t => t.type === 'video').length;
      const audioCount = prev.tracks.filter(t => t.type === 'audio').length;

      const newTrack = {
        id: newId,
        label: type === 'video' ? `Video ${videoCount + 1}` : `Audio ${audioCount + 1}`,
        type,
        muted: false,
        locked: false,
        hidden: false,
        height: type === 'video' ? 80 : 60
      };

      // Keep video tracks above audio tracks if possible, or just append
      const videoTracks = prev.tracks.filter(t => t.type === 'video');
      const audioTracks = prev.tracks.filter(t => t.type === 'audio');

      let newTracks;
      if (type === 'video') {
        newTracks = [...videoTracks, newTrack, ...audioTracks];
      } else {
        newTracks = [...prev.tracks, newTrack];
      }

      return {
        ...prev,
        tracks: newTracks,
        updatedAt: new Date().toISOString()
      };
    });
  }, [setProjectWithHistory]);

  const removeTrack = useCallback((trackId) => {
    setProjectWithHistory((prev) => {
      if (prev.tracks.length <= 1) return prev; // Keep at least one track

      return {
        ...prev,
        tracks: prev.tracks.filter(t => t.id !== trackId),
        clips: prev.clips.filter(c => c.track !== trackId), // Remove clips on this track
        updatedAt: new Date().toISOString()
      };
    });
  }, [setProjectWithHistory]);

  const resetProject = useCallback(() => {
    setProject({
      id: uuidv4(),
      name: 'Untitled Project',
      clips: [],
      assets: [],
      customFilters: [],
      textOverlays: [],
      tracks: [
        { id: 0, label: 'Video 1', type: 'video', muted: false, locked: false, hidden: false, height: 80 },
        { id: 1, label: 'Video 2', type: 'video', muted: false, locked: false, hidden: false, height: 80 },
        { id: 2, label: 'Audio 1', type: 'audio', muted: false, locked: false, hidden: false, height: 60 },
        { id: 3, label: 'Audio 2', type: 'audio', muted: false, locked: false, hidden: false, height: 60 },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setHistory([]);
    setFuture([]);
  }, []);

  const addCustomFilter = useCallback((filterPreset) => {
    setProjectWithHistory((prev) => {
      const newPreset = {
        ...filterPreset,
        id: filterPreset.id || uuidv4(),
        createdAt: filterPreset.createdAt || new Date().toISOString(),
      };
      return {
        ...prev,
        customFilters: [...(prev.customFilters || []), newPreset],
        updatedAt: new Date().toISOString(),
      };
    });
  }, [setProjectWithHistory]);

  const updateCustomFilter = useCallback((filterId, updates) => {
    setProjectWithHistory((prev) => ({
      ...prev,
      customFilters: (prev.customFilters || []).map(filter =>
        filter.id === filterId ? { ...filter, ...updates, updatedAt: new Date().toISOString() } : filter
      ),
      updatedAt: new Date().toISOString(),
    }));
  }, [setProjectWithHistory]);

  const removeCustomFilter = useCallback((filterId) => {
    setProjectWithHistory((prev) => ({
      ...prev,
      customFilters: (prev.customFilters || []).filter(filter => filter.id !== filterId),
      updatedAt: new Date().toISOString(),
    }));
  }, [setProjectWithHistory]);

  // Global text overlay management
  const addGlobalTextOverlay = useCallback((overlay) => {
    setProjectWithHistory((prev) => ({
      ...prev,
      textOverlays: [
        ...(prev.textOverlays || []),
        {
          id: uuidv4(),
          text: '',
          x: 50,
          y: 50,
          size: '4xl',
          color: '#ffffff',
          animation: 'none',
          positionMode: 'percentage',
          startTime: 0,
          endTime: 3,
          ...overlay,
        },
      ],
      updatedAt: new Date().toISOString(),
    }));
  }, [setProjectWithHistory]);

  const updateGlobalTextOverlay = useCallback((overlayId, updates) => {
    setProjectWithHistory((prev) => ({
      ...prev,
      textOverlays: (prev.textOverlays || []).map((ov) =>
        ov.id === overlayId ? { ...ov, ...updates } : ov
      ),
      updatedAt: new Date().toISOString(),
    }));
  }, [setProjectWithHistory]);

  const removeGlobalTextOverlay = useCallback((overlayId) => {
    setProjectWithHistory((prev) => ({
      ...prev,
      textOverlays: (prev.textOverlays || []).filter((ov) => ov.id !== overlayId),
      updatedAt: new Date().toISOString(),
    }));
  }, [setProjectWithHistory]);

  // Auto-save to LocalStorage
  useEffect(() => {
    const saveProject = () => {
      try {
        localStorage.setItem('vidzaro_autosave', JSON.stringify({
          ...project,
          autoSavedAt: new Date().toISOString()
        }));
      } catch (err) {
        console.error('Failed to auto-save project:', err);
      }
    };

    // Delay auto-save slightly to avoid excessive writes
    const timeout = setTimeout(saveProject, 2000);
    return () => clearTimeout(timeout);
  }, [project]);

  const loadAutoSave = useCallback(() => {
    try {
      const saved = localStorage.getItem('vidzaro_autosave');
      if (saved) {
        const data = JSON.parse(saved);
        loadProjectData(data);
        return true;
      }
    } catch (err) {
      console.error('Failed to load auto-save:', err);
    }
    return false;
  }, [loadProjectData]);

  const clearAutoSave = useCallback(() => {
    localStorage.removeItem('vidzaro_autosave');
  }, []);

  return {
    project,
    addClip,
    removeClip,
    updateClip,
    updateClipsBatch,
    reorderClips,
    splitClip,
    detachAudio,
    setProjectName,
    updateTrack,
    addAsset,
    removeAsset,
    renameAsset,
    addTrack,
    removeTrack,
    loadProjectData,
    loadAutoSave,
    clearAutoSave,
    activeTool,
    setActiveTool,
    resetProject,
    // Custom Filters
    addCustomFilter,
    updateCustomFilter,
    removeCustomFilter,
    // Text Overlays
    addTextOverlay,
    updateTextOverlay,
    removeTextOverlay,
    // Global Text Overlays
    addGlobalTextOverlay,
    updateGlobalTextOverlay,
    removeGlobalTextOverlay,
    // History
    undo,
    redo,
    canUndo: history.length > 0,
    canRedo: future.length > 0
  };
}
