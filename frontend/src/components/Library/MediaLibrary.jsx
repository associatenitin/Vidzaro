import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { getThumbnailUrl, getVideoUrl } from '../../services/api';
import UploadArea from '../Upload/UploadArea';

export default function MediaLibrary({ project, onAddAsset, onUpload, onRemoveAsset, onRenameAsset, onAddToTimeline }) {
    const [filter, setFilter] = useState('all'); // all, video, audio, image

    // Handle file dragging from desktop (HTML5)
    const handleDragOver = (e) => {
        e.preventDefault();
    };

    const handleDrop = (e) => {
        e.preventDefault();
    };

    // Context Menu State
    const [contextMenu, setContextMenu] = useState(null);

    const handleContextMenu = (e, asset) => {
        e.preventDefault();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            asset
        });
    };

    // Drag start for library items to timeline
    const handleDragStart = (e, asset) => {
        if (contextMenu) setContextMenu(null);
        // Set data for HTML5 drag and drop
        e.dataTransfer.setData('application/json', JSON.stringify({
            type: 'asset',
            ...asset
        }));
        e.dataTransfer.effectAllowed = 'copy';
    };

    const filteredAssets = (project.assets || []).filter(asset => {
        if (filter === 'all') return true;

        const type = asset.type || (asset.filename.match(/\.(mp4|mov|webm)$/i) ? 'video' :
            asset.filename.match(/\.(mp3|wav|ogg|m4a)$/i) ? 'audio' :
                asset.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? 'image' : 'video');

        return type === filter;
    });

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

                            return (
                                <div
                                    key={asset.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, asset)}
                                    onContextMenu={(e) => handleContextMenu(e, asset)}
                                    className="group relative aspect-video bg-slate-800 rounded border border-slate-700 hover:border-blue-500 cursor-grab active:cursor-grabbing overflow-hidden"
                                >
                                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950 text-slate-600 text-[10px] uppercase font-bold tracking-wider">
                                        {type === 'image' ? (
                                            <img
                                                src={getVideoUrl(asset.filename)}
                                                alt=""
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <span>{type}</span>
                                        )}
                                    </div>

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
                    className="fixed z-50 bg-slate-800 border border-slate-700 rounded shadow-xl py-1 w-40"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                >
                    <div className="px-3 py-1.5 text-xs text-slate-400 border-b border-slate-700 font-medium truncate">
                        {contextMenu.asset.originalName}
                    </div>
                    <button
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-700 text-blue-400 font-medium"
                        onClick={() => {
                            if (onAddToTimeline) {
                                onAddToTimeline(contextMenu.asset);
                            }
                            setContextMenu(null);
                        }}
                    >
                        ➕ Add to Timeline (Start)
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
                    onClick={() => setContextMenu(null)}
                    onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
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
