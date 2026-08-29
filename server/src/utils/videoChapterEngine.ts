/* eslint-disable @typescript-eslint/no-explicit-any */
import { query } from '../db';
import { dispatchWebhookEvent } from './webhookDispatcher';
import {
  CreateVideoChaptersBody,
  UpdateVideoChapterBody,
  SummaryType,
} from '../schemas/videoChapter.schema';

export interface ChapterItem {
  chapter_index: number;
  title: string;
  description: string;
  start_time_seconds: number;
  end_time_seconds: number;
  thumbnail_path: string | null;
  confidence: number;
}

export interface VideoSummaryResult {
  summary_type: SummaryType;
  content: string;
  key_takeaways: string[];
  topic_tags: string[];
  word_count: number;
}

export interface VideoChapterRecord {
  id: number;
  tenant_id: number;
  asset_id: number;
  version_id: number;
  chapter_index: number;
  title: string;
  description: string | null;
  start_time_seconds: number;
  end_time_seconds: number;
  thumbnail_path: string | null;
  confidence: number;
  created_at: string;
  updated_at: string;
}

export interface VideoSummaryRecord {
  id: number;
  tenant_id: number;
  asset_id: number;
  version_id: number;
  summary_type: SummaryType;
  content: string;
  key_takeaways: string[];
  topic_tags: string[];
  word_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Extracts normalized topic keywords from transcript text.
 */
export function extractTopicsFromText(text: string): string[] {
  const commonStopWords = new Set([
    'de', 'la', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un',
    'para', 'con', 'no', 'una', 'su', 'al', 'es', 'lo', 'como', 'mas', 'pero',
    'sus', 'le', 'ya', 'o', 'este', 'si', 'porque', 'esta', 'son', 'entre',
    'the', 'and', 'to', 'of', 'a', 'in', 'is', 'that', 'for', 'it', 'as',
    'was', 'with', 'on', 'be', 'at', 'by', 'this', 'have', 'from', 'or', 'an',
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^\w\s\u00C0-\u017F]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !commonStopWords.has(w));

  const frequency: Record<string, number> = {};
  for (const w of words) {
    frequency[w] = (frequency[w] || 0) + 1;
  }

  return Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));
}

/**
 * Calculates a deterministic confidence score based on cue density and duration.
 */
export function calculateChapterConfidence(cueCount: number, duration: number): number {
  if (duration <= 0 || cueCount <= 0) {
    return 0.75;
  }
  const ratio = cueCount / Math.max(1, duration / 10);
  const rawScore = 0.70 + Math.min(0.28, ratio * 0.10);
  return Number(Math.min(0.99, Math.max(0.60, rawScore)).toFixed(2));
}

/**
 * Partitions transcript cues into non-overlapping chapter intervals.
 */
export function partitionTranscriptIntoChapters(
  transcriptSegments: Array<{ start_time: number; end_time: number; text: string }>,
  totalDuration: number,
  targetCount: number = 5,
  minDuration: number = 10,
): ChapterItem[] {
  const safeTotalDuration = Math.max(minDuration, totalDuration);

  if (!transcriptSegments || transcriptSegments.length === 0) {
    // Fallback simple duration partition
    const numChapters = Math.max(1, Math.min(targetCount, Math.floor(safeTotalDuration / minDuration)));
    const chapterDuration = Number((safeTotalDuration / numChapters).toFixed(2));
    const chapters: ChapterItem[] = [];

    for (let i = 0; i < numChapters; i++) {
      const start = Number((i * chapterDuration).toFixed(2));
      const end = i === numChapters - 1 ? safeTotalDuration : Number(((i + 1) * chapterDuration).toFixed(2));
      chapters.push({
        chapter_index: i + 1,
        title: `Capítulo ${i + 1}: Sección General`,
        description: `Contenido audiovisual correspondiente al intervalo ${start}s - ${end}s.`,
        start_time_seconds: start,
        end_time_seconds: end,
        thumbnail_path: null,
        confidence: 0.85,
      });
    }
    return chapters;
  }

  // Group segments into targetCount clusters
  const totalSegments = transcriptSegments.length;
  const numChapters = Math.max(1, Math.min(targetCount, totalSegments));
  const segmentsPerChapter = Math.ceil(totalSegments / numChapters);

  const chapters: ChapterItem[] = [];
  let currentStart = 0;

  for (let i = 0; i < numChapters; i++) {
    const chunk = transcriptSegments.slice(i * segmentsPerChapter, (i + 1) * segmentsPerChapter);
    if (chunk.length === 0) break;

    const isLast = i === numChapters - 1 || (i + 1) * segmentsPerChapter >= totalSegments;
    const chunkText = chunk.map((s) => s.text.trim()).join(' ');
    const chunkEnd = isLast
      ? safeTotalDuration
      : Number(Math.max(currentStart + minDuration, chunk[chunk.length - 1].end_time).toFixed(2));

    const end = Math.min(safeTotalDuration, Math.max(currentStart + 1, chunkEnd));
    const topics = extractTopicsFromText(chunkText);
    const mainTopic = topics.length > 0 ? topics[0] : `Sección ${i + 1}`;

    const confidence = calculateChapterConfidence(chunk.length, end - currentStart);

    chapters.push({
      chapter_index: i + 1,
      title: `Capítulo ${i + 1}: ${mainTopic}`,
      description: chunkText.length > 200 ? chunkText.substring(0, 197) + '...' : chunkText || `Discusión del tema ${mainTopic}.`,
      start_time_seconds: currentStart,
      end_time_seconds: end,
      thumbnail_path: null,
      confidence,
    });

    currentStart = end;
  }

  // Ensure last chapter extends exactly to safeTotalDuration
  if (chapters.length > 0) {
    chapters[chapters.length - 1].end_time_seconds = safeTotalDuration;
  }

  return chapters;
}

/**
 * Generates structured summaries (EXECUTIVE, DETAILED, BULLET_POINTS, TOPICS_LIST).
 */
export function generateStructuredSummary(
  chapters: ChapterItem[],
  allText: string,
  summaryType: SummaryType = 'EXECUTIVE',
  customPrompt?: string,
): VideoSummaryResult {
  const topics = extractTopicsFromText(allText);
  const keyTakeaways: string[] = [];

  for (const ch of chapters) {
    keyTakeaways.push(`[${ch.start_time_seconds}s - ${ch.end_time_seconds}s] ${ch.title}: ${ch.description}`);
  }

  let content = '';

  switch (summaryType) {
    case 'EXECUTIVE':
      content = `Resumen Ejecutivo del Contenido:\n\nEl video se estructura en ${chapters.length} bloques temáticos principales. Se analizan aspectos fundamentales de ${topics.slice(0, 3).join(', ') || 'la temática expuesta'}.\n\nPuntos Clave:\n${keyTakeaways.map((k) => `• ${k}`).join('\n')}\n\nConclusión:\nEl material ofrece un recorrido integral cubriendo ${topics.join(', ')}.`;
      break;

    case 'DETAILED':
      content = `Desglose Detallado por Capítulos:\n\n${chapters
        .map(
          (c) =>
            `### ${c.title} (${c.start_time_seconds}s - ${c.end_time_seconds}s)\n${c.description}\nNivel de confianza semántica: ${(c.confidence * 100).toFixed(0)}%`,
        )
        .join('\n\n')}\n\nTópicos detectados: ${topics.join(', ')}.`;
      break;

    case 'BULLET_POINTS':
      content = `Puntos Clave y Destacados:\n\n${keyTakeaways.map((t, idx) => `${idx + 1}. ${t}`).join('\n')}\n\nTemas principales: ${topics.join(' | ')}`;
      break;

    case 'TOPICS_LIST':
      content = `Taxonomía Temática e Índice de Contenidos:\n\n${topics
        .map((t, idx) => `• Tema ${idx + 1}: ${t}`)
        .join('\n')}\n\nCapítulos Asociados:\n${chapters.map((c) => `- ${c.title} [${c.start_time_seconds}s - ${c.end_time_seconds}s]`).join('\n')}`;
      break;
  }

  if (customPrompt) {
    content += `\n\n[Contexto adicional: ${customPrompt}]`;
  }

  const wordCount = content.split(/\s+/).filter(Boolean).length;

  return {
    summary_type: summaryType,
    content,
    key_takeaways: keyTakeaways,
    topic_tags: topics,
    word_count: wordCount,
  };
}

/**
 * Service function: Generates automatic chapters and structured summary for an asset.
 */
export async function createAssetVideoChapters(
  tenantId: number,
  assetId: number,
  versionId: number,
  input: CreateVideoChaptersBody,
): Promise<
  | { success: true; statusCode: 201; chapters: VideoChapterRecord[]; summary: VideoSummaryRecord }
  | { success: false; statusCode: number; message: string }
> {
  // Verify asset
  const assetRows = (await query(
    `SELECT id, mime_type FROM assets WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [assetId, tenantId],
  )) as any[];

  if (!assetRows || assetRows.length === 0) {
    return { success: false, statusCode: 404, message: 'Activo digital no encontrado.' };
  }

  const mimeType = String(assetRows[0].mime_type || '');
  if (!mimeType.startsWith('video/') && !mimeType.startsWith('audio/')) {
    return {
      success: false,
      statusCode: 400,
      message: `Solo se admiten activos de video o audio. Tipo actual: ${mimeType || 'desconocido'}.`,
    };
  }

  // Fetch transcripts from FC 020
  const transcriptRows = (await query(
    `SELECT id, full_transcript, segments, duration_seconds FROM dam_video_transcripts WHERE asset_id = ? AND tenant_id = ? LIMIT 1`,
    [assetId, tenantId],
  )) as any[];

  if (!transcriptRows || transcriptRows.length === 0 || !transcriptRows[0].full_transcript) {
    return {
      success: false,
      statusCode: 400,
      message:
        'El activo no cuenta con transcripciones ni análisis de video previo (FC 020). Procese el video con /video-analysis primero.',
    };
  }

  const transcriptData = transcriptRows[0];
  const fullTranscript = String(transcriptData.full_transcript || '');
  let segments: Array<{ start_time: number; end_time: number; text: string }> = [];

  try {
    if (typeof transcriptData.segments === 'string') {
      segments = JSON.parse(transcriptData.segments);
    } else if (Array.isArray(transcriptData.segments)) {
      segments = transcriptData.segments;
    }
  } catch {
    segments = [];
  }

  const totalDuration = Number(transcriptData.duration_seconds) || 60;

  // Generate chapters and summary
  const chapterItems = partitionTranscriptIntoChapters(
    segments,
    totalDuration,
    input.target_chapter_count,
    input.min_chapter_duration_seconds,
  );

  const summaryResult = generateStructuredSummary(
    chapterItems,
    fullTranscript,
    input.summary_type,
    input.custom_prompt,
  );

  // Clean old chapters for this version
  await query(
    `DELETE FROM dam_asset_video_chapters WHERE tenant_id = ? AND asset_id = ? AND version_id = ?`,
    [tenantId, assetId, versionId],
  );

  // Insert chapters
  const insertedChapters: VideoChapterRecord[] = [];
  for (const ch of chapterItems) {
    const insertRes = (await query(
      `INSERT INTO dam_asset_video_chapters (
        tenant_id, asset_id, version_id, chapter_index, title, description,
        start_time_seconds, end_time_seconds, thumbnail_path, confidence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId,
        assetId,
        versionId,
        ch.chapter_index,
        ch.title,
        ch.description,
        ch.start_time_seconds,
        ch.end_time_seconds,
        ch.thumbnail_path,
        ch.confidence,
      ],
    )) as any;

    insertedChapters.push({
      id: insertRes.insertId,
      tenant_id: tenantId,
      asset_id: assetId,
      version_id: versionId,
      chapter_index: ch.chapter_index,
      title: ch.title,
      description: ch.description,
      start_time_seconds: ch.start_time_seconds,
      end_time_seconds: ch.end_time_seconds,
      thumbnail_path: ch.thumbnail_path,
      confidence: ch.confidence,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  // Upsert summary
  await query(
    `INSERT INTO dam_asset_video_summaries (
      tenant_id, asset_id, version_id, summary_type, content, key_takeaways, topic_tags, word_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      content = VALUES(content),
      key_takeaways = VALUES(key_takeaways),
      topic_tags = VALUES(topic_tags),
      word_count = VALUES(word_count),
      updated_at = NOW()`,
    [
      tenantId,
      assetId,
      versionId,
      summaryResult.summary_type,
      summaryResult.content,
      JSON.stringify(summaryResult.key_takeaways),
      JSON.stringify(summaryResult.topic_tags),
      summaryResult.word_count,
    ],
  );

  const summaryRows = (await query(
    `SELECT id, tenant_id, asset_id, version_id, summary_type, content, key_takeaways, topic_tags, word_count, created_at, updated_at
     FROM dam_asset_video_summaries
     WHERE tenant_id = ? AND asset_id = ? AND version_id = ? AND summary_type = ?
     LIMIT 1`,
    [tenantId, assetId, versionId, summaryResult.summary_type],
  )) as any[];

  const summaryRecord: VideoSummaryRecord = {
    id: summaryRows[0]?.id || 1,
    tenant_id: tenantId,
    asset_id: assetId,
    version_id: versionId,
    summary_type: summaryResult.summary_type,
    content: summaryResult.content,
    key_takeaways: summaryResult.key_takeaways,
    topic_tags: summaryResult.topic_tags,
    word_count: summaryResult.word_count,
    created_at: summaryRows[0]?.created_at || new Date().toISOString(),
    updated_at: summaryRows[0]?.updated_at || new Date().toISOString(),
  };

  // Dispatch Webhook
  await dispatchWebhookEvent(tenantId, 'asset.updated', {
    asset_id: assetId,
    event_type: 'VIDEO_CHAPTERS_GENERATED',
    chapter_count: insertedChapters.length,
    summary_type: summaryResult.summary_type,
  });

  return {
    success: true,
    statusCode: 201,
    chapters: insertedChapters,
    summary: summaryRecord,
  };
}

/**
 * Service function: Lists chapters for an asset.
 */
export async function listAssetVideoChapters(
  tenantId: number,
  assetId: number,
  limit: number = 50,
  offset: number = 0,
): Promise<VideoChapterRecord[]> {
  const rows = (await query(
    `SELECT id, tenant_id, asset_id, version_id, chapter_index, title, description,
            start_time_seconds, end_time_seconds, thumbnail_path, confidence, created_at, updated_at
     FROM dam_asset_video_chapters
     WHERE tenant_id = ? AND asset_id = ?
     ORDER BY chapter_index ASC
     LIMIT ? OFFSET ?`,
    [tenantId, assetId, limit, offset],
  )) as any[];

  return rows.map((r) => ({
    ...r,
    start_time_seconds: Number(r.start_time_seconds),
    end_time_seconds: Number(r.end_time_seconds),
    confidence: Number(r.confidence),
  }));
}

/**
 * Service function: Gets structured summary for an asset.
 */
export async function getAssetVideoSummary(
  tenantId: number,
  assetId: number,
  summaryType?: SummaryType,
): Promise<VideoSummaryRecord | null> {
  let sql = `SELECT id, tenant_id, asset_id, version_id, summary_type, content, key_takeaways, topic_tags, word_count, created_at, updated_at
             FROM dam_asset_video_summaries
             WHERE tenant_id = ? AND asset_id = ?`;
  const params: any[] = [tenantId, assetId];

  if (summaryType) {
    sql += ` AND summary_type = ?`;
    params.push(summaryType);
  }

  sql += ` ORDER BY updated_at DESC LIMIT 1`;

  const rows = (await query(sql, params)) as any[];
  if (!rows || rows.length === 0) {
    return null;
  }

  const row = rows[0];
  let keyTakeaways = row.key_takeaways;
  if (typeof keyTakeaways === 'string') {
    try {
      keyTakeaways = JSON.parse(keyTakeaways);
    } catch {
      keyTakeaways = [];
    }
  }

  let topicTags = row.topic_tags;
  if (typeof topicTags === 'string') {
    try {
      topicTags = JSON.parse(topicTags);
    } catch {
      topicTags = [];
    }
  }

  return {
    id: Number(row.id),
    tenant_id: Number(row.tenant_id),
    asset_id: Number(row.asset_id),
    version_id: Number(row.version_id),
    summary_type: row.summary_type,
    content: row.content,
    key_takeaways: Array.isArray(keyTakeaways) ? keyTakeaways : [],
    topic_tags: Array.isArray(topicTags) ? topicTags : [],
    word_count: Number(row.word_count),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Service function: Manually updates a video chapter.
 */
export async function updateAssetVideoChapter(
  tenantId: number,
  assetId: number,
  chapterId: number,
  updates: UpdateVideoChapterBody,
): Promise<VideoChapterRecord | null> {
  const rows = (await query(
    `SELECT id, tenant_id, asset_id, version_id, chapter_index, title, description,
            start_time_seconds, end_time_seconds, thumbnail_path, confidence, created_at, updated_at
     FROM dam_asset_video_chapters
     WHERE id = ? AND asset_id = ? AND tenant_id = ?
     LIMIT 1`,
    [chapterId, assetId, tenantId],
  )) as any[];

  if (!rows || rows.length === 0) {
    return null;
  }

  const existing = rows[0];
  const newTitle = updates.title !== undefined ? updates.title : existing.title;
  const newDescription = updates.description !== undefined ? updates.description : existing.description;
  const newStart = updates.start_time_seconds !== undefined ? updates.start_time_seconds : Number(existing.start_time_seconds);
  const newEnd = updates.end_time_seconds !== undefined ? updates.end_time_seconds : Number(existing.end_time_seconds);
  const newConfidence = updates.confidence !== undefined ? updates.confidence : Number(existing.confidence);

  if (newStart >= newEnd) {
    throw new Error('El tiempo de inicio debe ser menor al tiempo de fin.');
  }

  await query(
    `UPDATE dam_asset_video_chapters
     SET title = ?, description = ?, start_time_seconds = ?, end_time_seconds = ?, confidence = ?, updated_at = NOW()
     WHERE id = ? AND asset_id = ? AND tenant_id = ?`,
    [newTitle, newDescription, newStart, newEnd, newConfidence, chapterId, assetId, tenantId],
  );

  const updatedRows = (await query(
    `SELECT id, tenant_id, asset_id, version_id, chapter_index, title, description,
            start_time_seconds, end_time_seconds, thumbnail_path, confidence, created_at, updated_at
     FROM dam_asset_video_chapters
     WHERE id = ? AND asset_id = ? AND tenant_id = ?
     LIMIT 1`,
    [chapterId, assetId, tenantId],
  )) as any[];

  const updated = updatedRows[0];

  await dispatchWebhookEvent(tenantId, 'asset.updated', {
    asset_id: assetId,
    chapter_id: chapterId,
    event_type: 'VIDEO_CHAPTER_UPDATED',
    title: newTitle,
  });

  return {
    id: Number(updated.id),
    tenant_id: Number(updated.tenant_id),
    asset_id: Number(updated.asset_id),
    version_id: Number(updated.version_id),
    chapter_index: Number(updated.chapter_index),
    title: updated.title,
    description: updated.description,
    start_time_seconds: Number(updated.start_time_seconds),
    end_time_seconds: Number(updated.end_time_seconds),
    thumbnail_path: updated.thumbnail_path,
    confidence: Number(updated.confidence),
    created_at: updated.created_at,
    updated_at: updated.updated_at,
  };
}

/**
 * Service function: Deletes all chapters and summaries for an asset.
 */
export async function deleteAssetVideoChapters(
  tenantId: number,
  assetId: number,
): Promise<boolean> {
  const chapRes = (await query(
    `DELETE FROM dam_asset_video_chapters WHERE tenant_id = ? AND asset_id = ?`,
    [tenantId, assetId],
  )) as any;

  const sumRes = (await query(
    `DELETE FROM dam_asset_video_summaries WHERE tenant_id = ? AND asset_id = ?`,
    [tenantId, assetId],
  )) as any;

  const totalAffected = (chapRes?.affectedRows || 0) + (sumRes?.affectedRows || 0);

  if (totalAffected > 0) {
    await dispatchWebhookEvent(tenantId, 'asset.updated', {
      asset_id: assetId,
      event_type: 'VIDEO_CHAPTERS_DELETED',
    });
    return true;
  }

  return false;
}
