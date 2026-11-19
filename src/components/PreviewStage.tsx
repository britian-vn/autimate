import React, { useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Subtitles,
  Save,
  Check,
  Wand2,
  Trash2,
  Lock,
  Unlock,
  Upload,
} from 'lucide-react';
import type {
  AspectRatio,
  FitMode,
  KenBurnsPreset,
  SubtitleCue,
  SubtitleStyle,
  TransitionType,
  UploadedImage,
  VisualClip,
} from '../types';
import { getCanvasDimensions, renderStudioFrame } from '../lib/canvasRenderer';
import { formatTimecode, parseTimeInput } from '../lib/timeUtils';

interface PreviewStageProps {
  projectName: string;
  onRenameProject: (name: string) => void;
  aspectRatio: AspectRatio;
  onChangeAspectRatio: (ar: AspectRatio) => void;
  fitMode: FitMode;
  onChangeFitMode: (mode: FitMode) => void;
  subtitleStyle: SubtitleStyle;
  onChangeSubtitleStyle: (style: SubtitleStyle) => void;
  images: UploadedImage[];
  clips: VisualClip[];
  cues: SubtitleCue[];
  imageElements: Map<string, HTMLImageElement>;
  imageLoadVersion: number;
  currentTime: number;
  totalDurationSec: number;
  coveredUntilSec: number;
  isPlaying: boolean;
  playOnlyCovered: boolean;
  onTogglePlayOnlyCovered: (val: boolean) => void;
  muted: boolean;
  onToggleMute: () => void;
  onTogglePlay: () => void;
  onSeek: (sec: number) => void;
  selectedClip: VisualClip | null;
  onUpdateClip: (clipId: string, patch: Partial<VisualClip>) => void;
  onDeleteClip: (clipId: string) => void;
  onReplaceClipWithFile: (clipId: string, file: File) => void;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  lastSavedAt: number | null;
  onManualSave: () => void;
  onLoadDemo: () => void;
  isLoadingDemo: boolean;
}

export const PreviewStage: React.FC<PreviewStageProps> = ({
  projectName,
  onRenameProject,
  aspectRatio,
  onChangeAspectRatio,
  fitMode,
  onChangeFitMode,
  subtitleStyle,
  onChangeSubtitleStyle,
  images,
  clips,
  cues,
  imageElements,
  imageLoadVersion,
  currentTime,
  totalDurationSec,
  coveredUntilSec,
  isPlaying,
  playOnlyCovered,
  onTogglePlayOnlyCovered,
  muted,
  onToggleMute,
  onTogglePlay,
  onSeek,
  selectedClip,
  onUpdateClip,
  onDeleteClip,
  onReplaceClipWithFile,
  saveStatus,
  lastSavedAt,
  onManualSave,
  onLoadDemo,
  isLoadingDemo,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const clipReplaceInputRef = useRef<HTMLInputElement | null>(null);

  const dims = getCanvasDimensions(aspectRatio);

  // Render preview frame whenever time, clips, cues, settings, or loaded images change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.width !== dims.width || canvas.height !== dims.height) {
      canvas.width = dims.width;
      canvas.height = dims.height;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    renderStudioFrame({
      ctx,
      width: dims.width,
      height: dims.height,
      currentTime,
      clips,
      cues,
      imageElements,
      fitMode,
      subtitleStyle,
    });
  }, [
    dims.width,
    dims.height,
    currentTime,
    clips,
    cues,
    imageElements,
    imageLoadVersion,
    fitMode,
    subtitleStyle,
  ]);

  const effectiveLimit =
    playOnlyCovered && coveredUntilSec > 0 ? coveredUntilSec : totalDurationSec;

  const isEmptyWorkspace = images.length === 0 && cues.length === 0 && clips.length === 0;

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#0D1015]">
      {/* Inline Workspace Toolbar */}
      <div className="px-4 py-2.5 border-b border-[#252A35] bg-[#11141B] flex items-center justify-between gap-3 flex-wrap shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <input
            type="text"
            value={projectName}
            onChange={(e) => onRenameProject(e.target.value)}
            aria-label="Tên dự án"
            className="bg-transparent text-sm font-semibold text-slate-100 border border-transparent hover:border-[#2A303E] focus:border-amber-500 focus:bg-[#0B0D11] rounded px-2 py-1 focus:outline-none w-48 truncate"
          />
          <button
            type="button"
            onClick={onManualSave}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-[#252A35] bg-[#171B24] hover:bg-[#1E2330] text-slate-200 transition-colors whitespace-nowrap shrink-0"
          >
            {saveStatus === 'saved' ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Save className="w-3.5 h-3.5 text-amber-400" />
            )}
            {saveStatus === 'saving'
              ? 'Đang lưu...'
              : lastSavedAt
              ? `Đã lưu ${new Date(lastSavedAt).toLocaleTimeString('vi-VN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}`
              : 'Lưu dự án'}
          </button>
        </div>

        {/* Aspect ratio, Fit Mode, Subtitles */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="inline-flex items-center p-0.5 rounded-md bg-[#0B0D11] border border-[#252A35]">
            {(['16:9', '9:16', '1:1'] as AspectRatio[]).map((ar) => (
              <button
                key={ar}
                type="button"
                onClick={() => onChangeAspectRatio(ar)}
                className={`px-2.5 py-1 text-[11px] font-mono tabular-nums font-medium rounded transition-colors whitespace-nowrap ${
                  aspectRatio === ar
                    ? 'bg-[#252A35] text-amber-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {ar}
              </button>
            ))}
          </div>

          <div className="inline-flex items-center p-0.5 rounded-md bg-[#0B0D11] border border-[#252A35]">
            {(
              [
                { id: 'cover', label: 'Phủ kín' },
                { id: 'fit-blur', label: 'Giữ ảnh + Nền mờ' },
              ] as const
            ).map((fm) => (
              <button
                key={fm.id}
                type="button"
                onClick={() => onChangeFitMode(fm.id)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                  fitMode === fm.id
                    ? 'bg-[#252A35] text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {fm.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() =>
              onChangeSubtitleStyle({ ...subtitleStyle, enabled: !subtitleStyle.enabled })
            }
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded border transition-colors whitespace-nowrap ${
              subtitleStyle.enabled
                ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                : 'border-[#252A35] bg-[#13161C] text-slate-400 hover:text-slate-200'
            }`}
          >
            <Subtitles className="w-3.5 h-3.5" />
            Phụ đề {subtitleStyle.enabled ? 'Bật' : 'Tắt'}
          </button>

          {isEmptyWorkspace && (
            <button
              type="button"
              onClick={onLoadDemo}
              disabled={isLoadingDemo}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 transition-colors whitespace-nowrap"
            >
              <Wand2 className="w-3.5 h-3.5" />
              {isLoadingDemo ? 'Đang nạp mẫu...' : 'Nạp dự án mẫu thử'}
            </button>
          )}
        </div>
      </div>

      {/* Main Video Monitor Viewport */}
      <div className="flex-1 min-h-0 flex items-center justify-center p-4 overflow-hidden relative">
        <div
          className="relative flex items-center justify-center w-full h-full"
          style={{ maxHeight: '100%', maxWidth: '100%' }}
        >
          <canvas
            ref={canvasRef}
            onClick={onTogglePlay}
            className="max-w-full max-h-full rounded-lg border border-[#262C38] bg-[#0B0D11] shadow-2xl cursor-pointer object-contain"
            style={{
              aspectRatio:
                aspectRatio === '16:9' ? '16 / 9' : aspectRatio === '9:16' ? '9 / 16' : '1 / 1',
            }}
          />

          {isEmptyWorkspace && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-6 text-center">
              <div className="pointer-events-auto max-w-md rounded-xl border border-[#262C38] bg-[#11141B]/95 px-6 py-5">
                <h1 className="text-base font-semibold text-slate-100">
                  Bắt đầu dự án SyncCut Studio
                </h1>
                <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
                  Tải lên kho ảnh của bạn, thêm tệp giọng đọc MP3 cùng timeline lời nói. Bạn có thể gửi trước ảnh cho 1–2 phút đầu để ghép, xem trước, lưu lại rồi làm tiếp các đoạn sau.
                </p>
                <div className="mt-4 flex items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={onLoadDemo}
                    disabled={isLoadingDemo}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold transition-colors"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    {isLoadingDemo ? 'Đang nạp...' : 'Mở dự án mẫu (24s / 36s)'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Transport Control Bar */}
      <div className="px-4 py-2 border-t border-[#252A35] bg-[#11141B] flex items-center justify-between gap-4 shrink-0 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSeek(0)}
            title="Về đầu 00:00"
            className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-[#1A1E26] transition-colors"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            disabled={totalDurationSec <= 0}
            className="w-8 h-8 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center disabled:opacity-40 transition-colors"
            title={isPlaying ? 'Tạm dừng' : 'Phát xem trước'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>

          <button
            type="button"
            onClick={() => onSeek(coveredUntilSec > 0 ? coveredUntilSec : totalDurationSec)}
            title="Nhảy đến mốc đã ghép cuối cùng"
            className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-[#1A1E26] transition-colors"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          <div className="ml-2 text-xs font-mono tabular-nums text-slate-200">
            <span>{formatTimecode(currentTime, true)}</span>
            <span className="text-slate-600 mx-1.5">/</span>
            <span className="text-slate-400">{formatTimecode(effectiveLimit, true)}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {coveredUntilSec > 0 && coveredUntilSec < totalDurationSec - 0.5 && (
            <div className="inline-flex items-center p-0.5 rounded-md bg-[#0B0D11] border border-[#252A35]">
              <button
                type="button"
                onClick={() => onTogglePlayOnlyCovered(true)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                  playOnlyCovered
                    ? 'bg-[#252A35] text-amber-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Xem phần đã ghép ({formatTimecode(coveredUntilSec, false)})
              </button>
              <button
                type="button"
                onClick={() => onTogglePlayOnlyCovered(false)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                  !playOnlyCovered
                    ? 'bg-[#252A35] text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Toàn bộ MP3
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onToggleMute}
            title={muted ? 'Bật âm thanh' : 'Tắt tiếng'}
            className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-[#1A1E26] transition-colors"
          >
            {muted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Selected Clip Quick Inspector Strip */}
      {selectedClip && (
        <div className="px-4 py-2.5 border-t border-[#252A35] bg-[#13161C] flex items-center justify-between gap-3 flex-wrap shrink-0">
          <input
            ref={clipReplaceInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onReplaceClipWithFile(selectedClip.id, file);
              e.target.value = '';
            }}
          />

          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-amber-400 whitespace-nowrap">
              Cảnh đang chọn
            </span>

            {/* Swap image from library */}
            <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
              <span>Ảnh:</span>
              <select
                value={selectedClip.imageId}
                onChange={(e) => onUpdateClip(selectedClip.id, { imageId: e.target.value })}
                className="bg-[#0B0D11] border border-[#2A303E] rounded px-2 py-1 text-[11px] text-slate-200 max-w-[150px] focus:outline-none focus:border-amber-500"
              >
                {images.map((img, i) => (
                  <option key={img.id} value={img.id}>
                    #{i + 1} {img.name}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => clipReplaceInputRef.current?.click()}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[#2A303E] bg-[#1A1E26] hover:bg-[#232936] text-[11px] text-slate-200 whitespace-nowrap"
            >
              <Upload className="w-3 h-3" />
              Đổi từ máy
            </button>

            {/* Ken Burns motion */}
            <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
              <span>Chuyển động:</span>
              <select
                value={selectedClip.motion}
                onChange={(e) =>
                  onUpdateClip(selectedClip.id, { motion: e.target.value as KenBurnsPreset })
                }
                className="bg-[#0B0D11] border border-[#2A303E] rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-amber-500"
              >
                <option value="zoom-in">Zoom vào nhẹ</option>
                <option value="zoom-out">Zoom ra nhẹ</option>
                <option value="pan-left">Lia sang trái</option>
                <option value="pan-right">Lia sang phải</option>
                <option value="none">Đứng yên</option>
              </select>
            </label>

            {/* Transition */}
            <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
              <span>Chuyển cảnh:</span>
              <select
                value={selectedClip.transition}
                onChange={(e) =>
                  onUpdateClip(selectedClip.id, { transition: e.target.value as TransitionType })
                }
                className="bg-[#0B0D11] border border-[#2A303E] rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-amber-500"
              >
                <option value="crossfade">Mờ chéo</option>
                <option value="fade-black">Chuyển đen</option>
                <option value="slide-left">Trượt mượt</option>
                <option value="none">Cắt thẳng</option>
              </select>
            </label>

            {/* Start / End direct editing */}
            <div className="inline-flex items-center gap-1 text-[11px] text-slate-400">
              <input
                type="text"
                defaultValue={formatTimecode(selectedClip.startSec, true)}
                key={`${selectedClip.id}-cs-${selectedClip.startSec}`}
                onBlur={(e) => {
                  const val = parseTimeInput(e.target.value);
                  if (val !== null && val < selectedClip.endSec - 0.2) {
                    onUpdateClip(selectedClip.id, { startSec: val });
                  }
                }}
                className="w-[58px] px-1.5 py-1 font-mono tabular-nums bg-[#0B0D11] border border-[#2A303E] rounded text-slate-200 focus:outline-none focus:border-amber-500"
              />
              <span>–</span>
              <input
                type="text"
                defaultValue={formatTimecode(selectedClip.endSec, true)}
                key={`${selectedClip.id}-ce-${selectedClip.endSec}`}
                onBlur={(e) => {
                  const val = parseTimeInput(e.target.value);
                  if (val !== null && val > selectedClip.startSec + 0.2) {
                    onUpdateClip(selectedClip.id, { endSec: val });
                  }
                }}
                className="w-[58px] px-1.5 py-1 font-mono tabular-nums bg-[#0B0D11] border border-[#2A303E] rounded text-slate-200 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onUpdateClip(selectedClip.id, { locked: !selectedClip.locked })}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-[11px] transition-colors ${
                selectedClip.locked
                  ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                  : 'border-[#2A303E] bg-[#1A1E26] text-slate-300 hover:text-slate-100'
              }`}
            >
              {selectedClip.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
              {selectedClip.locked ? 'Đã khóa' : 'Khóa cảnh'}
            </button>
            <button
              type="button"
              onClick={() => onDeleteClip(selectedClip.id)}
              title="Xóa cảnh khỏi timeline"
              className="p-1.5 rounded border border-[#2A303E] bg-[#1A1E26] text-slate-400 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
