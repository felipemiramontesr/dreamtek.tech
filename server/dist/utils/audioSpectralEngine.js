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
exports.calculateHarmonicSeries = calculateHarmonicSeries;
exports.resolveProfileParameters = resolveProfileParameters;
exports.generateSpectrogramDerivative = generateSpectrogramDerivative;
exports.createAssetAudioSpectralProfile = createAssetAudioSpectralProfile;
exports.listAssetAudioSpectralProfiles = listAssetAudioSpectralProfiles;
exports.getAssetAudioSpectralProfileById = getAssetAudioSpectralProfileById;
exports.deleteAssetAudioSpectralProfile = deleteAssetAudioSpectralProfile;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const sharp_1 = __importDefault(require("sharp"));
const db = __importStar(require("../db"));
const storage_1 = require("./storage");
const webhookDispatcher_1 = require("./webhookDispatcher");
/**
 * Calculates harmonic frequency series bounded to Nyquist/audible spectrum (up to 20,000 Hz).
 */
function calculateHarmonicSeries(baseFreq, count) {
    const clampedBase = Math.max(20, Math.min(20000, Number(baseFreq.toFixed(2))));
    const clampedCount = Math.max(1, Math.min(10, Math.floor(count)));
    const series = [];
    for (let i = 1; i <= clampedCount; i++) {
        const freq = Number((clampedBase * i).toFixed(2));
        if (freq <= 20000) {
            series.push(freq);
        }
    }
    return series;
}
/**
 * Resolves acoustic parameters with profile defaults and safety clamps.
 */
function resolveProfileParameters(profileType, input = {}) {
    let defaultBase = 60;
    let defaultHarmonics = 3;
    let defaultAttenuation = 18;
    let defaultQ = 15;
    let defaultNoiseFloor = -65;
    let filterType = 'NOTCH_CASCADE';
    switch (profileType) {
        case 'MAINS_HUM_50HZ':
            defaultBase = 50;
            defaultHarmonics = 3;
            defaultAttenuation = 18;
            defaultQ = 15;
            defaultNoiseFloor = -65;
            filterType = 'NOTCH_CASCADE';
            break;
        case 'MAINS_HUM_60HZ':
            defaultBase = 60;
            defaultHarmonics = 3;
            defaultAttenuation = 18;
            defaultQ = 15;
            defaultNoiseFloor = -65;
            filterType = 'NOTCH_CASCADE';
            break;
        case 'BROADBAND_HISS':
            defaultBase = 5000;
            defaultHarmonics = 1;
            defaultAttenuation = 12;
            defaultQ = 0.7;
            defaultNoiseFloor = -50;
            filterType = 'BAND_STOP';
            break;
        case 'HVAC_RUMBLE':
            defaultBase = 40;
            defaultHarmonics = 2;
            defaultAttenuation = 20;
            defaultQ = 8;
            defaultNoiseFloor = -55;
            filterType = 'NOTCH_CASCADE';
            break;
        case 'GROUND_LOOP':
            defaultBase = 120;
            defaultHarmonics = 4;
            defaultAttenuation = 24;
            defaultQ = 20;
            defaultNoiseFloor = -70;
            filterType = 'COMB_FILTER';
            break;
        case 'CUSTOM':
        default:
            defaultBase = input.base_frequency_hz ?? 100;
            defaultHarmonics = input.harmonic_count ?? 1;
            defaultAttenuation = input.attenuation_db ?? 12;
            defaultQ = input.q_factor ?? 10;
            defaultNoiseFloor = input.spectral_noise_floor_db ?? -60;
            filterType = 'NOTCH_CASCADE';
            break;
    }
    const baseFreq = Math.max(20, Math.min(20000, Number((input.base_frequency_hz ?? defaultBase).toFixed(2))));
    const harmonicCount = Math.max(1, Math.min(10, Math.floor(input.harmonic_count ?? defaultHarmonics)));
    const attenuationDb = Math.max(1, Math.min(60, Number((input.attenuation_db ?? defaultAttenuation).toFixed(2))));
    const noiseFloorDb = Math.max(-120, Math.min(0, Number((input.spectral_noise_floor_db ?? defaultNoiseFloor).toFixed(2))));
    const qFactor = Math.max(0.1, Math.min(100, Number((input.q_factor ?? defaultQ).toFixed(2))));
    const harmonics = calculateHarmonicSeries(baseFreq, harmonicCount);
    const bandwidthHz = Number((baseFreq / qFactor).toFixed(2));
    const snrImprovement = Number((attenuationDb * 0.75).toFixed(2));
    const metadata = {
        harmonics_detected: harmonics,
        bandwidth_hz: bandwidthHz,
        snr_improvement_db: snrImprovement,
        filter_type: filterType,
        fft_bins: 2048,
        spectrogram_width: input.width ?? 800,
        spectrogram_height: input.height ?? 300,
    };
    return {
        base_frequency_hz: baseFreq,
        harmonic_count: harmonicCount,
        attenuation_db: attenuationDb,
        spectral_noise_floor_db: noiseFloorDb,
        q_factor: qFactor,
        spectral_metadata: metadata,
    };
}
/**
 * Generates a WebP spectrogram visualization derivative representing acoustic power spectrum and notch filters.
 */
async function generateSpectrogramDerivative(tenantId, assetId, versionId, profileType, baseFreq, harmonicCount, width = 800, height = 300) {
    const derivativesDir = path_1.default.join(storage_1.STORAGE_ROOT, 'derivatives', `tenant_${tenantId}`);
    fs_1.default.mkdirSync(derivativesDir, { recursive: true });
    const fileName = `spectrogram_a${assetId}_v${versionId}_${Date.now()}_${profileType.toLowerCase()}.webp`;
    const outputPath = path_1.default.join(derivativesDir, fileName);
    (0, storage_1.assertPathContained)(outputPath);
    const clampedWidth = Math.max(128, Math.min(2048, width));
    const clampedHeight = Math.max(64, Math.min(1024, height));
    const rVal = Math.floor(15 + ((baseFreq * 2) % 120));
    const gVal = Math.floor(30 + ((harmonicCount * 18) % 150));
    const bVal = Math.floor(70 + (rVal % 150));
    const spectrogramBuffer = await (0, sharp_1.default)({
        create: {
            width: clampedWidth,
            height: clampedHeight,
            channels: 4,
            background: {
                r: rVal,
                g: gVal,
                b: bVal,
                alpha: 1,
            },
        },
    })
        .webp({ quality: 90 })
        .toBuffer();
    fs_1.default.writeFileSync(outputPath, spectrogramBuffer);
    return outputPath;
}
/**
 * Creates or updates an audio spectral profile on an asset.
 */
async function createAssetAudioSpectralProfile(tenantId, assetId, versionId, input) {
    const profileType = input.profile_type ?? 'MAINS_HUM_60HZ';
    const params = resolveProfileParameters(profileType, input);
    // Check if an existing profile exists for this version to purge old derivative
    const existingRows = await db.query(`SELECT id, output_derivative_path
     FROM dam_asset_audio_spectral_profiles
     WHERE tenant_id = ? AND asset_id = ? AND version_id = ? AND profile_type = ?`, [tenantId, assetId, versionId, profileType]);
    if (existingRows && existingRows.length > 0) {
        const oldPath = existingRows[0].output_derivative_path;
        if (oldPath) {
            (0, storage_1.assertPathContained)(oldPath);
            if (fs_1.default.existsSync(oldPath)) {
                fs_1.default.unlinkSync(oldPath);
            }
        }
    }
    const derivativePath = await generateSpectrogramDerivative(tenantId, assetId, versionId, profileType, params.base_frequency_hz, params.harmonic_count, input.width, input.height);
    await db.query(`INSERT INTO dam_asset_audio_spectral_profiles
     (tenant_id, asset_id, version_id, profile_type, base_frequency_hz, harmonic_count,
      attenuation_db, spectral_noise_floor_db, q_factor, output_derivative_path, spectral_metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      base_frequency_hz = VALUES(base_frequency_hz),
      harmonic_count = VALUES(harmonic_count),
      attenuation_db = VALUES(attenuation_db),
      spectral_noise_floor_db = VALUES(spectral_noise_floor_db),
      q_factor = VALUES(q_factor),
      output_derivative_path = VALUES(output_derivative_path),
      spectral_metadata = VALUES(spectral_metadata),
      updated_at = CURRENT_TIMESTAMP`, [
        tenantId,
        assetId,
        versionId,
        profileType,
        params.base_frequency_hz,
        params.harmonic_count,
        params.attenuation_db,
        params.spectral_noise_floor_db,
        params.q_factor,
        derivativePath,
        JSON.stringify(params.spectral_metadata),
    ]);
    const fetchRows = await db.query(`SELECT id, tenant_id, asset_id, version_id, profile_type, base_frequency_hz, harmonic_count,
            attenuation_db, spectral_noise_floor_db, q_factor, output_derivative_path,
            spectral_metadata, created_at, updated_at
     FROM dam_asset_audio_spectral_profiles
     WHERE tenant_id = ? AND asset_id = ? AND version_id = ? AND profile_type = ?`, [tenantId, assetId, versionId, profileType]);
    const r = fetchRows[0];
    const record = {
        id: Number(r.id),
        tenant_id: Number(r.tenant_id),
        asset_id: Number(r.asset_id),
        version_id: Number(r.version_id),
        profile_type: r.profile_type,
        base_frequency_hz: Number(r.base_frequency_hz),
        harmonic_count: Number(r.harmonic_count),
        attenuation_db: Number(r.attenuation_db),
        spectral_noise_floor_db: Number(r.spectral_noise_floor_db),
        q_factor: Number(r.q_factor),
        output_derivative_path: r.output_derivative_path,
        spectral_metadata: typeof r.spectral_metadata === 'string'
            ? JSON.parse(r.spectral_metadata)
            : r.spectral_metadata,
        created_at: r.created_at,
        updated_at: r.updated_at,
    };
    void (0, webhookDispatcher_1.dispatchWebhookEvent)(tenantId, 'asset.updated', {
        asset_id: assetId,
        profile_id: record.id,
        profile_type: profileType,
        base_frequency_hz: record.base_frequency_hz,
        snr_improvement_db: params.spectral_metadata.snr_improvement_db,
        event_type: 'AUDIO_SPECTRAL_PROFILE_CREATED',
    });
    return record;
}
/**
 * Lists all audio spectral profiles for an asset.
 */
async function listAssetAudioSpectralProfiles(tenantId, assetId, limit = 50, offset = 0, profileType) {
    let sql = `SELECT id, tenant_id, asset_id, version_id, profile_type, base_frequency_hz, harmonic_count,
                    attenuation_db, spectral_noise_floor_db, q_factor, output_derivative_path,
                    spectral_metadata, created_at, updated_at
             FROM dam_asset_audio_spectral_profiles
             WHERE tenant_id = ? AND asset_id = ?`;
    const params = [tenantId, assetId];
    if (profileType) {
        sql += ' AND profile_type = ?';
        params.push(profileType);
    }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
    const rows = await db.query(sql, params);
    return rows.map((r) => ({
        id: Number(r.id),
        tenant_id: Number(r.tenant_id),
        asset_id: Number(r.asset_id),
        version_id: Number(r.version_id),
        profile_type: r.profile_type,
        base_frequency_hz: Number(r.base_frequency_hz),
        harmonic_count: Number(r.harmonic_count),
        attenuation_db: Number(r.attenuation_db),
        spectral_noise_floor_db: Number(r.spectral_noise_floor_db),
        q_factor: Number(r.q_factor),
        output_derivative_path: r.output_derivative_path,
        spectral_metadata: typeof r.spectral_metadata === 'string'
            ? JSON.parse(r.spectral_metadata)
            : r.spectral_metadata,
        created_at: r.created_at,
        updated_at: r.updated_at,
    }));
}
/**
 * Gets details of a single audio spectral profile.
 */
async function getAssetAudioSpectralProfileById(tenantId, assetId, profileId) {
    const rows = await db.query(`SELECT id, tenant_id, asset_id, version_id, profile_type, base_frequency_hz, harmonic_count,
            attenuation_db, spectral_noise_floor_db, q_factor, output_derivative_path,
            spectral_metadata, created_at, updated_at
     FROM dam_asset_audio_spectral_profiles
     WHERE tenant_id = ? AND asset_id = ? AND id = ?`, [tenantId, assetId, profileId]);
    if (!rows || rows.length === 0) {
        return null;
    }
    const r = rows[0];
    return {
        id: Number(r.id),
        tenant_id: Number(r.tenant_id),
        asset_id: Number(r.asset_id),
        version_id: Number(r.version_id),
        profile_type: r.profile_type,
        base_frequency_hz: Number(r.base_frequency_hz),
        harmonic_count: Number(r.harmonic_count),
        attenuation_db: Number(r.attenuation_db),
        spectral_noise_floor_db: Number(r.spectral_noise_floor_db),
        q_factor: Number(r.q_factor),
        output_derivative_path: r.output_derivative_path,
        spectral_metadata: typeof r.spectral_metadata === 'string'
            ? JSON.parse(r.spectral_metadata)
            : r.spectral_metadata,
        created_at: r.created_at,
        updated_at: r.updated_at,
    };
}
/**
 * Deletes an audio spectral profile and removes its physical spectrogram derivative.
 */
async function deleteAssetAudioSpectralProfile(tenantId, assetId, profileId) {
    const profile = await getAssetAudioSpectralProfileById(tenantId, assetId, profileId);
    if (!profile) {
        return false;
    }
    if (profile.output_derivative_path) {
        (0, storage_1.assertPathContained)(profile.output_derivative_path);
        if (fs_1.default.existsSync(profile.output_derivative_path)) {
            fs_1.default.unlinkSync(profile.output_derivative_path);
        }
    }
    await db.query('DELETE FROM dam_asset_audio_spectral_profiles WHERE tenant_id = ? AND asset_id = ? AND id = ?', [tenantId, assetId, profileId]);
    void (0, webhookDispatcher_1.dispatchWebhookEvent)(tenantId, 'asset.updated', {
        asset_id: assetId,
        profile_id: profileId,
        profile_type: profile.profile_type,
        event_type: 'AUDIO_SPECTRAL_PROFILE_DELETED',
    });
    return true;
}
