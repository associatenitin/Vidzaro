import React from 'react';

export default function TextOverlayManager({
  project,
  currentTime,
  onAddGlobalOverlay,
  onUpdateGlobalOverlay,
  onRemoveGlobalOverlay,
  onEditOverlayPosition,
}) {
  const overlays = project.textOverlays || [];

  const handleAdd = () => {
    if (!onAddGlobalOverlay) return;
    const start = currentTime || 0;
    const end = start + 3;
    onAddGlobalOverlay({
      text: '',
      x: 50,
      y: 50,
      size: '4xl',
      color: '#ffffff',
      animation: 'none',
      positionMode: 'percentage',
      startTime: start,
      endTime: end,
    });
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-semibold text-slate-200 uppercase tracking-wider">
          Global Text Overlays
        </span>
        <button
          type="button"
          onClick={handleAdd}
          className="text-[11px] px-2 py-1 rounded-md bg-slate-700 text-slate-200 hover:bg-slate-600"
        >
          + Add Global Overlay
        </button>
      </div>

      {overlays.length === 0 ? (
        <p className="text-[11px] text-slate-500">
          No global overlays. Add one to place text over the entire video, independent of clips.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
          {overlays
            .slice()
            .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))
            .map((overlay) => (
              <div
                key={overlay.id}
                className="flex items-center gap-2 text-[11px] bg-slate-800/80 border border-slate-700 rounded px-2 py-1.5"
              >
                <input
                  type="text"
                  placeholder="Text..."
                  value={overlay.text || ''}
                  onChange={(e) =>
                    onUpdateGlobalOverlay &&
                    onUpdateGlobalOverlay(overlay.id, { text: e.target.value })
                  }
                  className="flex-1 bg-slate-900 text-slate-100 border border-slate-700 rounded px-2 py-0.5 outline-none focus:border-cyan-500/60"
                />
                <div className="flex items-center gap-1">
                  <span className="text-slate-400">Start</span>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={overlay.startTime ?? 0}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      onUpdateGlobalOverlay &&
                        onUpdateGlobalOverlay(overlay.id, { startTime: Math.max(0, v) });
                    }}
                    className="w-14 bg-slate-900 text-slate-100 border border-slate-700 rounded px-1 py-0.5 outline-none focus:border-cyan-500/60"
                  />
                  <span className="text-slate-400">End</span>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={overlay.endTime ?? (overlay.startTime ?? 0) + 3}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      onUpdateGlobalOverlay &&
                        onUpdateGlobalOverlay(overlay.id, {
                          endTime: Math.max(overlay.startTime ?? 0, v),
                        });
                    }}
                    className="w-14 bg-slate-900 text-slate-100 border border-slate-700 rounded px-1 py-0.5 outline-none focus:border-cyan-500/60"
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onEditOverlayPosition && onEditOverlayPosition(overlay.id)
                  }
                  className="px-2 py-0.5 rounded bg-slate-700 text-slate-200 hover:bg-slate-600"
                >
                  Position
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onRemoveGlobalOverlay && onRemoveGlobalOverlay(overlay.id)
                  }
                  className="px-2 py-0.5 rounded bg-red-600 text-white hover:bg-red-500"
                >
                  ×
                </button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

