import React, { useRef, useState } from 'react';
import { Upload, Trash2, RefreshCw, Plus, Image as ImageIcon, ArrowRight } from 'lucide-react';
import type { UploadedImage, VisualClip } from '../types';

interface ImageLibraryPanelProps {
  images: UploadedImage[];
  clips: VisualClip[];
  isUploading: boolean;
  onUploadImages: (files: FileList | File[]) => void;
  onReplaceImage: (imageId: string, file: File) => void;
  onDeleteImage: (imageId: string) => void;
  onClearImages: () => void;
  onAppendImageAsClip: (imageId: string) => void;
  onGoToMatch: () => void;
}

export const ImageLibraryPanel: React.FC<ImageLibraryPanelProps> = ({
  images,
  clips,
  isUploading,
  onUploadImages,
  onReplaceImage,
  onDeleteImage,
  onClearImages,
  onAppendImageAsClip,
  onGoToMatch,
}) => {
  const multiInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'unused' | 'used'>('all');

  const usedImageIds = new Set(clips.map((c) => c.imageId));
  const unusedCount = images.filter((img) => !usedImageIds.has(img.id)).length;

  const filteredImages = images.filter((img) => {
    if (filterMode === 'unused') return !usedImageIds.has(img.id);
    if (filterMode === 'used') return usedImageIds.has(img.id);
    return true;
  });

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUploadImages(e.dataTransfer.files);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header summary */}
      <div className="px-4 pt-4 pb-3 border-b border-[#252A35] shrink-0">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-100">Kho ảnh của bạn</h2>
          <div className="flex items-center gap-2 text-xs text-slate-400 tabular-nums">
            <span>{images.length} ảnh</span>
            <span aria-hidden="true">·</span>
            <span>{unusedCount} chưa ghép</span>
          </div>
        </div>
        <p className="mt-1 text-xs text-slate-400 leading-relaxed">
          Tải lên từng đợt ảnh (ví dụ ảnh cho 2 phút đầu), AI sẽ đánh giá nội dung và ghép khớp tới đúng đoạn đó.
        </p>

        {/* Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => multiInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              multiInputRef.current?.click();
            }
          }}
          className={`mt-3 rounded-lg border border-dashed px-4 py-4 text-center cursor-pointer transition-colors ${
            isDragging
              ? 'border-amber-500 bg-amber-500/10'
              : 'border-[#313847] bg-[#13161C] hover:border-slate-500 hover:bg-[#171B23]'
          }`}
        >
          <input
            ref={multiInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                onUploadImages(e.target.files);
                e.target.value = '';
              }
            }}
          />
          <input
            ref={replaceInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && replacingId) {
                onReplaceImage(replacingId, file);
              }
              setReplacingId(null);
              e.target.value = '';
            }}
          />
          <Upload className="w-5 h-5 mx-auto text-amber-500 mb-1.5" />
          <div className="text-xs font-medium text-slate-200">
            {isUploading ? 'Đang xử lý ảnh...' : 'Kéo thả hoặc bấm để tải nhiều ảnh lên'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Hỗ trợ JPG, PNG, WebP · Giữ nguyên độ nét gốc khi xuất video
          </div>
        </div>

        {/* Filter segmented control */}
        {images.length > 0 && (
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="inline-flex items-center p-0.5 rounded-md bg-[#13161C] border border-[#252A35]">
              {(
                [
                  { id: 'all', label: `Tất cả (${images.length})` },
                  { id: 'unused', label: `Mới (${unusedCount})` },
                  { id: 'used', label: `Đã ghép (${images.length - unusedCount})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterMode(tab.id)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                    filterMode === tab.id
                      ? 'bg-[#252A35] text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onClearImages}
              className="text-[11px] text-slate-500 hover:text-red-400 transition-colors whitespace-nowrap"
            >
              Xóa hết
            </button>
          </div>
        )}
      </div>

      {/* Image Grid */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        {filteredImages.length === 0 ? (
          <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-center px-4">
            <ImageIcon className="w-8 h-8 text-slate-600 mb-2" />
            <p className="text-xs font-medium text-slate-300">
              {images.length === 0 ? 'Chưa có ảnh nào trong kho' : 'Không có ảnh ở mục lọc này'}
            </p>
            <p className="text-[11px] text-slate-500 mt-1 max-w-[240px]">
              {images.length === 0
                ? 'Hãy tải lên các ảnh bạn muốn dựng. Bạn có thể gửi từng đợt nhỏ và ghép nối tiếp.'
                : 'Chuyển sang tab Tất cả để xem toàn bộ ảnh đã tải.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredImages.map((img, idx) => {
              const isUsed = usedImageIds.has(img.id);
              return (
                <div
                  key={img.id}
                  className="group rounded-lg border border-[#252A35] bg-[#13161C] overflow-hidden flex flex-col"
                >
                  <div className="relative aspect-video bg-[#0B0D11] overflow-hidden">
                    <img
                      src={img.objectUrl}
                      alt={img.aiCaption || img.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2 py-1.5 flex items-center justify-between text-[11px]">
                      <span className="font-mono tabular-nums text-slate-200 font-medium">
                        #{String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className={isUsed ? 'text-emerald-400' : 'text-amber-400'}>
                        {isUsed ? 'Đã ghép' : 'Chưa ghép'}
                      </span>
                    </div>
                  </div>

                  <div className="p-2.5 flex-1 flex flex-col justify-between gap-2">
                    <div>
                      <div className="text-xs font-medium text-slate-200 truncate" title={img.name}>
                        {img.name}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2 leading-snug">
                        {img.aiCaption || `${img.width}×${img.height} px · Sẵn sàng đánh giá`}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-1.5 border-t border-[#1F242E]">
                      <button
                        type="button"
                        onClick={() => onAppendImageAsClip(img.id)}
                        title="Thêm ảnh này vào cuối timeline"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-300 hover:text-amber-400 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        Chèn
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setReplacingId(img.id);
                            replaceInputRef.current?.click();
                          }}
                          title="Thay thế ảnh này"
                          className="p-1 text-slate-400 hover:text-slate-100 rounded transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteImage(img.id)}
                          title="Xóa ảnh"
                          className="p-1 text-slate-400 hover:text-red-400 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer next-step action */}
      {images.length > 0 && (
        <div className="p-3 border-t border-[#252A35] bg-[#101318] shrink-0">
          <button
            type="button"
            onClick={onGoToMatch}
            className="w-full py-2 px-4 rounded-lg bg-[#1A1E26] hover:bg-[#232936] border border-[#2D3443] text-xs font-semibold text-slate-100 inline-flex items-center justify-center gap-2 transition-colors"
          >
            Chuyển sang AI Đánh giá &amp; Ghép khớp
            <ArrowRight className="w-3.5 h-3.5 text-amber-500" />
          </button>
        </div>
      )}
    </div>
  );
};
