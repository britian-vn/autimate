export type AspectRatio = '16:9' | '9:16' | '1:1';
export type FitMode = 'cover' | 'fit-blur';
export type KenBurnsPreset = 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'none';
export type TransitionType = 'crossfade' | 'fade-black' | 'slide-left' | 'none';
export type MatchLevel = 'high' | 'medium' | 'low';
export type LeftTab = 'images' | 'audio' | 'match';

export interface UploadedImage {
  id: string;
  name: string;
  objectUrl: string;
  blob: Blob;
  thumbnailBase64: string;
  mimeType: string;
  width: number;
  height: number;
  aiCaption?: string;
  addedAt: number;
}

export interface SubtitleCue {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
}

export interface VisualClip {
  id: string;
  imageId: string;
  startSec: number;
  endSec: number;
  motion: KenBurnsPreset;
  transition: TransitionType;
  transitionDuration: number;
  matchLevel?: MatchLevel;
  matchScore?: number;
  matchReason?: string;
  suggestedAltImageIds?: string[];
  locked?: boolean;
}

export interface AudioAsset {
  name: string;
  objectUrl: string;
  blob: Blob;
  mimeType: string;
  durationSec: number;
  peaks: number[];
  audioBuffer?: AudioBuffer;
}

export interface SubtitleStyle {
  enabled: boolean;
  position: 'bottom' | 'middle' | 'top';
  fontSize: 'sm' | 'md' | 'lg';
}

export interface StudioProjectState {
  id: string;
  name: string;
  aspectRatio: AspectRatio;
  fitMode: FitMode;
  subtitleStyle: SubtitleStyle;
  images: UploadedImage[];
  audio: AudioAsset | null;
  cues: SubtitleCue[];
  clips: VisualClip[];
  lastAiSummary?: string;
  updatedAt: number;
}

export interface SavedProjectSummary {
  id: string;
  name: string;
  aspectRatio: AspectRatio;
  imageCount: number;
  clipCount: number;
  coveredUntilSec: number;
  totalDurationSec: number;
  updatedAt: number;
}

export interface PersistedProjectRecord {
  id: string;
  name: string;
  aspectRatio: AspectRatio;
  fitMode: FitMode;
  subtitleStyle: SubtitleStyle;
  images: Array<{
    id: string;
    name: string;
    blob: Blob;
    thumbnailBase64: string;
    mimeType: string;
    width: number;
    height: number;
    aiCaption?: string;
    addedAt: number;
  }>;
  audio: {
    name: string;
    blob: Blob;
    mimeType: string;
    durationSec: number;
    peaks: number[];
  } | null;
  cues: SubtitleCue[];
  clips: VisualClip[];
  lastAiSummary?: string;
  updatedAt: number;
}
