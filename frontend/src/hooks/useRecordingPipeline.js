import { useState, useRef, useCallback } from 'react';
import { useRecordingCanvas } from './useRecordingCanvas';

/**
 * Coordinates: getDisplayMedia -> video element -> canvas draw loop -> captureStream -> MediaRecorder.
 * Returns blob on stop. No audio in this hook (added in useRecordingAudio integration).
 */
export function useRecordingPipeline(options = {}) {
  const {
    width = 1280,
    height = 720,
    fps = 30,
    videoBitsPerSecond = 2500000,
    cropRegion = null,
    cursor = 'always',
    overlayRef = null,
    webcamRef = null,
  } = options;

  const [state, setState] = useState('idle'); // idle | requesting | recording | paused | stopped
  const [error, setError] = useState(null);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const recordingStartTimeRef = useRef(null);

  const displayStreamRef = useRef(null);
  const displayVideoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const {
    canvasRef,
    setDisplaySource,
    startDrawLoop,
    stopDrawLoop,
    getCaptureStream,
  } = useRecordingCanvas(
    { width, height },
    cropRegion,
    overlayRef,
    webcamRef
  );

  const cleanup = useCallback(() => {
    stopDrawLoop();
    if (displayStreamRef.current) {
      displayStreamRef.current.getTracks().forEach((t) => t.stop());
      displayStreamRef.current = null;
    }
    if (displayVideoRef.current) {
      displayVideoRef.current.srcObject = null;
      displayVideoRef.current = null;
    }
    if (webcamRef?.current?.video) {
      webcamRef.current.video.srcObject = null;
      webcamRef.current.video = null;
    }
    setDisplaySource(null);
  }, [stopDrawLoop, setDisplaySource, webcamRef]);

  const requestDisplay = useCallback(async (includeSystemAudio = false) => {
    setError(null);
    setState('requesting');
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: width },
          height: { ideal: height },
          cursor: cursor,
          displaySurface: 'monitor',
        },
        audio: includeSystemAudio,
      });
      displayStreamRef.current = stream;
      setState('idle');
      return stream;
    } catch (err) {
      setError(err.message || 'Could not get display media');
      setState('idle');
      throw err;
    }
  }, [width, height, cursor]);

  const startRecording = useCallback(async (displayStream, audioStream = null, webcamStream = null, webcamOptions = {}) => {
    setError(null);
    chunksRef.current = [];

    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = displayStream;
    await video.play().catch(() => {});
    displayVideoRef.current = video;
    setDisplaySource(video);

    if (webcamStream && webcamRef?.current) {
      const wv = document.createElement('video');
      wv.autoplay = true;
      wv.muted = true;
      wv.playsInline = true;
      wv.srcObject = webcamStream;
      await wv.play().catch(() => {});
      webcamRef.current.video = wv;
      webcamRef.current.position = webcamOptions.position || 'bottom-right';
      webcamRef.current.size = webcamOptions.size ?? 160;
      webcamRef.current.shape = webcamOptions.shape || 'circle';
      webcamRef.current.blur = webcamOptions.blur || false;
    }

    startDrawLoop(fps);
    const canvasStream = getCaptureStream(fps);
    const tracks = [...canvasStream.getVideoTracks()];
    if (audioStream && audioStream.getAudioTracks && audioStream.getAudioTracks().length > 0) {
      tracks.push(...audioStream.getAudioTracks());
    }
    const combinedStream = new MediaStream(tracks);

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
    const recorder = new MediaRecorder(combinedStream, {
      mimeType,
      videoBitsPerSecond: videoBitsPerSecond,
      audioBitsPerSecond: tracks.some((t) => t.kind === 'audio') ? 128000 : 0,
    });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      setRecordedBlob(blob);
      setState('stopped');
      cleanup();
    };
    recorder.onerror = (e) => {
      setError(e.error?.message || 'Recording error');
      setState('stopped');
      cleanup();
    };

    recorder.start(1000);
    recordingStartTimeRef.current = Date.now();
    setState('recording');
  }, [fps, videoBitsPerSecond, startDrawLoop, getCaptureStream, cleanup, setDisplaySource, webcamRef]);

  const pauseRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && state === 'recording' && recorder.state === 'recording') {
      recorder.pause();
      stopDrawLoop();
      setState('paused');
    }
  }, [state, stopDrawLoop]);

  const resumeRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && state === 'paused' && recorder.state === 'paused') {
      recorder.resume();
      startDrawLoop(fps);
      setState('recording');
    }
  }, [state, fps, startDrawLoop]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && (recorder.state === 'recording' || recorder.state === 'paused')) {
      recorder.stop();
    }
  }, []);

  const getElapsedSeconds = useCallback(() => {
    if (!recordingStartTimeRef.current) return 0;
    const rec = mediaRecorderRef.current;
    if (!rec) return (Date.now() - recordingStartTimeRef.current) / 1000;
    if (rec.state === 'paused') {
      const pausedAt = rec.requestData ? (Date.now() / 1000) : 0;
      return (pausedAt - recordingStartTimeRef.current / 1000);
    }
    return (Date.now() - recordingStartTimeRef.current) / 1000;
  }, []);

  const reset = useCallback(() => {
    setRecordedBlob(null);
    setState('idle');
    setError(null);
    chunksRef.current = [];
    cleanup();
  }, [cleanup]);

  return {
    state,
    error,
    recordedBlob,
    canvasRef,
    displayVideoRef,
    requestDisplay,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    getElapsedSeconds,
    reset,
    cleanup,
  };
}
