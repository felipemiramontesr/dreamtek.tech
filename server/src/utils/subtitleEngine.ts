import fs from 'fs';
import path from 'path';
import * as db from '../db';
import { STORAGE_ROOT, assertPathContained } from './storage';
import { dispatchWebhookEvent } from './webhookDispatcher';
import {
  SubtitleFormat,
  SubtitleLanguage,
  SubtitleCueInput,
} from '../schemas/subtitle.schema';

export interface SubtitleCue {
  start_time_seconds: number;
  end_time_seconds: number;
  text: string;
  speaker?: string;
}

export interface SubtitleRecord {
  id: number;
  tenant_id: number;
  asset_id: number;
  version_id: number;
  language_code: SubtitleLanguage;
  format: SubtitleFormat;
  cues_count: number;
  output_derivative_path: string | null;
  cues_json: SubtitleCue[];
  created_at?: string;
}

/**
 * Sanitizes cue text to prevent WebVTT/SRT timing injection (-->) and HTML tags.
 */
export function sanitizeCueText(text: string): string {
  if (!text) return '';
  return text
    .replace(/-->/g, '->')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .trim();
}

/**
 * Formats seconds into WebVTT timestamp (HH:MM:SS.mmm).
 */
export function formatTimeVTT(seconds: number): string {
  const totalMs = Math.max(0, Math.floor(seconds * 1000));
  const hrs = Math.floor(totalMs / 3600000);
  const mins = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;

  const hStr = String(hrs).padStart(2, '0');
  const mStr = String(mins).padStart(2, '0');
  const sStr = String(secs).padStart(2, '0');
  const msStr = String(ms).padStart(3, '0');

  return `${hStr}:${mStr}:${sStr}.${msStr}`;
}

/**
 * Formats seconds into SubRip (SRT) timestamp (HH:MM:SS,mmm).
 */
export function formatTimeSRT(seconds: number): string {
  const totalMs = Math.max(0, Math.floor(seconds * 1000));
  const hrs = Math.floor(totalMs / 3600000);
  const mins = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;

  const hStr = String(hrs).padStart(2, '0');
  const mStr = String(mins).padStart(2, '0');
  const sStr = String(secs).padStart(2, '0');
  const msStr = String(ms).padStart(3, '0');

  return `${hStr}:${mStr}:${sStr},${msStr}`;
}

const LEXICON_MAP: Record<SubtitleLanguage, Record<string, string>> = {
  es: {},
  en: {
    hola: 'hello',
    bienvenidos: 'welcome',
    presentacion: 'presentation',
    producto: 'product',
    innovacion: 'innovation',
    tecnologia: 'technology',
    gracias: 'thank you',
  },
  fr: {
    hola: 'bonjour',
    bienvenidos: 'bienvenue',
    presentacion: 'présentation',
    producto: 'produit',
    innovacion: 'innovation',
    tecnologia: 'technologie',
    gracias: 'merci',
  },
  de: {
    hola: 'hallo',
    bienvenidos: 'willkommen',
    presentacion: 'präsentation',
    producto: 'produkt',
    innovacion: 'innovation',
    tecnologia: 'technologie',
    gracias: 'danke',
  },
  pt: {
    hola: 'olá',
    bienvenidos: 'bem-vindos',
    presentacion: 'apresentação',
    producto: 'produto',
    innovacion: 'inovação',
    tecnologia: 'tecnologia',
    gracias: 'obrigado',
  },
  it: {
    hola: 'ciao',
    bienvenidos: 'benvenuti',
    presentacion: 'presentazione',
    producto: 'prodotto',
    innovacion: 'innovazione',
    tecnologia: 'tecnologia',
    gracias: 'grazie',
  },
  ja: {
    hola: 'こんにちは',
    bienvenidos: 'ようこそ',
    presentacion: 'プレゼンテーション',
    producto: '製品',
    innovacion: '革新',
    tecnologia: 'テクノロジー',
    gracias: 'ありがとう',
  },
  zh: {
    hola: '你好',
    bienvenidos: '欢迎',
    presentacion: '演示',
    producto: '产品',
    innovacion: '创新',
    tecnologia: '技术',
    gracias: '谢谢',
  },
};

/**
 * Deterministically translates cue text into target language based on lexicon.
 */
export function translateLexicon(text: string, targetLang: SubtitleLanguage): string {
  if (targetLang === 'es' || !text) {
    return text;
  }

  const dict = LEXICON_MAP[targetLang];
  let translated = text;

  for (const [esWord, targetWord] of Object.entries(dict)) {
    const regex = new RegExp(`\\b${esWord}\\b`, 'gi');
    translated = translated.replace(regex, targetWord);
  }

  if (translated === text) {
    return `[${targetLang.toUpperCase()}] ${text}`;
  }

  return translated;
}

/**
 * Generates standard WebVTT formatted content string.
 */
export function generateVTTContent(cues: SubtitleCue[]): string {
  let vtt = 'WEBVTT\n\n';
  cues.forEach((cue, index) => {
    const start = formatTimeVTT(cue.start_time_seconds);
    const end = formatTimeVTT(cue.end_time_seconds);
    const speakerPrefix = cue.speaker ? `<v ${cue.speaker}>` : '';
    vtt += `${index + 1}\n${start} --> ${end}\n${speakerPrefix}${cue.text}\n\n`;
  });
  return vtt;
}

/**
 * Generates standard SubRip (SRT) formatted content string.
 */
export function generateSRTContent(cues: SubtitleCue[]): string {
  let srt = '';
  cues.forEach((cue, index) => {
    const start = formatTimeSRT(cue.start_time_seconds);
    const end = formatTimeSRT(cue.end_time_seconds);
    const speakerPrefix = cue.speaker ? `${cue.speaker}: ` : '';
    srt += `${index + 1}\n${start} --> ${end}\n${speakerPrefix}${cue.text}\n\n`;
  });
  return srt;
}

/**
 * Generates subtitle derivative file on disk.
 */
export async function generateSubtitleDerivative(
  tenantId: number,
  assetId: number,
  versionId: number,
  languageCode: SubtitleLanguage,
  format: SubtitleFormat,
  cues: SubtitleCue[],
): Promise<string> {
  const derivativesDir = path.join(STORAGE_ROOT, 'derivatives', `tenant_${tenantId}`);
  fs.mkdirSync(derivativesDir, { recursive: true });

  const ext = format.toLowerCase();
  const fileName = `subtitles_a${assetId}_v${versionId}_${Date.now()}_${languageCode}.${ext}`;
  const outputPath = path.join(derivativesDir, fileName);
  assertPathContained(outputPath);

  let fileContent = '';
  if (format === 'VTT') {
    fileContent = generateVTTContent(cues);
  } else if (format === 'SRT') {
    fileContent = generateSRTContent(cues);
  } else {
    fileContent = JSON.stringify(cues, null, 2);
  }

  fs.writeFileSync(outputPath, fileContent, 'utf-8');
  return outputPath;
}

/**
 * Creates or translates a subtitle track for an asset.
 */
export async function createAssetSubtitles(
  tenantId: number,
  assetId: number,
  versionId: number,
  languageCode: SubtitleLanguage = 'es',
  format: SubtitleFormat = 'VTT',
  customCues?: SubtitleCueInput[],
): Promise<{
  success: boolean;
  message?: string;
  subtitle?: SubtitleRecord;
}> {
  let rawCues: SubtitleCueInput[] = [];

  if (customCues && customCues.length > 0) {
    rawCues = customCues;
  } else {
    const rows: any[] = await db.query(
      `SELECT transcript_text, sentences_json FROM dam_video_transcripts
       WHERE tenant_id = ? AND asset_id = ? AND version_id = ?`,
      [tenantId, assetId, versionId],
    );

    if (!rows || rows.length === 0) {
      return {
        success: false,
        message:
          'No hay transcripciones disponibles para este activo. Realice el análisis de video primero o proporcione los cues directamente.',
      };
    }

    const record = rows[0];
    const sentences =
      typeof record.sentences_json === 'string'
        ? JSON.parse(record.sentences_json)
        : record.sentences_json;

    if (Array.isArray(sentences) && sentences.length > 0) {
      rawCues = sentences.map((s: any) => ({
        start_time_seconds: Number(s.start_time_seconds),
        end_time_seconds: Number(s.end_time_seconds),
        text: String(s.text),
        speaker: s.speaker ? String(s.speaker) : undefined,
      }));
    } else {
      rawCues = [
        {
          start_time_seconds: 0,
          end_time_seconds: 5,
          text: String(record.transcript_text),
        },
      ];
    }
  }

  const processedCues: SubtitleCue[] = rawCues.map((c) => {
    const sanitized = sanitizeCueText(c.text);
    const translated = translateLexicon(sanitized, languageCode);
    return {
      start_time_seconds: Number(c.start_time_seconds),
      end_time_seconds: Number(c.end_time_seconds),
      text: translated,
      speaker: c.speaker,
    };
  });

  const derivativePath = await generateSubtitleDerivative(
    tenantId,
    assetId,
    versionId,
    languageCode,
    format,
    processedCues,
  );

  const insertResult: any = await db.query(
    `INSERT INTO dam_asset_subtitles
     (tenant_id, asset_id, version_id, language_code, format, cues_count, output_derivative_path, cues_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       cues_count = VALUES(cues_count),
       output_derivative_path = VALUES(output_derivative_path),
       cues_json = VALUES(cues_json),
       created_at = CURRENT_TIMESTAMP`,
    [
      tenantId,
      assetId,
      versionId,
      languageCode,
      format,
      processedCues.length,
      derivativePath,
      JSON.stringify(processedCues),
    ],
  );

  const subtitleRecord: SubtitleRecord = {
    id: Number(insertResult.insertId),
    tenant_id: tenantId,
    asset_id: assetId,
    version_id: versionId,
    language_code: languageCode,
    format,
    cues_count: processedCues.length,
    output_derivative_path: derivativePath,
    cues_json: processedCues,
  };

  void dispatchWebhookEvent(tenantId, 'asset.updated', {
    asset_id: assetId,
    subtitle_id: subtitleRecord.id,
    language_code: languageCode,
    format,
    cues_count: processedCues.length,
    event_type: 'SUBTITLE_CREATED',
  });

  return {
    success: true,
    subtitle: subtitleRecord,
  };
}

/**
 * Lists all subtitles for an asset.
 */
export async function listAssetSubtitles(
  tenantId: number,
  assetId: number,
  limit: number = 50,
  offset: number = 0,
  languageCode?: string,
  format?: string,
): Promise<SubtitleRecord[]> {
  let sql = `SELECT id, tenant_id, asset_id, version_id, language_code, format,
                    cues_count, output_derivative_path, cues_json, created_at
             FROM dam_asset_subtitles
             WHERE tenant_id = ? AND asset_id = ?`;
  const params: any[] = [tenantId, assetId];

  if (languageCode) {
    sql += ' AND language_code = ?';
    params.push(languageCode);
  }

  if (format) {
    sql += ' AND format = ?';
    params.push(format);
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const rows: any[] = await db.query(sql, params);

  return rows.map((r) => ({
    ...r,
    id: Number(r.id),
    tenant_id: Number(r.tenant_id),
    asset_id: Number(r.asset_id),
    version_id: Number(r.version_id),
    cues_count: Number(r.cues_count),
    cues_json:
      typeof r.cues_json === 'string' ? JSON.parse(r.cues_json) : r.cues_json,
  }));
}

/**
 * Gets details of a single subtitle record.
 */
export async function getAssetSubtitleById(
  tenantId: number,
  assetId: number,
  subtitleId: number,
): Promise<SubtitleRecord | null> {
  const rows: any[] = await db.query(
    `SELECT id, tenant_id, asset_id, version_id, language_code, format,
            cues_count, output_derivative_path, cues_json, created_at
     FROM dam_asset_subtitles
     WHERE tenant_id = ? AND asset_id = ? AND id = ?`,
    [tenantId, assetId, subtitleId],
  );

  if (!rows || rows.length === 0) {
    return null;
  }

  const r = rows[0];
  return {
    ...r,
    id: Number(r.id),
    tenant_id: Number(r.tenant_id),
    asset_id: Number(r.asset_id),
    version_id: Number(r.version_id),
    cues_count: Number(r.cues_count),
    cues_json:
      typeof r.cues_json === 'string' ? JSON.parse(r.cues_json) : r.cues_json,
  };
}

/**
 * Deletes a subtitle record and unlinks its derivative from disk.
 */
export async function deleteAssetSubtitle(
  tenantId: number,
  assetId: number,
  subtitleId: number,
): Promise<boolean> {
  const subtitle = await getAssetSubtitleById(tenantId, assetId, subtitleId);
  if (!subtitle) {
    return false;
  }

  if (subtitle.output_derivative_path) {
    assertPathContained(subtitle.output_derivative_path);
    if (fs.existsSync(subtitle.output_derivative_path)) {
      fs.unlinkSync(subtitle.output_derivative_path);
    }
  }

  await db.query(
    'DELETE FROM dam_asset_subtitles WHERE tenant_id = ? AND asset_id = ? AND id = ?',
    [tenantId, assetId, subtitleId],
  );

  void dispatchWebhookEvent(tenantId, 'asset.updated', {
    asset_id: assetId,
    subtitle_id: subtitleId,
    event_type: 'SUBTITLE_DELETED',
  });

  return true;
}
