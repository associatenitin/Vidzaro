export default function Toolbar({ onSplit, currentTime, isPlaying, onPlayPause, activeTool, onToolChange, onUndo, onRedo, canUndo, canRedo, onOpenPreferences, onAIEnhance, onGenAI, genAIProgress }) {
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center gap-4 relative z-10">
      <button
        onClick={() => onPlayPause(!isPlaying)}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium flex items-center gap-2"
      >
        {isPlaying ? (
          <>
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6 4h2v12H6V4zm6 0h2v12h-2V4z" />
            </svg>
            Pause
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
            </svg>
            Play
          </>
        )}
      </button>

      <div className="flex items-center gap-2 text-sm text-slate-400 font-mono w-24">
        <span>{formatTime(currentTime)}</span>
      </div>

      {/* Undo/Redo */}
      <div className="flex bg-slate-700/50 rounded-lg p-1 gap-1">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className={`p-1.5 rounded ${canUndo ? 'text-slate-300 hover:text-white hover:bg-slate-600' : 'text-slate-600 cursor-not-allowed'}`}
          title="Undo (Ctrl+Z)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className={`p-1.5 rounded ${canRedo ? 'text-slate-300 hover:text-white hover:bg-slate-600' : 'text-slate-600 cursor-not-allowed'}`}
          title="Redo (Ctrl+Shift+Z)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>
        </button>
      </div>

      <div className="h-6 w-px bg-slate-700"></div>

      {/* Tools */}
      <div className="flex bg-slate-700/50 rounded-lg p-1 gap-1">
        <button
          onClick={() => onToolChange && onToolChange('select')}
          className={`p-1.5 rounded ${activeTool === 'select' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-600'}`}
          title="Selection Tool (V)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg>
        </button>
        <button
          onClick={() => onToolChange && onToolChange('ripple')}
          className={`p-1.5 rounded ${activeTool === 'ripple' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-600'}`}
          title="Ripple Edit (B)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
        </button>
      </div>

      <div className="h-6 w-px bg-slate-700"></div>

      {/* AI Enhance Button */}
      {onAIEnhance && (
        <button
          onClick={onAIEnhance}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium flex items-center gap-2"
          title="AI Enhance Video Clarity"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
          AI Enhance
        </button>
      )}

      {/* Gen AI Button */}
      {onGenAI && (
        <button
          onClick={onGenAI}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg font-medium flex items-center gap-2"
          title="Generate AI Video (Wan 2.1)"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Gen AI
        </button>
      )}

      {/* Gen AI progress indicator */}
      {genAIProgress && (
        <div className="flex items-center gap-3 px-3 py-1.5 bg-slate-900/80 rounded-lg border border-slate-600 min-w-[180px]">
          <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex justify-between text-xs mb-0.5">
              <span className="text-slate-400 truncate">Gen AI</span>
              <span className="text-emerald-400 font-medium">{Math.round(genAIProgress.progress || 0)}%</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, genAIProgress.progress || 0))}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex-1"></div>

      {/* Preferences */}
      <button
        type="button"
        onClick={() => onOpenPreferences?.()}
        className="p-2 rounded text-slate-400 hover:text-white hover:bg-slate-600"
        title="Preferences"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      <button
        onClick={onSplit}
        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium flex items-center gap-2"
        title="Split at playhead"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Split
      </button>
    </div>
  );
}
