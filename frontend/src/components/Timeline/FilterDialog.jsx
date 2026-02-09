import { useState, useEffect, useRef } from 'react';
import FilterPresetManager from '../Filter/FilterPresetManager';
import FilterEditor from '../Filter/FilterEditor';
import { convertFilterToString } from '../../utils/filterUtils';

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
  onClose,
  project,
  selectedClipIds,
  onSavePreset,
  onDeletePreset,
  onUpdatePreset
}) {
  // Initialize selectedFilter - handle both string and object filters
  const getInitialFilterValue = () => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
      if (value.id) return value.id; // Custom preset
      if (value.name) return value.name;
    }
    return '';
  };

  const [selectedFilter, setSelectedFilter] = useState(() => getInitialFilterValue());
  const [showEditor, setShowEditor] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [editingPreset, setEditingPreset] = useState(null);
  const selectRef = useRef(null);

  useEffect(() => {
    // Focus select on mount
    if (selectRef.current) {
      selectRef.current.focus();
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    // Handle filter selection
    let filterToApply = null;
    
    if (selectedFilter) {
      if (typeof selectedFilter === 'string') {
        // Check if it's a custom preset ID
        const preset = project?.customFilters?.find(f => f.id === selectedFilter);
        if (preset) {
          filterToApply = preset;
        } else {
          filterToApply = selectedFilter; // Built-in filter string
        }
      } else {
        filterToApply = selectedFilter; // Already an object
      }
    }
    
    onConfirm(filterToApply);
    onClose();
  };

  const handleCreateCustom = () => {
    setShowEditor(true);
  };

  const handleEditorApply = (filterObj) => {
    // Convert to string if it's a simple built-in, otherwise keep as object
    const filterString = convertFilterToString(filterObj);
    setSelectedFilter(filterString || filterObj);
    setShowEditor(false);
  };

  const handlePresetSelect = (preset) => {
    setSelectedFilter(preset.id || preset);
    setShowPresets(false);
    // Auto-apply preset
    onConfirm(preset);
    onClose();
  };

  const handlePresetEdit = (preset) => {
    setEditingPreset(preset);
    setShowEditor(true);
    setShowPresets(false);
  };

  const handlePresetSave = (filterPreset) => {
    if (onSavePreset) {
      onSavePreset(filterPreset);
    }
    setSelectedFilter(filterPreset);
    setShowEditor(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  // Show filter editor if requested
  if (showEditor) {
    return (
      <FilterEditor
        initialFilter={editingPreset || selectedFilter}
        project={project}
        selectedClipIds={selectedClipIds}
        onApply={handleEditorApply}
        onSavePreset={handlePresetSave}
        onClose={() => {
          setShowEditor(false);
          setEditingPreset(null);
        }}
      />
    );
  }

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10001]"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div 
        className="bg-slate-800 border border-slate-700 rounded-lg shadow-2xl w-[600px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 flex-1 overflow-auto">
          <h3 className="text-lg font-semibold text-slate-200 mb-4">{title}</h3>
          
          {/* Tabs */}
          <div className="flex gap-2 mb-4 border-b border-slate-700">
            <button
              onClick={() => setShowPresets(false)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                !showPresets
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              Built-in Filters
            </button>
            <button
              onClick={() => setShowPresets(true)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                showPresets
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              Custom Presets {project?.customFilters?.length > 0 && `(${project.customFilters.length})`}
            </button>
          </div>

          {showPresets ? (
            /* Custom Presets Tab */
            <div className="space-y-4">
              <button
                onClick={handleCreateCustom}
                className="w-full p-4 border-2 border-dashed border-slate-600 hover:border-blue-500 rounded-lg text-slate-400 hover:text-blue-400 transition-colors flex items-center justify-center gap-2"
              >
                <span className="text-xl">➕</span>
                <span>Create Custom Filter</span>
              </button>

              {project?.customFilters && project.customFilters.length > 0 ? (
                <FilterPresetManager
                  presets={project.customFilters}
                  onSelect={handlePresetSelect}
                  onDelete={onDeletePreset}
                  onEdit={handlePresetEdit}
                />
              ) : (
                <div className="text-center text-slate-500 text-sm py-8">
                  No custom presets. Click above to create one.
                </div>
              )}
            </div>
          ) : (
            /* Built-in Filters Tab */
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Select Filter</label>
                
                <select
                  ref={selectRef}
                  value={typeof selectedFilter === 'string' ? selectedFilter : (typeof selectedFilter === 'object' ? (selectedFilter.id || selectedFilter.name || '') : '')}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedFilter(val);
                  }}
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
                      {typeof selectedFilter === 'string' 
                        ? FILTER_OPTIONS.find(opt => opt.value === selectedFilter)?.label
                        : selectedFilter.name || 'Custom Filter'}
                    </span>
                  )}
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleCreateCustom}
                  className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors text-sm mb-2"
                >
                  Create Custom Filter
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="flex gap-2 p-6 border-t border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
          >
            Cancel
          </button>
          {!showPresets && (
            <button
              onClick={handleSubmit}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors font-medium"
            >
              Apply
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
