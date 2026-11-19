import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AudioAsset,
  KenBurnsPreset,
  LeftTab,
  SavedProjectSummary,
  StudioProjectState,
  SubtitleCue,
  UploadedImage,
  VisualClip,
} from './types';
import { TopBar } from './components/TopBar';
import { ImageLibraryPanel } from './components/ImageLibraryPanel';
import { AudioTimelinePanel } from './components/AudioTimelinePanel';
import { AiMatchPanel, type EvaluateRequestOptions } from './components/AiMatchPanel';
import { PreviewStage } from './components/PreviewStage';
import { MultiTrackTimeline } from './components/MultiTrackTimeline';
import { ExportModal } from './components/ExportModal';
import { ProjectsModal } from './components/ProjectsModal';
import {
  blobToBase64,
  buildSampleDemoWorkspace,
  decodeAudioBlob,
  processUploadedImageFile,
} from './lib/mediaUtils';
import {
  computeCoveredUntil,
  computeTotalDuration,
  deleteProjectFromDb,
  listSavedProjects,
  loadProjectFromDb,
  saveProjectToDb,
} from './lib/projectDb';
import { createId, formatTimecode } from './lib/timeUtils';

function createEmptyProject(name = 'Dự án video mới'): StudioProjectState {
  return {
    id: createId('proj'),
    name,
    aspectRatio: '16:9',
    fitMode: 'cover',
    subtitleStyle: {
      enabled: true,
      position: 'bottom',
      fontSize: 'md',
    },
    images: [],
    audio: null,
    cues: [],
    clips: [],
    updatedAt: Date.now(),
  };
}

const MOTION_CYCLE: KenBurnsPreset[] = ['zoom-in', 'pan-right', 'zoom-out', 'pan-left'];

export default function App() {
  const [project, setProject] = useState<StudioProjectState>(() => createEmptyProject());
  const [activeTab, setActiveTab] = useState<LeftTab>('images');
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playOnlyCovered, setPlayOnlyCovered] = useState(true);
  const [muted, setMuted] = useState(false);

  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [isDecodingAudio, setIsDecodingAudio] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluateError, setEvaluateError] = useState<string | null>(null);
  const [isLoadingDemo, setIsLoadingDemo] = useState(false);

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [savedProjects, setSavedProjects] = useState<SavedProjectSummary[]>([]);
  const [projectsModalOpen, setProjectsModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const imageElementsRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const [imageLoadVersion, setImageLoadVersion] = useState(0);
  const hydratedRef = useRef(false);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3400);
  }, []);

  const coveredUntilSec = useMemo(() => computeCoveredUntil(project), [project.clips]);
  const totalDurationSec = useMemo(
    () => computeTotalDuration(project),
    [project.audio, project.cues, project.clips]
  );

  const selectedClip = useMemo(
    () => project.clips.find((c) => c.id === selectedClipId) ?? null,
    [project.clips, selectedClipId]
  );

  // Refresh saved project summaries
  const refreshSavedList = useCallback(async () => {
    try {
      const list = await listSavedProjects();
      setSavedProjects(list);
      return list;
    } catch {
      return [];
    }
  }, []);

  // Hydrate latest saved project on startup so saved progress (e.g. 2m / 10m) is restored seamlessly
  useEffect(() => {
    let active = true;
    (async () => {
      const list = await refreshSavedList();
      if (!active) return;
      if (list.length > 0) {
        const latest = await loadProjectFromDb(list[0].id);
        if (active && latest) {
          setProject(latest);
          setLastSavedAt(latest.updatedAt);
          setSaveStatus('saved');
        }
      }
      hydratedRef.current = true;
    })();
    return () => {
      active = false;
    };
  }, [refreshSavedList]);

  // Auto-save whenever meaningful project data changes
  useEffect(() => {
    if (!hydratedRef.current) return;
    const hasContent =
      project.images.length > 0 || project.audio !== null || project.cues.length > 0 || project.clips.length > 0;
    if (!hasContent) return;

    const timer = window.setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await saveProjectToDb(project);
        setLastSavedAt(Date.now());
        setSaveStatus('saved');
        await refreshSavedList();
      } catch {
        setSaveStatus('error');
      }
    }, 850);

    return () => window.clearTimeout(timer);
  }, [project, refreshSavedList]);

  const handleManualSave = async () => {
    setSaveStatus('saving');
    try {
      await saveProjectToDb(project);
      setLastSavedAt(Date.now());
      setSaveStatus('saved');
      await refreshSavedList();
      showToast('Đã lưu dự án và tiến độ hiện tại vào bộ nhớ trình duyệt.');
    } catch {
      setSaveStatus('error');
      showToast('Không thể lưu dự án. Bộ nhớ trình duyệt có thể đã đầy.');
    }
  };

  // Preload HTMLImageElements for Canvas rendering
  useEffect(() => {
    const cache = imageElementsRef.current;
    const activeIds = new Set(project.images.map((i) => i.id));
    for (const key of cache.keys()) {
      if (!activeIds.has(key)) cache.delete(key);
    }

    for (const img of project.images) {
      const existing = cache.get(img.id);
      if (!existing || existing.src !== img.objectUrl) {
        const el = new Image();
        el.onload = () => setImageLoadVersion((v) => v + 1);
        el.src = img.objectUrl;
        cache.set(img.id, el);
      }
    }
  }, [project.images]);

  // Sync mute state
  useEffect(() => {
    if (audioElRef.current) {
      audioElRef.current.muted = muted;
    }
  }, [muted]);

  // Playback loop (audio-driven when MP3 is present, wall-clock fallback otherwise)
  const effectiveStopSec =
    playOnlyCovered && coveredUntilSec > 0 ? coveredUntilSec : totalDurationSec;

  useEffect(() => {
    if (!isPlaying) return;
    if (effectiveStopSec <= 0) {
      setIsPlaying(false);
      return;
    }

    const audioEl = audioElRef.current;
    let rafId = 0;
    let lastPerf = performance.now();

    if (audioEl && project.audio) {
      if (Math.abs(audioEl.currentTime - currentTime) > 0.15) {
        audioEl.currentTime = Math.min(currentTime, project.audio.durationSec);
      }
      audioEl.play().catch(() => {});
    }

    const tick = (now: number) => {
      if (audioEl && project.audio && !audioEl.paused) {
        const t = audioEl.currentTime;
        if (t >= effectiveStopSec - 0.03) {
          audioEl.pause();
          setCurrentTime(effectiveStopSec);
          setIsPlaying(false);
          return;
        }
        setCurrentTime(t);
      } else {
        const dt = (now - lastPerf) / 1000;
        lastPerf = now;
        setCurrentTime((prev) => {
          const next = prev + dt;
          if (next >= effectiveStopSec) {
            setIsPlaying(false);
            return effectiveStopSec;
          }
          return next;
        });
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      if (audioEl && !audioEl.paused) {
        audioEl.pause();
      }
    };
  }, [isPlaying, effectiveStopSec, project.audio]);

  const handleSeek = useCallback(
    (sec: number) => {
      const clamped = Math.max(0, Math.min(Math.max(totalDurationSec, 0), sec));
      setCurrentTime(clamped);
      if (audioElRef.current && project.audio) {
        audioElRef.current.currentTime = Math.min(clamped, project.audio.durationSec);
      }
    },
    [totalDurationSec, project.audio]
  );

  const handleTogglePlay = useCallback(() => {
    if (totalDurationSec <= 0) return;
    setIsPlaying((prev) => {
      if (!prev && currentTime >= effectiveStopSec - 0.1) {
        handleSeek(0);
      }
      return !prev;
    });
  }, [totalDurationSec, currentTime, effectiveStopSec, handleSeek]);

  // Keyboard shortcut: Space to toggle playback
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
      e.preventDefault();
      handleTogglePlay();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleTogglePlay]);

  // Image uploads
  const handleUploadImages = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (list.length === 0) return;
    setIsUploadingImages(true);
    try {
      const processed: UploadedImage[] = [];
      for (const file of list) {
        const img = await processUploadedImageFile(file, file.name);
        processed.push(img);
      }
      setProject((prev) => ({
        ...prev,
        images: [...prev.images, ...processed],
        updatedAt: Date.now(),
      }));
      showToast(`Đã thêm ${processed.length} ảnh vào kho.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Lỗi khi đọc tệp ảnh.');
    } finally {
      setIsUploadingImages(false);
    }
  };

  const handleReplaceImage = async (imageId: string, file: File) => {
    try {
      const processed = await processUploadedImageFile(file, file.name);
      setProject((prev) => ({
        ...prev,
        images: prev.images.map((img) =>
          img.id === imageId
            ? {
                ...processed,
                id: imageId,
              }
            : img
        ),
        updatedAt: Date.now(),
      }));
      showToast('Đã thay thế ảnh và giữ nguyên mốc timeline.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không thể thay thế ảnh.');
    }
  };

  const handleReplaceClipWithFile = async (clipId: string, file: File) => {
    try {
      const processed = await processUploadedImageFile(file, file.name);
      setProject((prev) => ({
        ...prev,
        images: [...prev.images, processed],
        clips: prev.clips.map((c) =>
          c.id === clipId
            ? {
                ...c,
                imageId: processed.id,
                matchReason: 'Đã thay bằng ảnh mới từ máy tính.',
              }
            : c
        ),
        updatedAt: Date.now(),
      }));
      showToast('Đã đổi ảnh cho phân cảnh đang chọn.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không thể tải ảnh thay thế.');
    }
  };

  const handleDeleteImage = (imageId: string) => {
    setProject((prev) => ({
      ...prev,
      images: prev.images.filter((i) => i.id !== imageId),
      clips: prev.clips.filter((c) => c.imageId !== imageId),
      updatedAt: Date.now(),
    }));
  };

  const handleClearImages = () => {
    setProject((prev) => ({
      ...prev,
      images: [],
      clips: [],
      updatedAt: Date.now(),
    }));
    setSelectedClipId(null);
  };

  const handleAppendImageAsClip = (imageId: string) => {
    const startSec = coveredUntilSec;
    const defaultDur = 5;
    const endSec =
      totalDurationSec > startSec + 0.5
        ? Math.min(totalDurationSec, startSec + defaultDur)
        : startSec + defaultDur;
    const newClip: VisualClip = {
      id: createId('clip'),
      imageId,
      startSec: Number(startSec.toFixed(2)),
      endSec: Number(endSec.toFixed(2)),
      motion: MOTION_CYCLE[project.clips.length % MOTION_CYCLE.length],
      transition: project.clips.length === 0 ? 'fade-black' : 'crossfade',
      transitionDuration: 0.5,
      matchReason: 'Chèn thủ công vào cuối timeline.',
    };
    setProject((prev) => ({
      ...prev,
      clips: [...prev.clips, newClip],
      updatedAt: Date.now(),
    }));
    setSelectedClipId(newClip.id);
    handleSeek(newClip.startSec);
  };

  // Audio upload
  const handleUploadAudio = async (file: File) => {
    setIsDecodingAudio(true);
    setTranscribeError(null);
    setIsPlaying(false);
    try {
      const audioAsset: AudioAsset = await decodeAudioBlob(file, file.name);
      setProject((prev) => ({
        ...prev,
        audio: audioAsset,
        updatedAt: Date.now(),
      }));
      setCurrentTime(0);
      showToast(
        `Đã nạp giọng đọc "${file.name}" (${formatTimecode(audioAsset.durationSec, false)}).`
      );
    } catch {
      showToast('Không thể giải mã tệp âm thanh này. Hãy thử tệp MP3 hoặc WAV chuẩn.');
    } finally {
      setIsDecodingAudio(false);
    }
  };

  // AI Transcribe MP3 -> Timestamped Cues
  const handleTranscribeAudio = async () => {
    if (!project.audio) return;
    setIsTranscribing(true);
    setTranscribeError(null);
    try {
      if (project.audio.blob.size > 38 * 1024 * 1024) {
        throw new Error(
          'Tệp âm thanh vượt quá 38MB cho chế độ tách trực tuyến. Bạn vẫn có thể dán file SRT/VTT cho tệp MP3 này.'
        );
      }
      const audioBase64 = await blobToBase64(project.audio.blob);
      const res = await fetch('/api/audio/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64,
          mimeType: project.audio.mimeType,
          durationSec: project.audio.durationSec,
        }),
      });
      const data = (await res.json()) as {
        cues?: Array<{ startSec: number; endSec: number; text: string }>;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || 'Tách timeline thất bại.');
      }
      const nextCues: SubtitleCue[] = (data.cues ?? []).map((c) => ({
        id: createId('cue'),
        startSec: c.startSec,
        endSec: c.endSec,
        text: c.text,
      }));
      if (nextCues.length === 0) {
        throw new Error('AI không nhận diện được câu thoại rõ ràng trong tệp âm thanh.');
      }
      setProject((prev) => ({
        ...prev,
        cues: nextCues,
        updatedAt: Date.now(),
      }));
      showToast(`Đã tách xong ${nextCues.length} dòng timeline lời nói từ MP3.`);
    } catch (err) {
      setTranscribeError(err instanceof Error ? err.message : 'Lỗi khi tách timeline.');
    } finally {
      setIsTranscribing(false);
    }
  };

  // AI Evaluate & Match Images to Timeline (supports incremental continuation!)
  const handleRunAiEvaluate = async (opts: EvaluateRequestOptions) => {
    if (project.images.length === 0 || project.cues.length === 0) return;

    setIsEvaluating(true);
    setEvaluateError(null);
    setIsPlaying(false);

    try {
      const keptClips = opts.incremental
        ? project.clips.map((c) => ({ ...c, locked: true }))
        : project.clips.filter((c) => c.locked);

      const startFromSec =
        keptClips.length > 0 ? keptClips.reduce((m, c) => Math.max(m, c.endSec), 0) : 0;

      const usedIds = new Set(keptClips.map((c) => c.imageId));
      const candidateImages =
        opts.onlyUnusedImages && opts.incremental
          ? project.images.filter((i) => !usedIds.has(i.id))
          : project.images;

      if (candidateImages.length === 0) {
        throw new Error(
          'Không có ảnh mới chưa dùng. Hãy tải thêm ảnh ở Kho ảnh hoặc bỏ chọn "Chỉ dùng ảnh mới".'
        );
      }

      const payload = {
        images: candidateImages.map((img) => ({
          id: img.id,
          name: img.name,
          thumbnailBase64: img.thumbnailBase64,
          mimeType: img.mimeType,
          existingCaption: img.aiCaption,
        })),
        cues: project.cues,
        mode: opts.mode,
        startFromSec,
        stopWhenImagesExhausted: opts.stopWhenImagesExhausted,
        totalDurationSec,
      };

      const res = await fetch('/api/match/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as {
        summary?: string;
        coveredUntilSec?: number;
        imageCaptions?: Array<{ imageId: string; caption: string }>;
        clips?: Array<{
          imageId: string;
          startSec: number;
          endSec: number;
          matchLevel: 'high' | 'medium' | 'low';
          matchScore: number;
          matchReason: string;
          suggestedAltImageIds: string[];
          recommendedMotion: KenBurnsPreset;
        }>;
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error || 'Đánh giá khớp ảnh thất bại.');
      }

      const captionMap = new Map(
        (data.imageCaptions ?? []).map((ic) => [ic.imageId, ic.caption])
      );

      const newClips: VisualClip[] = (data.clips ?? []).map((c, idx) => ({
        id: createId('clip'),
        imageId: c.imageId,
        startSec: Number(c.startSec.toFixed(2)),
        endSec: Number(c.endSec.toFixed(2)),
        motion: c.recommendedMotion || MOTION_CYCLE[idx % MOTION_CYCLE.length],
        transition: keptClips.length === 0 && idx === 0 ? 'fade-black' : 'crossfade',
        transitionDuration: 0.55,
        matchLevel: c.matchLevel,
        matchScore: c.matchScore,
        matchReason: c.matchReason,
        suggestedAltImageIds: c.suggestedAltImageIds,
        locked: false,
      }));

      if (newClips.length === 0) {
        throw new Error('AI không tìm thấy đoạn phù hợp nào để ghép thêm.');
      }

      const mergedClips = [...keptClips, ...newClips].sort((a, b) => a.startSec - b.startSec);

      setProject((prev) => ({
        ...prev,
        images: prev.images.map((img) =>
          captionMap.has(img.id) ? { ...img, aiCaption: captionMap.get(img.id) } : img
        ),
        clips: mergedClips,
        lastAiSummary: data.summary,
        updatedAt: Date.now(),
      }));

      setSelectedClipId(newClips[0].id);
      handleSeek(newClips[0].startSec);
      showToast(
        `Đã ghép ${newClips.length} cảnh đến mốc ${formatTimecode(
          mergedClips[mergedClips.length - 1].endSec,
          false
        )}.`
      );
    } catch (err) {
      setEvaluateError(err instanceof Error ? err.message : 'Lỗi kết nối máy chủ đánh giá.');
    } finally {
      setIsEvaluating(false);
    }
  };

  // Sequential fast matching (incremental-aware: stops cleanly after available images run out!)
  const handleSequentialAutoMatch = (incremental: boolean) => {
    if (project.images.length === 0 || project.cues.length === 0) return;

    const keptClips = incremental ? project.clips : [];
    const startFromSec =
      keptClips.length > 0 ? keptClips.reduce((m, c) => Math.max(m, c.endSec), 0) : 0;
    const usedIds = new Set(keptClips.map((c) => c.imageId));
    const pool = incremental
      ? project.images.filter((i) => !usedIds.has(i.id))
      : project.images;

    if (pool.length === 0) {
      showToast('Tất cả ảnh hiện tại đã được dùng. Hãy tải thêm ảnh mới để ghép tiếp.');
      return;
    }

    const remainingCues = project.cues.filter((c) => c.endSec > startFromSec + 0.05);
    if (remainingCues.length === 0) {
      showToast('Không còn đoạn lời nói nào phía sau mốc hiện tại.');
      return;
    }

    // Assign 1 image per cue (or up to available images, stopping cleanly!)
    const count = Math.min(pool.length, remainingCues.length);
    const added: VisualClip[] = [];
    for (let i = 0; i < count; i++) {
      const cue = remainingCues[i];
      const clipStart = i === 0 ? Math.max(startFromSec, cue.startSec) : remainingCues[i - 1].endSec;
      const clipEnd = cue.endSec;
      if (clipEnd <= clipStart + 0.05) continue;
      added.push({
        id: createId('clip'),
        imageId: pool[i].id,
        startSec: Number(clipStart.toFixed(2)),
        endSec: Number(clipEnd.toFixed(2)),
        motion: MOTION_CYCLE[(keptClips.length + i) % MOTION_CYCLE.length],
        transition: keptClips.length === 0 && i === 0 ? 'fade-black' : 'crossfade',
        transitionDuration: 0.5,
        matchReason: 'Ghép nhanh theo thứ tự tải lên.',
      });
    }

    const merged = [...keptClips, ...added].sort((a, b) => a.startSec - b.startSec);
    setProject((prev) => ({
      ...prev,
      clips: merged,
      lastAiSummary: `Đã ghép nhanh ${added.length} ảnh theo thứ tự đến mốc ${formatTimecode(
        merged[merged.length - 1].endSec,
        false
      )}.`,
      updatedAt: Date.now(),
    }));
    if (added[0]) {
      setSelectedClipId(added[0].id);
      handleSeek(added[0].startSec);
    }
  };

  const handleUpdateClip = (clipId: string, patch: Partial<VisualClip>) => {
    setProject((prev) => ({
      ...prev,
      clips: prev.clips
        .map((c) => (c.id === clipId ? { ...c, ...patch } : c))
        .sort((a, b) => a.startSec - b.startSec),
      updatedAt: Date.now(),
    }));
  };

  const handleResizeClip = (clipId: string, startSec: number, endSec: number) => {
    setProject((prev) => ({
      ...prev,
      clips: prev.clips.map((c) => (c.id === clipId ? { ...c, startSec, endSec } : c)),
      updatedAt: Date.now(),
    }));
  };

  const handleDeleteClip = (clipId: string) => {
    setProject((prev) => ({
      ...prev,
      clips: prev.clips.filter((c) => c.id !== clipId),
      updatedAt: Date.now(),
    }));
    if (selectedClipId === clipId) setSelectedClipId(null);
  };

  // Load Demo Project (4 images matched to 24s of 36s audio to demonstrate incremental workflow!)
  const handleLoadDemo = async () => {
    setIsLoadingDemo(true);
    setIsPlaying(false);
    try {
      const demo = await buildSampleDemoWorkspace();
      const nextProj: StudioProjectState = {
        ...createEmptyProject('Dự án mẫu — Nhịp sống thành phố'),
        images: demo.images,
        audio: demo.audio,
        cues: demo.cues,
        clips: demo.clips,
        lastAiSummary: demo.summary,
        updatedAt: Date.now(),
      };
      setProject(nextProj);
      setCurrentTime(0);
      setSelectedClipId(demo.clips[0]?.id ?? null);
      setActiveTab('match');
      hydratedRef.current = true;
      showToast('Đã nạp dự án mẫu (đã ghép 24s / 36s) — bạn có thể bấm Phát ngay.');
    } catch {
      showToast('Không thể nạp dự án mẫu.');
    } finally {
      setIsLoadingDemo(false);
    }
  };

  const handleLoadSavedProject = async (id: string) => {
    setIsPlaying(false);
    const loaded = await loadProjectFromDb(id);
    if (loaded) {
      setProject(loaded);
      setCurrentTime(0);
      setSelectedClipId(loaded.clips[0]?.id ?? null);
      setLastSavedAt(loaded.updatedAt);
      setSaveStatus('saved');
      showToast(`Đã mở lại dự án "${loaded.name}".`);
    }
  };

  const handleCreateNewProject = () => {
    setIsPlaying(false);
    setProject(createEmptyProject(`Dự án mới ${savedProjects.length + 1}`));
    setCurrentTime(0);
    setSelectedClipId(null);
    setLastSavedAt(null);
    setSaveStatus('idle');
    setActiveTab('images');
  };

  const handleDeleteSavedProject = async (id: string) => {
    await deleteProjectFromDb(id);
    const remaining = await refreshSavedList();
    if (id === project.id) {
      if (remaining.length > 0) {
        await handleLoadSavedProject(remaining[0].id);
      } else {
        handleCreateNewProject();
      }
    }
    showToast('Đã xóa dự án khỏi bộ nhớ máy.');
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0B0D11] text-[#F1F5F9] flex flex-col">
      {/* Hidden synchronized audio player */}
      <audio
        ref={audioElRef}
        src={project.audio?.objectUrl}
        preload="auto"
        onEnded={() => setIsPlaying(false)}
      />

      {/* Top Navigation Bar */}
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenProjects={() => {
          refreshSavedList();
          setProjectsModalOpen(true);
        }}
        onOpenExport={() => {
          setIsPlaying(false);
          setExportModalOpen(true);
        }}
        canExport={totalDurationSec > 0 && project.clips.length > 0}
      />

      {/* Main Studio Workspace Split */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Drawer Panel (Images / Audio & Timeline / AI Evaluation) */}
        <aside className="w-full lg:w-[410px] xl:w-[440px] shrink-0 border-b lg:border-b-0 lg:border-r border-[#252A35] bg-[#0F1218] flex flex-col min-h-0 max-h-[46vh] lg:max-h-none">
          {activeTab === 'images' && (
            <ImageLibraryPanel
              images={project.images}
              clips={project.clips}
              isUploading={isUploadingImages}
              onUploadImages={handleUploadImages}
              onReplaceImage={handleReplaceImage}
              onDeleteImage={handleDeleteImage}
              onClearImages={handleClearImages}
              onAppendImageAsClip={handleAppendImageAsClip}
              onGoToMatch={() => setActiveTab(project.cues.length === 0 ? 'audio' : 'match')}
            />
          )}

          {activeTab === 'audio' && (
            <AudioTimelinePanel
              audio={project.audio}
              cues={project.cues}
              currentTime={currentTime}
              isDecodingAudio={isDecodingAudio}
              isTranscribing={isTranscribing}
              transcribeError={transcribeError}
              onUploadAudio={handleUploadAudio}
              onTranscribeAudio={handleTranscribeAudio}
              onSetCues={(nextCues) =>
                setProject((prev) => ({ ...prev, cues: nextCues, updatedAt: Date.now() }))
              }
              onSeek={handleSeek}
            />
          )}

          {activeTab === 'match' && (
            <AiMatchPanel
              images={project.images}
              cues={project.cues}
              clips={project.clips}
              coveredUntilSec={coveredUntilSec}
              totalDurationSec={totalDurationSec}
              selectedClipId={selectedClipId}
              lastAiSummary={project.lastAiSummary}
              isEvaluating={isEvaluating}
              evaluateError={evaluateError}
              onRunAiEvaluate={handleRunAiEvaluate}
              onSequentialAutoMatch={handleSequentialAutoMatch}
              onSelectClip={(id) => {
                setSelectedClipId(id);
                const target = project.clips.find((c) => c.id === id);
                if (target) handleSeek(target.startSec);
              }}
              onSwapClipImage={(clipId, newImageId) =>
                handleUpdateClip(clipId, {
                  imageId: newImageId,
                  matchReason: 'Đã đổi sang ảnh thay thế theo lựa chọn của bạn.',
                })
              }
              onToggleLockClip={(clipId) => {
                const target = project.clips.find((c) => c.id === clipId);
                if (target) handleUpdateClip(clipId, { locked: !target.locked });
              }}
              onGoToUploadMore={() => setActiveTab('images')}
            />
          )}
        </aside>

        {/* Right Stage: Live Canvas Monitor + Clip Inspector */}
        <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
          <PreviewStage
            projectName={project.name}
            onRenameProject={(name) => setProject((prev) => ({ ...prev, name }))}
            aspectRatio={project.aspectRatio}
            onChangeAspectRatio={(aspectRatio) =>
              setProject((prev) => ({ ...prev, aspectRatio, updatedAt: Date.now() }))
            }
            fitMode={project.fitMode}
            onChangeFitMode={(fitMode) =>
              setProject((prev) => ({ ...prev, fitMode, updatedAt: Date.now() }))
            }
            subtitleStyle={project.subtitleStyle}
            onChangeSubtitleStyle={(subtitleStyle) =>
              setProject((prev) => ({ ...prev, subtitleStyle, updatedAt: Date.now() }))
            }
            images={project.images}
            clips={project.clips}
            cues={project.cues}
            imageElements={imageElementsRef.current}
            imageLoadVersion={imageLoadVersion}
            currentTime={currentTime}
            totalDurationSec={totalDurationSec}
            coveredUntilSec={coveredUntilSec}
            isPlaying={isPlaying}
            playOnlyCovered={playOnlyCovered}
            onTogglePlayOnlyCovered={setPlayOnlyCovered}
            muted={muted}
            onToggleMute={() => setMuted((m) => !m)}
            onTogglePlay={handleTogglePlay}
            onSeek={handleSeek}
            selectedClip={selectedClip}
            onUpdateClip={handleUpdateClip}
            onDeleteClip={handleDeleteClip}
            onReplaceClipWithFile={handleReplaceClipWithFile}
            saveStatus={saveStatus}
            lastSavedAt={lastSavedAt}
            onManualSave={handleManualSave}
            onLoadDemo={handleLoadDemo}
            isLoadingDemo={isLoadingDemo}
          />
        </main>
      </div>

      {/* Bottom Full-Width Multi-Track Timeline */}
      <MultiTrackTimeline
        audio={project.audio}
        images={project.images}
        clips={project.clips}
        cues={project.cues}
        currentTime={currentTime}
        totalDurationSec={totalDurationSec}
        coveredUntilSec={coveredUntilSec}
        selectedClipId={selectedClipId}
        onSelectClip={setSelectedClipId}
        onSeek={handleSeek}
        onResizeClip={handleResizeClip}
        onOpenUploadMore={() => setActiveTab('images')}
      />

      {/* Export Modal */}
      <ExportModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        projectName={project.name}
        aspectRatio={project.aspectRatio}
        fitMode={project.fitMode}
        subtitleStyle={project.subtitleStyle}
        onChangeSubtitleStyle={(subtitleStyle) =>
          setProject((prev) => ({ ...prev, subtitleStyle, updatedAt: Date.now() }))
        }
        clips={project.clips}
        cues={project.cues}
        imageElements={imageElementsRef.current}
        audio={project.audio}
        coveredUntilSec={coveredUntilSec}
        totalDurationSec={totalDurationSec}
      />

      {/* Saved Projects Modal */}
      <ProjectsModal
        open={projectsModalOpen}
        onClose={() => setProjectsModalOpen(false)}
        projects={savedProjects}
        currentProjectId={project.id}
        onLoadProject={handleLoadSavedProject}
        onCreateNewProject={handleCreateNewProject}
        onDeleteProject={handleDeleteSavedProject}
      />

      {/* Non-intrusive toast feedback */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-[244px] right-5 z-50 rounded-lg border border-[#343C4D] bg-[#161B24] px-4 py-2.5 text-xs font-medium text-slate-100 shadow-xl"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
