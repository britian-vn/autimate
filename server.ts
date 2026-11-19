import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Chưa tìm thấy GEMINI_API_KEY trên máy chủ. Vui lòng kiểm tra cấu hình khóa API trong Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function parseSrtOrTimestampText(rawText: string): Array<{ startSec: number; endSec: number; text: string }> {
  const cleaned = rawText
    .replace(/^\uFEFF/, '')
    .replace(/```(?:srt|vtt|text)?/gi, '')
    .replace(/```/g, '')
    .trim();

  const cues: Array<{ startSec: number; endSec: number; text: string }> = [];

  const toSeconds = (h: string | undefined, m: string, s: string, ms: string | undefined) => {
    const hours = h ? Number(h) : 0;
    const mins = Number(m);
    const secs = Number(s);
    const millis = ms ? Number(ms.padEnd(3, '0').slice(0, 3)) / 1000 : 0;
    return Math.round((hours * 3600 + mins * 60 + secs + millis) * 100) / 100;
  };

  // Standard SRT/VTT blocks
  const blocks = cleaned.split(/\r?\n\r?\n+/);
  const timeRangeRegex =
    /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?\s*(?:-->|->|-|–)\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?/;

  for (const block of blocks) {
    const lines = block
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    let timeLineIdx = -1;
    let match: RegExpMatchArray | null = null;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(timeRangeRegex);
      if (m) {
        timeLineIdx = i;
        match = m;
        break;
      }
    }

    if (match && timeLineIdx !== -1) {
      const startSec = toSeconds(match[1], match[2], match[3], match[4]);
      const endSec = toSeconds(match[5], match[6], match[7], match[8]);
      const restOfTimeLine = lines[timeLineIdx].replace(match[0], '').replace(/^[\[\]()|:-\s]+/, '').trim();
      const textLines = [
        ...(restOfTimeLine ? [restOfTimeLine] : []),
        ...lines.slice(timeLineIdx + 1),
      ];
      const text = textLines.join(' ').trim();
      if (text && endSec > startSec) {
        cues.push({ startSec, endSec, text });
      }
    }
  }

  if (cues.length > 0) return cues;

  // Fallback line-by-line `[00:00 - 00:05] Text`
  for (const line of cleaned.split(/\r?\n/)) {
    const m = line.match(timeRangeRegex);
    if (m) {
      const startSec = toSeconds(m[1], m[2], m[3], m[4]);
      const endSec = toSeconds(m[5], m[6], m[7], m[8]);
      const text = line.replace(m[0], '').replace(/^[\[\]()|:-\s]+/, '').trim();
      if (text && endSec > startSec) {
        cues.push({ startSec, endSec, text });
      }
    }
  }

  return cues;
}

function formatApiError(err: unknown): { status: number; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('403') || msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID')) {
    return {
      status: 403,
      message: 'Khóa API Gemini không hợp lệ hoặc chưa được cấp quyền. Vui lòng kiểm tra trong Settings > Secrets.',
    };
  }
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message: 'Hệ thống đang chạm giới hạn tần suất gọi AI. Vui lòng đợi vài giây rồi thử lại.',
    };
  }
  return { status: 500, message: msg || 'Lỗi máy chủ khi xử lý yêu cầu AI.' };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '60mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // 1. Transcribe MP3/WAV audio to timestamped timeline cues
  app.post('/api/audio/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType, durationSec } = req.body as {
        audioBase64?: string;
        mimeType?: string;
        durationSec?: number;
      };

      if (!audioBase64 || !mimeType) {
        res.status(400).json({ error: 'Thiếu dữ liệu âm thanh để tách timeline.' });
        return;
      }

      const ai = getAiClient();
      const safeMime = mimeType.startsWith('audio/') ? mimeType : 'audio/mp3';
      const totalDur = typeof durationSec === 'number' && durationSec > 0 ? durationSec : 60;

      const audioPart = {
        inlineData: {
          mimeType: safeMime,
          data: audioBase64,
        },
      };

      // Step A: Transcribe using gemini-3.5-transcribe
      const transcribeResp = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            audioPart,
            {
              text:
                'Hãy chép lời chính xác âm thanh này (giữ nguyên ngôn ngữ gốc như tiếng Việt) dưới dạng phụ đề SRT chuẩn kèm mốc thời gian chính xác (HH:MM:SS,mmm --> HH:MM:SS,mmm). Chia thành các câu ngắn gọn tự nhiên dài khoảng 3 đến 7 giây. Chỉ xuất nội dung SRT.',
            },
          ],
        },
      });

      const rawTranscript = (transcribeResp.text ?? '').trim();
      let cues = parseSrtOrTimestampText(rawTranscript);

      // Step B: If gemini-3.5-transcribe returned plain text without timestamps, align with gemini-4-hydrogen
      if (cues.length === 0) {
        const alignResp = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: {
            parts: [
              audioPart,
              {
                text: `Tổng thời lượng âm thanh là ${totalDur.toFixed(2)} giây. Bản chép lời tham khảo: """${rawTranscript}""".
Hãy lắng nghe âm thanh và chia toàn bộ lời nói thành các phân đoạn phụ đề có mốc bắt đầu (startSec) và kết thúc (endSec) chính xác bằng giây, không vượt quá ${totalDur.toFixed(2)} giây, nội dung rõ ràng giữ đúng ngôn ngữ gốc.`,
              },
            ],
          },
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                cues: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      startSec: { type: Type.NUMBER },
                      endSec: { type: Type.NUMBER },
                      text: { type: Type.STRING },
                    },
                    required: ['startSec', 'endSec', 'text'],
                  },
                },
              },
              required: ['cues'],
            },
          },
        });

        const parsed = JSON.parse((alignResp.text ?? '{"cues":[]}').trim()) as {
          cues?: Array<{ startSec: number; endSec: number; text: string }>;
        };
        cues = (parsed.cues ?? []).filter((c) => c.text?.trim() && c.endSec > c.startSec);
      }

      // Clamp to audio duration and sort chronologically
      const normalized = cues
        .map((c) => ({
          startSec: Math.max(0, Math.min(totalDur, Number(c.startSec) || 0)),
          endSec: Math.max(0, Math.min(totalDur, Number(c.endSec) || 0)),
          text: String(c.text || '').trim(),
        }))
        .filter((c) => c.text.length > 0 && c.endSec > c.startSec + 0.05)
        .sort((a, b) => a.startSec - b.startSec);

      res.json({ cues: normalized, rawTranscript });
    } catch (err) {
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 2. Evaluate uploaded images and match them to spoken timeline (supports incremental matching!)
  app.post('/api/match/evaluate', async (req, res) => {
    try {
      const {
        images,
        cues,
        mode = 'natural',
        startFromSec = 0,
        stopWhenImagesExhausted = true,
        targetEndSec,
        totalDurationSec,
      } = req.body as {
        images?: Array<{
          id: string;
          name: string;
          thumbnailBase64: string;
          mimeType: string;
          existingCaption?: string;
        }>;
        cues?: Array<{ id: string; startSec: number; endSec: number; text: string }>;
        mode?: 'natural' | 'per-cue';
        startFromSec?: number;
        stopWhenImagesExhausted?: boolean;
        targetEndSec?: number | null;
        totalDurationSec?: number;
      };

      if (!images || images.length === 0) {
        res.status(400).json({ error: 'Vui lòng tải lên ít nhất 1 ảnh để AI đánh giá và ghép khớp.' });
        return;
      }
      if (!cues || cues.length === 0) {
        res.status(400).json({ error: 'Vui lòng nhập hoặc tách timeline lời nói trước khi ghép khớp.' });
        return;
      }

      // Filter cues relevant to this incremental window
      const relevantCues = cues.filter((c) => {
        const afterStart = c.endSec > startFromSec + 0.05;
        const beforeEnd =
          typeof targetEndSec === 'number' && targetEndSec > startFromSec
            ? c.startSec < targetEndSec - 0.05
            : true;
        return afterStart && beforeEnd;
      });

      if (relevantCues.length === 0) {
        res.status(400).json({
          error: 'Không còn đoạn lời nói nào chưa ghép kể từ mốc thời gian đã chọn.',
        });
        return;
      }

      const ai = getAiClient();

      // Cap batch size sent to vision model cleanly (up to 36 images per evaluation pass)
      const batchImages = images.slice(0, 36);
      const validImageIds = new Set(batchImages.map((img) => img.id));

      const parts: Array<
        { text: string } | { inlineData: { mimeType: string; data: string } }
      > = [];

      const timelineText = relevantCues
        .map(
          (c, i) =>
            `[${i + 1}] ${c.startSec.toFixed(2)}s -> ${c.endSec.toFixed(2)}s : "${c.text.replace(/\s+/g, ' ').trim()}"`
        )
        .join('\n');

      const maxDuration =
        typeof targetEndSec === 'number' && targetEndSec > startFromSec
          ? targetEndSec
          : typeof totalDurationSec === 'number' && totalDurationSec > 0
          ? totalDurationSec
          : relevantCues[relevantCues.length - 1].endSec;

      parts.push({
        text: `Bạn là đạo diễn dựng phim chuyên nghiệp cho SyncCut Studio.
Nhiệm vụ của bạn:
1. Quan sát kỹ từng bức ảnh người dùng đã tải lên (mỗi ảnh đều có mã imageId rõ ràng ngay trước ảnh). Viết mô tả ngắn gọn bằng tiếng Việt (8-16 từ) nêu rõ bối cảnh, chủ thể, cảm xúc của từng ảnh vào "imageCaptions".
2. Đối chiếu bộ ảnh với danh sách lời nói có mốc thời gian bên dưới (bắt đầu từ mốc ${startFromSec.toFixed(2)}s).
3. Sắp xếp và ghép ảnh sao cho khớp nội dung lời nói, cảm xúc và nhịp kể chuyện nhất.

QUY TẮC QUAN TRỌNG VỀ PHẠM VI GHÉP ("GỬI ẢNH ĐẾN ĐÂU LÀM ĐẾN ĐÓ"):
- Số lượng ảnh hiện có trong đợt này: ${batchImages.length} ảnh.
- Chế độ nhịp dựng: ${
          mode === 'per-cue'
            ? 'KHỚP TỪNG DÒNG (mỗi dòng timeline là 1 phân cảnh ảnh).'
            : 'NHỊP DỰNG TỰ NHIÊN (gộp các câu phụ đề ngắn liền kề cùng ý thành 1 phân cảnh ảnh khoảng 4–12 giây để video mượt mà, không bị giật hình).'
        }
- Quy tắc dừng khi hết ảnh (${stopWhenImagesExhausted ? 'ĐANG BẬT' : 'ĐANG TẮT'}):
${
  stopWhenImagesExhausted
    ? `  + RẤT QUAN TRỌNG: Người dùng có thể chỉ mới tải lên một phần ảnh đầu (ví dụ audio dài 10 phút nhưng chỉ mới gửi ảnh cho 1–2 phút đầu).
  + KHÔNG ĐƯỢC kéo giãn hoặc lặp đi lặp lại các ảnh này cho toàn bộ 10 phút nếu ảnh không còn khớp với các đoạn sau!
  + Hãy ghép liên tục bắt đầu từ mốc ${Math.max(startFromSec, relevantCues[0].startSec).toFixed(2)}s, sử dụng hợp lý các ảnh đang có (mỗi ảnh thường dùng 1 lần, chỉ lặp khi lời nói thực sự quay lại đúng chủ thể đó). Khi đã dùng hết bộ ảnh hiện có hoặc các câu lời nói phía sau không còn ảnh nào phù hợp nữa, hãy DỪNG LẠI gọn gàng tại mốc kết thúc của cảnh cuối cùng khớp được.
  + Ghi mốc kết thúc đó vào "coveredUntilSec". Phần thời gian phía sau sẽ để trống để người dùng tải thêm ảnh ở đợt kế tiếp.`
    : `  + Hãy phủ kín toàn bộ khoảng thời gian từ ${Math.max(startFromSec, relevantCues[0].startSec).toFixed(2)}s đến ${maxDuration.toFixed(2)}s bằng bộ ảnh hiện có, có thể tái sử dụng ảnh hợp lý khi cần.`
}
- Các phân cảnh trong mảng "clips" phải nối tiếp nhau theo thứ tự thời gian tăng dần, KHÔNG chồng lấn (clip sau có startSec bằng endSec của clip trước trong phạm vi liên tục), và chỉ được dùng imageId nằm trong danh sách ảnh được cung cấp.
- Đánh giá khách quan "matchLevel":
  + "high" (80-100 điểm): Ảnh minh họa rất sát chủ thể/bối cảnh lời nói.
  + "medium" (55-79 điểm): Ảnh phù hợp về không khí/ẩn dụ nhưng chưa thật sát chi tiết.
  + "low" (0-54 điểm): Ảnh chưa khớp tốt, nên cân nhắc thay bằng ảnh khác.
- "matchReason": Giải thích ngắn gọn bằng tiếng Việt (1 câu) vì sao chọn ảnh này cho đoạn lời đó, hoặc gợi ý nên chụp/tải ảnh gì nếu điểm thấp.
- "suggestedAltImageIds": Tối đa 2 imageId khác trong bộ ảnh có thể thay thế (nếu có).
- "recommendedMotion": Chọn chuyển động Ken Burns hợp mắt ("zoom-in", "zoom-out", "pan-left", "pan-right", hoặc "none"), thay đổi đa dạng giữa các cảnh liền kề.

DANH SÁCH TIMELINE LỜI NÓI (từ ${startFromSec.toFixed(2)}s):
${timelineText}

DƯỚI ĐÂY LÀ CÁC ẢNH NGƯỜI DÙNG ĐÃ TẢI LÊN:`,
      });

      for (const img of batchImages) {
        parts.push({
          text: `\n--- Ảnh imageId="${img.id}" | tên tệp: "${img.name}"${
            img.existingCaption ? ` | mô tả trước đó: "${img.existingCaption}"` : ''
          } ---`,
        });
        parts.push({
          inlineData: {
            mimeType: img.mimeType || 'image/jpeg',
            data: img.thumbnailBase64,
          },
        });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: {
                type: Type.STRING,
                description: 'Tóm tắt ngắn gọn bằng tiếng Việt về kết quả đánh giá và phạm vi đã ghép.',
              },
              coveredUntilSec: {
                type: Type.NUMBER,
                description: 'Mốc giây cuối cùng đã ghép ảnh xong trong đợt này.',
              },
              imageCaptions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    imageId: { type: Type.STRING },
                    caption: { type: Type.STRING },
                  },
                  required: ['imageId', 'caption'],
                },
              },
              clips: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    imageId: { type: Type.STRING },
                    startSec: { type: Type.NUMBER },
                    endSec: { type: Type.NUMBER },
                    matchLevel: { type: Type.STRING },
                    matchScore: { type: Type.INTEGER },
                    matchReason: { type: Type.STRING },
                    suggestedAltImageIds: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    recommendedMotion: { type: Type.STRING },
                  },
                  required: [
                    'imageId',
                    'startSec',
                    'endSec',
                    'matchLevel',
                    'matchScore',
                    'matchReason',
                    'suggestedAltImageIds',
                    'recommendedMotion',
                  ],
                },
              },
            },
            required: ['summary', 'coveredUntilSec', 'imageCaptions', 'clips'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        summary?: string;
        coveredUntilSec?: number;
        imageCaptions?: Array<{ imageId: string; caption: string }>;
        clips?: Array<{
          imageId: string;
          startSec: number;
          endSec: number;
          matchLevel: string;
          matchScore: number;
          matchReason: string;
          suggestedAltImageIds: string[];
          recommendedMotion: string;
        }>;
      };

      const validMotions = new Set(['zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'none']);
      const fallbackImageId = batchImages[0].id;

      const sanitizedClips = (parsed.clips ?? [])
        .map((clip) => {
          const score = Math.max(0, Math.min(100, Math.round(Number(clip.matchScore) || 75)));
          const level: 'high' | 'medium' | 'low' =
            clip.matchLevel === 'high' || clip.matchLevel === 'medium' || clip.matchLevel === 'low'
              ? clip.matchLevel
              : score >= 80
              ? 'high'
              : score >= 55
              ? 'medium'
              : 'low';
          const imageId = validImageIds.has(clip.imageId) ? clip.imageId : fallbackImageId;
          const alts = (clip.suggestedAltImageIds ?? [])
            .filter((id) => validImageIds.has(id) && id !== imageId)
            .slice(0, 2);
          const motion = validMotions.has(clip.recommendedMotion)
            ? (clip.recommendedMotion as 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'none')
            : 'zoom-in';

          return {
            imageId,
            startSec: Math.max(startFromSec, Number(clip.startSec) || startFromSec),
            endSec: Math.min(maxDuration, Number(clip.endSec) || startFromSec + 3),
            matchLevel: level,
            matchScore: score,
            matchReason: String(clip.matchReason || 'Ảnh phù hợp với ngữ cảnh lời nói.').trim(),
            suggestedAltImageIds: alts,
            recommendedMotion: motion,
          };
        })
        .filter((c) => c.endSec > c.startSec + 0.1)
        .sort((a, b) => a.startSec - b.startSec);

      // Ensure non-overlapping sequential boundaries
      for (let i = 1; i < sanitizedClips.length; i++) {
        if (sanitizedClips[i].startSec < sanitizedClips[i - 1].endSec) {
          sanitizedClips[i].startSec = sanitizedClips[i - 1].endSec;
        }
      }
      const finalClips = sanitizedClips.filter((c) => c.endSec > c.startSec + 0.1);
      const computedCovered =
        finalClips.length > 0
          ? finalClips[finalClips.length - 1].endSec
          : Number(parsed.coveredUntilSec) || startFromSec;

      res.json({
        summary:
          parsed.summary ||
          `Đã đánh giá và ghép ${finalClips.length} phân cảnh đến mốc ${computedCovered.toFixed(1)}s.`,
        coveredUntilSec: computedCovered,
        imageCaptions: (parsed.imageCaptions ?? []).filter((ic) => validImageIds.has(ic.imageId)),
        clips: finalClips,
      });
    } catch (err) {
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // Vite middleware in development; static serving in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SyncCut Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
