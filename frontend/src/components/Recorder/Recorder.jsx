import { useState, useRef, useEffect } from 'react';
import { useRecordingPipeline } from '../../hooks/useRecordingPipeline';
import { useRecordingAudio, requestMicrophone } from '../../hooks/useRecordingAudio';
import RecorderOverlay from './RecorderOverlay';
import RegionSelector from './RegionSelector';

const RESOLUTIONS = [
  { label: '720p', width: 1280, height: 720 },
  { label: '1080p', width: 1920, height: 1080 },
  { label: '4K', width: 3840, height: 2160 },
];

const FPS_OPTIONS = [15, 30, 60];
const BITRATE_OPTIONS = [
  { label: 'Low', value: 1500000 },
  { label: 'Medium', value: 4000000 },
  { label: 'High', value: 8000000 },
];

export default function Recorder({ onClose, onRecordingComplete }) {
  const [step, setStep] = useState('setup'); // setup | region | countdown | recording | preview
  const [displayStream, setDisplayStream] = useState(null);
  const [cropRegion, setCropRegion] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [webcamPreviewStream, setWebcamPreviewStream] = useState(null);
  const elapsedIntervalRef = useRef(null);
  const micStreamRef = useRef(null);

  const [settings, setSettings] = useState({
    systemAudio: true,
    mic: true,
    cameraDeviceId: '',
    audioDeviceId: '',
    systemVolume: 1,
    micVolume: 1,
    noiseSuppression: true,
    captureRegion: false,
    cursorVisible: true,
    cursorHighlight: false,
    clickEffect: false,
    keyOverlay: false,
    webcam: false,
    webcamPosition: 'bottom-right',
    webcamSize: 160,
    webcamShape: 'circle',
    outputFormat: 'mp4',
    fps: 30,
    resolutionIndex: 0,
    bitrateIndex: 1,
  });

  const [devices, setDevices] = useState({ cameras: [], microphones: [] });
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        if (!mounted) return;
        setDevices({
          cameras: list.filter((d) => d.kind === 'videoinput'),
          microphones: list.filter((d) => d.kind === 'audioinput'),
        });
      } catch (e) {
        console.warn('Failed to enumerate devices:', e);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  const resolution = RESOLUTIONS[settings.resolutionIndex] || RESOLUTIONS[0];
  const bitrate = BITRATE_OPTIONS[settings.bitrateIndex]?.value ?? 4000000;

  const overlayRef = useRef({
    pointerNorm: { x: -1, y: -1 },
    clicks: [],
    cursorHighlight: false,
    clickEffect: false,
    keyOverlay: false,
    keysPressed: new Set(),
  });
  const webcamRef = useRef({ video: null, position: 'bottom-right', size: 160, shape: 'circle' });
  const webcamStreamRef = useRef(null);

  const pipeline = useRecordingPipeline({
    width: resolution.width,
    height: resolution.height,
    fps: settings.fps,
    videoBitsPerSecond: bitrate,
    cursor: settings.cursorVisible ? 'always' : 'never',
    cropRegion: cropRegion,
    overlayRef: (settings.cursorHighlight || settings.clickEffect || settings.keyOverlay) ? overlayRef : null,
    webcamRef: settings.webcam ? webcamRef : null,
  });

  const audio = useRecordingAudio();

  const {
    state,
    error,
    recordedBlob,
    canvasRef,
    requestDisplay,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    getElapsedSeconds,
    reset,
  } = pipeline;

  // Elapsed timer during recording
  useEffect(() => {
    if (state === 'recording' || state === 'paused') {
      const tick = () => setElapsed(pipeline.getElapsedSeconds());
      elapsedIntervalRef.current = setInterval(tick, 500);
      return () => {
        if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
      };
    }
  }, [state, pipeline]);

  // Pointer and keyboard overlay (when recording this tab)
  useEffect(() => {
    if (step !== 'recording') return;
    const showOverlay = settings.cursorHighlight || settings.clickEffect || settings.keyOverlay;
    if (!showOverlay) return;
    overlayRef.current.cursorHighlight = settings.cursorHighlight;
    overlayRef.current.clickEffect = settings.clickEffect;
    overlayRef.current.keyOverlay = settings.keyOverlay;
    if (overlayRef.current.keysPressed) overlayRef.current.keysPressed.clear();

    const onMove = (e) => {
      overlayRef.current.pointerNorm = {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      };
    };
    const onDown = (e) => {
      if (settings.clickEffect && overlayRef.current.clicks) {
        overlayRef.current.clicks.push({ x: e.clientX, y: e.clientY, t: Date.now() });
      }
      if (settings.keyOverlay && overlayRef.current.keysPressed) {
        const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
        overlayRef.current.keysPressed.add(key);
      }
    };
    const onUp = (e) => {
      if (settings.keyOverlay && overlayRef.current.keysPressed) {
        const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
        overlayRef.current.keysPressed.delete(key);
      }
    };
    const onBlur = () => {
      if (overlayRef.current.keysPressed) overlayRef.current.keysPressed.clear();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [step, settings.cursorHighlight, settings.clickEffect, settings.keyOverlay]);

  // In-app hotkey: Ctrl+Shift+R to stop recording
  useEffect(() => {
    if (step !== 'recording') return;
    const onKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        handleStop();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [step, state]);

  const handleStartCapture = async () => {
    try {
      const stream = await requestDisplay(settings.systemAudio);
      setDisplayStream(stream);
      setCropRegion(null);
      setStep(settings.captureRegion ? 'region' : 'countdown');
    } catch {
      // Error already set in pipeline
    }
  };

  const handleCountdownComplete = async () => {
    setStep('recording');
    let audioStream = null;
    if (settings.mic) {
      try {
        micStreamRef.current = await requestMicrophone({
          noiseSuppression: settings.noiseSuppression,
          deviceId: settings.audioDeviceId || undefined,
        });
      } catch (e) {
        console.warn('Mic access failed:', e);
      }
    }
    const hasSystemAudio = settings.systemAudio && displayStream && displayStream.getAudioTracks().length > 0;
    if (hasSystemAudio || (micStreamRef.current && micStreamRef.current.getAudioTracks().length > 0)) {
      audioStream = await audio.startMixing(displayStream, micStreamRef.current || null, {
        systemVolume: settings.systemVolume,
        micVolume: settings.micVolume,
        noiseSuppression: settings.noiseSuppression,
      });
    }
    let wcStream = null;
    if (settings.webcam) {
      try {
        const videoConstraints = settings.cameraDeviceId
          ? { video: { deviceId: { exact: settings.cameraDeviceId } } }
          : { video: true };
        webcamStreamRef.current = await navigator.mediaDevices.getUserMedia(videoConstraints);
        wcStream = webcamStreamRef.current;
        setWebcamPreviewStream(wcStream);
      } catch (e) {
        console.warn('Webcam access failed:', e);
      }
    }
    await startRecording(displayStream, audioStream, wcStream, {
      position: settings.webcamPosition,
      size: settings.webcamSize,
      shape: settings.webcamShape,
    });
  };

  const handleStop = () => {
    stopRecording();
    setStep('preview');
    setWebcamPreviewStream(null);
    audio.stop();
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach((t) => t.stop());
      webcamStreamRef.current = null;
    }
  };

  useEffect(() => {
    if (state === 'stopped' && recordedBlob) {
      setStep('preview');
    }
  }, [state, recordedBlob]);

  const selectClass = 'w-full bg-slate-800/80 border border-slate-600/80 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 transition-colors';
  const labelClass = 'flex items-center gap-3 cursor-pointer text-slate-200 hover:text-white transition-colors';
  const checkboxClass = 'w-4 h-4 rounded border-slate-500 bg-slate-800 text-red-500 focus:ring-2 focus:ring-red-500/50 focus:ring-offset-0 focus:ring-offset-slate-900 border-slate-600';

  if (step === 'setup') {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 overflow-auto">
        <div className="w-full max-w-2xl">
          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="text-3xl font-semibold text-white tracking-tight mb-2">Screen Recording</h2>
            <p className="text-slate-400 text-sm max-w-md mx-auto">
              Configure your recording. You'll pick screen, window, or tab in the next step.
            </p>
          </div>

          {/* Main content grid */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* Audio section */}
            <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider mb-4">Audio</h3>
              <label className={labelClass}>
                <input type="checkbox" checked={settings.systemAudio} onChange={(e) => setSettings((s) => ({ ...s, systemAudio: e.target.checked }))} className={checkboxClass} />
                <span>System audio</span>
              </label>
              <label className={labelClass}>
                <input type="checkbox" checked={settings.mic} onChange={(e) => setSettings((s) => ({ ...s, mic: e.target.checked }))} className={checkboxClass} />
                <span>Microphone</span>
              </label>
              {settings.mic && devices.microphones.length > 0 && (
                <div>
                  <label className="text-slate-400 text-xs font-medium uppercase tracking-wider block mb-2">Audio source</label>
                  <select value={settings.audioDeviceId} onChange={(e) => setSettings((s) => ({ ...s, audioDeviceId: e.target.value }))} className={selectClass}>
                    <option value="">Default</option>
                    {devices.microphones.map((d, i) => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>
                    ))}
                  </select>
                </div>
              )}
              {settings.systemAudio && (
                <div>
                  <label className="text-slate-400 text-xs font-medium uppercase tracking-wider block mb-2">System volume · {Math.round(settings.systemVolume * 100)}%</label>
                  <input type="range" min="0" max="1" step="0.05" value={settings.systemVolume} onChange={(e) => setSettings((s) => ({ ...s, systemVolume: +e.target.value }))} className="recorder-range w-full h-2" />
                </div>
              )}
              {settings.mic && (
                <>
                  <div>
                    <label className="text-slate-400 text-xs font-medium uppercase tracking-wider block mb-2">Mic volume · {Math.round(settings.micVolume * 100)}%</label>
                    <input type="range" min="0" max="1" step="0.05" value={settings.micVolume} onChange={(e) => setSettings((s) => ({ ...s, micVolume: +e.target.value }))} className="recorder-range w-full h-2" />
                  </div>
                  <label className={labelClass}>
                    <input type="checkbox" checked={settings.noiseSuppression} onChange={(e) => setSettings((s) => ({ ...s, noiseSuppression: e.target.checked }))} className={checkboxClass} />
                    <span>Noise suppression</span>
                  </label>
                </>
              )}
            </div>

            {/* Display & cursor section */}
            <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider mb-4">Display & cursor</h3>
              <label className={labelClass}>
                <input type="checkbox" checked={settings.captureRegion} onChange={(e) => setSettings((s) => ({ ...s, captureRegion: e.target.checked }))} className={checkboxClass} />
                <span>Select custom region</span>
              </label>
              <label className={labelClass}>
                <input type="checkbox" checked={settings.cursorVisible} onChange={(e) => setSettings((s) => ({ ...s, cursorVisible: e.target.checked }))} className={checkboxClass} />
                <span>Show cursor</span>
              </label>
              <label className={labelClass}>
                <input type="checkbox" checked={settings.cursorHighlight} onChange={(e) => setSettings((s) => ({ ...s, cursorHighlight: e.target.checked }))} className={checkboxClass} />
                <span>Cursor highlight</span>
              </label>
              <label className={labelClass}>
                <input type="checkbox" checked={settings.clickEffect} onChange={(e) => setSettings((s) => ({ ...s, clickEffect: e.target.checked }))} className={checkboxClass} />
                <span>Click effect</span>
              </label>
              <label className={labelClass}>
                <input type="checkbox" checked={settings.keyOverlay} onChange={(e) => setSettings((s) => ({ ...s, keyOverlay: e.target.checked }))} className={checkboxClass} />
                <span>Show keyboard shortcuts</span>
              </label>
            </div>
          </div>

          {/* Webcam section */}
          <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-5 mb-6">
            <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider mb-4">Webcam overlay</h3>
            <label className={`${labelClass} mb-4`}>
              <input type="checkbox" checked={settings.webcam} onChange={(e) => setSettings((s) => ({ ...s, webcam: e.target.checked }))} className={checkboxClass} />
              <span>Enable webcam overlay</span>
            </label>
            {settings.webcam && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 pl-7 border-l-2 border-slate-600/50">
                {devices.cameras.length > 0 && (
                  <div>
                    <label className="text-slate-400 text-xs font-medium uppercase tracking-wider block mb-2">Camera</label>
                    <select value={settings.cameraDeviceId} onChange={(e) => setSettings((s) => ({ ...s, cameraDeviceId: e.target.value }))} className={selectClass}>
                      <option value="">Default</option>
                      {devices.cameras.map((d, i) => (
                        <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="text-slate-400 text-xs font-medium uppercase tracking-wider block mb-2">Position</label>
                  <select value={settings.webcamPosition} onChange={(e) => setSettings((s) => ({ ...s, webcamPosition: e.target.value }))} className={selectClass}>
                    <option value="top-left">Top left</option>
                    <option value="top-right">Top right</option>
                    <option value="bottom-left">Bottom left</option>
                    <option value="bottom-right">Bottom right</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 text-xs font-medium uppercase tracking-wider block mb-2">Shape</label>
                  <select value={settings.webcamShape} onChange={(e) => setSettings((s) => ({ ...s, webcamShape: e.target.value }))} className={selectClass}>
                    <option value="circle">Circle</option>
                    <option value="square">Square</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Output settings */}
          <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-5 mb-6">
            <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider mb-4">Output</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-slate-400 text-xs font-medium uppercase tracking-wider block mb-2">Format</label>
                <select value={settings.outputFormat} onChange={(e) => setSettings((s) => ({ ...s, outputFormat: e.target.value }))} className={selectClass}>
                  <option value="mp4">MP4</option>
                  <option value="webm">WebM</option>
                  <option value="mkv">MKV</option>
                </select>
              </div>
              <div>
                <label className="text-slate-400 text-xs font-medium uppercase tracking-wider block mb-2">Frame rate</label>
                <select value={settings.fps} onChange={(e) => setSettings((s) => ({ ...s, fps: +e.target.value }))} className={selectClass}>
                  {FPS_OPTIONS.map((f) => (
                    <option key={f} value={f}>{f} fps</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-slate-400 text-xs font-medium uppercase tracking-wider block mb-2">Resolution</label>
                <select value={settings.resolutionIndex} onChange={(e) => setSettings((s) => ({ ...s, resolutionIndex: +e.target.value }))} className={selectClass}>
                  {RESOLUTIONS.map((r, i) => (
                    <option key={r.label} value={i}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-slate-400 text-xs font-medium uppercase tracking-wider block mb-2">Quality</label>
                <select value={settings.bitrateIndex} onChange={(e) => setSettings((s) => ({ ...s, bitrateIndex: +e.target.value }))} className={selectClass}>
                  {BITRATE_OPTIONS.map((b, i) => (
                    <option key={b.label} value={i}>{b.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {error && (
            <p className="text-red-400 mb-4 text-sm px-1">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <button onClick={onClose} className="px-5 py-2.5 bg-slate-700/60 hover:bg-slate-600/80 border border-slate-600/80 rounded-lg font-medium text-slate-200 hover:text-white transition-colors">
              Cancel
            </button>
            <button onClick={handleStartCapture} className="px-6 py-2.5 bg-red-600 hover:bg-red-500 rounded-lg font-medium text-white shadow-lg shadow-red-900/20 transition-colors flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
              Start recording
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'region') {
    return (
      <RegionSelector
        displayStream={displayStream}
        onConfirm={(region) => {
          setCropRegion(region);
          setStep('countdown');
        }}
        onCancel={() => {
          if (displayStream) displayStream.getTracks().forEach((t) => t.stop());
          setDisplayStream(null);
          setStep('setup');
        }}
      />
    );
  }

  if (step === 'countdown') {
    return (
      <CountdownScreen
        onComplete={handleCountdownComplete}
        onCancel={() => {
          if (displayStream) displayStream.getTracks().forEach((t) => t.stop());
          if (micStreamRef.current) micStreamRef.current.getTracks().forEach((t) => t.stop());
          micStreamRef.current = null;
          setDisplayStream(null);
          setCropRegion(null);
          setStep('setup');
        }}
      />
    );
  }

  if (step === 'recording') {
    return (
      <>
        {/* Hidden canvas for capture */}
        <canvas
          ref={canvasRef}
          width={resolution.width}
          height={resolution.height}
          className="hidden"
          style={{ position: 'absolute', left: -9999 }}
        />
        <RecorderOverlay
          isPaused={state === 'paused'}
          elapsedSeconds={elapsed}
          micLevel={audio.micLevel}
          onStop={handleStop}
          onPause={pauseRecording}
          onResume={resumeRecording}
          webcamStream={webcamPreviewStream}
          webcamPosition={settings.webcamPosition}
          webcamSize={settings.webcamSize}
          webcamShape={settings.webcamShape}
        />
      </>
    );
  }

  if (step === 'preview') {
    return (
      <PreviewStep
        blob={recordedBlob}
        outputOptions={{
          format: settings.outputFormat,
          fps: settings.fps,
          width: resolution.width,
          height: resolution.height,
          bitrate,
        }}
        onReRecord={() => {
          reset();
          setDisplayStream(null);
          setStep('setup');
        }}
        onAddToProject={(saveOptions) => {
          if (recordedBlob && onRecordingComplete) onRecordingComplete(recordedBlob, saveOptions);
          onClose();
        }}
        onClose={onClose}
      />
    );
  }

  return null;
}

function CountdownScreen({ onComplete, onCancel }) {
  const [count, setCount] = useState(3);

  useEffect(() => {
    if (count <= 0) {
      onComplete();
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count, onComplete]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center">
      <p className="text-white text-6xl font-bold mb-6">
        {count > 0 ? count : 'Go!'}
      </p>
      <button
        onClick={onCancel}
        className="text-slate-400 hover:text-white text-sm"
      >
        Cancel
      </button>
    </div>
  );
}

function PreviewStep({ blob, outputOptions, onReRecord, onAddToProject, onClose }) {
  const url = blob ? URL.createObjectURL(blob) : null;
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [saving, setSaving] = useState(false);
  const videoRef = useRef(null);

  const handleAddToProject = async () => {
    if (!blob || !outputOptions) return;
    setSaving(true);
    try {
      const saveOptions = {
        trimStart: trimStart > 0 ? trimStart : undefined,
        trimEnd: duration > 0 && trimEnd < duration ? trimEnd : undefined,
        format: outputOptions.format,
        fps: outputOptions.fps,
        width: outputOptions.width,
        height: outputOptions.height,
        bitrate: outputOptions.bitrate,
      };
      onAddToProject(saveOptions);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  useEffect(() => {
    if (!videoRef.current || !url) return;
    const v = videoRef.current;
    const onLoaded = () => {
      const d = v.duration;
      if (Number.isFinite(d)) {
        setDuration(d);
        setTrimEnd(d);
      }
    };
    v.addEventListener('loadedmetadata', onLoaded);
    if (v.duration && Number.isFinite(v.duration)) {
      setDuration(v.duration);
      setTrimEnd(v.duration);
    }
    return () => v.removeEventListener('loadedmetadata', onLoaded);
  }, [url]);

  if (!url) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400">Processing...</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col p-6">
      <h2 className="text-xl font-bold text-white mb-4">Preview recording</h2>
      <div className="flex-1 flex items-center justify-center min-h-0 mb-4">
        <video
          ref={videoRef}
          src={url}
          controls
          className="max-w-full max-h-full rounded-lg bg-black"
          playsInline
        />
      </div>
      {duration > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-slate-400 text-sm">Trim (optional)</p>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              Start (s)
              <input
                type="number"
                min={0}
                max={duration}
                step={0.1}
                value={trimStart.toFixed(1)}
                onChange={(e) => setTrimStart(Math.max(0, Math.min(parseFloat(e.target.value) || 0, trimEnd)))}
                className="w-20 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              End (s)
              <input
                type="number"
                min={trimStart}
                max={duration}
                step={0.1}
                value={trimEnd.toFixed(1)}
                onChange={(e) => setTrimEnd(Math.max(trimStart, Math.min(parseFloat(e.target.value) || duration, duration)))}
                className="w-20 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white"
              />
            </label>
          </div>
        </div>
      )}
      <div className="flex gap-3 justify-center">
        <button
          onClick={onReRecord}
          disabled={saving}
          className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg font-medium text-white disabled:opacity-50"
        >
          Re-record
        </button>
        <button
          onClick={handleAddToProject}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium text-white disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Add to project'}
        </button>
        <button
          onClick={onClose}
          disabled={saving}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium text-white disabled:opacity-50"
        >
          Close
        </button>
      </div>
    </div>
  );
}
