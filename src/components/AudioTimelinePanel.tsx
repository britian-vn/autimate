import React, { useRef, useState } from 'react';
import {
  Music,
  FileText,
  Sparkles,
  Plus,
  Trash2,
  Download,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import type { AudioAsset, SubtitleCue } from '../types';
import {
  createId,
  exportCuesToSrt,
  formatTimecode,
  parseSrtOrVtt,
  parseTimeInput,
} from '../lib/timeUtils';

interface AudioTimelinePanelProps {
  audio: AudioAsset | null;
  cues: SubtitleCue[];
  currentTime: number;
  isDecodingAudio: boolean;
  isTranscribing: boolean;
  transcribeError: string | null;
  onUploadAudio: (file: File) => void;
  onTranscribeAudio: () => void;
  onSetCues: (cues: SubtitleCue[]) => void;
  onSeek: (sec: number) => void;
}

export const AudioTimelinePanel: React.FC<AudioTimelinePanelProps> = ({
  audio,
  cues,
  currentTime,
  isDecodingAudio,
  isTranscribing,
  transcribeError,
  onUploadAudio,
  onTranscribeAudio,
  onSetCues,
  onSeek,
}) => {
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const srtFileInputRef = useRef<HTMLInputElement | null>(null);
  const [inputMode, setInputMode] = useState<'list' | 'paste'>('list');
  const [rawPaste, setRawPaste] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);

  const handleImportText = (text: string) => {
    const parsed = parseSrtOrVtt(text);
    if (parsed.length === 0) {
      setPasteError(
        'Không đọc được mốc thời gian. Hãy dùng định dạng SRT/VTT hoặc mỗi dòng "00:00 - 00:05 Nội dung".'
      );
      return;
    }
    setPasteError(null);
    onSetCues(parsed);
    setRawPaste('');
    setInputMode('list');
  };

  const handleSrtFile = async (file: File) => {
    const content = await file.text();
    handleImportText(content);
  };

  const handleAddManualCue = () => {
    const lastEnd = cues.length > 0 ? cues[cues.length - 1].endSec : 0;
    const maxDur = audio?.durationSec ? audio.durationSec : lastEnd + 6;
    const nextEnd = Math.min(maxDur > lastEnd ? maxDur : lastEnd + 5, lastEnd + 5);
    const nextCue: SubtitleCue = {
      id: createId('cue'),
      startSec: Number(lastEnd.toFixed(2)),
      endSec: Number(Math.max(lastEnd + 1, nextEnd).toFixed(2)),
      text: 'Nhập nội dung lời thoại tại đây...',
    };
    onSetCues([...cues, nextCue]);
  };

  const handleUpdateCue = (id: string, patch: Partial<SubtitleCue>) => {
    onSetCues(
      cues
        .map((c) => (c.id === id ? { ...c, ...patch } : c))
        .sort((a, b) => a.startSec - b.startSec)
    );
  };

  const handleDeleteCue = (id: string) => {
    onSetCues(cues.filter((c) => c.id !== id));
  };

  const handleDownloadSrt = () => {
    if (cues.length === 0) return;
    const srt = exportCuesToSrt(cues);
    const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'timeline_subtitles.srt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Audio upload section */}
      <div className="p-4 border-b border-[#252A35] shrink-0">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <h2 className="text-sm font-semibold text-slate-100">Giọng đọc MP3 / WAV</h2>
          {audio && (
            <span className="text-xs font-mono tabular-nums text-amber-400">
              {formatTimecode(audio.durationSec, false)}
            </span>
          )}
        </div>

        <input
          ref={audioInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUploadAudio(file);
            e.target.value = '';
          }}
        />
        <input
          ref={srtFileInputRef}
          type="file"
          accept=".srt,.vtt,.txt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleSrtFile(file);
            e.target.value = '';
          }}
        />

        {audio ? (
          <div className="rounded-lg border border-[#252A35] bg-[#13161C] p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <Music className="w-4 h-4 text-amber-500 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-100 truncate">{audio.name}</div>
                  <div className="text-[11px] text-slate-400 tabular-nums">
                    Thời lượng {formatTimecode(audio.durationSec, false)} · Đã giải mã sóng âm
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => audioInputRef.current?.click()}
                className="px-2.5 py-1.5 text-[11px] font-medium rounded border border-[#2D3443] bg-[#1A1E26] text-slate-200 hover:bg-[#232936] whitespace-nowrap shrink-0"
              >
                Đổi tệp
              </button>
            </div>

            <div className="mt-3 pt-2.5 border-t border-[#1F242E] flex items-center gap-2">
              <button
                type="button"
                onClick={onTranscribeAudio}
                disabled={isTranscribing}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-xs font-semibold text-amber-300 disabled:opacity-50 transition-colors"
              >
                {isTranscribing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    AI đang tách lời &amp; mốc giây...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    Tự động tách timeline từ MP3 bằng AI
                  </>
                )}
              </button>
            </div>
            {transcribeError && (
              <div className="mt-2 flex items-start gap-1.5 text-[11px] text-red-400">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{transcribeError}</span>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => audioInputRef.current?.click()}
            className="w-full rounded-lg border border-dashed border-[#313847] bg-[#13161C] hover:border-slate-500 hover:bg-[#171B23] px-4 py-4 text-center transition-colors"
          >
            <Music className="w-5 h-5 mx-auto text-amber-500 mb-1.5" />
            <div className="text-xs font-medium text-slate-200">
              {isDecodingAudio ? 'Đang giải mã âm thanh...' : 'Tải lên tệp giọng đọc MP3 / WAV / M4A'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Hỗ trợ cả tệp dài 10+ phút · Tự động hiển thị sóng âm
            </div>
          </button>
        )}
      </div>

      {/* Timeline script header */}
      <div className="px-4 pt-3 pb-2.5 border-b border-[#252A35] shrink-0">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-slate-200">
            Timeline lời nói ({cues.length} đoạn)
          </h3>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => srtFileInputRef.current?.click()}
              className="px-2 py-1 text-[11px] font-medium text-slate-300 hover:text-slate-100 rounded border border-[#252A35] bg-[#13161C] hover:bg-[#1A1E26] inline-flex items-center gap-1 whitespace-nowrap"
            >
              <FileText className="w-3 h-3" />
              Tải SRT/VTT
            </button>
            {cues.length > 0 && (
              <button
                type="button"
                onClick={handleDownloadSrt}
                title="Tải xuống file SRT"
                className="p-1.5 text-slate-400 hover:text-slate-100 rounded border border-[#252A35] bg-[#13161C]"
              >
                <Download className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-2.5 inline-flex items-center p-0.5 rounded-md bg-[#13161C] border border-[#252A35]">
          <button
            type="button"
            onClick={() => setInputMode('list')}
            className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
              inputMode === 'list' ? 'bg-[#252A35] text-slate-100' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Danh sách chỉnh tay
          </button>
          <button
            type="button"
            onClick={() => setInputMode('paste')}
            className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
              inputMode === 'paste' ? 'bg-[#252A35] text-slate-100' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Dán nhanh SRT / Mốc giây
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        {inputMode === 'paste' ? (
          <div className="flex flex-col gap-2.5 h-full">
            <textarea
              value={rawPaste}
              onChange={(e) => setRawPaste(e.target.value)}
              placeholder={`Dán nội dung SRT/VTT hoặc từng dòng mốc thời gian, ví dụ:\n00:00 - 00:06 Mở đầu câu chuyện vào buổi bình minh\n00:06 - 00:12 Nhâm nhi ly cà phê sáng bên góc phố\n00:12 - 00:20 Bắt đầu một ngày làm việc sáng tạo`}
              className="w-full flex-1 min-h-[200px] rounded-lg border border-[#252A35] bg-[#0F1218] p-3 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500 resize-none"
            />
            {pasteError && (
              <div className="text-[11px] text-red-400 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{pasteError}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleImportText(rawPaste)}
                disabled={!rawPaste.trim()}
                className="flex-1 py-2 px-3 rounded-lg bg-amber-500 text-slate-950 text-xs font-semibold hover:bg-amber-400 disabled:opacity-40 transition-colors"
              >
                Phân tích &amp; Nạp vào timeline
              </button>
              <button
                type="button"
                onClick={() => setInputMode('list')}
                className="py-2 px-3 rounded-lg border border-[#252A35] bg-[#13161C] text-xs font-medium text-slate-300 hover:text-slate-100"
              >
                Hủy
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {cues.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-xs font-medium text-slate-300">Chưa có timeline lời nói</p>
                <p className="text-[11px] text-slate-500 mt-1 max-w-[260px] mx-auto">
                  Hãy tải file SRT/VTT, dán mốc giây, bấm tách tự động từ MP3, hoặc thêm từng dòng thủ công bên dưới.
                </p>
              </div>
            ) : (
              cues.map((cue, idx) => {
                const isActive = currentTime >= cue.startSec && currentTime <= cue.endSec;
                return (
                  <div
                    key={cue.id}
                    className={`rounded-lg border p-2.5 transition-colors ${
                      isActive
                        ? 'border-amber-500/60 bg-amber-500/[0.06]'
                        : 'border-[#252A35] bg-[#13161C]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onSeek(cue.startSec)}
                          className="text-[11px] font-mono tabular-nums text-slate-400 hover:text-amber-400"
                          title="Nhảy đến mốc này"
                        >
                          #{idx + 1}
                        </button>
                        <input
                          type="text"
                          defaultValue={formatTimecode(cue.startSec, true)}
                          key={`${cue.id}-s-${cue.startSec}`}
                          onBlur={(e) => {
                            const val = parseTimeInput(e.target.value);
                            if (val !== null && val < cue.endSec) {
                              handleUpdateCue(cue.id, { startSec: val });
                            }
                          }}
                          className="w-[64px] px-1.5 py-0.5 text-[11px] font-mono tabular-nums bg-[#0B0D11] border border-[#252A35] rounded text-slate-200 focus:outline-none focus:border-amber-500"
                        />
                        <span className="text-slate-600 text-[11px]">–</span>
                        <input
                          type="text"
                          defaultValue={formatTimecode(cue.endSec, true)}
                          key={`${cue.id}-e-${cue.endSec}`}
                          onBlur={(e) => {
                            const val = parseTimeInput(e.target.value);
                            if (val !== null && val > cue.startSec) {
                              handleUpdateCue(cue.id, { endSec: val });
                            }
                          }}
                          className="w-[64px] px-1.5 py-0.5 text-[11px] font-mono tabular-nums bg-[#0B0D11] border border-[#252A35] rounded text-slate-200 focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteCue(cue.id)}
                        title="Xóa dòng này"
                        className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <textarea
                      rows={2}
                      value={cue.text}
                      onChange={(e) => handleUpdateCue(cue.id, { text: e.target.value })}
                      className="w-full text-xs text-slate-200 bg-[#0B0D11] border border-[#222733] rounded px-2 py-1.5 focus:outline-none focus:border-amber-500 resize-none leading-relaxed"
                    />
                  </div>
                );
              })
            )}

            <button
              type="button"
              onClick={handleAddManualCue}
              className="w-full py-2 px-3 rounded-lg border border-dashed border-[#313847] hover:border-slate-500 text-xs font-medium text-slate-300 hover:text-slate-100 inline-flex items-center justify-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Thêm dòng lời nói thủ công
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
