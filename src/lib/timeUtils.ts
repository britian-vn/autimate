import type { SubtitleCue } from '../types';

export function formatTimecode(seconds: number, showTenths = true): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const tenths = Math.floor((safe - Math.floor(safe)) * 10);

  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  const base = hrs > 0 ? `${String(hrs).padStart(2, '0')}:${mm}:${ss}` : `${mm}:${ss}`;
  return showTenths ? `${base}.${tenths}` : base;
}

export function formatShortDuration(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  if (mins === 0) return `${secs}s`;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function parseTimeInput(value: string): number | null {
  const trimmed = value.trim().replace(',', '.');
  if (!trimmed) return null;

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  const parts = trimmed.split(':').map((p) => Number(p));
  if (parts.some((n) => Number.isNaN(n) || n < 0)) return null;

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return null;
}

export function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function parseSrtOrVtt(input: string): SubtitleCue[] {
  const cleaned = input.replace(/^\uFEFF/, '').replace(/^WEBVTT[^\n]*\n*/i, '').trim();
  if (!cleaned) return [];

  const toSeconds = (h: string | undefined, m: string, s: string, ms: string | undefined) => {
    const hours = h ? Number(h) : 0;
    const mins = Number(m);
    const secs = Number(s);
    const millis = ms ? Number(ms.padEnd(3, '0').slice(0, 3)) / 1000 : 0;
    return Math.round((hours * 3600 + mins * 60 + secs + millis) * 100) / 100;
  };

  const rangeRegex =
    /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?\s*(?:-->|->|-|–)\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?/;

  const cues: SubtitleCue[] = [];
  const blocks = cleaned.split(/\r?\n\r?\n+/);

  for (const block of blocks) {
    const lines = block
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    let timeIdx = -1;
    let match: RegExpMatchArray | null = null;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(rangeRegex);
      if (m) {
        timeIdx = i;
        match = m;
        break;
      }
    }

    if (match && timeIdx !== -1) {
      const startSec = toSeconds(match[1], match[2], match[3], match[4]);
      const endSec = toSeconds(match[5], match[6], match[7], match[8]);
      const inlineRest = lines[timeIdx]
        .replace(match[0], '')
        .replace(/^[\[\]()|:-\s]+/, '')
        .trim();
      const text = [...(inlineRest ? [inlineRest] : []), ...lines.slice(timeIdx + 1)]
        .join(' ')
        .replace(/<[^>]+>/g, '')
        .trim();

      if (text && endSec > startSec) {
        cues.push({
          id: createId('cue'),
          startSec,
          endSec,
          text,
        });
      }
    }
  }

  if (cues.length > 0) {
    return cues.sort((a, b) => a.startSec - b.startSec);
  }

  // Line-by-line fallback: `00:00 - 00:05 Nội dung câu thoại`
  for (const line of cleaned.split(/\r?\n/)) {
    const m = line.match(rangeRegex);
    if (!m) continue;
    const startSec = toSeconds(m[1], m[2], m[3], m[4]);
    const endSec = toSeconds(m[5], m[6], m[7], m[8]);
    const text = line
      .replace(m[0], '')
      .replace(/^[\[\]()|:-\s]+/, '')
      .trim();
    if (text && endSec > startSec) {
      cues.push({
        id: createId('cue'),
        startSec,
        endSec,
        text,
      });
    }
  }

  return cues.sort((a, b) => a.startSec - b.startSec);
}

export function exportCuesToSrt(cues: SubtitleCue[]): string {
  const toSrtTime = (sec: number) => {
    const safe = Math.max(0, sec);
    const hrs = Math.floor(safe / 3600);
    const mins = Math.floor((safe % 3600) / 60);
    const secs = Math.floor(safe % 60);
    const ms = Math.round((safe - Math.floor(safe)) * 1000);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(
      2,
      '0'
    )},${String(Math.min(999, ms)).padStart(3, '0')}`;
  };

  return cues
    .map((cue, idx) => `${idx + 1}\n${toSrtTime(cue.startSec)} --> ${toSrtTime(cue.endSec)}\n${cue.text}`)
    .join('\n\n');
}
