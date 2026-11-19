import React, { useEffect, useRef, useState } from 'react';
import { X, Download, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import type {
  AspectRatio,
  AudioAsset,
  FitMode,
  SubtitleCue,
  SubtitleStyle,
  VisualClip,
} from '../types';
import { exportVideoFile, getCanvasDimensions } from '../lib/canvasRenderer';
import { formatTimecode } from '../lib/timeUtils';

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  projectName: string;
  aspectRatio: AspectRatio;
  fitMode: FitMode;
  subtitleStyle: SubtitleStyle;
  onChangeSubtitleStyle: (style: SubtitleStyle) => void;
  clips: VisualClip[];
  cues: SubtitleCue[];
  imageElements: Map<string, HTMLImageElement>;
  audio: AudioAsset | null;
  coveredUntilSec: number;
  totalDurationSec: number;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  open,
  onClose,
  projectName,
  aspectRatio,
  fitMode,
  subtitleStyle,
  onChangeSubtitleStyle,
  clips,
  cues,
  imageElements,
  audio,
  coveredUntilSec,
  totalDurationSec,
}) => {
  const [rangeMode, setRangeMode] = useState<'covered' | 'full'>('covered');
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [doneFile, setDoneFile] = useState<{ url: string; filename: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) {
      setRangeMode(
        coveredUntilSec > 0 && coveredUntilSec < totalDurationSec - 0.5 ? 'covered' : 'full'
      );
      setError(null);
    }
  }, [open, coveredUntilSec, totalDurationSec]);

  if (!open) return null;

  const dims = getCanvasDimensions(aspectRatio);
  const hasPartial = coveredUntilSec > 0 && coveredUntilSec < totalDurationSec - 0.5;
  const effectiveEnd =
    rangeMode === 'covered' && coveredUntilSec > 0 ? coveredUntilSec : totalDurationSec;

  const handleStartExport = async () => {
    setError(null);
    if (doneFile) {
      URL.revokeObjectURL(doneFile.url);
      setDoneFile(null);
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setIsExporting(true);
    setProgress(0);
    setElapsed(0);

    try {
      const { blob, extension } = await exportVideoFile({
        aspectRatio,
        fitMode,
        subtitleStyle,
        clips,
        cues,
        imageElements,
        audio,
        rangeStartSec: 0,
        rangeEndSec: effectiveEnd,
        fps: 30,
        onProgress: (pct, sec) => {
          setProgress(pct);
          setElapsed(sec);
        },
        signal: controller.signal,
      });

      const url = URL.createObjectURL(blob);
      const safeSlug =
        projectName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '') || 'synccut_video';
      const suffix = rangeMode === 'covered' && hasPartial ? `_den_${Math.round(effectiveEnd)}s` : '';
      const filename = `${safeSlug}${suffix}.${extension}`;

      setDoneFile({ url, filename });
      // Auto trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xuất video.');
    } finally {
      setIsExporting(false);
      abortRef.current = null;
    }
  };

  const handleCancel = () => {
    if (isExporting && abortRef.current) {
      abortRef.current.abort();
      return;
    }
    if (doneFile) {
      URL.revokeObjectURL(doneFile.url);
      setDoneFile(null);
    }
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-lg rounded-xl border border-[#2A303E] bg-[#13161C] overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b border-[#252A35] flex items-center justify-between">
          <div>
            <h2 id="export-modal-title" className="text-base font-semibold text-slate-100">
              Xuất tệp video
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
              {aspectRatio} · {dims.width}×{dims.height} px · 30 fps
            </p>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-[#1E232E]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Range selection for incremental projects */}
          <div>
            <div className="text-xs font-medium text-slate-300 mb-2">Phạm vi xuất video</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={isExporting || coveredUntilSec <= 0}
                onClick={() => setRangeMode('covered')}
                className={`text-left p-3 rounded-lg border transition-colors ${
                  rangeMode === 'covered'
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-[#252A35] bg-[#0F1218] hover:border-slate-600'
                }`}
              >
                <div className="text-xs font-semibold text-slate-100">Chỉ phần đã ghép ảnh</div>
                <div className="text-[11px] font-mono tabular-nums text-amber-400 mt-0.5">
                  00:00 – {formatTimecode(coveredUntilSec, false)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Xuất nhanh bản nháp đến đúng mốc bạn đã làm.
                </div>
              </button>

              <button
                type="button"
                disabled={isExporting}
                onClick={() => setRangeMode('full')}
                className={`text-left p-3 rounded-lg border transition-colors ${
                  rangeMode === 'full'
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-[#252A35] bg-[#0F1218] hover:border-slate-600'
                }`}
              >
                <div className="text-xs font-semibold text-slate-100">Toàn bộ thời lượng MP3</div>
                <div className="text-[11px] font-mono tabular-nums text-slate-300 mt-0.5">
                  00:00 – {formatTimecode(totalDurationSec, false)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Bao gồm trọn vẹn đoạn giọng đọc hiện có.
                </div>
              </button>
            </div>
          </div>

          {/* Subtitle options */}
          <div className="pt-3 border-t border-[#222733] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300">Ghi phụ đề vào video</span>
              <input
                type="checkbox"
                disabled={isExporting}
                checked={subtitleStyle.enabled}
                onChange={(e) =>
                  onChangeSubtitleStyle({ ...subtitleStyle, enabled: e.target.checked })
                }
                className="accent-amber-500 w-4 h-4"
              />
            </div>

            {subtitleStyle.enabled && (
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[11px] text-slate-400 space-y-1 block">
                  <span>Vị trí phụ đề</span>
                  <select
                    disabled={isExporting}
                    value={subtitleStyle.position}
                    onChange={(e) =>
                      onChangeSubtitleStyle({
                        ...subtitleStyle,
                        position: e.target.value as SubtitleStyle['position'],
                      })
                    }
                    className="w-full bg-[#0B0D11] border border-[#2A303E] rounded px-2.5 py-1.5 text-xs text-slate-200"
                  >
                    <option value="bottom">Phía dưới (Tiêu chuẩn)</option>
                    <option value="middle">Giữa khung hình</option>
                    <option value="top">Phía trên</option>
                  </select>
                </label>

                <label className="text-[11px] text-slate-400 space-y-1 block">
                  <span>Cỡ chữ</span>
                  <select
                    disabled={isExporting}
                    value={subtitleStyle.fontSize}
                    onChange={(e) =>
                      onChangeSubtitleStyle({
                        ...subtitleStyle,
                        fontSize: e.target.value as SubtitleStyle['fontSize'],
                      })
                    }
                    className="w-full bg-[#0B0D11] border border-[#2A303E] rounded px-2.5 py-1.5 text-xs text-slate-200"
                  >
                    <option value="sm">Nhỏ gọn</option>
                    <option value="md">Vừa phải</option>
                    <option value="lg">Lớn nổi bật</option>
                  </select>
                </label>
              </div>
            )}
          </div>

          {/* Progress or Result */}
          {isExporting && (
            <div className="rounded-lg border border-[#252A35] bg-[#0F1218] p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-2 text-slate-200 font-medium">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                  Đang kết xuất hình ảnh &amp; trộn âm thanh...
                </span>
                <span className="font-mono tabular-nums text-amber-400">
                  {Math.round(progress)}% ({formatTimecode(elapsed, false)} /{' '}
                  {formatTimecode(effectiveEnd, false)})
                </span>
              </div>
              <div className="h-2 rounded-full bg-[#1A1E26] overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Vui lòng giữ tab trình duyệt mở để đảm bảo tốc độ khung hình mượt mà.
              </p>
            </div>
          )}

          {doneFile && !isExporting && (
            <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-emerald-300">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Đã xuất xong tệp {doneFile.filename}</span>
              </div>
              <a
                href={doneFile.url}
                download={doneFile.filename}
                className="px-3 py-1.5 rounded bg-emerald-500 text-slate-950 text-xs font-semibold hover:bg-emerald-400 whitespace-nowrap"
              >
                Tải lại
              </a>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/35 bg-red-500/10 p-3 text-xs text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-[#252A35] bg-[#101318] flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 rounded-lg border border-[#2A303E] bg-[#1A1E26] text-xs font-medium text-slate-300 hover:text-slate-100"
          >
            {isExporting ? 'Hủy xuất' : 'Đóng'}
          </button>
          <button
            type="button"
            disabled={isExporting || effectiveEnd <= 0}
            onClick={handleStartExport}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold disabled:opacity-40 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Bắt đầu xuất ({formatTimecode(effectiveEnd, false)})
          </button>
        </div>
      </div>
    </div>
  );
};
