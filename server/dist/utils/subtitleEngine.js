"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeCueText = sanitizeCueText;
exports.formatTimeVTT = formatTimeVTT;
exports.formatTimeSRT = formatTimeSRT;
exports.translateLexicon = translateLexicon;
exports.generateVTTContent = generateVTTContent;
exports.generateSRTContent = generateSRTContent;
exports.generateSubtitleDerivative = generateSubtitleDerivative;
exports.createAssetSubtitles = createAssetSubtitles;
exports.listAssetSubtitles = listAssetSubtitles;
exports.getAssetSubtitleById = getAssetSubtitleById;
exports.deleteAssetSubtitle = deleteAssetSubtitle;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const db = __importStar(require("../db"));
const storage_1 = require("./storage");
const webhookDispatcher_1 = require("./webhookDispatcher");
/**
 * Sanitizes cue text to prevent WebVTT/SRT timing injection (-->) and HTML tags.
 */
function sanitizeCueText(text) {
    if (!text)
        return '';
    return text
        .replace(/-->/g, '->')
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<[^>]*>/g, '')
        .trim();
}
/**
 * Formats seconds into WebVTT timestamp (HH:MM:SS.mmm).
 */
function formatTimeVTT(seconds) {
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
function formatTimeSRT(seconds) {
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
const LEXICON_MAP = {
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
function translateLexicon(text, targetLang) {
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
function generateVTTContent(cues) {
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
function generateSRTContent(cues) {
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
async function generateSubtitleDerivative(tenantId, assetId, versionId, languageCode, format, cues) {
    const derivativesDir = path_1.default.join(storage_1.STORAGE_ROOT, 'derivatives', `tenant_${tenantId}`);
    fs_1.default.mkdirSync(derivativesDir, { recursive: true });
    const ext = format.toLowerCase();
    const fileName = `subtitles_a${assetId}_v${versionId}_${Date.now()}_${languageCode}.${ext}`;
    const outputPath = path_1.default.join(derivativesDir, fileName);
    (0, storage_1.assertPathContained)(outputPath);
    let fileContent = '';
    if (format === 'VTT') {
        fileContent = generateVTTContent(cues);
    }
    else if (format === 'SRT') {
        fileContent = generateSRTContent(cues);
    }
    else {
        fileContent = JSON.stringify(cues, null, 2);
    }
    fs_1.default.writeFileSync(outputPath, fileContent, 'utf-8');
    return outputPath;
}
/**
 * Creates or translates a subtitle track for an asset.
 */
async function createAssetSubtitles(tenantId, assetId, versionId, languageCode = 'es', format = 'VTT', customCues) {
    let rawCues = [];
    if (customCues && customCues.length > 0) {
        rawCues = customCues;
    }
    else {
        const rows = await db.query(`SELECT transcript_text, sentences_json FROM dam_video_transcripts
       WHERE tenant_id = ? AND asset_id = ? AND version_id = ?`, [tenantId, assetId, versionId]);
        if (!rows || rows.length === 0) {
            return {
                success: false,
                message: 'No hay transcripciones disponibles para este activo. Realice el análisis de video primero o proporcione los cues directamente.',
            };
        }
        const record = rows[0];
        const sentences = typeof record.sentences_json === 'string'
            ? JSON.parse(record.sentences_json)
            : record.sentences_json;
        if (Array.isArray(sentences) && sentences.length > 0) {
            rawCues = sentences.map((s) => ({
                start_time_seconds: Number(s.start_time_seconds),
                end_time_seconds: Number(s.end_time_seconds),
                text: String(s.text),
                speaker: s.speaker ? String(s.speaker) : undefined,
            }));
        }
        else {
            rawCues = [
                {
                    start_time_seconds: 0,
                    end_time_seconds: 5,
                    text: String(record.transcript_text),
                },
            ];
        }
    }
    const processedCues = rawCues.map((c) => {
        const sanitized = sanitizeCueText(c.text);
        const translated = translateLexicon(sanitized, languageCode);
        return {
            start_time_seconds: Number(c.start_time_seconds),
            end_time_seconds: Number(c.end_time_seconds),
            text: translated,
            speaker: c.speaker,
        };
    });
    const derivativePath = await generateSubtitleDerivative(tenantId, assetId, versionId, languageCode, format, processedCues);
    const insertResult = await db.query(`INSERT INTO dam_asset_subtitles
     (tenant_id, asset_id, version_id, language_code, format, cues_count, output_derivative_path, cues_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       cues_count = VALUES(cues_count),
       output_derivative_path = VALUES(output_derivative_path),
       cues_json = VALUES(cues_json),
       created_at = CURRENT_TIMESTAMP`, [
        tenantId,
        assetId,
        versionId,
        languageCode,
        format,
        processedCues.length,
        derivativePath,
        JSON.stringify(processedCues),
    ]);
    const subtitleRecord = {
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
    void (0, webhookDispatcher_1.dispatchWebhookEvent)(tenantId, 'asset.updated', {
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
async function listAssetSubtitles(tenantId, assetId, limit = 50, offset = 0, languageCode, format) {
    let sql = `SELECT id, tenant_id, asset_id, version_id, language_code, format,
                    cues_count, output_derivative_path, cues_json, created_at
             FROM dam_asset_subtitles
             WHERE tenant_id = ? AND asset_id = ?`;
    const params = [tenantId, assetId];
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
    const rows = await db.query(sql, params);
    return rows.map((r) => ({
        ...r,
        id: Number(r.id),
        tenant_id: Number(r.tenant_id),
        asset_id: Number(r.asset_id),
        version_id: Number(r.version_id),
        cues_count: Number(r.cues_count),
        cues_json: typeof r.cues_json === 'string' ? JSON.parse(r.cues_json) : r.cues_json,
    }));
}
/**
 * Gets details of a single subtitle record.
 */
async function getAssetSubtitleById(tenantId, assetId, subtitleId) {
    const rows = await db.query(`SELECT id, tenant_id, asset_id, version_id, language_code, format,
            cues_count, output_derivative_path, cues_json, created_at
     FROM dam_asset_subtitles
     WHERE tenant_id = ? AND asset_id = ? AND id = ?`, [tenantId, assetId, subtitleId]);
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
        cues_json: typeof r.cues_json === 'string' ? JSON.parse(r.cues_json) : r.cues_json,
    };
}
/**
 * Deletes a subtitle record and unlinks its derivative from disk.
 */
async function deleteAssetSubtitle(tenantId, assetId, subtitleId) {
    const subtitle = await getAssetSubtitleById(tenantId, assetId, subtitleId);
    if (!subtitle) {
        return false;
    }
    if (subtitle.output_derivative_path) {
        (0, storage_1.assertPathContained)(subtitle.output_derivative_path);
        if (fs_1.default.existsSync(subtitle.output_derivative_path)) {
            fs_1.default.unlinkSync(subtitle.output_derivative_path);
        }
    }
    await db.query('DELETE FROM dam_asset_subtitles WHERE tenant_id = ? AND asset_id = ? AND id = ?', [tenantId, assetId, subtitleId]);
    void (0, webhookDispatcher_1.dispatchWebhookEvent)(tenantId, 'asset.updated', {
        asset_id: assetId,
        subtitle_id: subtitleId,
        event_type: 'SUBTITLE_DELETED',
    });
    return true;
}
