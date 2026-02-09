import { useState } from 'react';
import { convertFilterToCSS } from '../../utils/filterUtils';

export default function FilterPresetManager({ 
  presets, 
  onSelect, 
  onDelete, 
  onEdit 
}) {
  const [hoveredId, setHoveredId] = useState(null);

  if (!presets || presets.length === 0) {
    return (
      <div className="text-center text-slate-500 text-sm py-4">
        No custom presets saved yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {presets.map((preset) => {
        const cssFilter = convertFilterToCSS(preset);
        return (
          <div
            key={preset.id}
            className="relative group bg-slate-900 border border-slate-700 rounded p-2 hover:border-blue-500 transition-colors cursor-pointer"
            onMouseEnter={() => setHoveredId(preset.id)}
            onMouseLeave={() => setHoveredId(null)}
            onClick={() => onSelect && onSelect(preset)}
          >
            {/* Preview */}
            <div
              className="w-full h-16 rounded mb-2 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500"
              style={{ filter: cssFilter }}
            />
            
            {/* Name */}
            <div className="text-xs text-slate-300 font-medium truncate">
              {preset.name}
            </div>

            {/* Actions on hover */}
            {hoveredId === preset.id && (
              <div className="absolute top-1 right-1 flex gap-1">
                {onEdit && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(preset);
                    }}
                    className="p-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-400 hover:text-blue-400 text-xs"
                    title="Edit"
                  >
                    ✏️
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Delete preset "${preset.name}"?`)) {
                        onDelete(preset.id);
                      }
                    }}
                    className="p-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-400 hover:text-red-400 text-xs"
                    title="Delete"
                  >
                    🗑️
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
