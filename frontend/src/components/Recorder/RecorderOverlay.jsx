import { useState, useEffect } from 'react';

export default function RecorderOverlay({
  isPaused,
  elapsedSeconds,
  micLevel = 0,
  onStop,
  onPause,
  onResume,
}) {
  const [displayTime, setDisplayTime] = useState('00:00');

  useEffect(() => {
    const totalSec = Math.floor(elapsedSeconds);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    setDisplayTime(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
  }, [elapsedSeconds]);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-4 px-4 py-3 bg-slate-800/95 border border-slate-600 rounded-xl shadow-xl">
      {/* Timer */}
      <span className="font-mono text-lg font-medium text-white tabular-nums min-w-[4rem]">
        {displayTime}
      </span>
      {/* Mic level indicator */}
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-8 bg-slate-700 rounded-full overflow-hidden flex flex-col-reverse">
          <div
            className="w-full bg-green-500 transition-all duration-150"
            style={{ height: `${Math.min(100, micLevel * 100)}%` }}
          />
        </div>
        <span className="text-xs text-slate-400">Mic</span>
      </div>
      {/* Pause / Resume */}
      <button
        type="button"
        onClick={isPaused ? onResume : onPause}
        className="px-3 py-1.5 rounded-lg bg-slate-600 hover:bg-slate-500 text-white text-sm font-medium"
      >
        {isPaused ? 'Resume' : 'Pause'}
      </button>
      {/* Stop */}
      <button
        type="button"
        onClick={onStop}
        className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium"
      >
        Stop
      </button>
      <span className="text-slate-500 text-xs hidden sm:inline">Ctrl+Shift+R</span>
    </div>
  );
}
