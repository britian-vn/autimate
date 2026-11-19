import type { AudioAsset, SubtitleCue, UploadedImage, VisualClip } from '../types';
import { createId } from './timeUtils';

export async function processUploadedImageFile(file: File | Blob, fileName: string): Promise<UploadedImage> {
  const objectUrl = URL.createObjectURL(file);

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error(`Không thể đọc tệp ảnh "${fileName}"`));
    el.src = objectUrl;
  });

  const maxDim = 512;
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const thumbW = Math.max(1, Math.round((img.naturalWidth || 512) * scale));
  const thumbH = Math.max(1, Math.round((img.naturalHeight || 512) * scale));

  const canvas = document.createElement('canvas');
  canvas.width = thumbW;
  canvas.height = thumbH;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(img, 0, 0, thumbW, thumbH);
  }
  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  const thumbnailBase64 = dataUrl.split(',')[1] ?? '';

  return {
    id: createId('img'),
    name: fileName,
    objectUrl,
    blob: file,
    thumbnailBase64,
    mimeType: 'image/jpeg',
    width: img.naturalWidth,
    height: img.naturalHeight,
    addedAt: Date.now(),
  };
}

export async function decodeAudioBlob(blob: Blob, name: string): Promise<AudioAsset> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtx();
  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    const channelData = audioBuffer.getChannelData(0);
    const numBuckets = Math.min(480, Math.max(120, Math.floor(audioBuffer.duration * 6)));
    const blockSize = Math.max(1, Math.floor(channelData.length / numBuckets));
    const peaks: number[] = [];

    for (let i = 0; i < numBuckets; i++) {
      const start = i * blockSize;
      const end = Math.min(channelData.length, start + blockSize);
      let maxVal = 0;
      const step = Math.max(1, Math.floor((end - start) / 120));
      for (let j = start; j < end; j += step) {
        const abs = Math.abs(channelData[j]);
        if (abs > maxVal) maxVal = abs;
      }
      peaks.push(Math.min(1, maxVal));
    }

    const objectUrl = URL.createObjectURL(blob);
    return {
      name,
      objectUrl,
      blob,
      mimeType: blob.type || 'audio/mpeg',
      durationSec: audioBuffer.duration,
      peaks,
      audioBuffer,
    };
  } finally {
    await audioCtx.close().catch(() => {});
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(new Error('Không thể chuyển đổi tệp âm thanh sang base64.'));
    reader.readAsDataURL(blob);
  });
}

// Synthesize a gentle 36-second warm ambient WAV track so the sample project plays & exports cleanly
function createSampleWavBlob(durationSec = 36): Blob {
  const sampleRate = 22050;
  const totalSamples = Math.floor(sampleRate * durationSec);
  const buffer = new ArrayBuffer(44 + totalSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + totalSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, totalSamples * 2, true);

  // Soft warm cinematic progression (changes chord every 6s to match scene cadence)
  const chords = [
    [220.0, 261.63, 329.63],
    [174.61, 220.0, 261.63],
    [196.0, 246.94, 293.66],
    [164.81, 196.0, 246.94],
    [220.0, 261.63, 329.63],
    [196.0, 246.94, 293.66],
  ];

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const chordIdx = Math.min(chords.length - 1, Math.floor(t / 6));
    const localT = t % 6;
    const env = Math.min(1, localT / 0.8) * Math.min(1, (6 - localT) / 0.9);
    const pulse = 0.72 + 0.28 * Math.sin(t * 2.2);
    const freqs = chords[chordIdx];

    let val = 0;
    for (let f = 0; f < freqs.length; f++) {
      val += Math.sin(2 * Math.PI * freqs[f] * t) * (f === 0 ? 0.45 : 0.28);
    }
    const sample = Math.max(-1, Math.min(1, val * 0.16 * env * pulse));
    view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export async function buildSampleDemoWorkspace(): Promise<{
  images: UploadedImage[];
  audio: AudioAsset;
  cues: SubtitleCue[];
  clips: VisualClip[];
  summary: string;
}> {
  const sampleMeta = [
    {
      url: '/src/assets/images/sample_dawn_skyline_1795098963135.jpg',
      name: '01_binh_minh_thanh_pho.jpg',
      caption: 'Bình minh vàng rực trên dòng sông và đường chân trời thành phố hiện đại',
    },
    {
      url: '/src/assets/images/sample_morning_coffee_1795098964032.jpg',
      name: '02_ca_phe_phin_sang.jpg',
      caption: 'Ly cà phê sữa đá phin truyền thống trên bàn gỗ dưới nắng sớm',
    },
    {
      url: '/src/assets/images/sample_creative_studio_1795098962942.jpg',
      name: '03_phong_dung_phim_toi.jpg',
      caption: 'Nhà làm phim ngồi dựng video trong phòng studio tối ấm áp nhìn ra thành phố mưa',
    },
    {
      url: '/src/assets/images/sample_night_bridge_1795098963973.jpg',
      name: '04_cau_dem_anh_den.jpg',
      caption: 'Cây cầu dây văng hiện đại rực sáng ánh đèn vàng bắc qua sông lúc chạng vạng',
    },
  ];

  const images: UploadedImage[] = [];
  for (const item of sampleMeta) {
    const res = await fetch(item.url);
    const blob = await res.blob();
    const uploaded = await processUploadedImageFile(blob, item.name);
    uploaded.aiCaption = item.caption;
    images.push(uploaded);
  }

  // 36s audio, with 24s matched so user immediately sees incremental "done 24s / 36s, 12s remaining"!
  const wavBlob = createSampleWavBlob(36);
  const audio = await decodeAudioBlob(wavBlob, 'voiceover_demo_36s.wav');

  const cues: SubtitleCue[] = [
    {
      id: createId('cue'),
      startSec: 0,
      endSec: 6,
      text: 'Mỗi buổi sáng sớm, khi ánh nắng đầu tiên chạm xuống mặt sông và những tòa nhà cao tầng...',
    },
    {
      id: createId('cue'),
      startSec: 6,
      endSec: 12,
      text: 'Nhịp sống chậm lại đôi phút bên ly cà phê phin đậm đà trên chiếc bàn gỗ quen thuộc.',
    },
    {
      id: createId('cue'),
      startSec: 12,
      endSec: 18,
      text: 'Đó cũng là lúc những câu chuyện bằng hình ảnh bắt đầu thành hình trong căn phòng dựng phim.',
    },
    {
      id: createId('cue'),
      startSec: 18,
      endSec: 24,
      text: 'Và khi màn đêm buông xuống, ánh đèn trên cây cầu lớn lại mở ra một hành trình mới.',
    },
    {
      id: createId('cue'),
      startSec: 24,
      endSec: 30,
      text: '[Đoạn chờ ảnh tiếp theo] Từng khung hình được ghép nối nhịp nhàng theo đúng hơi thở của lời kể.',
    },
    {
      id: createId('cue'),
      startSec: 30,
      endSec: 36,
      text: '[Đoạn chờ ảnh tiếp theo] Hãy tải thêm ảnh mới rồi nhấn AI Ghép tiếp để hoàn thiện phần còn lại.',
    },
  ];

  const clips: VisualClip[] = [
    {
      id: createId('clip'),
      imageId: images[0].id,
      startSec: 0,
      endSec: 6,
      motion: 'zoom-in',
      transition: 'fade-black',
      transitionDuration: 0.6,
      matchLevel: 'high',
      matchScore: 96,
      matchReason: 'Ảnh bình minh trên sông và đường chân trời khớp hoàn toàn với câu mở đầu.',
      suggestedAltImageIds: [images[3].id],
      locked: true,
    },
    {
      id: createId('clip'),
      imageId: images[1].id,
      startSec: 6,
      endSec: 12,
      motion: 'pan-right',
      transition: 'crossfade',
      transitionDuration: 0.6,
      matchLevel: 'high',
      matchScore: 98,
      matchReason: 'Cận cảnh ly cà phê phin trên bàn gỗ khớp trực tiếp chủ thể được nhắc tới.',
      suggestedAltImageIds: [images[0].id],
      locked: true,
    },
    {
      id: createId('clip'),
      imageId: images[2].id,
      startSec: 12,
      endSec: 18,
      motion: 'zoom-out',
      transition: 'crossfade',
      transitionDuration: 0.6,
      matchLevel: 'high',
      matchScore: 94,
      matchReason: 'Khung cảnh dựng phim trong studio tối thể hiện đúng bối cảnh sáng tạo nội dung.',
      suggestedAltImageIds: [images[1].id],
      locked: true,
    },
    {
      id: createId('clip'),
      imageId: images[3].id,
      startSec: 18,
      endSec: 24,
      motion: 'pan-left',
      transition: 'crossfade',
      transitionDuration: 0.7,
      matchLevel: 'high',
      matchScore: 95,
      matchReason: 'Cây cầu rực sáng về đêm ăn khớp hoàn hảo với nhịp chuyển sang buổi tối.',
      suggestedAltImageIds: [images[0].id],
      locked: true,
    },
  ];

  return {
    images,
    audio,
    cues,
    clips,
    summary:
      'Đã ghép mẫu 4 ảnh khớp 24 giây đầu (00:00 – 00:24) trên tổng thời lượng 36 giây. Phần 00:24 – 00:36 đang để trống để minh họa chế độ làm đến đâu ghép đến đó.',
  };
}
