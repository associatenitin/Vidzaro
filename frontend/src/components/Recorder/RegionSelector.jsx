import { useState, useRef, useEffect } from 'react';

/**
 * Shows the display stream and lets the user select a region to record.
 * Returns region in source video coordinates { x, y, width, height }.
 */
export default function RegionSelector({ displayStream, onConfirm, onCancel }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [videoSize, setVideoSize] = useState({ w: 0, h: 0 });
  const [region, setRegion] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(null);
  const dragStartRef = useRef({ x: 0, y: 0, left: 0, top: 0, width: 0, height: 0 });

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !displayStream) return;
    v.srcObject = displayStream;
    v.play().catch(() => {});
    const onLoaded = () => {
      if (v.videoWidth && v.videoHeight) {
        setVideoSize({ w: v.videoWidth, h: v.videoHeight });
        setRegion({
          x: 0,
          y: 0,
          width: v.videoWidth,
          height: v.videoHeight,
        });
      }
    };
    v.addEventListener('loadedmetadata', onLoaded);
    if (v.videoWidth) onLoaded();
    return () => {
      v.removeEventListener('loadedmetadata', onLoaded);
    };
  }, [displayStream]);

  const containerRect = containerRef.current?.getBoundingClientRect();
  const scaleX = containerRect && videoSize.w ? containerRect.width / videoSize.w : 1;
  const scaleY = containerRect && videoSize.h ? containerRect.height / videoSize.h : 1;
  const scale = Math.min(scaleX, scaleY);
  const offsetX = containerRect ? (containerRect.width - videoSize.w * scale) / 2 : 0;
  const offsetY = containerRect ? (containerRect.height - videoSize.h * scale) / 2 : 0;

  const regionToPx = (r) => {
    if (!r) return null;
    return {
      left: offsetX + r.x * scale,
      top: offsetY + r.y * scale,
      width: r.width * scale,
      height: r.height * scale,
    };
  };

  const pxToRegion = (left, top, width, height) => ({
    x: Math.round((left - offsetX) / scale),
    y: Math.round((top - offsetY) / scale),
    width: Math.round(width / scale),
    height: Math.round(height / scale),
  });

  const handleMouseDown = (e) => {
    e.preventDefault();
    if (!region || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const px = regionToPx(region);
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const edge = 12;
    const left = px.left, right = px.left + px.width, top = px.top, bottom = px.top + px.height;
    dragStartRef.current = { x, y, ...region };
    if (x >= left - edge && x <= left + edge && y >= top && y <= bottom) {
      setResizing('left');
      return;
    }
    if (x >= right - edge && x <= right + edge && y >= top && y <= bottom) {
      setResizing('right');
      return;
    }
    if (y >= top - edge && y <= top + edge && x >= left && x <= right) {
      setResizing('top');
      return;
    }
    if (y >= bottom - edge && y <= bottom + edge && x >= left && x <= right) {
      setResizing('bottom');
      return;
    }
    if (x >= left && x <= right && y >= top && y <= bottom) {
      setDragging(true);
    }
  };

  useEffect(() => {
    if (!dragging && !resizing) return;
    const onMove = (e) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const dx = x - dragStartRef.current.x;
      const dy = y - dragStartRef.current.y;
      const r = { ...dragStartRef.current };
      if (dragging) {
        let nx = r.x + dx / scale;
        let ny = r.y + dy / scale;
        nx = Math.max(0, Math.min(nx, videoSize.w - r.width));
        ny = Math.max(0, Math.min(ny, videoSize.h - r.height));
        setRegion({ ...r, x: nx, y: ny });
        dragStartRef.current = { x, y, x: nx, y: ny, width: r.width, height: r.height };
      } else {
        if (resizing === 'left') {
          const nw = r.width - dx / scale;
          if (nw > 40) setRegion((prev) => ({ ...prev, x: prev.x + dx / scale, width: nw }));
        } else if (resizing === 'right') {
          const nw = r.width + dx / scale;
          if (nw > 40) setRegion((prev) => ({ ...prev, width: Math.min(nw, videoSize.w - prev.x) }));
        } else if (resizing === 'top') {
          const nh = r.height - dy / scale;
          if (nh > 40) setRegion((prev) => ({ ...prev, y: prev.y + dy / scale, height: nh }));
        } else if (resizing === 'bottom') {
          const nh = r.height + dy / scale;
          if (nh > 40) setRegion((prev) => ({ ...prev, height: Math.min(nh, videoSize.h - prev.y) }));
        }
        dragStartRef.current = { x, y, ...r };
      }
    };
    const onUp = () => {
      setDragging(false);
      setResizing(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, resizing, scale, videoSize]);

  const px = regionToPx(region);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col p-6">
      <p className="text-slate-300 mb-2">Select the region to record, or use full frame.</p>
      <div
        ref={containerRef}
        className="flex-1 min-h-0 flex items-center justify-center bg-black rounded-lg overflow-hidden relative"
        onMouseDown={handleMouseDown}
      >
        <video
          ref={videoRef}
          className="max-h-full max-w-full object-contain"
          muted
          playsInline
        />
        {px && (
          <div
            className="absolute border-2 border-red-500 bg-red-500/20 cursor-move"
            style={{
              left: px.left,
              top: px.top,
              width: px.width,
              height: px.height,
            }}
          />
        )}
      </div>
      <div className="flex gap-3 justify-center mt-4">
        <button
          onClick={() => region && onConfirm(region)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium text-white"
        >
          Use selected region
        </button>
        <button
          onClick={() => region && onConfirm({ x: 0, y: 0, width: videoSize.w, height: videoSize.h })}
          className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg font-medium text-white"
        >
          Use full frame
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium text-white"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
