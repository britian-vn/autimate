import React, { useState } from 'react';
import {
  Sparkles,
  Loader2,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  ListOrdered,
  Lock,
  Unlock,
  Upload,
} from 'lucide-react';
import type { SubtitleCue, UploadedImage, VisualClip } from '../types';
import { formatTimecode } from '../lib/timeUtils';

export interface EvaluateRequestOptions {
  mode: 'natural' | 'per-cue';
  incremental: boolean;
  stopWhenImagesExhausted: boolean;
  onlyUnusedImages: boolean;
}

interface AiMatchPanelProps {
  images: UploadedImage[];
  cues: SubtitleCue[];
  clips: VisualClip[];
  coveredUntilSec: number;
  totalDurationSec: number;
  selectedClipId: string | null;
  lastAiSummary?: string;
  isEvaluating: boolean;
  evaluateError: string | null;
  onRunAiEvaluate: (opts: EvaluateRequestOptions) => void;
  onSequentialAutoMatch: (incremental: boolean) => void;
  onSelectClip: (clipId: string) => void;
  onSwapClipImage: (clipId: string, newImageId: string) => void;
  onToggleLockClip: (clipId: string) => void;
  onGoToUploadMore: () => void;
}

export const AiMatchPanel: React.FC<AiMatchPanelProps> = ({
  images,
  cues,
  clips,
  coveredUntilSec,
  totalDurationSec,
  selectedClipId,
  lastAiSummary,
  isEvaluating,
  evaluateError,
  onRunAiEvaluate,
  onSequentialAutoMatch,
  onSelectClip,
  onSwapClipImage,
  onToggleLockClip,
  onGoToUploadMore,
}) => {
  const [rhythmMode, setRhythmMode] = useState<'natural' | 'per-cue'>('natural');
  const [incremental, setIncremental] = useState(true);
  const [stopWhenExhausted, setStopWhenExhausted] = useState(true);
  const [onlyUnusedImages, setOnlyUnusedImages] = useState(true);

  const imageMap = new Map(images.map((i) => [i.id, i]));
  const usedImageIds = new Set(clips.map((c) => c.imageId));
  const unusedImagesCount = images.filter((i) => !usedImageIds.has(i.id)).length;

  const progressPct =
    totalDurationSec > 0 ? Math.min(100, Math.round((coveredUntilSec / totalDurationSec) * 100)) : 0;
  const remainingSec = Math.max(0, totalDurationSec - coveredUntilSec);
  const hasExistingClips = clips.length > 0;
  const canEvaluate = images.length > 0 && cues.length > 0 && !isEvaluating;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Progress & Incremental Controls */}
      <div className="p-4 border-b border-[#252A35] shrink-0 space-y-3">
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-semibold text-slate-100">Tiến độ ghép theo MP3</span>
            <span className="font-mono tabular-nums text-amber-400">
              {formatTimecode(coveredUntilSec, false)} / {formatTimecode(totalDurationSec, false)} ({progressPct}%)
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-[#1A1E26] overflow-hidden border border-[#252A35]">
            <div
              className="h-full bg-amber-500 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400 tabular-nums">
            <span>{clips.length} phân cảnh đã ghép</span>
            <span>
              {remainingSec > 0.5
                ? `Còn ${formatTimecode(remainingSec, false)} chưa có ảnh`
                : totalDurationSec > 0
                ? 'Đã phủ kín toàn bộ âm thanh'
                : 'Chưa có âm thanh'}
            </span>
          </div>
        </div>

        {/* Incremental Mode Selector */}
        <div className="space-y-2 pt-2 border-t border-[#1F242E]">
          {hasExistingClips && remainingSec > 0.5 && (
            <div className="grid grid-cols-2 gap-1 p-0.5 rounded-md bg-[#13161C] border border-[#252A35]">
              <button
                type="button"
                onClick={() => setIncremental(true)}
                className={`px-2 py-1.5 text-[11px] font-medium rounded transition-colors ${
                  incremental ? 'bg-[#252A35] text-slate-100' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Ghép tiếp từ {formatTimecode(coveredUntilSec, false)}
              </button>
              <button
                type="button"
                onClick={() => setIncremental(false)}
                className={`px-2 py-1.5 text-[11px] font-medium rounded transition-colors ${
                  !incremental ? 'bg-[#252A35] text-slate-100' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Đánh giá lại từ 00:00
              </button>
            </div>
          )}

          {/* Rhythm selector */}
          <div className="grid grid-cols-2 gap-1 p-0.5 rounded-md bg-[#13161C] border border-[#252A35]">
            <button
              type="button"
              onClick={() => setRhythmMode('natural')}
              className={`px-2 py-1 text-[11px] font-medium rounded transition-colors ${
                rhythmMode === 'natural' ? 'bg-[#252A35] text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Nhịp dựng tự nhiên
            </button>
            <button
              type="button"
              onClick={() => setRhythmMode('per-cue')}
              className={`px-2 py-1 text-[11px] font-medium rounded transition-colors ${
                rhythmMode === 'per-cue' ? 'bg-[#252A35] text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Khớp từng câu thoại
            </button>
          </div>

          <label className="flex items-start gap-2 text-[11px] text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={stopWhenExhausted}
              onChange={(e) => setStopWhenExhausted(e.target.checked)}
              className="mt-0.5 accent-amber-500 rounded"
            />
            <span>
              Làm đến đâu ghép đến đó (dừng khi hết ảnh phù hợp, không kéo giãn sang phần chưa gửi ảnh)
            </span>
          </label>

          {hasExistingClips && incremental && unusedImagesCount > 0 && (
            <label className="flex items-start gap-2 text-[11px] text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyUnusedImages}
                onChange={(e) => setOnlyUnusedImages(e.target.checked)}
                className="mt-0.5 accent-amber-500 rounded"
              />
              <span>Chỉ dùng {unusedImagesCount} ảnh mới tải thêm cho đợt ghép tiếp này</span>
            </label>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!canEvaluate}
            onClick={() =>
              onRunAiEvaluate({
                mode: rhythmMode,
                incremental: hasExistingClips && remainingSec > 0.5 ? incremental : false,
                stopWhenImagesExhausted: stopWhenExhausted,
                onlyUnusedImages: hasExistingClips && incremental && unusedImagesCount > 0 ? onlyUnusedImages : false,
              })
            }
            className="flex-1 py-2.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isEvaluating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                AI đang xem ảnh &amp; ghép...
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                {hasExistingClips && incremental && remainingSec > 0.5
                  ? 'AI Đánh giá & Ghép tiếp'
                  : 'AI Đánh giá & Ghép khớp'}
              </>
            )}
          </button>

          <button
            type="button"
            disabled={images.length === 0 || cues.length === 0 || isEvaluating}
            onClick={() => onSequentialAutoMatch(hasExistingClips && remainingSec > 0.5 && incremental)}
            title="Ghép nhanh lần lượt theo thứ tự ảnh đã tải"
            className="py-2.5 px-3 rounded-lg border border-[#2D3443] bg-[#1A1E26] hover:bg-[#232936] text-slate-200 text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-40 whitespace-nowrap"
          >
            <ListOrdered className="w-3.5 h-3.5" />
            Theo thứ tự
          </button>
        </div>

        {evaluateError && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{evaluateError}</span>
          </div>
        )}

        {lastAiSummary && !evaluateError && (
          <div className="text-[11px] text-slate-300 leading-relaxed bg-[#13161C] border border-[#252A35] rounded-md px-3 py-2">
            {lastAiSummary}
          </div>
        )}
      </div>

      {/* Evaluated clips review list */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0 space-y-2.5">
        {clips.length === 0 ? (
          <div className="py-10 text-center">
            <Sparkles className="w-7 h-7 text-slate-600 mx-auto mb-2" />
            <p className="text-xs font-medium text-slate-300">Chưa có phân cảnh nào được ghép</p>
            <p className="text-[11px] text-slate-500 mt-1 max-w-[260px] mx-auto">
              Tải ảnh ở tab Kho ảnh, nạp MP3 &amp; timeline, rồi nhấn AI Đánh giá &amp; Ghép khớp để xem nhận xét chi tiết từng cảnh.
            </p>
          </div>
        ) : (
          <>
            {clips.map((clip, index) => {
              const img = imageMap.get(clip.imageId);
              const isSelected = clip.id === selectedClipId;
              const matchColor =
                clip.matchLevel === 'high'
                  ? 'text-emerald-400'
                  : clip.matchLevel === 'medium'
                  ? 'text-amber-400'
                  : clip.matchLevel === 'low'
                  ? 'text-red-400'
                  : 'text-slate-400';

              const matchText =
                clip.matchLevel === 'high'
                  ? `Khớp cao ${clip.matchScore ?? ''}%`
                  : clip.matchLevel === 'medium'
                  ? `Trung bình ${clip.matchScore ?? ''}%`
                  : clip.matchLevel === 'low'
                  ? `Cần đổi ảnh ${clip.matchScore ?? ''}%`
                  : 'Ghép thủ công';

              const alts = (clip.suggestedAltImageIds ?? [])
                .map((id) => imageMap.get(id))
                .filter((x): x is UploadedImage => Boolean(x));

              return (
                <div
                  key={clip.id}
                  onClick={() => onSelectClip(clip.id)}
                  className={`rounded-lg border p-2.5 cursor-pointer transition-colors ${
                    isSelected
                      ? 'border-amber-500 bg-[#1A1E26]'
                      : 'border-[#252A35] bg-[#13161C] hover:border-[#343C4C]'
                  }`}
                >
                  <div className="flex gap-2.5">
                    <div className="w-20 h-14 rounded overflow-hidden bg-[#0B0D11] shrink-0 border border-[#252A35]">
                      {img ? (
                        <img
                          src={img.objectUrl}
                          alt={img.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-600">
                          Thiếu ảnh
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-slate-300">
                          <span className="font-semibold text-slate-100">Cảnh {index + 1}</span>
                          <span aria-hidden="true" className="text-slate-600">·</span>
                          <span>
                            {formatTimecode(clip.startSec, false)}–{formatTimecode(clip.endSec, false)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleLockClip(clip.id);
                          }}
                          title={clip.locked ? 'Đang khóa cảnh (giữ nguyên khi ghép tiếp)' : 'Khóa cảnh này'}
                          className={`p-1 rounded transition-colors ${
                            clip.locked ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          {clip.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                        </button>
                      </div>

                      <div className={`mt-0.5 flex items-center gap-1 text-[11px] font-medium ${matchColor}`}>
                        {clip.matchLevel === 'high' && <CheckCircle2 className="w-3 h-3 shrink-0" />}
                        {clip.matchLevel === 'medium' && <AlertTriangle className="w-3 h-3 shrink-0" />}
                        {clip.matchLevel === 'low' && <AlertCircle className="w-3 h-3 shrink-0" />}
                        <span className="tabular-nums">{matchText}</span>
                      </div>

                      {clip.matchReason && (
                        <p className="mt-1 text-[11px] text-slate-400 leading-snug">
                          {clip.matchReason}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 1-click alternative image suggestions */}
                  {alts.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-[#1F242E] flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] text-slate-500">Đổi nhanh:</span>
                      {alts.map((alt) => (
                        <button
                          key={alt.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSwapClipImage(clip.id, alt.id);
                          }}
                          className="inline-flex items-center gap-1.5 pr-2 pl-1 py-0.5 rounded bg-[#0B0D11] border border-[#2A303E] hover:border-amber-500 text-[11px] text-slate-300 hover:text-slate-100 transition-colors"
                        >
                          <img
                            src={alt.objectUrl}
                            alt={alt.name}
                            referrerPolicy="no-referrer"
                            className="w-5 h-3.5 object-cover rounded-sm"
                          />
                          <span className="max-w-[100px] truncate">{alt.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Prompt to upload next batch if uncovered audio remains */}
            {remainingSec > 0.5 && (
              <div className="rounded-lg border border-dashed border-[#313847] bg-[#101318] p-3 text-center">
                <div className="text-xs font-medium text-slate-200 tabular-nums">
                  Còn {formatTimecode(remainingSec, false)} chưa có ảnh (từ {formatTimecode(coveredUntilSec, false)})
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Bạn có thể lưu và xem ngay phần đã ghép, hoặc tải thêm ảnh đợt tiếp theo để ghép nối tiếp.
                </p>
                <button
                  type="button"
                  onClick={onGoToUploadMore}
                  className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#1A1E26] hover:bg-[#232936] border border-[#2D3443] text-xs font-medium text-amber-400 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Tải thêm ảnh cho phần tiếp theo
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
