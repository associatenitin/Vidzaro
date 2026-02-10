export default function AboutDialog({ isOpen, onClose }) {
  if (!isOpen) return null;

  const githubUrl = 'https://github.com/associatenitin';
  const linkedInUrl = 'https://www.linkedin.com/in/nitin-verma-61038614';
  const xUrl = 'https://x.com/Code_Nitin';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-lg border border-slate-700 shadow-xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-700 flex-shrink-0">
          <h2 className="text-xl font-bold text-white">About Vidzaro</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">
            ×
          </button>
        </div>

        <div className="p-6 space-y-4 text-sm">
          <p className="text-slate-200 font-medium text-base">
            Vidzaro — Edit videos. Zero limits.
          </p>
          <p className="text-slate-300">
            A free, web-based video editor. Upload or record, edit on a multi-track timeline with filters, text overlays, and AI features, then export or share.
          </p>

          <div className="pt-3 border-t border-slate-700">
            <p className="text-slate-400 text-xs mb-2">Created by</p>
            <p className="text-white font-semibold mb-1">Nitin Verma</p>
            <p className="text-slate-400 text-xs mb-3">💭 Learning & Building Everyday</p>
            <div className="flex flex-wrap gap-3">
              <a
                href={githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                GitHub
              </a>
              <a
                href={linkedInUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                LinkedIn
              </a>
              <a
                href={xUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                X / Twitter
              </a>
            </div>
          </div>

          <p className="text-slate-500 text-xs">
            Free and open-source. Built with React, FFmpeg, and optional AI services.
          </p>
        </div>

        <div className="p-4 border-t border-slate-700 flex justify-end flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium text-white">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
