import { useRef, useCallback } from 'react';

/**
 * Manages drawing a display (and later webcam/key overlay) onto a canvas
 * and provides the canvas stream for MediaRecorder.
 * @param {{ width: number, height: number }} outputSize - Canvas output dimensions
 * @param {{ x: number, y: number, width: number, height: number } | null} cropRegion - Source region to crop (null = full frame)
 * @param {{ current: { pointerNorm: {x,y}, clicks: Array<{x,y,t}>, cursorHighlight: boolean, clickEffect: boolean, keyOverlay: boolean, keysPressed: Set<string> } } | null} overlayRef - Optional overlay state for cursor/click/keys
 * @param {{ video: HTMLVideoElement | null, position: string, size: number, shape: 'circle'|'square', blur: boolean }} webcamRef - Optional webcam video and options
 */
export function useRecordingCanvas(outputSize, cropRegion = null, overlayRef = null, webcamRef = null) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const displayVideoRef = useRef(null);
  const webcamOffscreenRef = useRef(null);

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const displayVideo = displayVideoRef.current;
    if (!canvas || !displayVideo || displayVideo.readyState < 2) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width: outW, height: outH } = outputSize || { width: 1280, height: 720 };
    const srcW = displayVideo.videoWidth;
    const srcH = displayVideo.videoHeight;
    if (srcW === 0 || srcH === 0) return;

    let sx = 0, sy = 0, sW = srcW, sH = srcH;
    if (cropRegion && cropRegion.width > 0 && cropRegion.height > 0) {
      sx = cropRegion.x;
      sy = cropRegion.y;
      sW = cropRegion.width;
      sH = cropRegion.height;
    }

    ctx.drawImage(displayVideo, sx, sy, sW, sH, 0, 0, outW, outH);

    const overlay = overlayRef?.current;
    if (overlay) {
      const now = Date.now();
      if (overlay.clicks) {
        overlay.clicks = overlay.clicks.filter((c) => now - c.t < 600);
      }
      if (overlay.clickEffect && overlay.clicks?.length) {
        overlay.clicks.forEach((c) => {
          const age = (now - c.t) / 1000;
          const radius = Math.min(80, age * 120);
          const alpha = Math.max(0, 1 - age * 2);
          ctx.strokeStyle = `rgba(100, 200, 255, ${alpha})`;
          ctx.lineWidth = 3;
          const cx = (c.x / (typeof window !== 'undefined' ? window.innerWidth : 1)) * outW;
          const cy = (c.y / (typeof window !== 'undefined' ? window.innerHeight : 1)) * outH;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.stroke();
        });
      }
      if (overlay.cursorHighlight && overlay.pointerNorm && overlay.pointerNorm.x >= 0 && overlay.pointerNorm.y >= 0) {
        const px = overlay.pointerNorm.x * outW;
        const py = overlay.pointerNorm.y * outH;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(px, py, 24, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (overlay.keyOverlay && overlay.keysPressed && overlay.keysPressed.size > 0) {
        const mods = [];
        if (overlay.keysPressed.has('Control')) mods.push('Ctrl');
        if (overlay.keysPressed.has('Alt')) mods.push('Alt');
        if (overlay.keysPressed.has('Shift')) mods.push('Shift');
        if (overlay.keysPressed.has('Meta')) mods.push('Win');
        const rest = [...overlay.keysPressed].filter((k) => !['Control', 'Alt', 'Shift', 'Meta'].includes(k));
        const label = [...mods, ...rest].join(' + ');
        const pad = 12;
        const fontSize = 20;
        ctx.font = `${fontSize}px sans-serif`;
        const metrics = ctx.measureText(label);
        const boxW = metrics.width + pad * 2;
        const boxH = fontSize + pad;
        const x = 16;
        const y = outH - boxH - 16;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, boxW, boxH, 6);
        else { ctx.rect(x, y, boxW, boxH); }
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillText(label, x + pad, y + fontSize + pad / 2 - 2);
      }
    }

    const webcam = webcamRef?.current;
    if (webcam?.video && webcam.video.readyState >= 2 && webcam.video.videoWidth > 0) {
      const pos = webcam.position || 'bottom-right';
      const size = webcam.size || 160;
      const shape = webcam.shape || 'circle';
      const blur = webcam.blur;
      let x = 0, y = 0;
      const pad = 16;
      if (pos === 'bottom-right') { x = outW - size - pad; y = outH - size - pad; }
      else if (pos === 'bottom-left') { x = pad; y = outH - size - pad; }
      else if (pos === 'top-right') { x = outW - size - pad; y = pad; }
      else { x = pad; y = pad; }

      const w = size, h = size;
      if (!webcamOffscreenRef.current || webcamOffscreenRef.current.width !== w) {
        webcamOffscreenRef.current = document.createElement('canvas');
        webcamOffscreenRef.current.width = w;
        webcamOffscreenRef.current.height = h;
      }
      const off = webcamOffscreenRef.current;
      const octx = off.getContext('2d');
      if (!octx) return;
      octx.drawImage(webcam.video, 0, 0, w, h);

      ctx.save();
      if (shape === 'circle') {
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, w / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
      }
      if (blur) {
        ctx.filter = 'blur(8px)';
        ctx.drawImage(off, 0, 0, w, h, x, y, w, h);
        ctx.filter = 'none';
      }
      ctx.drawImage(off, 0, 0, w, h, x, y, w, h);
      ctx.restore();
    }
  }, [outputSize, cropRegion, overlayRef, webcamRef]);

  const startDrawLoop = useCallback((fps = 30) => {
    const interval = 1000 / fps;
    let last = performance.now();
    const loop = (now) => {
      animationRef.current = requestAnimationFrame(loop);
      if (now - last >= interval) {
        last = now;
        drawFrame();
      }
    };
    animationRef.current = requestAnimationFrame(loop);
  }, [drawFrame]);

  const stopDrawLoop = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }, []);

  const setDisplaySource = useCallback((videoElement) => {
    displayVideoRef.current = videoElement;
  }, []);

  /**
   * Get a capture stream from the canvas at the given fps.
   */
  const getCaptureStream = useCallback((fps = 30) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.captureStream(fps);
  }, []);

  return {
    canvasRef,
    setDisplaySource,
    startDrawLoop,
    stopDrawLoop,
    drawFrame,
    getCaptureStream,
  };
}
