import { useState, useRef, useEffect } from 'react';

export default function SaveDialog({ isOpen, onClose, projectName, onSave, onSaveComplete, title = 'Save Project' }) {
  const [fileName, setFileName] = useState(projectName || 'Untitled Project');
  const [saveLocation, setSaveLocation] = useState('');

  useEffect(() => {
    if (isOpen) {
      setFileName(projectName || 'Untitled Project');
      setSaveLocation('');
    }
  }, [isOpen, projectName]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!fileName || fileName.trim() === '') {
      alert('Please enter a project name');
      return;
    }

    // Sanitize filename
    const sanitizedName = fileName
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 255) || 'Untitled_Project';

    const finalFileName = sanitizedName.endsWith('.json') ? sanitizedName : `${sanitizedName}.json`;

    try {
      // Try to use File System Access API (modern browsers)
      if ('showSaveFilePicker' in window) {
        try {
          const fileHandle = await window.showSaveFilePicker({
            suggestedName: finalFileName,
            types: [{
              description: 'JSON Project Files',
              accept: { 'application/json': ['.json'] }
            }],
            excludeAcceptAllOption: false
          });

          // Get the project data with updated name
          const projectData = onSave();
          projectData.name = fileName.trim() || 'Untitled Project';
          const projectJson = JSON.stringify(projectData, null, 2);
          
          // Get the file handle and save
          const writable = await fileHandle.createWritable();
          await writable.write(projectJson);
          await writable.close();

          // Get the file name
          const file = await fileHandle.getFile();
          setSaveLocation(file.name);
          
          // Notify parent component of save completion
          if (onSaveComplete) {
            await onSaveComplete(projectData, file.name);
          }
          
          alert(`Project saved successfully!\n\nFile: ${file.name}`);
          onClose();
        } catch (error) {
          // User cancelled or error occurred
          if (error.name !== 'AbortError') {
            console.error('Save error:', error);
            // Fallback to download
            const projectData = onSave();
            projectData.name = fileName.trim() || 'Untitled Project';
            downloadFile(finalFileName, projectData);
            if (onSaveComplete) {
              await onSaveComplete(projectData, finalFileName);
            }
          }
        }
      } else {
        // Fallback: Download the file
        const projectData = onSave();
        projectData.name = fileName.trim() || 'Untitled Project';
        downloadFile(finalFileName, projectData);
        if (onSaveComplete) {
          await onSaveComplete(projectData, finalFileName);
        }
        onClose();
      }
    } catch (error) {
      console.error('Failed to save project:', error);
      alert('Failed to save project. Please try again.');
    }
  };

  const downloadFile = (filename, projectData) => {
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert(`Project saved!\n\nFile: ${filename}\n\nThe file has been downloaded to your default download folder.`);
  };

  const handleCancel = () => {
    setFileName(projectName || 'Untitled Project');
    setSaveLocation('');
    onClose();
  };

  const handleBackdropClick = (e) => {
    // Only close when the backdrop itself is clicked, not when events bubble from children
    if (e.target === e.currentTarget) {
      handleCancel();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" 
      onClick={handleBackdropClick}
    >
      <div 
        className="bg-slate-800 border border-slate-700 rounded-lg shadow-xl w-full max-w-2xl mx-4"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
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
              Project Name
            </label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSave();
                }
              }}
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              placeholder="Enter project name"
              autoFocus
            />
            <p className="mt-2 text-xs text-slate-400">
              File will be saved as: <span className="text-slate-300">{fileName.endsWith('.json') ? fileName : `${fileName}.json`}</span>
            </p>
          </div>

          {saveLocation && (
            <div className="mt-4 p-3 bg-slate-900/50 border border-slate-700 rounded-lg">
              <div className="text-xs text-slate-400">
                <div><span className="font-medium">Saved to:</span> <span className="text-slate-300">{saveLocation}</span></div>
              </div>
            </div>
          )}

          {!('showSaveFilePicker' in window) && (
            <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
              <div className="text-xs text-yellow-400 flex items-start gap-2">
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <div className="font-medium mb-1">Note:</div>
                  <div>Your browser doesn't support the File System Access API. The file will be downloaded to your default download folder instead.</div>
                </div>
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
            onClick={handleSave}
            disabled={!fileName || fileName.trim() === ''}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white"
          >
            Save Project
          </button>
        </div>
      </div>
    </div>
  );
}
