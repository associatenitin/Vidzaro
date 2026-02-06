import { useRef, useCallback, useState, useEffect } from 'react';

/**
 * Mixes system audio (from getDisplayMedia) and microphone with separate gain controls.
 * Returns mixed MediaStream for recording and mic level (0-1) for overlay.
 */
export function useRecordingAudio() {
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const gainSystemRef = useRef(null);
  const gainMicRef = useRef(null);
  const destinationRef = useRef(null);
  const [micLevel, setMicLevel] = useState(0);
  const animationRef = useRef(null);

  const startMixing = useCallback(async (displayStream, micStream, options = {}) => {
    const {
      systemVolume = 1,
      micVolume = 1,
      noiseSuppression = true,
    } = options;

    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioContextRef.current = ctx;

    const destination = ctx.createMediaStreamDestination();
    destinationRef.current = destination;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    analyserRef.current = analyser;

    const gainSystem = ctx.createGain();
    gainSystem.gain.value = systemVolume;
    gainSystemRef.current = gainSystem;

    const gainMic = ctx.createGain();
    gainMic.gain.value = micVolume;
    gainMicRef.current = gainMic;

    if (displayStream && displayStream.getAudioTracks().length > 0) {
      const systemSource = ctx.createMediaStreamSource(displayStream);
      systemSource.connect(gainSystem);
      gainSystem.connect(destination);
    }

    if (micStream && micStream.getAudioTracks().length > 0) {
      const micSource = ctx.createMediaStreamSource(micStream);
      micSource.connect(gainMic);
      gainMic.connect(destination);
      gainMic.connect(analyser);
    }

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const updateLevel = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArray);
      const sum = dataArray.reduce((a, b) => a + b, 0);
      const avg = dataArray.length ? sum / dataArray.length / 255 : 0;
      setMicLevel(avg);
      animationRef.current = requestAnimationFrame(updateLevel);
    };
    animationRef.current = requestAnimationFrame(updateLevel);

    return destination.stream;
  }, []);

  const setSystemVolume = useCallback((value) => {
    if (gainSystemRef.current) gainSystemRef.current.gain.value = value;
  }, []);

  const setMicVolume = useCallback((value) => {
    if (gainMicRef.current) gainMicRef.current.gain.value = value;
  }, []);

  const stop = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    setMicLevel(0);
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    gainSystemRef.current = null;
    gainMicRef.current = null;
    destinationRef.current = null;
  }, []);

  return {
    startMixing,
    setSystemVolume,
    setMicVolume,
    micLevel,
    stop,
  };
}

/**
 * Request microphone with optional noise suppression constraints.
 */
export async function requestMicrophone(options = {}) {
  const { noiseSuppression = true, echoCancellation = true, autoGainControl = true } = options;
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation,
      noiseSuppression,
      autoGainControl,
    },
  });
}
