import type {
  AspectRatio,
  AudioAsset,
  FitMode,
  KenBurnsPreset,
  SubtitleCue,
  SubtitleStyle,
  VisualClip,
} from '../types';
import { formatTimecode } from './timeUtils';

export function getCanvasDimensions(aspectRatio: AspectRatio): { width: number; height: number } {
  switch (aspectRatio) {
    case '9:16':
      return { width: 720, height: 1280 };
    case '1:1':
      return { width: 1080, height: 1080 };
    case '16:9':
    default:
      return { width: 1280, height: 720 };
  }
}

function drawFittedImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  canvasW: number,
  canvasH: number,
  fitMode: FitMode,
  motion: KenBurnsPreset,
  progress: number,
  alpha = 1,
  offsetX = 0
) {
  if (!img.complete || img.naturalWidth === 0) return;

  const t = Math.max(0, Math.min(1, progress));
  // Smooth ease in-out cubic for gentle cinematic motion
  const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  let zoom = 1;
  let panX = 0;
  let panY = 0;

  switch (motion) {
    case 'zoom-in':
      zoom = 1 + 0.1 * eased;
      break;
    case 'zoom-out':
      zoom = 1.1 - 0.1 * eased;
      break;
    case 'pan-left':
      zoom = 1.1;
      panX = (0.5 - eased) * canvasW * 0.06;
      break;
    case 'pan-right':
      zoom = 1.1;
      panX = (eased - 0.5) * canvasW * 0.06;
      break;
    case 'none':
    default:
      zoom = 1;
      break;
  }

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.translate(offsetX, 0);

  const imgRatio = img.naturalWidth / img.naturalHeight;
  const canvasRatio = canvasW / canvasH;

  if (fitMode === 'fit-blur') {
    // Blurred cover background
    let bgW = canvasW;
    let bgH = canvasH;
    if (imgRatio > canvasRatio) {
      bgH = canvasH * 1.15;
      bgW = bgH * imgRatio;
    } else {
      bgW = canvasW * 1.15;
      bgH = bgW / imgRatio;
    }
    ctx.save();
    ctx.filter = 'blur(26px) brightness(0.45)';
    ctx.drawImage(img, (canvasW - bgW) / 2, (canvasH - bgH) / 2, bgW, bgH);
    ctx.restore();

    // Sharp contained foreground with Ken Burns
    let fgW = canvasW;
    let fgH = canvasH;
    if (imgRatio > canvasRatio) {
      fgW = canvasW;
      fgH = canvasW / imgRatio;
    } else {
      fgH = canvasH;
      fgW = canvasH * imgRatio;
    }
    ctx.translate(canvasW / 2 + panX, canvasH / 2 + panY);
    ctx.scale(zoom, zoom);
    ctx.drawImage(img, -fgW / 2, -fgH / 2, fgW, fgH);
  } else {
    // Cover mode
    let drawW = canvasW;
    let drawH = canvasH;
    if (imgRatio > canvasRatio) {
      drawH = canvasH;
      drawW = canvasH * imgRatio;
    } else {
      drawW = canvasW;
      drawH = canvasW / imgRatio;
    }
    ctx.translate(canvasW / 2 + panX, canvasH / 2 + panY);
    ctx.scale(zoom, zoom);
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  }

  ctx.restore();
}

function drawSubtitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  canvasW: number,
  canvasH: number,
  style: SubtitleStyle
) {
  if (!style.enabled || !text.trim()) return;

  const baseSize = Math.round(Math.min(canvasW, canvasH) * 0.044);
  const multiplier = style.fontSize === 'sm' ? 0.82 : style.fontSize === 'lg' ? 1.2 : 1;
  const fontSize = Math.max(20, Math.round(baseSize * multiplier));
  const lineHeight = Math.round(fontSize * 1.38);
  const maxWidth = canvasW * 0.84;

  ctx.save();
  ctx.font = `600 ${fontSize}px "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Word-wrap Vietnamese text cleanly
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);

  const visibleLines = lines.slice(0, 3);
  const totalTextH = visibleLines.length * lineHeight;
  const padX = Math.round(fontSize * 0.7);
  const padY = Math.round(fontSize * 0.42);

  let maxLineW = 0;
  for (const l of visibleLines) {
    const w = ctx.measureText(l).width;
    if (w > maxLineW) maxLineW = w;
  }

  const boxW = Math.min(canvasW * 0.92, maxLineW + padX * 2);
  const boxH = totalTextH + padY * 2;
  const boxX = (canvasW - boxW) / 2;

  let boxY = canvasH - boxH - Math.round(canvasH * 0.065);
  if (style.position === 'top') {
    boxY = Math.round(canvasH * 0.065);
  } else if (style.position === 'middle') {
    boxY = (canvasH - boxH) / 2;
  }

  // Measured contrast scrim
  ctx.fillStyle = 'rgba(11, 13, 17, 0.78)';
  const radius = Math.round(fontSize * 0.35);
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxW, boxH, radius);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#F8FAFC';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;

  for (let i = 0; i < visibleLines.length; i++) {
    const y = boxY + padY + lineHeight * (i + 0.5);
    ctx.fillText(visibleLines[i], canvasW / 2, y);
  }

  ctx.restore();
}

export interface RenderFrameParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  currentTime: number;
  clips: VisualClip[];
  cues: SubtitleCue[];
  imageElements: Map<string, HTMLImageElement>;
  fitMode: FitMode;
  subtitleStyle: SubtitleStyle;
}

export function renderStudioFrame({
  ctx,
  width,
  height,
  currentTime,
  clips,
  cues,
  imageElements,
  fitMode,
  subtitleStyle,
}: RenderFrameParams) {
  ctx.fillStyle = '#0B0D11';
  ctx.fillRect(0, 0, width, height);

  const sortedClips = [...clips].sort((a, b) => a.startSec - b.startSec);
  const activeIdx = sortedClips.findIndex(
    (c) => currentTime >= c.startSec && currentTime < c.endSec
  );

  // If exactly at the final frame end, hold the last clip cleanly
  const resolvedIdx =
    activeIdx !== -1
      ? activeIdx
      : sortedClips.length > 0 &&
        Math.abs(currentTime - sortedClips[sortedClips.length - 1].endSec) <= 0.08
      ? sortedClips.length - 1
      : -1;

  if (resolvedIdx !== -1) {
    const clip = sortedClips[resolvedIdx];
    const prevClip = resolvedIdx > 0 ? sortedClips[resolvedIdx - 1] : null;
    const clipDur = Math.max(0.1, clip.endSec - clip.startSec);
    const localElapsed = Math.max(0, currentTime - clip.startSec);
    const progress = Math.min(1, localElapsed / clipDur);

    const img = imageElements.get(clip.imageId);
    const transDur = Math.min(clip.transitionDuration || 0.5, clipDur * 0.45);
    const inTransition = clip.transition !== 'none' && localElapsed < transDur;
    const transT = inTransition ? Math.max(0, Math.min(1, localElapsed / Math.max(0.05, transDur))) : 1;

    if (inTransition && clip.transition === 'crossfade' && prevClip) {
      const prevImg = imageElements.get(prevClip.imageId);
      if (prevImg) {
        drawFittedImage(ctx, prevImg, width, height, fitMode, prevClip.motion, 1, 1);
      }
      if (img) {
        drawFittedImage(ctx, img, width, height, fitMode, clip.motion, progress, transT);
      }
    } else if (inTransition && clip.transition === 'slide-left' && prevClip) {
      const prevImg = imageElements.get(prevClip.imageId);
      const easedSlide = 1 - Math.pow(1 - transT, 3);
      if (prevImg) {
        drawFittedImage(ctx, prevImg, width, height, fitMode, prevClip.motion, 1, 1, -width * easedSlide);
      }
      if (img) {
        drawFittedImage(ctx, img, width, height, fitMode, clip.motion, progress, 1, width * (1 - easedSlide));
      }
    } else if (inTransition && clip.transition === 'fade-black') {
      if (transT < 0.5 && prevClip) {
        const prevImg = imageElements.get(prevClip.imageId);
        if (prevImg) {
          drawFittedImage(ctx, prevImg, width, height, fitMode, prevClip.motion, 1, 1 - transT * 2);
        }
      } else if (img) {
        const alpha = prevClip ? (transT - 0.5) * 2 : transT;
        drawFittedImage(ctx, img, width, height, fitMode, clip.motion, progress, alpha);
      }
    } else if (img) {
      drawFittedImage(ctx, img, width, height, fitMode, clip.motion, progress, 1);
    }
  } else {
    // Clean studio placeholder for uncovered timeline range (e.g. minute 3 of 10-min MP3)
    ctx.save();
    ctx.fillStyle = '#11141B';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.strokeRect(width * 0.08, height * 0.14, width * 0.84, height * 0.64);
    ctx.setLineDash([]);

    const titleSize = Math.round(Math.min(width, height) * 0.036);
    const subSize = Math.round(Math.min(width, height) * 0.024);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#E2E8F0';
    ctx.font = `600 ${titleSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText(
      `Chưa có ảnh tại mốc ${formatTimecode(currentTime, false)}`,
      width / 2,
      height * 0.42
    );

    ctx.fillStyle = '#94A3B8';
    ctx.font = `400 ${subSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText(
      'Tải thêm ảnh mới rồi nhấn AI Đánh giá & Ghép tiếp để hoàn thiện đoạn này',
      width / 2,
      height * 0.5
    );
    ctx.restore();
  }

  // Active subtitle cue
  const activeCue = cues.find((c) => currentTime >= c.startSec && currentTime <= c.endSec);
  if (activeCue) {
    drawSubtitle(ctx, activeCue.text, width, height, subtitleStyle);
  }
}

export interface ExportVideoOptions {
  aspectRatio: AspectRatio;
  fitMode: FitMode;
  subtitleStyle: SubtitleStyle;
  clips: VisualClip[];
  cues: SubtitleCue[];
  imageElements: Map<string, HTMLImageElement>;
  audio: AudioAsset | null;
  rangeStartSec: number;
  rangeEndSec: number;
  fps?: number;
  onProgress: (percent: number, elapsedSec: number) => void;
  signal: AbortSignal;
}

export async function exportVideoFile(
  options: ExportVideoOptions
): Promise<{ blob: Blob; extension: string }> {
  const {
    aspectRatio,
    fitMode,
    subtitleStyle,
    clips,
    cues,
    imageElements,
    audio,
    rangeStartSec,
    rangeEndSec,
    fps = 30,
    onProgress,
    signal,
  } = options;

  const totalRange = Math.max(0.5, rangeEndSec - rangeStartSec);
  const { width, height } = getCanvasDimensions(aspectRatio);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Trình duyệt không hỗ trợ khởi tạo Canvas 2D để xuất video.');
  }

  const videoStream = canvas.captureStream(fps);
  const combinedTracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()];

  let audioCtx: AudioContext | null = null;
  let audioSource: AudioBufferSourceNode | null = null;

  if (audio?.audioBuffer) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioCtx();
    const dest = audioCtx.createMediaStreamDestination();
    audioSource = audioCtx.createBufferSource();
    audioSource.buffer = audio.audioBuffer;
    audioSource.connect(dest);
    dest.stream.getAudioTracks().forEach((track) => combinedTracks.push(track));
  }

  const finalStream = new MediaStream(combinedTracks);

  const mimeCandidates = [
    { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' },
    { mime: 'video/mp4', ext: 'mp4' },
    { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
    { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' },
  ];

  const chosen =
    mimeCandidates.find((c) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.mime)) ?? {
      mime: '',
      ext: 'webm',
    };

  const recorder = new MediaRecorder(finalStream, {
    ...(chosen.mime ? { mimeType: chosen.mime } : {}),
    videoBitsPerSecond: 6_000_000,
    audioBitsPerSecond: 192_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };

  return new Promise<{ blob: Blob; extension: string }>((resolve, reject) => {
    let rafId = 0;
    let finished = false;

    const cleanup = () => {
      cancelAnimationFrame(rafId);
      try {
        audioSource?.stop();
      } catch {
        // already stopped
      }
      audioCtx?.close().catch(() => {});
      finalStream.getTracks().forEach((t) => t.stop());
    };

    const onAbort = () => {
      if (finished) return;
      finished = true;
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
      cleanup();
      reject(new Error('Đã hủy quá trình xuất video.'));
    };

    signal.addEventListener('abort', onAbort, { once: true });

    recorder.onerror = () => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error('Lỗi trình ghi hình MediaRecorder khi xuất video.'));
    };

    recorder.onstop = () => {
      if (finished) return;
      finished = true;
      signal.removeEventListener('abort', onAbort);
      cleanup();
      const blob = new Blob(chunks, { type: chosen.mime || 'video/webm' });
      resolve({ blob, extension: chosen.ext });
    };

    // Paint initial frame before starting recorder
    renderStudioFrame({
      ctx,
      width,
      height,
      currentTime: rangeStartSec,
      clips,
      cues,
      imageElements,
      fitMode,
      subtitleStyle,
    });

    const startWallTime = performance.now();
    recorder.start(250);

    if (audioSource && audio?.audioBuffer) {
      const safeOffset = Math.min(rangeStartSec, Math.max(0, audio.audioBuffer.duration - 0.05));
      const playDuration = Math.min(totalRange, Math.max(0.05, audio.audioBuffer.duration - safeOffset));
      audioSource.start(0, safeOffset, playDuration);
    }

    const tick = () => {
      if (finished || signal.aborted) return;
      const elapsedSec = (performance.now() - startWallTime) / 1000;
      const playheadSec = Math.min(rangeEndSec, rangeStartSec + elapsedSec);

      renderStudioFrame({
        ctx,
        width,
        height,
        currentTime: playheadSec,
        clips,
        cues,
        imageElements,
        fitMode,
        subtitleStyle,
      });

      const pct = Math.min(100, (elapsedSec / totalRange) * 100);
      onProgress(pct, Math.min(totalRange, elapsedSec));

      if (elapsedSec >= totalRange) {
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
        return;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
  });
}
