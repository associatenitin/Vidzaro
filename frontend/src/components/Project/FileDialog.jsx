import { useState, useRef, useEffect } from 'react';

export default function FileDialog({ isOpen, onClose, onSelectFile, title = 'Select Project File' }) {
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);

  // Reset selected file when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleOpen = () => {
    fileInputRef.current?.click();
  };

  const handleConfirm = async () => {
    if (selectedFile) {
      // Read file content
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target.result;
          const projectData = JSON.parse(content);
          // Note: Browsers don't expose full file paths for security reasons
          // We'll use the filename instead
          onSelectFile(projectData, selectedFile.name, '');
        } catch (error) {
          alert('Failed to parse project file. Please ensure it is a valid JSON file.');
          console.error('Parse error:', error);
        }
      };
      reader.onerror = () => {
        alert('Failed to read file.');
      };
      reader.readAsText(selectedFile);
      onClose();
    }
  };

  const handleCancel = () => {
    setSelectedFile(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={handleCancel}>
      <div 
        className="bg-slate-800 border border-slate-700 rounded-lg shadow-xl w-full max-w-2xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button
            onClick={handleCancel}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Select a project file (.json)
            </label>
            <div className="flex gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                onClick={handleOpen}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium text-white border border-slate-600"
              >
                Browse Files...
              </button>
              {selectedFile && (
                <div className="flex-1 px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-300 flex items-center">
                  <svg className="w-5 h-5 mr-2 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="truncate">{selectedFile.name}</span>
                </div>
              )}
            </div>
          </div>

          {selectedFile && (
            <div className="mt-4 p-3 bg-slate-900/50 border border-slate-700 rounded-lg">
              <div className="text-xs text-slate-400 space-y-1">
                <div><span className="font-medium">File:</span> {selectedFile.name}</div>
                <div><span className="font-medium">Size:</span> {(selectedFile.size / 1024).toFixed(2)} KB</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700 flex justify-end gap-3">
          <button
            onClick={handleCancel}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium text-white border border-slate-600"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedFile}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white"
          >
            Load Project
          </button>
        </div>
      </div>
    </div>
  );
}
