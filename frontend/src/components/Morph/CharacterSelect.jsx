import { useState } from 'react';

/**
 * Shows keyframes with overlaid face boxes and track labels.
 * User clicks a face to select that character (trackId).
 */
export default function CharacterSelect({ keyframes = [], selectedTrackId, onSelect }) {
  const [hoverTrack, setHoverTrack] = useState(null);

  const allTrackIds = [...new Set(keyframes.flatMap((k) => k.faces?.map((f) => f.trackId) ?? []))].sort((a, b) => a - b);

  return (
    <div className="space-y-3">
      <p className="text-slate-400 text-sm">
        Click on the person you want to replace with the photo face. Labels show Person 1, Person 2, etc.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-80 overflow-y-auto">
        {keyframes.map((kf, i) => {
          const imgW = kf.width || 640;
          const imgH = kf.height || 360;
          return (
            <div key={i} className="relative rounded overflow-hidden border-2 border-slate-600 bg-slate-900">
              {kf.imageBase64 ? (
                <img
                  src={kf.imageBase64}
                  alt={`Frame ${kf.frameIndex}`}
                  className="w-full h-auto block"
                />
              ) : (
                <div className="aspect-video bg-slate-800 flex items-center justify-center text-slate-500 text-sm">
                  Frame {kf.frameIndex}
                </div>
              )}
              {kf.faces?.map((face, faceIdx) => {
                const [x1, y1, x2, y2] = face.bbox;
                const isSelected = selectedTrackId === face.trackId;
                const isHover = hoverTrack === face.trackId;
                const label = `Person ${face.trackId + 1}`;
                return (
                  <div
                    key={`${i}-${faceIdx}-${face.trackId}`}
                    className="absolute border-2 cursor-pointer rounded"
                    style={{
                      left: `${(x1 / imgW) * 100}%`,
                      top: `${(y1 / imgH) * 100}%`,
                      width: `${((x2 - x1) / imgW) * 100}%`,
                      height: `${((y2 - y1) / imgH) * 100}%`,
                      borderColor: isSelected ? '#3b82f6' : isHover ? '#60a5fa' : 'rgba(255,255,255,0.7)',
                      backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.2)' : isHover ? 'rgba(96, 165, 250, 0.15)' : 'transparent',
                    }}
                    onClick={() => onSelect(face.trackId)}
                    onMouseEnter={() => setHoverTrack(face.trackId)}
                    onMouseLeave={() => setHoverTrack(null)}
                    title={label}
                  >
                    <span
                      className="absolute -top-6 left-0 px-1.5 py-0.5 rounded text-xs font-medium bg-slate-800 text-white whitespace-nowrap"
                      style={{ zIndex: 1 }}
                    >
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {allTrackIds.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-slate-500 text-sm">Select character:</span>
          {allTrackIds.map((tid) => (
            <button
              key={tid}
              type="button"
              onClick={() => onSelect(tid)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${selectedTrackId === tid
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
            >
              Person {tid + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
