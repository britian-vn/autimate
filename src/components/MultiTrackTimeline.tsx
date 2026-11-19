import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Plus } from 'lucide-react';
import type { AudioAsset, SubtitleCue, UploadedImage, VisualClip } from '../types';
import { formatTimecode } from '../lib/timeUtils';

interface MultiTrackTimelineProps {
  audio: AudioAsset | null;
  images: UploadedImage[];
  clips: VisualClip[];
  cues: SubtitleCue[];
  currentTime: number;
  totalDurationSec: number;
  coveredUntilSec: number;
  selectedClipId: string | null;
  onSelectClip: (clipId: string | null) => void;
  onSeek: (sec: number) => void;
  onResizeClip: (clipId: string, startSec: number, endSec: number) => void;
  onOpenUploadMore: () => void;
}

export const MultiTrackTimeline: React.FC<MultiTrackTimelineProps> = ({
  audio,
  images,
  clips,
  cues,
  currentTime,
  totalDurationSec,
  coveredUntilSec,
  selectedClipId,
  onSelectClip,
  onSeek,
  onResizeClip,
  onOpenUploadMore,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pxPerSec, setPxPerSec] = useState(28);
  const [scrubbing, setScrubbing] = useState(false);

  const imageMap = useMemo(() => new Map(images.map((i) => [i.id, i])), [images]);
  const safeDuration = Math.max(totalDurationSec, 15);
  const trackWidth = Math.max(760, Math.ceil(safeDuration * pxPerSec));

  // Auto-fit zoom sensibly for long 10-minute MP3s vs short clips
  const handleFitZoom = () => {
    const containerW = scrollRef.current?.clientWidth ?? 1100;
    const usableW = Math.max(400, containerW - 140);
    const ideal = Math.max(4, Math.min(80, usableW / safeDuration));
    setPxPerSec(ideal);
  };

  // Draw crisp audio waveform canvas
  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = trackWidth;
    const cssH = 44;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    if (!audio || audio.peaks.length === 0) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
      ctx.beginPath();
      ctx.moveTo(0, cssH / 2);
      ctx.lineTo(cssW, cssH / 2);
      ctx.stroke();
      return;
    }

    const audioW = (audio.durationSec / safeDuration) * cssW;
    const peaks = audio.peaks;
    const barStep = Math.max(2, audioW / peaks.length);
    const coveredX = (coveredUntilSec / safeDuration) * cssW;

    for (let i = 0; i < peaks.length; i++) {
      const x = (i / peaks.length) * audioW;
      const amp = Math.max(0.06, peaks[i]);
      const h = amp * (cssH - 8);
      const y = (cssH - h) / 2;
      ctx.fillStyle = x <= coveredX ? 'rgba(245, 158, 11, 0.65)' : 'rgba(100, 116, 139, 0.45)';
      ctx.fillRect(x, y, Math.max(1.5, barStep - 1), h);
    }
  }, [audio, trackWidth, safeDuration, coveredUntilSec]);

  const clientXToTime = (clientX: number) => {
    const scroller = scrollRef.current;
    if (!scroller) return 0;
    const rect = scroller.getBoundingClientRect();
    const labelW = 112;
    const localX = clientX - rect.left + scroller.scrollLeft - labelW;
    const sec = Math.max(0, Math.min(safeDuration, localX / (trackWidth / safeDuration)));
    return Math.round(sec * 100) / 100;
  };

  useEffect(() => {
    if (!scrubbing) return;
    const onMove = (e: MouseEvent) => {
      onSeek(clientXToTime(e.clientX));
    };
    const onUp = () => setScrubbing(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [scrubbing, safeDuration, trackWidth]);

  const startEdgeDrag = (
    e: React.MouseEvent,
    clip: VisualClip,
    edge: 'left' | 'right'
  ) => {
    e.stopPropagation();
    const originX = e.clientX;
    const originStart = clip.startSec;
    const originEnd = clip.endSec;
    const secPerPx = safeDuration / trackWidth;

    const onMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - originX;
      const dt = dx * secPerPx;
      if (edge === 'left') {
        const nextStart = Math.max(0, Math.min(originEnd - 0.4, originStart + dt));
        onResizeClip(clip.id, Math.round(nextStart * 100) / 100, originEnd);
      } else {
        const nextEnd = Math.max(originStart + 0.4, Math.min(safeDuration, originEnd + dt));
        onResizeClip(clip.id, originStart, Math.round(nextEnd * 100) / 100);
      }
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Generate readable ruler ticks based on current zoom
  const tickStep = useMemo(() => {
    const targetSec = 85 / (trackWidth / safeDuration);
    const steps = [1, 2, 5, 10, 15, 30, 60, 120];
    return steps.find((s) => s >= targetSec) ?? 120;
  }, [trackWidth, safeDuration]);

  const ticks: number[] = [];
  for (let t = 0; t <= safeDuration; t += tickStep) {
    ticks.push(t);
  }

  const playheadLeft = (Math.min(currentTime, safeDuration) / safeDuration) * trackWidth;
  const coveredLeft = (Math.min(coveredUntilSec, safeDuration) / safeDuration) * trackWidth;
  const uncoveredWidth = Math.max(0, trackWidth - coveredLeft);

  // Keep playhead within visible scroll viewport during playback on long MP3s
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || scrubbing) return;
    const viewW = scroller.clientWidth - 112;
    if (viewW <= 0) return;
    const margin = 48;
    if (playheadLeft < scroller.scrollLeft + margin) {
      scroller.scrollLeft = Math.max(0, playheadLeft - margin);
    } else if (playheadLeft > scroller.scrollLeft + viewW - margin) {
      scroller.scrollLeft = Math.max(0, playheadLeft - viewW * 0.35);
    }
  }, [playheadLeft, scrubbing]);

  return (
    <section
      aria-label="Timeline đa rãnh"
      className="h-[228px] shrink-0 border-t border-[#252A35] bg-[#0B0D11] flex flex-col select-none"
    >
      {/* Timeline Header Bar */}
      <div className="h-9 px-4 border-b border-[#252A35] bg-[#11141B] flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 text-xs text-slate-400 tabular-nums">
          <span className="font-semibold text-slate-200">Timeline</span>
          <span aria-hidden="true">·</span>
          <span>
            Đã phủ ảnh{' '}
            <strong className="font-mono text-amber-400 font-medium">
              {formatTimecode(coveredUntilSec, false)}
            </strong>{' '}
            / {formatTimecode(totalDurationSec, false)}
          </span>
          <span aria-hidden="true">·</span>
          <span>{clips.length} cảnh ảnh</span>
          <span aria-hidden="true">·</span>
          <span>{cues.length} dòng lời nói</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPxPerSec((p) => Math.max(4, p * 0.72))}
            title="Thu nhỏ timeline"
            className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-[#1A1E26]"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleFitZoom}
            className="px-2 py-1 text-[11px] font-medium text-slate-300 hover:text-slate-100 rounded border border-[#252A35] bg-[#13161C]"
          >
            Vừa khung
          </button>
          <button
            type="button"
            onClick={() => setPxPerSec((p) => Math.min(110, p * 1.35))}
            title="Phóng to timeline"
            className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-[#1A1E26]"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Scrollable Tracks Area */}
      <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden relative">
        <div style={{ width: trackWidth + 112 }} className="h-full flex flex-col relative">
          {/* Time Ruler Row */}
          <div className="h-7 flex border-b border-[#252A35] bg-[#0F1218] shrink-0">
            <div className="w-[112px] shrink-0 border-r border-[#252A35] px-3 flex items-center text-[11px] font-mono text-slate-500 sticky left-0 z-20 bg-[#0F1218]">
              {formatTimecode(currentTime, true)}
            </div>
            <div
              onMouseDown={(e) => {
                onSeek(clientXToTime(e.clientX));
                setScrubbing(true);
              }}
              className="relative flex-1 cursor-ew-resize"
            >
              {ticks.map((t) => {
                const left = (t / safeDuration) * trackWidth;
                return (
                  <div
                    key={t}
                    style={{ left }}
                    className="absolute top-0 bottom-0 flex flex-col justify-between pointer-events-none"
                  >
                    <span className="pl-1 pt-0.5 text-[10px] font-mono tabular-nums text-slate-500">
                      {formatTimecode(t, false)}
                    </span>
                    <span className="w-px h-2 bg-[#2D3443]" />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Track 1: Visual Scenes */}
          <div className="h-[64px] flex border-b border-[#1E232E] shrink-0">
            <div className="w-[112px] shrink-0 border-r border-[#252A35] px-3 flex flex-col justify-center sticky left-0 z-20 bg-[#0D1016]">
              <span className="text-[11px] font-medium text-slate-200">Hình ảnh</span>
              <span className="text-[10px] text-slate-500 tabular-nums">{clips.length} cảnh</span>
            </div>
            <div
              className="relative flex-1 bg-[#0B0D11]"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  onSelectClip(null);
                  onSeek(clientXToTime(e.clientX));
                }
              }}
            >
              {clips.map((clip, idx) => {
                const left = (clip.startSec / safeDuration) * trackWidth;
                const width = Math.max(18, ((clip.endSec - clip.startSec) / safeDuration) * trackWidth);
                const img = imageMap.get(clip.imageId);
                const isSelected = clip.id === selectedClipId;
                const scoreBorder =
                  clip.matchLevel === 'low'
                    ? 'border-red-500/70'
                    : clip.matchLevel === 'medium'
                    ? 'border-amber-500/60'
                    : 'border-[#333C4D]';

                return (
                  <div
                    key={clip.id}
                    style={{ left, width }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectClip(clip.id);
                      onSeek(clip.startSec);
                    }}
                    className={`group absolute top-1.5 bottom-1.5 rounded-md overflow-hidden border cursor-pointer flex items-stretch transition-colors ${
                      isSelected
                        ? 'border-amber-500 ring-1 ring-amber-500/50 z-10'
                        : `${scoreBorder} hover:border-slate-400`
                    }`}
                  >
                    {img ? (
                      <img
                        src={img.objectUrl}
                        alt={img.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover opacity-75 group-hover:opacity-90 transition-opacity"
                      />
                    ) : (
                      <div className="w-full h-full bg-[#1A1E26]" />
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent px-2 py-1 flex flex-col justify-between pointer-events-none">
                      <div className="flex items-center justify-between gap-1 text-[10px] font-mono tabular-nums text-slate-100">
                        <span className="truncate font-semibold">#{idx + 1}</span>
                        {clip.matchScore !== undefined && width > 64 && (
                          <span
                            className={
                              clip.matchLevel === 'high'
                                ? 'text-emerald-400'
                                : clip.matchLevel === 'medium'
                                ? 'text-amber-300'
                                : 'text-red-400'
                            }
                          >
                            {clip.matchScore}%
                          </span>
                        )}
                      </div>
                      {width > 72 && (
                        <div className="text-[10px] text-slate-200 truncate">
                          {img?.name || 'Ảnh'}
                        </div>
                      )}
                    </div>

                    {/* Left & Right trim handles */}
                    <div
                      onMouseDown={(e) => startEdgeDrag(e, clip, 'left')}
                      title="Kéo để chỉnh điểm bắt đầu"
                      className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-amber-500/70 transition-colors"
                    />
                    <div
                      onMouseDown={(e) => startEdgeDrag(e, clip, 'right')}
                      title="Kéo để chỉnh điểm kết thúc"
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-amber-500/70 transition-colors"
                    />
                  </div>
                );
              })}

              {/* Uncovered Timeline Zone (e.g., minute 2 to minute 10 waiting for more images) */}
              {totalDurationSec > 0 && uncoveredWidth > 28 && (
                <button
                  type="button"
                  onClick={onOpenUploadMore}
                  style={{ left: coveredLeft + 2, width: Math.max(0, uncoveredWidth - 4) }}
                  className="uncovered-hatch absolute top-1.5 bottom-1.5 rounded-md border border-dashed border-[#2C3342] hover:border-amber-500/60 flex items-center justify-center gap-1.5 px-3 text-[11px] text-slate-400 hover:text-amber-300 transition-colors overflow-hidden"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    Chưa có ảnh từ {formatTimecode(coveredUntilSec, false)} — Tải thêm để ghép tiếp
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Track 2: Subtitles / Speech Cues */}
          <div className="h-[42px] flex border-b border-[#1E232E] shrink-0">
            <div className="w-[112px] shrink-0 border-r border-[#252A35] px-3 flex flex-col justify-center sticky left-0 z-20 bg-[#0D1016]">
              <span className="text-[11px] font-medium text-slate-300">Lời nói</span>
              <span className="text-[10px] text-slate-500 tabular-nums">{cues.length} câu</span>
            </div>
            <div className="relative flex-1 bg-[#0C0F14]">
              {cues.map((cue) => {
                const left = (cue.startSec / safeDuration) * trackWidth;
                const width = Math.max(14, ((cue.endSec - cue.startSec) / safeDuration) * trackWidth);
                const isActive = currentTime >= cue.startSec && currentTime <= cue.endSec;
                return (
                  <button
                    key={cue.id}
                    type="button"
                    onClick={() => onSeek(cue.startSec)}
                    style={{ left, width }}
                    title={cue.text}
                    className={`absolute top-1.5 bottom-1.5 px-2 rounded border text-left text-[11px] truncate transition-colors ${
                      isActive
                        ? 'border-amber-500/70 bg-amber-500/15 text-amber-100'
                        : 'border-[#252B37] bg-[#151922] text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    {cue.text}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Track 3: Audio Waveform */}
          <div className="h-[52px] flex shrink-0">
            <div className="w-[112px] shrink-0 border-r border-[#252A35] px-3 flex flex-col justify-center sticky left-0 z-20 bg-[#0D1016]">
              <span className="text-[11px] font-medium text-slate-300">Giọng đọc</span>
              <span className="text-[10px] text-slate-500 truncate">
                {audio ? formatTimecode(audio.durationSec, false) : 'Trống'}
              </span>
            </div>
            <div
              onMouseDown={(e) => {
                onSeek(clientXToTime(e.clientX));
                setScrubbing(true);
              }}
              className="relative flex-1 bg-[#0B0D11] cursor-ew-resize flex items-center"
            >
              <canvas
                ref={waveformCanvasRef}
                style={{ width: trackWidth, height: 44 }}
                className="block"
              />
            </div>
          </div>

          {/* Playhead Needle spanning all tracks */}
          <div
            style={{ left: 112 + playheadLeft }}
            className="absolute top-0 bottom-0 w-px bg-amber-500 pointer-events-none z-30"
          >
            <div className="w-2.5 h-2.5 -ml-[4.5px] bg-amber-500 rotate-45 -mt-1" />
          </div>
        </div>
      </div>
    </section>
  );
};
