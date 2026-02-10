import React, { useState, useMemo } from 'react';

export default function TextOverlayManager({
  project,
  currentTime,
  onAddGlobalOverlay,
  onUpdateGlobalOverlay,
  onRemoveGlobalOverlay,
  onEditOverlayPosition,
}) {
  const overlays = project.textOverlays || [];
  const [searchQuery, setSearchQuery] = useState('');
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

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

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Filter and sort overlays
  const filteredOverlays = useMemo(() => {
    let filtered = overlays.slice();

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (ov) =>
          (ov.text || '').toLowerCase().includes(query) ||
          formatTime(ov.startTime ?? 0).includes(query) ||
          formatTime(ov.endTime ?? 0).includes(query)
      );
    }

    // Filter by active status
    if (showActiveOnly) {
      filtered = filtered.filter((ov) => {
        const start = ov.startTime ?? 0;
        const end = ov.endTime ?? 0;
        return currentTime >= start && currentTime <= end;
      });
    }

    // Sort by start time
    return filtered.sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));
  }, [overlays, searchQuery, showActiveOnly, currentTime]);

  const isOverlayActive = (overlay) => {
    const start = overlay.startTime ?? 0;
    const end = overlay.endTime ?? 0;
    return currentTime >= start && currentTime <= end;
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-200 uppercase tracking-wider">
            Global Text Overlays ({overlays.length})
          </span>
          {overlays.length > 0 && (
            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 hover:text-slate-200"
              title={isCollapsed ? 'Expand' : 'Collapse'}
            >
              {isCollapsed ? '▶' : '▼'}
            </button>
          )}
        </div>
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
      ) : !isCollapsed ? (
        <>
          {/* Search and Filter Controls */}
          <div className="flex items-center gap-2 mb-2">
            <input
              type="text"
              placeholder="Search overlays..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-slate-800 text-slate-100 text-[11px] border border-slate-700 rounded px-2 py-1 outline-none focus:border-cyan-500/60 placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={() => setShowActiveOnly(!showActiveOnly)}
              className={`text-[10px] px-2 py-1 rounded ${
                showActiveOnly
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
              title="Show only active overlays"
            >
              Active
            </button>
          </div>

          {/* Overlay List */}
          {filteredOverlays.length === 0 ? (
            <p className="text-[11px] text-slate-500 text-center py-2">
              {searchQuery || showActiveOnly
                ? 'No overlays match your filters.'
                : 'No overlays found.'}
            </p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
              {filteredOverlays.map((overlay) => {
                const active = isOverlayActive(overlay);
                return (
                  <div
                    key={overlay.id}
                    className={`flex items-center gap-2 text-[11px] bg-slate-800/80 border rounded px-2 py-1.5 ${
                      active
                        ? 'border-cyan-500/50 bg-cyan-900/20'
                        : 'border-slate-700'
                    }`}
                  >
                    {/* Active Indicator */}
                    <div
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        active ? 'bg-cyan-400' : 'bg-slate-600'
                      }`}
                      title={active ? 'Currently active' : 'Inactive'}
                    />

                    <input
                      type="text"
                      placeholder="Text..."
                      value={overlay.text || ''}
                      onChange={(e) =>
                        onUpdateGlobalOverlay &&
                        onUpdateGlobalOverlay(overlay.id, { text: e.target.value })
                      }
                      className="flex-1 bg-slate-900 text-slate-100 border border-slate-700 rounded px-2 py-0.5 outline-none focus:border-cyan-500/60 text-[11px]"
                    />
                    <div className="flex items-center gap-1 text-[10px] text-slate-400">
                      <span>Start</span>
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
                        className="w-16 bg-slate-900 text-slate-100 border border-slate-700 rounded px-1 py-0.5 outline-none focus:border-cyan-500/60"
                      />
                      <span>End</span>
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
                        className="w-16 bg-slate-900 text-slate-100 border border-slate-700 rounded px-1 py-0.5 outline-none focus:border-cyan-500/60"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onEditOverlayPosition && onEditOverlayPosition(overlay.id)
                      }
                      className="px-2 py-0.5 rounded bg-slate-700 text-slate-200 hover:bg-slate-600 text-[10px]"
                      title="Position on video"
                    >
                      Position
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onRemoveGlobalOverlay && onRemoveGlobalOverlay(overlay.id)
                      }
                      className="px-2 py-0.5 rounded bg-red-600 text-white hover:bg-red-500 text-[11px]"
                      title="Delete overlay"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="text-[11px] text-slate-500 py-1">
          {overlays.length} overlay{overlays.length !== 1 ? 's' : ''} •{' '}
          {overlays.filter(isOverlayActive).length} active
        </div>
      )}
    </div>
  );
}

