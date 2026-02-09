import { useState, useEffect, useRef } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { getThumbnailUrl, getVideoUrl, getVideoThumbnails, getWaveformUrl } from '../../services/api';
import UploadArea from '../Upload/UploadArea';

export default function MediaLibrary({ project, onAddAsset, onUpload, onRemoveAsset, onRenameAsset, onAddToTimeline, onAssetSelect, selectedAssetId, onShare }) {
    const [filter, setFilter] = useState('all'); // all, video, audio, image
    const [thumbnails, setThumbnails] = useState({}); // Map of assetId -> thumbnail URL
    const [waveforms, setWaveforms] = useState({}); // Map of assetId -> waveform URL
    const [failedThumbnails, setFailedThumbnails] = useState(new Set()); // Track failed thumbnail loads
    const [failedWaveforms, setFailedWaveforms] = useState(new Set()); // Track failed waveform loads
    const fetchingRef = useRef(new Set()); // Track which assets we're currently fetching
    const fetchingWaveformsRef = useRef(new Set()); // Track which waveforms we're currently fetching

    // Handle file dragging from desktop (HTML5)
    const handleDragOver = (e) => {
        e.preventDefault();
    };

    const handleDrop = (e) => {
        e.preventDefault();
    };

    // Context Menu State
    const [contextMenu, setContextMenu] = useState(null);
    const [showTrackMenu, setShowTrackMenu] = useState(false);

    const handleContextMenu = (e, asset) => {
        e.preventDefault();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            asset
        });
        setShowTrackMenu(false);
    };

    // Drag start for library items to timeline
    const handleDragStart = (e, asset) => {
        if (contextMenu) setContextMenu(null);

        const dragData = JSON.stringify({
            ...asset,
            type: 'asset' // Ensure type is 'asset' for timeline drop detection
        });

        // Set data for HTML5 drag and drop
        // Using multiple formats for maximum browser compatibility
        e.dataTransfer.setData('application/json', dragData);
        e.dataTransfer.setData('text/plain', dragData);

        e.dataTransfer.effectAllowed = 'copy';
    };

    const filteredAssets = (project.assets || []).filter(asset => {
        if (filter === 'all') return true;

        const type = asset.type || (asset.filename.match(/\.(mp4|mov|webm)$/i) ? 'video' :
            asset.filename.match(/\.(mp3|wav|ogg|m4a)$/i) ? 'audio' :
                asset.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? 'image' : 'video');

        return type === filter;
    });

    // Fetch thumbnails for video assets
    useEffect(() => {
        const videoAssets = (project.assets || []).filter(asset => {
            const type = asset.type || (asset.filename.match(/\.(mp4|mov|webm)$/i) ? 'video' :
                asset.filename.match(/\.(mp3|wav|ogg|m4a)$/i) ? 'audio' :
                    asset.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? 'image' : 'video');
            return type === 'video';
        });

        // Fetch thumbnails for assets that don't have one yet
        videoAssets.forEach(asset => {
            // Check current thumbnails state and fetching ref
            setThumbnails(prev => {
                // Skip if we already have a thumbnail or are currently fetching
                if (prev[asset.id] || fetchingRef.current.has(asset.id)) {
                    return prev;
                }

                // Mark as fetching
                fetchingRef.current.add(asset.id);

                // Fetch thumbnail
                getVideoThumbnails(asset.filename)
                    .then(response => {
                        if (response.data && response.data.length > 0) {
                            const firstThumbnail = response.data[0];
                            setThumbnails(prevThumbs => {
                                // Double-check to avoid race conditions
                                if (prevThumbs[asset.id]) return prevThumbs;
                                return {
                                    ...prevThumbs,
                                    [asset.id]: getThumbnailUrl(firstThumbnail)
                                };
                            });
                        }
                    })
                    .catch(error => {
                        console.error(`Failed to fetch thumbnail for ${asset.filename}:`, error);
                    })
                    .finally(() => {
                        // Remove from fetching set
                        fetchingRef.current.delete(asset.id);
                    });

                return prev; // Return unchanged state
            });
        });
    }, [project.assets]); // Re-fetch when assets change

    // Fetch waveforms for audio and video assets
    useEffect(() => {
        const audioVideoAssets = (project.assets || []).filter(asset => {
            const type = asset.type || (asset.filename.match(/\.(mp4|mov|webm)$/i) ? 'video' :
                asset.filename.match(/\.(mp3|wav|ogg|m4a)$/i) ? 'audio' :
                    asset.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? 'image' : 'video');
            return type === 'audio' || type === 'video';
        });

        // Fetch waveforms for assets that don't have one yet
        audioVideoAssets.forEach(asset => {
            // Check if we should skip this asset
            setWaveforms(prevWaveforms => {
                // Skip if already fetched or currently fetching
                if (prevWaveforms[asset.id] || fetchingWaveformsRef.current.has(asset.id)) {
                    return prevWaveforms;
                }
                
                // Check failed waveforms
                setFailedWaveforms(prevFailed => {
                    if (prevFailed.has(asset.id)) {
                        return prevFailed;
                    }
                    
                    // Mark as fetching
                    fetchingWaveformsRef.current.add(asset.id);

                    // Generate waveform URL (backend expects videoId which is the filename)
                    const waveformUrl = getWaveformUrl(asset.filename);
                    
                    // Pre-load the waveform image to check if it exists
                    const img = new Image();
                    img.onload = () => {
                        setWaveforms(prev => {
                            if (prev[asset.id]) return prev;
                            return {
                                ...prev,
                                [asset.id]: waveformUrl
                            };
                        });
                        fetchingWaveformsRef.current.delete(asset.id);
                    };
                    img.onerror = () => {
                        // Waveform doesn't exist or failed to load
                        setFailedWaveforms(prev => new Set(prev).add(asset.id));
                        fetchingWaveformsRef.current.delete(asset.id);
                    };
                    img.src = waveformUrl;
                    
                    return prevFailed;
                });
                
                return prevWaveforms;
            });
        });
    }, [project.assets]); // Only depend on project.assets

    return (
        <div className="h-full flex flex-col bg-slate-900 border-r border-slate-700">
            {/* Header */}
            <div className="p-4 border-b border-slate-700 bg-slate-800">
                <h2 className="text-sm font-bold text-white mb-2">Media Library</h2>
                <div className="flex gap-2">
                    {['all', 'video', 'audio', 'image'].map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`text-xs px-2 py-1 rounded capitalize ${filter === f ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            {/* Asset Grid */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {project.assets && project.assets.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3">
                        {filteredAssets.map(asset => {
                            const type = asset.type || (asset.filename.match(/\.(mp4|mov|webm)$/i) ? 'video' :
                                asset.filename.match(/\.(mp3|wav|ogg|m4a)$/i) ? 'audio' :
                                    asset.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? 'image' : 'video');

                            // Check if this asset is used in any clip on the timeline
                            const isInTimeline = project.clips && project.clips.some(clip => clip.assetId === asset.id);

                            return (
                                <div
                                    key={asset.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, asset)}
                                    onClick={() => {
                                        if (onAssetSelect) {
                                            onAssetSelect(selectedAssetId === asset.id ? null : asset);
                                        }
                                    }}
                                    onContextMenu={(e) => handleContextMenu(e, asset)}
                                    className={`group relative aspect-video bg-slate-800 rounded border overflow-hidden ${
                                        selectedAssetId === asset.id 
                                            ? 'border-blue-500 ring-2 ring-blue-500/50' 
                                            : 'border-slate-700 hover:border-blue-500'
                                    } cursor-grab active:cursor-grabbing`}
                                >
                                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950 text-slate-600 text-[10px] uppercase font-bold tracking-wider overflow-hidden">
                                        {type === 'image' ? (
                                            <img
                                                src={getVideoUrl(asset.filename)}
                                                alt=""
                                                className="w-full h-full object-cover"
                                            />
                                        ) : type === 'video' && thumbnails[asset.id] && !failedThumbnails.has(asset.id) ? (
                                            <img
                                                src={thumbnails[asset.id]}
                                                alt=""
                                                className="w-full h-full object-cover"
                                                onError={() => {
                                                    // Mark thumbnail as failed, will show fallback text
                                                    setFailedThumbnails(prev => new Set(prev).add(asset.id));
                                                }}
                                            />
                                        ) : (
                                            <span>{type}</span>
                                        )}
                                        
                                        {/* Waveform overlay for audio and video */}
                                        {(type === 'audio' || type === 'video') && waveforms[asset.id] && !failedWaveforms.has(asset.id) && (
                                            <div className="absolute inset-0 pointer-events-none opacity-60 mix-blend-screen">
                                                <img
                                                    src={waveforms[asset.id]}
                                                    alt="waveform"
                                                    className="w-full h-full object-fill"
                                                    draggable="false"
                                                    onError={() => {
                                                        setFailedWaveforms(prev => new Set(prev).add(asset.id));
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Green Checkmark - shown when asset is in timeline */}
                                    {isInTimeline && (
                                        <div className="absolute top-1 left-1 bg-green-500 rounded-full p-1 shadow-lg z-10">
                                            <svg 
                                                xmlns="http://www.w3.org/2000/svg" 
                                                viewBox="0 0 20 20" 
                                                fill="currentColor" 
                                                className="w-3 h-3 text-white"
                                            >
                                                <path 
                                                    fillRule="evenodd" 
                                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" 
                                                    clipRule="evenodd" 
                                                />
                                            </svg>
                                        </div>
                                    )}

                                    {/* Label */}
                                    <div className="absolute bottom-0 left-0 right-0 bg-slate-900/80 p-1 text-[10px] truncate text-slate-300">
                                        {asset.originalName}
                                    </div>

                                    {/* Duration Badge */}
                                    {type !== 'image' && (
                                        <div className="absolute top-1 right-1 bg-black/60 px-1 rounded text-[9px] text-white">
                                            {Math.round(asset.duration)}s
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 text-sm gap-2 opacity-60">
                        <p>No media imported</p>
                    </div>
                )}
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <div
                    className="fixed z-50 bg-slate-800 border border-slate-700 rounded shadow-xl py-1"
                    style={{ 
                        top: contextMenu.y, 
                        left: contextMenu.x,
                        width: showTrackMenu ? '200px' : '180px'
                    }}
                >
                    <div className="px-3 py-1.5 text-xs text-slate-400 border-b border-slate-700 font-medium truncate">
                        {contextMenu.asset.originalName}
                    </div>
                    
                    {/* Add to Timeline - with track selection */}
                    <div className="relative">
                        <button
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-700 text-blue-400 font-medium flex items-center justify-between"
                            onMouseEnter={() => setShowTrackMenu(true)}
                            onMouseLeave={() => setShowTrackMenu(false)}
                        >
                            <span>➕ Add to Timeline</span>
                            <span className="text-slate-500">▶</span>
                        </button>
                        
                        {/* Track Selection Submenu */}
                        {showTrackMenu && (
                            <div 
                                className="absolute left-full top-0 ml-1 bg-slate-800 border border-slate-700 rounded shadow-xl py-1 min-w-[160px] z-60"
                                style={{
                                    // Adjust position if near right edge
                                    left: contextMenu.x > window.innerWidth - 400 ? 'auto' : '100%',
                                    right: contextMenu.x > window.innerWidth - 400 ? '100%' : 'auto',
                                    marginLeft: contextMenu.x > window.innerWidth - 400 ? '-1px' : '4px',
                                    marginRight: contextMenu.x > window.innerWidth - 400 ? '4px' : '0'
                                }}
                                onMouseEnter={() => setShowTrackMenu(true)}
                                onMouseLeave={() => setShowTrackMenu(false)}
                            >
                                <div className="px-3 py-1 text-[10px] text-slate-500 uppercase font-bold border-b border-slate-700">
                                    Select Track
                                </div>
                                {(project.tracks || []).map((track) => {
                                    // Filter tracks based on asset type
                                    const assetType = contextMenu.asset.type || 
                                        (contextMenu.asset.filename.match(/\.(mp4|mov|webm)$/i) ? 'video' :
                                         contextMenu.asset.filename.match(/\.(mp3|wav|ogg|m4a)$/i) ? 'audio' :
                                         contextMenu.asset.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? 'image' : 'video');
                                    
                                    // Show video/image tracks for video/image assets, audio tracks for audio assets
                                    const isCompatible = (track.type === 'video' && (assetType === 'video' || assetType === 'image')) ||
                                                       (track.type === 'audio' && assetType === 'audio');
                                    
                                    if (!isCompatible) return null;
                                    
                                    return (
                                        <button
                                            key={track.id}
                                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-700 text-slate-200 flex items-center gap-2"
                                            onClick={() => {
                                                if (onAddToTimeline) {
                                                    onAddToTimeline(contextMenu.asset, track.id);
                                                }
                                                setContextMenu(null);
                                                setShowTrackMenu(false);
                                            }}
                                        >
                                            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                            {track.label}
                                        </button>
                                    );
                                })}
                                {(!project.tracks || project.tracks.length === 0) && (
                                    <div className="px-3 py-2 text-xs text-slate-500">
                                        No tracks available
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    
                    {/* Quick add to first compatible track */}
                    <button
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-700 text-slate-300"
                        onClick={() => {
                            if (onAddToTimeline) {
                                // Find first compatible track or default to track 0
                                const assetType = contextMenu.asset.type || 
                                    (contextMenu.asset.filename.match(/\.(mp4|mov|webm)$/i) ? 'video' :
                                     contextMenu.asset.filename.match(/\.(mp3|wav|ogg|m4a)$/i) ? 'audio' :
                                     contextMenu.asset.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? 'image' : 'video');
                                
                                const tracks = project.tracks || [];
                                const compatibleTrack = tracks.find(t => 
                                    (t.type === 'video' && (assetType === 'video' || assetType === 'image')) ||
                                    (t.type === 'audio' && assetType === 'audio')
                                );
                                
                                const trackId = compatibleTrack ? compatibleTrack.id : 0;
                                onAddToTimeline(contextMenu.asset, trackId);
                            }
                            setContextMenu(null);
                        }}
                    >
                        ➕ Add to Timeline (Start - Track 0)
                    </button>
                    {/*
                    <button
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-700 text-slate-200"
                        onClick={() => {
                            // TODO: Implement preview (maybe open modal)
                            setContextMenu(null);
                        }}
                    >
                        Preview
                    </button>
                    */}
                    {onShare && (
                        <button
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-700 text-slate-200"
                            onClick={() => {
                                onShare(contextMenu.asset);
                                setContextMenu(null);
                            }}
                        >
                            Share (copy link)
                        </button>
                    )}
                    <button
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-700 text-slate-200"
                        onClick={() => {
                            if (window.confirm('Remove this asset from library?')) {
                                if (onRemoveAsset) {
                                    onRemoveAsset(contextMenu.asset.id);
                                }
                            }
                            setContextMenu(null);
                        }}
                    >
                        Remove from Project
                    </button>
                    <button
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-700 text-slate-200"
                        onClick={() => {
                            const newName = prompt("Rename asset", contextMenu.asset.originalName);
                            if (newName && onRenameAsset) {
                                onRenameAsset(contextMenu.asset.id, newName);
                            }
                            setContextMenu(null);
                        }}
                    >
                        Rename
                    </button>
                    <div className="border-t border-slate-700 my-1"></div>
                    <div className="px-3 py-1.5 text-[10px] text-slate-500">
                        {Math.round(contextMenu.asset.duration)}s • {contextMenu.asset.filename.split('.').pop().toUpperCase()}
                    </div>
                </div>
            )}

            {/* Click away listener */}
            {contextMenu && (
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => {
                        setContextMenu(null);
                        setShowTrackMenu(false);
                    }}
                    onContextMenu={(e) => { 
                        e.preventDefault(); 
                        setContextMenu(null);
                        setShowTrackMenu(false);
                    }}
                ></div>
            )}

            {/* Upload Area at bottom */}
            <div className="p-4 border-t border-slate-700 bg-slate-800/50">
                <UploadArea onUpload={(data) => {
                    onAddAsset(data);
                    // Optionally auto-add to timeline is disabled now, user drags it
                }} compact={true} />
            </div>
        </div>
    );
}
