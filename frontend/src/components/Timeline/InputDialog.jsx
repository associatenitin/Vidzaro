import { useState, useEffect, useRef } from 'react';

export default function InputDialog({ 
  title, 
  label, 
  value, 
  min, 
  max, 
  step, 
  unit, 
  isTextInput = false,
  onConfirm, 
  onClose 
}) {
  const [inputValue, setInputValue] = useState(value !== undefined ? value : (isTextInput ? '' : 1));
  const inputRef = useRef(null);

  useEffect(() => {
    // Focus input on mount
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isTextInput) {
      onConfirm(inputValue);
      onClose();
    } else {
      const numValue = parseFloat(inputValue);
      if (!isNaN(numValue) && numValue >= min && numValue <= max) {
        onConfirm(numValue);
        onClose();
      }
    }
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
            <label className="block text-sm text-slate-400 mb-2">{label}</label>
            
            {isTextInput ? (
              /* Text Input for Filters */
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="Enter filter name (e.g., grayscale, blur, sepia)"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    onClose();
                  }
                }}
              />
            ) : (
              <>
                {/* Slider */}
                <div className="mb-3">
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={inputValue}
                    onChange={(e) => setInputValue(parseFloat(e.target.value))}
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <div className="flex justify-between text-xs text-slate-500 mt-1">
                    <span>{min}{unit}</span>
                    <span>{max}{unit}</span>
                  </div>
                </div>

                {/* Number Input */}
                <div className="flex items-center gap-2">
                  <input
                    ref={inputRef}
                    type="number"
                    min={min}
                    max={max}
                    step={step}
                    value={inputValue}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val)) {
                        setInputValue(Math.max(min, Math.min(max, val)));
                      }
                    }}
                    className="flex-1 bg-slate-900 border border-slate-600 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder={`${min} - ${max}`}
                  />
                  {unit && (
                    <span className="text-slate-400 text-sm font-medium w-8">{unit}</span>
                  )}
                </div>

                {/* Current Value Display */}
                <div className="mt-2 text-center">
                  <span className="text-xs text-slate-500">Current: </span>
                  <span className="text-sm font-mono text-blue-400">{typeof inputValue === 'number' ? inputValue.toFixed(2) : inputValue}{unit}</span>
                </div>
              </>
            )}
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
