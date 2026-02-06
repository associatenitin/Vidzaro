import { useState, useEffect } from 'react';
import { startExport, getExportStatus, getExportDownloadUrl } from '../../services/api';

export default function ExportPanel({ project, onClose }) {
  const [isExporting, setIsExporting] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState(null);

  useEffect(() => {
    if (!jobId) return;

    const checkStatus = async () => {
      try {
        const response = await getExportStatus(jobId);
        setStatus(response.data);

        if (response.data.status === 'completed') {
          setIsExporting(false);
          setDownloadUrl(getExportDownloadUrl(jobId));
        } else if (response.data.status === 'failed') {
          setIsExporting(false);
          setError(response.data.error || 'Export failed');
        } else {
          // Check again in 2 seconds
          setTimeout(checkStatus, 2000);
        }
      } catch (err) {
        setIsExporting(false);
        setError(err.message || 'Failed to check export status');
      }
    };

    const interval = setInterval(checkStatus, 2000);
    checkStatus();

    return () => clearInterval(interval);
  }, [jobId]);

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);
    setStatus(null);
    setDownloadUrl(null);

    try {
      // Prepare project data for export
      const exportData = {
        ...project,
        clips: project.clips.map((clip) => ({
          ...clip,
          videoId: clip.videoId,
        })),
      };

      const response = await startExport(exportData);
      setJobId(response.data.jobId);
    } catch (err) {
      setIsExporting(false);
      setError(err.response?.data?.error || err.message || 'Export failed');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4 border border-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Export Video</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white"
          >
            ×
          </button>
        </div>

        {!isExporting && !status && (
          <div className="space-y-4">
            <p className="text-slate-300">
              Export your project as an MP4 video file. This may take a few minutes depending on video length.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleExport}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium"
              >
                Start Export
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {isExporting && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-500"></div>
              <p className="text-slate-300">Exporting video...</p>
            </div>
            {status && (
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${status.progress || 0}%` }}
                ></div>
              </div>
            )}
          </div>
        )}

        {status?.status === 'completed' && downloadUrl && (
          <div className="space-y-4">
            <div className="p-4 bg-green-500/20 border border-green-500/50 rounded-lg">
              <p className="text-green-400 font-medium">Export completed!</p>
            </div>
            <a
              href={downloadUrl}
              download
              className="block w-full px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-medium text-center"
            >
              Download Video
            </a>
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium"
            >
              Close
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg">
            <p className="text-red-400">{error}</p>
            <button
              onClick={() => {
                setError(null);
                setIsExporting(false);
                setStatus(null);
              }}
              className="mt-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
