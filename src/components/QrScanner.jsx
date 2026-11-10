import { useEffect, useRef } from 'react';
import jsQR from 'jsqr';

function cameraMessage(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access was blocked. Allow the camera for this site in the browser settings, then tap Start scanner.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera was found on this device.';
    case 'NotReadableError':
      return 'The camera is being used by another app.';
    default:
      return `Could not start the camera${err?.name ? ` (${err.name})` : ''}.`;
  }
}

// Live camera view that reads QR codes with jsQR, which works the same on
// Android Chrome and iPad Safari (neither needs a native barcode API). The
// camera stays on while `paused` is true so resuming is instant; only the
// decoding stops. Mount it to start the camera, unmount it to release it.
export default function QrScanner({ facing = 'environment', paused = false, onCode, onError }) {
  const videoRef = useRef(null);
  const pausedRef = useRef(paused);
  const onCodeRef = useRef(onCode);
  const onErrorRef = useRef(onError);
  pausedRef.current = paused;
  onCodeRef.current = onCode;
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    let stream = null;
    let raf = 0;
    let last = 0;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    function tick(t) {
      raf = requestAnimationFrame(tick);
      if (pausedRef.current || t - last < 120) return;
      last = t;
      const v = videoRef.current;
      if (!v || v.readyState < 2 || !v.videoWidth) return;
      const scale = Math.min(1, 640 / v.videoWidth);
      const w = Math.round(v.videoWidth * scale);
      const h = Math.round(v.videoHeight * scale);
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(v, 0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);
      const code = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
      if (code && code.data) onCodeRef.current?.(code.data);
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        onErrorRef.current?.('The camera needs a secure (https) page and an up-to-date browser.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch (err) {
        if (!cancelled) onErrorRef.current?.(cameraMessage(err));
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((tr) => tr.stop());
        return;
      }
      const v = videoRef.current;
      v.srcObject = stream;
      try {
        await v.play();
      } catch {
        // autoplay can be refused; decoding starts once frames arrive anyway
      }
      raf = requestAnimationFrame(tick);
    }

    start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach((tr) => tr.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [facing]);

  return (
    <div className={'checkin-scanner' + (paused ? ' checkin-scanner--paused' : '')}>
      <video ref={videoRef} playsInline muted autoPlay />
      <div className="checkin-scanner__frame" />
      {paused && <div className="checkin-scanner__status">Paused</div>}
    </div>
  );
}
