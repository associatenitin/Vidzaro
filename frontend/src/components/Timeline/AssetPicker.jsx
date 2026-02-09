import { useState } from 'react';
import { getThumbnailUrl, getVideoUrl } from '../../services/api';

export default function AssetPicker({ project, onSelect, onClose, trackType }) {
  const [filter, setFilter] = useState('all');

  const filteredAssets = (project.assets || []).filter(asset => {
    if (filter === 'all') return true;

    const type = asset.type || (asset.filename.match(/\.(mp4|mov|webm)$/i) ? 'video' :
      asset.filename.match(/\.(mp3|wav|ogg|m4a)$/i) ? 'audio' :
        asset.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? 'image' : 'video');

    return type === filter;
  });

  // Filter by track compatibility if trackType is specified
  const compatibleAssets = trackType 
    ? filteredAssets.filter(asset => {
        const assetType = asset.type || 
          (asset.filename.match(/\.(mp4|mov|webm)$/i) ? 'video' :
           asset.filename.match(/\.(mp3|wav|ogg|m4a)$/i) ? 'audio' :
           asset.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? 'image' : 'video');
        
        return (trackType === 'video' && (assetType === 'video' || assetType === 'image')) ||
               (trackType === 'audio' && assetType === 'audio');
      })
    : filteredAssets;

  const handleAssetClick = (asset) => {
    onSelect(asset);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-slate-800 border border-slate-700 rounded-lg shadow-2xl w-[90vw] max-w-4xl h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-slate-200">
            Select Media to Add
            {trackType && (
              <span className="text-sm text-slate-400 ml-2">
                ({trackType === 'video' ? 'Video/Image' : 'Audio'} track)
              </span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
          >
            ×
          </button>
        </div>

        {/* Filter */}
        <div className="p-4 border-b border-slate-700 flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 text-xs rounded ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('video')}
            className={`px-3 py-1 text-xs rounded ${filter === 'video' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          >
            Video
          </button>
          <button
            onClick={() => setFilter('audio')}
            className={`px-3 py-1 text-xs rounded ${filter === 'audio' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          >
            Audio
          </button>
          <button
            onClick={() => setFilter('image')}
            className={`px-3 py-1 text-xs rounded ${filter === 'image' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          >
            Image
          </button>
        </div>

        {/* Assets Grid */}
        <div className="flex-1 overflow-auto p-4">
          {compatibleAssets.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {compatibleAssets.map((asset) => {
                const assetType = asset.type || 
                  (asset.filename.match(/\.(mp4|mov|webm)$/i) ? 'video' :
                   asset.filename.match(/\.(mp3|wav|ogg|m4a)$/i) ? 'audio' :
                   asset.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? 'image' : 'video');
                
                const isImage = assetType === 'image';
                const isAudio = assetType === 'audio';

                return (
                  <div
                    key={asset.id}
                    onClick={() => handleAssetClick(asset)}
                    className="group relative aspect-video bg-slate-900 rounded border border-slate-700 overflow-hidden cursor-pointer hover:border-blue-500 hover:ring-2 hover:ring-blue-500/50 transition-all"
                  >
                    {isImage ? (
                      <img
                        src={getVideoUrl(asset.filename)}
                        alt={asset.originalName || asset.filename}
                        className="w-full h-full object-cover"
                      />
                    ) : isAudio ? (
                      <div className="w-full h-full flex items-center justify-center bg-slate-800">
                        <span className="text-4xl">🔊</span>
                      </div>
                    ) : (
                      <div className="w-full h-full bg-slate-800 flex items-center justify-center">
                        <span className="text-4xl">🎬</span>
                      </div>
                    )}
                    
                    {/* Overlay with name */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="absolute bottom-0 left-0 right-0 p-2">
                        <p className="text-xs text-white truncate font-medium">
                          {asset.originalName || asset.filename}
                        </p>
                        {asset.duration && (
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {Math.floor(asset.duration / 60)}:{(Math.floor(asset.duration % 60)).toString().padStart(2, '0')}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Type badge */}
                    <div className="absolute top-1 right-1">
                      <span className="text-[8px] bg-slate-900/80 text-slate-300 px-1.5 py-0.5 rounded uppercase font-bold">
                        {assetType}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 text-sm gap-2">
              <p className="text-lg">No media available</p>
              <p className="text-xs text-slate-600">
                {trackType 
                  ? `No ${trackType === 'video' ? 'video or image' : 'audio'} assets found`
                  : 'Import media from the media library first'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
