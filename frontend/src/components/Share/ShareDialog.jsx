import { useState } from 'react';
import { createShare } from '../../services/api';

const EXPIRY_OPTIONS = [
  { label: '1 day', value: 24 },
  { label: '7 days', value: 24 * 7 },
  { label: '30 days', value: 24 * 30 },
  { label: 'Never', value: null },
];

export default function ShareDialog({ asset, onClose }) {
  const [expiresIn, setExpiresIn] = useState(24);
  const [shareUrl, setShareUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleCreateLink = async () => {
    if (!asset?.filename) return;
    setLoading(true);
    setError(null);
    try {
      const hours = expiresIn === null || expiresIn === 'never' ? null : Number(expiresIn);
      const data = await createShare(asset.filename, hours);
      setShareUrl(data.url || `${window.location.origin.replace(/:\d+$/, ':3001')}/api/shares/${data.id}`);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to create share');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy to clipboard');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-lg p-6 max-w-md w-full border border-slate-700 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Share</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">
            ×
          </button>
        </div>
        {asset ? (
          <>
            <p className="text-slate-300 text-sm mb-4">
              Share &quot;{asset.originalName || asset.filename}&quot; via a link.
            </p>
            <div className="mb-4">
              <label className="text-slate-400 text-sm block mb-2">Link expires</label>
              <select
                value={expiresIn == null ? 'never' : expiresIn}
                onChange={(e) => setExpiresIn(e.target.value === 'never' ? null : Number(e.target.value))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white"
              >
                {EXPIRY_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value == null ? 'never' : opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
            {shareUrl && (
              <div className="mb-4 p-2 bg-slate-900 rounded text-slate-300 text-sm break-all">
                {shareUrl}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={shareUrl ? handleCopy : handleCreateLink}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium text-white disabled:opacity-50"
              >
                {loading ? 'Creating...' : shareUrl ? (copied ? 'Copied!' : 'Copy link') : 'Create link'}
              </button>
              {shareUrl && (
                <button
                  onClick={handleCreateLink}
                  disabled={loading}
                  className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg font-medium text-white"
                >
                  New link
                </button>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium text-white"
              >
                Close
              </button>
            </div>
          </>
        ) : (
          <p className="text-slate-400">No asset selected.</p>
        )}
      </div>
    </div>
  );
}
