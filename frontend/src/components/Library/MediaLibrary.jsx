import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { getThumbnailUrl } from '../../services/api';
import UploadArea from '../Upload/UploadArea';

export default function MediaLibrary({ project, onAddAsset, onUpload }) {
    const [filter, setFilter] = useState('all'); // all, video, audio, image

    // Handle file dragging from desktop (HTML5)
    const handleDragOver = (e) => {
        e.preventDefault();
    };

    const handleDrop = (e) => {
        e.preventDefault();
        // Handled by UploadArea internally or we can expose a drop zone entire area
    };

    // Drag start for library items to timeline
    const handleDragStart = (e, asset) => {
        // Set data for HTML5 drag and drop
        e.dataTransfer.setData('application/json', JSON.stringify({
            type: 'asset',
            ...asset
        }));
        e.dataTransfer.effectAllowed = 'copy';
    };

    const filteredAssets = (project.assets || []).filter(asset => {
        if (filter === 'all') return true;
        // Simple extension check or mime type if available
        if (filter === 'video') return asset.filename.match(/\.(mp4|mov|webm)$/i);
        // Add logic for audio/image
        return true;
    });

    return (
        <div className="h-full flex flex-col bg-slate-900 border-r border-slate-700">
            {/* Header */}
            <div className="p-4 border-b border-slate-700 bg-slate-800">
                <h2 className="text-sm font-bold text-white mb-2">Media Library</h2>
                <div className="flex gap-2">
                    {['all', 'video', 'audio'].map(f => (
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
                        {filteredAssets.map(asset => (
                            <div
                                key={asset.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, asset)}
                                className="group relative aspect-video bg-slate-800 rounded border border-slate-700 hover:border-blue-500 cursor-grab active:cursor-grabbing overflow-hidden"
                            >
                                {/* Thumbnail Preview usually needed here, for now using placeholder or video tag if small */}
                                {/* Ideally we use generated thumbnails from backend */}
                                <div className="absolute inset-0 flex items-center justify-center bg-slate-950 text-slate-600 text-xs">
                                    {/* If we had a thumbnail URL in asset we'd use it */}
                                    Video
                                </div>

                                {/* Label */}
                                <div className="absolute bottom-0 left-0 right-0 bg-slate-900/80 p-1 text-[10px] truncate text-slate-300">
                                    {asset.originalName}
                                </div>

                                {/* Duration Badge */}
                                <div className="absolute top-1 right-1 bg-black/60 px-1 rounded text-[9px] text-white">
                                    {Math.round(asset.duration)}s
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 text-sm gap-2 opacity-60">
                        <p>No media imported</p>
                    </div>
                )}
            </div>

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
