import React, { useEffect, useRef, useState } from 'react';
// type-only on purpose: a value import of './ProofCamera' would resolve to
// this very file on web (Metro prefers the .web extension) and go circular
import type { ProofCameraProps } from './ProofCamera';

// The browser's proof camera: a LIVE webcam preview with a shutter button,
// via getUserMedia. There is deliberately no file input anywhere, so a photo
// can only come from the camera, in the moment, exactly like on the phone.
// Needs a secure context (https or localhost) and camera permission.

const CAPTURE_WIDTH = 1280;
const JPEG_QUALITY = 0.6;

export default function ProofCamera({ onCapture, onCancel }: ProofCameraProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<'starting' | 'live' | 'blocked'>('starting');

  useEffect(() => {
    let cancelled = false;
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!md || !md.getUserMedia) {
      setState('blocked');
      return;
    }
    md.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: CAPTURE_WIDTH },
        height: { ideal: 960 },
      },
      audio: false,
    })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          v.play().catch(() => {});
        }
        setState('live');
      })
      .catch(() => {
        if (!cancelled) setState('blocked');
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  function snap() {
    const v = videoRef.current;
    if (!v || v.videoWidth === 0) return;
    const scale = Math.min(1, CAPTURE_WIDTH / v.videoWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    // stop the stream before handing the frame back
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    onCapture(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
  }

  const s: Record<string, React.CSSProperties> = {
    card: {
      background: '#FFFFFF',
      borderRadius: 20,
      padding: 18,
      width: '100%',
      maxWidth: 420,
      boxSizing: 'border-box',
      fontFamily: 'inherit',
    },
    title: { fontSize: 16, fontWeight: 800, color: '#3A3340', margin: 0 },
    sub: { fontSize: 12.5, color: '#8B8294', margin: '2px 0 12px' },
    video: {
      width: '100%',
      aspectRatio: '4 / 3',
      objectFit: 'cover',
      borderRadius: 14,
      background: '#3A3340',
      display: state === 'live' ? 'block' : 'none',
    },
    waiting: {
      width: '100%',
      aspectRatio: '4 / 3',
      borderRadius: 14,
      background: '#FBF7F0',
      display: state === 'live' ? 'none' : 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      color: '#8B8294',
      fontSize: 13,
      padding: 16,
      boxSizing: 'border-box',
    },
    row: { display: 'flex', gap: 10, marginTop: 14, alignItems: 'center' },
    shutter: {
      flex: 1,
      background: '#F2789F',
      color: '#FFFFFF',
      border: 'none',
      borderRadius: 18,
      padding: '14px 20px',
      fontSize: 15,
      fontWeight: 800,
      cursor: 'pointer',
      opacity: state === 'live' ? 1 : 0.5,
    },
    cancel: {
      background: 'transparent',
      color: '#8B8294',
      border: 'none',
      fontSize: 13,
      fontWeight: 800,
      cursor: 'pointer',
      padding: '10px 12px',
    },
  };

  return (
    <div style={s.card}>
      <p style={s.title}>proof, live from your camera 📸</p>
      <p style={s.sub}>no uploads, no gallery · what the lens sees is what they get</p>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video ref={videoRef} playsInline muted style={s.video} />
      <div style={s.waiting}>
        {state === 'starting'
          ? 'waking the camera…'
          : 'the camera is blocked. allow camera access for this site in your browser (https is required), then try again ♡'}
      </div>
      <div style={s.row}>
        <button type="button" style={s.shutter} onClick={snap} disabled={state !== 'live'}>
          take the snap
        </button>
        <button type="button" style={s.cancel} onClick={onCancel}>
          cancel
        </button>
      </div>
    </div>
  );
}
