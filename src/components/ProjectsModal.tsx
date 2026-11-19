import React from 'react';
import { X, FolderOpen, Plus, Trash2, Clock } from 'lucide-react';
import type { SavedProjectSummary } from '../types';
import { formatTimecode } from '../lib/timeUtils';

interface ProjectsModalProps {
  open: boolean;
  onClose: () => void;
  projects: SavedProjectSummary[];
  currentProjectId: string;
  onLoadProject: (id: string) => void;
  onCreateNewProject: () => void;
  onDeleteProject: (id: string) => void;
}

export const ProjectsModal: React.FC<ProjectsModalProps> = ({
  open,
  onClose,
  projects,
  currentProjectId,
  onLoadProject,
  onCreateNewProject,
  onDeleteProject,
}) => {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="projects-modal-title"
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-xl rounded-xl border border-[#2A303E] bg-[#13161C] overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b border-[#252A35] flex items-center justify-between">
          <div>
            <h2 id="projects-modal-title" className="text-base font-semibold text-slate-100">
              Dự án đã lưu trên máy
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Lưu đầy đủ tệp MP3, ảnh gốc độ nét cao và tiến độ ghép timeline để mở lại làm tiếp bất kỳ lúc nào.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-[#1E232E]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 max-h-[60vh] overflow-y-auto space-y-2.5">
          {projects.length === 0 ? (
            <div className="py-10 text-center">
              <FolderOpen className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-xs font-medium text-slate-300">Chưa có dự án nào được lưu</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Dự án hiện tại sẽ tự động lưu ngay khi bạn tải ảnh hoặc tệp MP3.
              </p>
            </div>
          ) : (
            projects.map((proj) => {
              const isCurrent = proj.id === currentProjectId;
              const pct =
                proj.totalDurationSec > 0
                  ? Math.min(100, Math.round((proj.coveredUntilSec / proj.totalDurationSec) * 100))
                  : 0;

              return (
                <div
                  key={proj.id}
                  className={`rounded-lg border p-3.5 flex items-center justify-between gap-4 transition-colors ${
                    isCurrent
                      ? 'border-amber-500/60 bg-amber-500/[0.06]'
                      : 'border-[#252A35] bg-[#0F1218] hover:border-slate-600'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-100 truncate">
                        {proj.name}
                      </span>
                      {isCurrent && (
                        <span className="text-[11px] font-medium text-amber-400 whitespace-nowrap">
                          · Đang mở
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400 tabular-nums flex-wrap">
                      <span>{proj.aspectRatio}</span>
                      <span aria-hidden="true">·</span>
                      <span>{proj.imageCount} ảnh</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-slate-200">
                        Đã ghép {formatTimecode(proj.coveredUntilSec, false)} /{' '}
                        {formatTimecode(proj.totalDurationSec, false)} ({pct}%)
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                      <Clock className="w-3 h-3" />
                      <span>
                        Lưu lần cuối:{' '}
                        {new Date(proj.updatedAt).toLocaleString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                          day: '2-digit',
                          month: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!isCurrent && (
                      <button
                        type="button"
                        onClick={() => {
                          onLoadProject(proj.id);
                          onClose();
                        }}
                        className="px-3 py-1.5 rounded-md bg-[#1A1E26] hover:bg-[#232936] border border-[#2D3443] text-xs font-medium text-slate-100"
                      >
                        Mở lại
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDeleteProject(proj.id)}
                      title="Xóa dự án"
                      className="p-1.5 rounded border border-[#252A35] text-slate-400 hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-[#252A35] bg-[#101318] flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              onCreateNewProject();
              onClose();
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Tạo dự án mới
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[#2A303E] bg-[#1A1E26] text-xs font-medium text-slate-300 hover:text-slate-100"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
