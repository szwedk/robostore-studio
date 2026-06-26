/**
 * useHandCamera — owns the webcam stream, the MediaPipe tracker, and the RAF
 * loop. Draws the hand skeleton onto an overlay canvas and hands each frame's
 * landmarks + computed positions to a callback. Fully self-cleaning.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  HandTracker,
  HAND_CONNECTIONS,
  landmarksToPositions,
  type Landmark,
} from "@/lib/handTracking";

export type CameraStatus = "idle" | "starting" | "live" | "denied" | "error";

interface FramePayload {
  positions: number[];
  landmarks: Landmark[];
}

export function useHandCamera(onFrame: (p: FramePayload) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastFrameTime = useRef(-1);
  const trackedRef = useRef(false);
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  const [status, setStatus] = useState<CameraStatus>("idle");
  const [tracked, setTracked] = useState(false);
  const [error, setError] = useState<string>("");

  const loop = useCallback(() => {
    const video = videoRef.current;
    const tracker = trackerRef.current;
    // Only run detection on genuinely new camera frames — RAF fires ~60Hz but the
    // camera produces ~30, so this halves the expensive MediaPipe calls and stops
    // redundant work/re-renders on duplicate frames.
    if (
      video &&
      tracker &&
      video.readyState >= 2 &&
      video.currentTime !== lastFrameTime.current
    ) {
      lastFrameTime.current = video.currentTime;
      const lm = tracker.detect(video, performance.now());

      const canvas = canvasRef.current;
      if (canvas) {
        if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
        if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (lm) drawSkeleton(ctx, lm, canvas.width, canvas.height);
      }

      if (lm) {
        if (!trackedRef.current) { trackedRef.current = true; setTracked(true); }
        onFrameRef.current({ positions: landmarksToPositions(lm), landmarks: lm });
      } else if (trackedRef.current) {
        trackedRef.current = false;
        setTracked(false);
      }
    }
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const start = useCallback(async () => {
    setStatus("starting");
    setError("");
    try {
      // 640×480 @ 30fps — plenty for hand landmarks and ~2× faster to detect than 720p.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
          facingMode: "user",
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      trackerRef.current = new HandTracker();
      await trackerRef.current.init();
      setStatus("live");
      rafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      const name = (e as Error)?.name ?? "";
      if (name === "NotAllowedError" || name === "SecurityError") setStatus("denied");
      else {
        setStatus("error");
        setError((e as Error)?.message ?? "Could not start the camera.");
      }
    }
  }, [loop]);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    trackerRef.current?.close();
    trackerRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
    setTracked(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { videoRef, canvasRef, status, tracked, error, start, stop };
}

function drawSkeleton(ctx: CanvasRenderingContext2D, lm: Landmark[], w: number, h: number) {
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(92,182,196,0.85)";
  ctx.lineCap = "round";
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.beginPath();
    ctx.moveTo(lm[a].x * w, lm[a].y * h);
    ctx.lineTo(lm[b].x * w, lm[b].y * h);
    ctx.stroke();
  }
  for (const p of lm) {
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
  }
}
