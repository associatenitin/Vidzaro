import { useState, useEffect } from 'react';

const MORPH_USE_CUDA_KEY = 'morphUseCuda';

function getMorphUseCuda() {
  if (typeof localStorage === 'undefined') return true;
  return localStorage.getItem(MORPH_USE_CUDA_KEY) !== 'false';
}

export default function PreferencesDialog({ isOpen, onClose }) {
  const [morphUseCuda, setMorphUseCuda] = useState(getMorphUseCuda);

  useEffect(() => {
    setMorphUseCuda(getMorphUseCuda());
  }, [isOpen]);

  const toggleMorphUseCuda = () => {
    const next = !morphUseCuda;
    setMorphUseCuda(next);
    localStorage.setItem(MORPH_USE_CUDA_KEY, next ? 'true' : 'false');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-lg p-6 max-w-md w-full border border-slate-700 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Preferences</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">
            ×
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={morphUseCuda}
                onChange={toggleMorphUseCuda}
                className="rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-300 group-hover:text-white">Video Morph: Use GPU (CUDA)</span>
            </label>
            <p className="text-xs text-slate-500 mt-1.5 ml-6">
              When off, uses CPU only (slower; avoids CUDA DLL errors such as missing cublasLt64_12.dll).
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
