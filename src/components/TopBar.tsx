import React from 'react';
import { Download } from 'lucide-react';
import type { LeftTab } from '../types';

interface TopBarProps {
  activeTab: LeftTab;
  onSelectTab: (tab: LeftTab) => void;
  onOpenProjects: () => void;
  onOpenExport: () => void;
  canExport: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  onOpenProjects,
  onOpenExport,
  canExport,
}) => {
  const navItems: Array<{ id: LeftTab | 'projects'; label: string }> = [
    { id: 'images', label: 'Kho ảnh' },
    { id: 'audio', label: 'Giọng đọc & Timeline' },
    { id: 'match', label: 'Đánh giá khớp' },
    { id: 'projects', label: 'Dự án đã lưu' },
  ];

  return (
    <header className="h-14 shrink-0 border-b border-[#252A35] bg-[#0B0D11] px-6 flex items-center justify-between gap-8">
      {/* Zone 1: Single-line brand wordmark */}
      <a
        href="#top"
        onClick={(e) => {
          e.preventDefault();
          onSelectTab('images');
        }}
        className="text-[17px] font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded"
      >
        SyncCut Studio
      </a>

      {/* Zone 2: Clean single-line text nav links */}
      <nav
        aria-label="Điều hướng chính"
        className="flex items-center gap-7 overflow-x-auto"
      >
        {navItems.map((item) => {
          const isActive = item.id !== 'projects' && activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.id === 'projects') {
                  onOpenProjects();
                } else {
                  onSelectTab(item.id);
                }
              }}
              className={`relative py-4 text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded ${
                isActive
                  ? 'text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.label}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-[2px] bg-amber-500"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Single primary CTA */}
      <div className="shrink-0 flex items-center">
        <button
          type="button"
          onClick={onOpenExport}
          disabled={!canExport}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          <Download className="w-3.5 h-3.5" />
          Xuất video
        </button>
      </div>
    </header>
  );
};
