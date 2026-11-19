import type {
  PersistedProjectRecord,
  SavedProjectSummary,
  StudioProjectState,
} from '../types';
import { decodeAudioBlob } from './mediaUtils';

const DB_NAME = 'SyncCutStudioDB';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Không thể mở bộ nhớ IndexedDB.'));
  });
}

export function computeCoveredUntil(project: Pick<StudioProjectState, 'clips'>): number {
  if (!project.clips || project.clips.length === 0) return 0;
  return project.clips.reduce((max, c) => Math.max(max, c.endSec), 0);
}

export function computeTotalDuration(
  project: Pick<StudioProjectState, 'audio' | 'cues' | 'clips'>
): number {
  const audioDur = project.audio?.durationSec ?? 0;
  const maxCue = project.cues.reduce((m, c) => Math.max(m, c.endSec), 0);
  const maxClip = project.clips.reduce((m, c) => Math.max(m, c.endSec), 0);
  return Math.max(audioDur, maxCue, maxClip, 0);
}

export async function saveProjectToDb(project: StudioProjectState): Promise<void> {
  const db = await openDb();
  const record: PersistedProjectRecord = {
    id: project.id,
    name: project.name,
    aspectRatio: project.aspectRatio,
    fitMode: project.fitMode,
    subtitleStyle: project.subtitleStyle,
    images: project.images.map((img) => ({
      id: img.id,
      name: img.name,
      blob: img.blob,
      thumbnailBase64: img.thumbnailBase64,
      mimeType: img.mimeType,
      width: img.width,
      height: img.height,
      aiCaption: img.aiCaption,
      addedAt: img.addedAt,
    })),
    audio: project.audio
      ? {
          name: project.audio.name,
          blob: project.audio.blob,
          mimeType: project.audio.mimeType,
          durationSec: project.audio.durationSec,
          peaks: project.audio.peaks,
        }
      : null,
    cues: project.cues,
    clips: project.clips,
    lastAiSummary: project.lastAiSummary,
    updatedAt: Date.now(),
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Không thể lưu dự án.'));
  });
  db.close();
}

export async function loadProjectFromDb(id: string): Promise<StudioProjectState | null> {
  const db = await openDb();
  const record = await new Promise<PersistedProjectRecord | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result as PersistedProjectRecord | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();

  if (!record) return null;

  const images = record.images.map((img) => ({
    ...img,
    objectUrl: URL.createObjectURL(img.blob),
  }));

  let audio = null;
  if (record.audio) {
    try {
      audio = await decodeAudioBlob(record.audio.blob, record.audio.name);
    } catch {
      audio = {
        ...record.audio,
        objectUrl: URL.createObjectURL(record.audio.blob),
      };
    }
  }

  return {
    id: record.id,
    name: record.name,
    aspectRatio: record.aspectRatio,
    fitMode: record.fitMode,
    subtitleStyle: record.subtitleStyle,
    images,
    audio,
    cues: record.cues ?? [],
    clips: record.clips ?? [],
    lastAiSummary: record.lastAiSummary,
    updatedAt: record.updatedAt,
  };
}

export async function listSavedProjects(): Promise<SavedProjectSummary[]> {
  const db = await openDb();
  const records = await new Promise<PersistedProjectRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve((req.result as PersistedProjectRecord[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  db.close();

  return records
    .map((r) => {
      const coveredUntilSec = (r.clips ?? []).reduce((m, c) => Math.max(m, c.endSec), 0);
      const maxCue = (r.cues ?? []).reduce((m, c) => Math.max(m, c.endSec), 0);
      const totalDurationSec = Math.max(r.audio?.durationSec ?? 0, maxCue, coveredUntilSec);
      return {
        id: r.id,
        name: r.name,
        aspectRatio: r.aspectRatio,
        imageCount: r.images?.length ?? 0,
        clipCount: r.clips?.length ?? 0,
        coveredUntilSec,
        totalDurationSec,
        updatedAt: r.updatedAt,
      };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteProjectFromDb(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
