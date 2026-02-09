import { useState, useEffect, useRef } from 'react';

const FILTER_OPTIONS = [
  { value: '', label: 'No Filter' },
  { value: 'grayscale', label: 'Grayscale' },
  { value: 'sepia', label: 'Sepia' },
  { value: 'invert', label: 'Invert' },
  { value: 'blur', label: 'Blur' },
  { value: 'brightness', label: 'Brighten' },
  { value: 'darken', label: 'Darken' },
  { value: 'contrast', label: 'High Contrast' },
  { value: 'saturate', label: 'Saturate' },
  { value: 'desaturate', label: 'Desaturate' },
  { value: 'hue-rotate', label: 'Hue Shift' },
  { value: 'vintage', label: 'Vintage' },
  { value: 'cool', label: 'Cool Tone' },
  { value: 'warm', label: 'Warm Tone' },
];

export default function FilterDialog({ 
  title, 
  value, 
  onConfirm, 
  onClose 
}) {
  const [selectedFilter, setSelectedFilter] = useState(value || '');
  const selectRef = useRef(null);

  useEffect(() => {
    // Focus select on mount
    if (selectRef.current) {
      selectRef.current.focus();
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfirm(selectedFilter || null);
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10001]"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div 
        className="bg-slate-800 border border-slate-700 rounded-lg shadow-2xl w-96 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-slate-200 mb-4">{title}</h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-2">Select Filter</label>
            
            <select
              ref={selectRef}
              value={selectedFilter}
              onChange={(e) => setSelectedFilter(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {/* Preview text */}
            <div className="mt-3 text-center">
              <span className="text-xs text-slate-500">
                {selectedFilter ? `Filter: ` : 'No filter will be applied'}
              </span>
              {selectedFilter && (
                <span className="text-sm font-medium text-blue-400 ml-1 capitalize">
                  {FILTER_OPTIONS.find(opt => opt.value === selectedFilter)?.label}
                </span>
              )}
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors font-medium"
            >
              Apply
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
