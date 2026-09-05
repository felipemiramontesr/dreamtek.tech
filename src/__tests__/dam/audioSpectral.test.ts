import fs from 'fs';
import path from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';
import {
  AudioSpectralProfileTypeEnum,
  createAudioSpectralBodySchema,
  listAudioSpectralQuerySchema,
  audioSpectralParamSchema,
} from '../../../server/src/schemas/audioSpectral.schema';
import {
  calculateHarmonicSeries,
  resolveProfileParameters,
  generateSpectrogramDerivative,
  createAssetAudioSpectralProfile,
  listAssetAudioSpectralProfiles,
  getAssetAudioSpectralProfileById,
  deleteAssetAudioSpectralProfile,
} from '../../../server/src/utils/audioSpectralEngine';
import { STORAGE_ROOT } from '../../../server/src/utils/storage';
import { audioSpectralRateLimiter } from '../../../server/src/middleware/rateLimiter';
import * as db from '../../../server/src/db';
import { evaluateAclPermission } from '../../../server/src/utils/acl';
import { dispatchWebhookEvent } from '../../../server/src/utils/webhookDispatcher';
import assetsRouter from '../../../server/src/routes/assets';

vi.mock('../../../server/src/db', () => ({
  query: vi.fn(),
  pool: {
    execute: vi.fn(),
    getConnection: vi.fn(),
  },
}));

vi.mock('../../../server/src/middleware/auditLogger', () => ({
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
  auditLogger: vi.fn((_req, _res, next) => next()),
}));

vi.mock('../../../server/src/utils/acl', () => ({
  evaluateAclPermission: vi.fn().mockResolvedValue({ allowed: true, reason: 'ADMIN_BYPASS' }),
}));

vi.mock('../../../server/src/utils/webhookDispatcher', () => ({
  dispatchWebhookEvent: vi.fn().mockResolvedValue(undefined),
}));

const TEST_SECRET = 'test-jwt-secret-key-super-secure-and-long-enough-for-hs512-compliance-testing';
process.env.JWT_SECRET = TEST_SECRET;

function makeToken(payload: { userId: number; role: string; tenantId: number }): string {
  return jwt.sign(
    {
      userId: payload.userId,
      uid: payload.userId,
      email: `${payload.role.toLowerCase()}@dreamtek.tech`,
      role: payload.role,
      tenantId: payload.tenantId,
    },
    TEST_SECRET,
    { algorithm: 'HS512', expiresIn: '1h' },
  );
}

let ipCounter = 1;
function getNextIp(): string {
  return `10.99.1.${ipCounter++}`;
}

describe('DAM AI Audio Spectral Noise Profiling & De-humming (FC 035)', () => {
  const adminToken = makeToken({ userId: 1, role: 'ADMIN', tenantId: 100 });
  const clientToken = makeToken({ userId: 2, role: 'CLIENT', tenantId: 100 });

  let app: express.Express;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(evaluateAclPermission).mockResolvedValue({
      allowed: true,
      reason: 'ADMIN_BYPASS',
    });
    vi.mocked(dispatchWebhookEvent).mockResolvedValue(undefined);
    app = express();
    app.set('trust proxy', true);
    app.use(express.json());
    app.use('/api/v1/assets', assetsRouter);
  });

  describe('1. Zod Validation Schemas (audioSpectral.schema.ts)', () => {
    it('validates AudioSpectralProfileTypeEnum values', () => {
      expect(AudioSpectralProfileTypeEnum.safeParse('MAINS_HUM_50HZ').success).toBe(true);
      expect(AudioSpectralProfileTypeEnum.safeParse('MAINS_HUM_60HZ').success).toBe(true);
      expect(AudioSpectralProfileTypeEnum.safeParse('BROADBAND_HISS').success).toBe(true);
      expect(AudioSpectralProfileTypeEnum.safeParse('HVAC_RUMBLE').success).toBe(true);
      expect(AudioSpectralProfileTypeEnum.safeParse('GROUND_LOOP').success).toBe(true);
      expect(AudioSpectralProfileTypeEnum.safeParse('CUSTOM').success).toBe(true);
      expect(AudioSpectralProfileTypeEnum.safeParse('INVALID_PROFILE').success).toBe(false);
    });

    it('validates createAudioSpectralBodySchema with default and custom values', () => {
      const defaultParsed = createAudioSpectralBodySchema.safeParse({});
      expect(defaultParsed.success).toBe(true);
      if (defaultParsed.success) {
        expect(defaultParsed.data.profile_type).toBe('MAINS_HUM_60HZ');
        expect(defaultParsed.data.harmonic_count).toBe(1);
        expect(defaultParsed.data.attenuation_db).toBe(12);
        expect(defaultParsed.data.spectral_noise_floor_db).toBe(-60);
        expect(defaultParsed.data.q_factor).toBe(10);
        expect(defaultParsed.data.width).toBe(800);
        expect(defaultParsed.data.height).toBe(300);
      }

      const customParsed = createAudioSpectralBodySchema.safeParse({
        profile_type: 'CUSTOM',
        base_frequency_hz: 120,
        harmonic_count: 5,
        attenuation_db: 30,
        spectral_noise_floor_db: -80,
        q_factor: 25,
        width: 1024,
        height: 512,
      });
      expect(customParsed.success).toBe(true);
    });

    it('fails createAudioSpectralBodySchema on invalid ranges', () => {
      expect(createAudioSpectralBodySchema.safeParse({ base_frequency_hz: 10 }).success).toBe(
        false,
      );
      expect(createAudioSpectralBodySchema.safeParse({ base_frequency_hz: 25000 }).success).toBe(
        false,
      );
      expect(createAudioSpectralBodySchema.safeParse({ harmonic_count: 0 }).success).toBe(false);
      expect(createAudioSpectralBodySchema.safeParse({ harmonic_count: 15 }).success).toBe(false);
      expect(createAudioSpectralBodySchema.safeParse({ attenuation_db: 0 }).success).toBe(false);
      expect(createAudioSpectralBodySchema.safeParse({ attenuation_db: 100 }).success).toBe(false);
      expect(
        createAudioSpectralBodySchema.safeParse({ spectral_noise_floor_db: -150 }).success,
      ).toBe(false);
      expect(createAudioSpectralBodySchema.safeParse({ spectral_noise_floor_db: 10 }).success).toBe(
        false,
      );
      expect(createAudioSpectralBodySchema.safeParse({ q_factor: 0.05 }).success).toBe(false);
      expect(createAudioSpectralBodySchema.safeParse({ q_factor: 200 }).success).toBe(false);
      expect(createAudioSpectralBodySchema.safeParse({ width: 50 }).success).toBe(false);
      expect(createAudioSpectralBodySchema.safeParse({ height: 2000 }).success).toBe(false);
    });

    it('validates listAudioSpectralQuerySchema', () => {
      const defaultQuery = listAudioSpectralQuerySchema.safeParse({});
      expect(defaultQuery.success).toBe(true);
      if (defaultQuery.success) {
        expect(defaultQuery.data.limit).toBe(50);
        expect(defaultQuery.data.offset).toBe(0);
      }

      const filteredQuery = listAudioSpectralQuerySchema.safeParse({
        limit: '20',
        offset: '10',
        profile_type: 'GROUND_LOOP',
      });
      expect(filteredQuery.success).toBe(true);
      if (filteredQuery.success) {
        expect(filteredQuery.data.limit).toBe(20);
        expect(filteredQuery.data.offset).toBe(10);
        expect(filteredQuery.data.profile_type).toBe('GROUND_LOOP');
      }

      expect(listAudioSpectralQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
      expect(listAudioSpectralQuerySchema.safeParse({ offset: -1 }).success).toBe(false);
    });

    it('validates audioSpectralParamSchema', () => {
      expect(audioSpectralParamSchema.safeParse({ id: 10, profileId: 5 }).success).toBe(true);
      expect(audioSpectralParamSchema.safeParse({ id: '10', profileId: '5' }).success).toBe(true);
      expect(audioSpectralParamSchema.safeParse({ id: 0, profileId: 5 }).success).toBe(false);
      expect(audioSpectralParamSchema.safeParse({ id: 10, profileId: -1 }).success).toBe(false);
    });
  });

  describe('2. Audio Spectral Engine Core (audioSpectralEngine.ts)', () => {
    it('calculateHarmonicSeries bounds harmonics and handles upper frequencies correctly', () => {
      const series60 = calculateHarmonicSeries(60, 4);
      expect(series60).toEqual([60, 120, 180, 240]);

      // Count clamp: minimum 1, maximum 10
      const clampedCount = calculateHarmonicSeries(50, 15);
      expect(clampedCount.length).toBe(10);

      // Filtering frequencies above 20000 Hz
      const highFreqSeries = calculateHarmonicSeries(8000, 5);
      expect(highFreqSeries).toEqual([8000, 16000]); // 24000 is filtered out
    });

    it('resolveProfileParameters handles all predefined profiles and custom settings', () => {
      const p50 = resolveProfileParameters('MAINS_HUM_50HZ');
      expect(p50.base_frequency_hz).toBe(50);
      expect(p50.harmonic_count).toBe(3);
      expect(p50.spectral_metadata.filter_type).toBe('NOTCH_CASCADE');

      const p60 = resolveProfileParameters('MAINS_HUM_60HZ');
      expect(p60.base_frequency_hz).toBe(60);
      expect(p60.harmonic_count).toBe(3);

      const pHiss = resolveProfileParameters('BROADBAND_HISS');
      expect(pHiss.base_frequency_hz).toBe(5000);
      expect(pHiss.spectral_metadata.filter_type).toBe('BAND_STOP');

      const pRumble = resolveProfileParameters('HVAC_RUMBLE');
      expect(pRumble.base_frequency_hz).toBe(40);
      expect(pRumble.harmonic_count).toBe(2);

      const pGround = resolveProfileParameters('GROUND_LOOP');
      expect(pGround.base_frequency_hz).toBe(120);
      expect(pGround.harmonic_count).toBe(4);
      expect(pGround.spectral_metadata.filter_type).toBe('COMB_FILTER');

      const pCustom = resolveProfileParameters('CUSTOM', {
        base_frequency_hz: 250,
        harmonic_count: 5,
        attenuation_db: 35,
        q_factor: 50,
        spectral_noise_floor_db: -75,
      });
      expect(pCustom.base_frequency_hz).toBe(250);
      expect(pCustom.harmonic_count).toBe(5);
      expect(pCustom.attenuation_db).toBe(35);
      expect(pCustom.q_factor).toBe(50);
      expect(pCustom.spectral_noise_floor_db).toBe(-75);
    });

    it('generateSpectrogramDerivative creates a real WebP derivative on disk', async () => {
      const tenantId = 100;
      const assetId = 200;
      const versionId = 1;

      const derivativePath = await generateSpectrogramDerivative(
        tenantId,
        assetId,
        versionId,
        'MAINS_HUM_60HZ',
        60,
        3,
        800,
        300,
      );

      expect(fs.existsSync(derivativePath)).toBe(true);
      expect(derivativePath.endsWith('.webp')).toBe(true);

      // Clean up test derivative
      fs.unlinkSync(derivativePath);
    });

    it('createAssetAudioSpectralProfile executes database query and unlinks previous derivative if present', async () => {
      const tenantId = 100;
      const assetId = 50;
      const versionId = 1;

      // Mock previous existing derivative to test physical unlink
      const dummyPrevPath = path.join(
        STORAGE_ROOT,
        'derivatives',
        `tenant_${tenantId}`,
        'dummy_prev.webp',
      );
      fs.mkdirSync(path.dirname(dummyPrevPath), { recursive: true });
      fs.writeFileSync(dummyPrevPath, Buffer.from('test'));

      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 99, output_derivative_path: dummyPrevPath }]) // check existing
        .mockResolvedValueOnce({ insertId: 101 }) // upsert
        .mockResolvedValueOnce([
          {
            id: 101,
            tenant_id: tenantId,
            asset_id: assetId,
            version_id: versionId,
            profile_type: 'MAINS_HUM_60HZ',
            base_frequency_hz: 60,
            harmonic_count: 3,
            attenuation_db: 18,
            spectral_noise_floor_db: -65,
            q_factor: 15,
            output_derivative_path: dummyPrevPath,
            spectral_metadata: JSON.stringify({
              harmonics_detected: [60, 120, 180],
              bandwidth_hz: 4,
              snr_improvement_db: 13.5,
              filter_type: 'NOTCH_CASCADE',
              fft_bins: 2048,
              spectrogram_width: 800,
              spectrogram_height: 300,
            }),
            created_at: '2026-08-28T21:00:00.000Z',
            updated_at: '2026-08-28T21:00:00.000Z',
          },
        ]); // fetch result

      const profile = await createAssetAudioSpectralProfile(tenantId, assetId, versionId, {
        profile_type: 'MAINS_HUM_60HZ',
      });

      expect(profile.id).toBe(101);
      expect(profile.base_frequency_hz).toBe(60);
      expect(profile.spectral_metadata.harmonics_detected).toEqual([60, 120, 180]);
      expect(dispatchWebhookEvent).toHaveBeenCalledWith(
        tenantId,
        'asset.updated',
        expect.any(Object),
      );

      // Check that dummyPrevPath was unlinked during replacement
      expect(fs.existsSync(dummyPrevPath)).toBe(false);

      if (profile.output_derivative_path && fs.existsSync(profile.output_derivative_path)) {
        fs.unlinkSync(profile.output_derivative_path);
      }
    });

    it('listAssetAudioSpectralProfiles lists profiles with string or parsed JSON', async () => {
      const tenantId = 100;
      const assetId = 50;

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: tenantId,
          asset_id: assetId,
          version_id: 1,
          profile_type: 'MAINS_HUM_50HZ',
          base_frequency_hz: 50,
          harmonic_count: 3,
          attenuation_db: 18,
          spectral_noise_floor_db: -65,
          q_factor: 15,
          output_derivative_path: null,
          spectral_metadata:
            '{"harmonics_detected":[50,100,150],"bandwidth_hz":3.33,"snr_improvement_db":13.5,"filter_type":"NOTCH_CASCADE","fft_bins":2048,"spectrogram_width":800,"spectrogram_height":300}',
          created_at: '2026-08-28T21:00:00.000Z',
        },
        {
          id: 2,
          tenant_id: tenantId,
          asset_id: assetId,
          version_id: 1,
          profile_type: 'BROADBAND_HISS',
          base_frequency_hz: 5000,
          harmonic_count: 1,
          attenuation_db: 12,
          spectral_noise_floor_db: -50,
          q_factor: 0.7,
          output_derivative_path: null,
          spectral_metadata: {
            harmonics_detected: [5000],
            bandwidth_hz: 7142.86,
            snr_improvement_db: 9,
            filter_type: 'BAND_STOP',
            fft_bins: 2048,
            spectrogram_width: 800,
            spectrogram_height: 300,
          },
          created_at: '2026-08-28T21:05:00.000Z',
        },
      ]);

      const list = await listAssetAudioSpectralProfiles(tenantId, assetId, 10, 0, 'MAINS_HUM_50HZ');
      expect(list.length).toBe(2);
      expect(list[0].spectral_metadata.harmonics_detected).toEqual([50, 100, 150]);
      expect(list[1].spectral_metadata.filter_type).toBe('BAND_STOP');
    });

    it('getAssetAudioSpectralProfileById returns null when not found or record when exists', async () => {
      const tenantId = 100;
      const assetId = 50;

      vi.mocked(db.query).mockResolvedValueOnce([]);
      const notFound = await getAssetAudioSpectralProfileById(tenantId, assetId, 999);
      expect(notFound).toBeNull();

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: tenantId,
          asset_id: assetId,
          version_id: 1,
          profile_type: 'HVAC_RUMBLE',
          base_frequency_hz: 40,
          harmonic_count: 2,
          attenuation_db: 20,
          spectral_noise_floor_db: -55,
          q_factor: 8,
          output_derivative_path: null,
          spectral_metadata: JSON.stringify({
            harmonics_detected: [40, 80],
            bandwidth_hz: 5,
            snr_improvement_db: 15,
            filter_type: 'NOTCH_CASCADE',
            fft_bins: 2048,
            spectrogram_width: 800,
            spectrogram_height: 300,
          }),
        },
      ]);

      const found = await getAssetAudioSpectralProfileById(tenantId, assetId, 1);
      expect(found).not.toBeNull();
      expect(found?.profile_type).toBe('HVAC_RUMBLE');
    });

    it('resolveProfileParameters handles custom defaults and fallbacks when fields are undefined', () => {
      const pCustomDefault = resolveProfileParameters('CUSTOM', {});
      expect(pCustomDefault.base_frequency_hz).toBe(100);
      expect(pCustomDefault.harmonic_count).toBe(1);
      expect(pCustomDefault.attenuation_db).toBe(12);
      expect(pCustomDefault.q_factor).toBe(10);
      expect(pCustomDefault.spectral_noise_floor_db).toBe(-60);
    });

    it('generateSpectrogramDerivative handles clamped minimum and maximum width/height', async () => {
      const tenantId = 100;
      const assetId = 201;
      const versionId = 1;

      const pathMin = await generateSpectrogramDerivative(
        tenantId,
        assetId,
        versionId,
        'CUSTOM',
        100,
        1,
        50, // will clamp to 128
        20, // will clamp to 64
      );
      expect(fs.existsSync(pathMin)).toBe(true);
      fs.unlinkSync(pathMin);

      const pathMax = await generateSpectrogramDerivative(
        tenantId,
        assetId,
        versionId,
        'CUSTOM',
        100,
        1,
        5000, // will clamp to 2048
        3000, // will clamp to 1024
      );
      expect(fs.existsSync(pathMax)).toBe(true);
      fs.unlinkSync(pathMax);
    });

    it('createAssetAudioSpectralProfile handles missing old file on disk and null previous path', async () => {
      const tenantId = 100;
      const assetId = 51;
      const versionId = 1;

      // 1. existing row with null output_derivative_path
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 88, output_derivative_path: null }])
        .mockResolvedValueOnce({ insertId: 102 })
        .mockResolvedValueOnce([
          {
            id: 102,
            tenant_id: tenantId,
            asset_id: assetId,
            version_id: versionId,
            profile_type: 'MAINS_HUM_60HZ',
            base_frequency_hz: 60,
            harmonic_count: 3,
            attenuation_db: 18,
            spectral_noise_floor_db: -65,
            q_factor: 15,
            output_derivative_path: null,
            spectral_metadata: {
              harmonics_detected: [60],
              bandwidth_hz: 4,
              snr_improvement_db: 13.5,
              filter_type: 'NOTCH_CASCADE',
              fft_bins: 2048,
              spectrogram_width: 800,
              spectrogram_height: 300,
            },
          },
        ]);

      const profile1 = await createAssetAudioSpectralProfile(tenantId, assetId, versionId, {
        profile_type: 'MAINS_HUM_60HZ',
      });
      expect(profile1.id).toBe(102);

      // 2. existing row with path that does not exist on disk
      const nonExistentPath = path.join(
        STORAGE_ROOT,
        'derivatives',
        `tenant_${tenantId}`,
        'non_existent.webp',
      );
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 89, output_derivative_path: nonExistentPath }])
        .mockResolvedValueOnce({ insertId: 103 })
        .mockResolvedValueOnce([
          {
            id: 103,
            tenant_id: tenantId,
            asset_id: assetId,
            version_id: versionId,
            profile_type: 'MAINS_HUM_60HZ',
            base_frequency_hz: 60,
            harmonic_count: 3,
            attenuation_db: 18,
            spectral_noise_floor_db: -65,
            q_factor: 15,
            output_derivative_path: null,
            spectral_metadata: {
              harmonics_detected: [60],
              bandwidth_hz: 4,
              snr_improvement_db: 13.5,
              filter_type: 'NOTCH_CASCADE',
              fft_bins: 2048,
              spectrogram_width: 800,
              spectrogram_height: 300,
            },
          },
        ]);

      const profile2 = await createAssetAudioSpectralProfile(tenantId, assetId, versionId, {});
      expect(profile2.id).toBe(103);
    });

    it('listAssetAudioSpectralProfiles lists profiles without profileType parameter', async () => {
      const tenantId = 100;
      const assetId = 50;

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: tenantId,
          asset_id: assetId,
          version_id: 1,
          profile_type: 'MAINS_HUM_50HZ',
          base_frequency_hz: 50,
          harmonic_count: 3,
          attenuation_db: 18,
          spectral_noise_floor_db: -65,
          q_factor: 15,
          output_derivative_path: null,
          spectral_metadata: { harmonics_detected: [50] },
        },
      ]);

      const list = await listAssetAudioSpectralProfiles(tenantId, assetId);
      expect(list.length).toBe(1);
    });

    it('getAssetAudioSpectralProfileById handles parsed object metadata', async () => {
      const tenantId = 100;
      const assetId = 50;

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: tenantId,
          asset_id: assetId,
          version_id: 1,
          profile_type: 'HVAC_RUMBLE',
          base_frequency_hz: 40,
          harmonic_count: 2,
          attenuation_db: 20,
          spectral_noise_floor_db: -55,
          q_factor: 8,
          output_derivative_path: null,
          spectral_metadata: {
            harmonics_detected: [40, 80],
            bandwidth_hz: 5,
            snr_improvement_db: 15,
            filter_type: 'NOTCH_CASCADE',
            fft_bins: 2048,
            spectrogram_width: 800,
            spectrogram_height: 300,
          },
        },
      ]);

      const found = await getAssetAudioSpectralProfileById(tenantId, assetId, 1);
      expect(found).not.toBeNull();
      expect(found?.spectral_metadata.harmonics_detected).toEqual([40, 80]);
    });

    it('deleteAssetAudioSpectralProfile handles null derivative and non-existent file on disk', async () => {
      const tenantId = 100;
      const assetId = 50;

      // 1. null output_derivative_path
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 3,
            tenant_id: tenantId,
            asset_id: assetId,
            version_id: 1,
            profile_type: 'CUSTOM',
            base_frequency_hz: 100,
            harmonic_count: 1,
            attenuation_db: 12,
            spectral_noise_floor_db: -60,
            q_factor: 10,
            output_derivative_path: null,
            spectral_metadata: { harmonics_detected: [100] },
          },
        ])
        .mockResolvedValueOnce({ affectedRows: 1 });

      const delNull = await deleteAssetAudioSpectralProfile(tenantId, assetId, 3);
      expect(delNull).toBe(true);

      // 2. output_derivative_path set but file does not exist on disk
      const missingFile = path.join(
        STORAGE_ROOT,
        'derivatives',
        `tenant_${tenantId}`,
        'already_gone.webp',
      );
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 4,
            tenant_id: tenantId,
            asset_id: assetId,
            version_id: 1,
            profile_type: 'CUSTOM',
            base_frequency_hz: 100,
            harmonic_count: 1,
            attenuation_db: 12,
            spectral_noise_floor_db: -60,
            q_factor: 10,
            output_derivative_path: missingFile,
            spectral_metadata: { harmonics_detected: [100] },
          },
        ])
        .mockResolvedValueOnce({ affectedRows: 1 });

      const delMissing = await deleteAssetAudioSpectralProfile(tenantId, assetId, 4);
      expect(delMissing).toBe(true);
    });

    it('deleteAssetAudioSpectralProfile unlinks physical file when it exists on disk', async () => {
      const tenantId = 100;
      const assetId = 50;

      const testDerivative = path.join(
        STORAGE_ROOT,
        'derivatives',
        `tenant_${tenantId}`,
        'test_del_exists.webp',
      );
      fs.mkdirSync(path.dirname(testDerivative), { recursive: true });
      fs.writeFileSync(testDerivative, Buffer.from('delete-me-real'));

      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 2,
            tenant_id: tenantId,
            asset_id: assetId,
            version_id: 1,
            profile_type: 'GROUND_LOOP',
            base_frequency_hz: 120,
            harmonic_count: 4,
            attenuation_db: 24,
            spectral_noise_floor_db: -70,
            q_factor: 20,
            output_derivative_path: testDerivative,
            spectral_metadata: JSON.stringify({
              harmonics_detected: [120, 240, 360, 480],
              bandwidth_hz: 6,
              snr_improvement_db: 18,
              filter_type: 'COMB_FILTER',
              fft_bins: 2048,
              spectrogram_width: 800,
              spectrogram_height: 300,
            }),
          },
        ])
        .mockResolvedValueOnce({ affectedRows: 1 });

      const successResult = await deleteAssetAudioSpectralProfile(tenantId, assetId, 2);
      expect(successResult).toBe(true);
      expect(fs.existsSync(testDerivative)).toBe(false);
    });
  });

  describe('3. Rate Limiter (audioSpectralRateLimiter)', () => {
    it('audioSpectralRateLimiter debe estar definido y configurado', () => {
      expect(audioSpectralRateLimiter).toBeDefined();
    });

    it('audioSpectralRateLimiter responde con 429 cuando se excede el límite de 30 solicitudes', async () => {
      const rateLimitApp = express();
      rateLimitApp.set('trust proxy', true);
      rateLimitApp.use(audioSpectralRateLimiter);
      rateLimitApp.get('/test-spectral-limit', (_req, res) => {
        res.status(200).json({ ok: true });
      });

      const isolatedIp = '198.51.100.234';

      // 30 requests allowed
      for (let i = 0; i < 30; i++) {
        const res = await supertest(rateLimitApp)
          .get('/test-spectral-limit')
          .set('X-Forwarded-For', isolatedIp);
        expect(res.status).toBe(200);
      }

      // 31st request rejected with 429
      const res429 = await supertest(rateLimitApp)
        .get('/test-spectral-limit')
        .set('X-Forwarded-For', isolatedIp);
      expect(res429.status).toBe(429);
      expect(res429.body.error).toBe('Too Many Requests');
      expect(res429.body.message).toContain(
        'Límite de operaciones de perfilado espectral y de-humming',
      );
    });
  });

  describe('4. REST Endpoints Integration (assets.ts)', () => {
    describe('POST /api/v1/assets/:id/audio-spectral-profile', () => {
      it('returns 400 if asset ID is invalid or <= 0', async () => {
        const res1 = await supertest(app)
          .post('/api/v1/assets/invalid/audio-spectral-profile')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp())
          .send({});
        expect(res1.status).toBe(400);
        expect(res1.body.message).toContain('ID de activo inválido');

        const res2 = await supertest(app)
          .post('/api/v1/assets/0/audio-spectral-profile')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp())
          .send({});
        expect(res2.status).toBe(400);

        const res3 = await supertest(app)
          .post('/api/v1/assets/-5/audio-spectral-profile')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp())
          .send({});
        expect(res3.status).toBe(400);
      });

      it('returns 404 if asset does not exist in tenant', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([]);

        const res = await supertest(app)
          .post('/api/v1/assets/999/audio-spectral-profile')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp())
          .send({});

        expect(res.status).toBe(404);
        expect(res.body.message).toContain('Activo digital no encontrado');
      });

      it('returns 400 if asset is not audio or video, or mime_type is empty', async () => {
        // 1. image/png
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: 10, current_version_id: 1, mime_type: 'image/png' },
        ]);

        const res1 = await supertest(app)
          .post('/api/v1/assets/10/audio-spectral-profile')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp())
          .send({});

        expect(res1.status).toBe(400);
        expect(res1.body.message).toContain('Solo activos de audio o video');

        // 2. null mime_type
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: 10, current_version_id: 1, mime_type: null },
        ]);

        const res2 = await supertest(app)
          .post('/api/v1/assets/10/audio-spectral-profile')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp())
          .send({});

        expect(res2.status).toBe(400);
        expect(res2.body.message).toContain('Solo activos de audio o video');
      });

      it('returns 403 if ACL denies EDIT permission', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: 10, current_version_id: 1, mime_type: 'audio/mpeg' },
        ]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({
          allowed: false,
          reason: 'NO_EDIT_ACCESS',
        });

        const res = await supertest(app)
          .post('/api/v1/assets/10/audio-spectral-profile')
          .set('Authorization', `Bearer ${clientToken}`)
          .set('X-Forwarded-For', getNextIp())
          .send({});

        expect(res.status).toBe(403);
        expect(res.body.error).toBe('Forbidden');
      });

      it('returns 201 Created and profile data on success for video/mp4 and null current_version_id fallback', async () => {
        vi.mocked(db.query)
          .mockResolvedValueOnce([{ id: 10, current_version_id: null, mime_type: 'video/mp4' }]) // asset check (current_version_id null -> fallback to 1)
          .mockResolvedValueOnce([]) // check existing
          .mockResolvedValueOnce({ insertId: 1 }) // insert
          .mockResolvedValueOnce([
            {
              id: 1,
              tenant_id: 100,
              asset_id: 10,
              version_id: 1,
              profile_type: 'MAINS_HUM_50HZ',
              base_frequency_hz: 50,
              harmonic_count: 3,
              attenuation_db: 18,
              spectral_noise_floor_db: -65,
              q_factor: 15,
              output_derivative_path: null,
              spectral_metadata: JSON.stringify({
                harmonics_detected: [50, 100, 150],
                bandwidth_hz: 3.33,
                snr_improvement_db: 13.5,
                filter_type: 'NOTCH_CASCADE',
                fft_bins: 2048,
                spectrogram_width: 800,
                spectrogram_height: 300,
              }),
            },
          ]);

        const res = await supertest(app)
          .post('/api/v1/assets/10/audio-spectral-profile')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp())
          .send({ profile_type: 'MAINS_HUM_50HZ' });

        expect(res.status).toBe(201);
        expect(res.body.status).toBe(201);
        expect(res.body.data.profile_type).toBe('MAINS_HUM_50HZ');
        expect(res.body.data.base_frequency_hz).toBe(50);
      });

      it('returns 201 Created on success with truthy current_version_id', async () => {
        vi.mocked(db.query)
          .mockResolvedValueOnce([{ id: 10, current_version_id: 3, mime_type: 'audio/wav' }])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce({ insertId: 2 })
          .mockResolvedValueOnce([
            {
              id: 2,
              tenant_id: 100,
              asset_id: 10,
              version_id: 3,
              profile_type: 'CUSTOM',
              base_frequency_hz: 100,
              harmonic_count: 2,
              attenuation_db: 10,
              spectral_noise_floor_db: -60,
              q_factor: 10,
              output_derivative_path: null,
              spectral_metadata: JSON.stringify({
                harmonics_detected: [100, 200],
                bandwidth_hz: 10,
                snr_improvement_db: 7.5,
                filter_type: 'NOTCH_CASCADE',
                fft_bins: 2048,
                spectrogram_width: 800,
                spectrogram_height: 300,
              }),
            },
          ]);

        const res = await supertest(app)
          .post('/api/v1/assets/10/audio-spectral-profile')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp())
          .send({ profile_type: 'CUSTOM', base_frequency_hz: 100 });

        expect(res.status).toBe(201);
        expect(res.body.data.version_id).toBe(3);
      });

      it('handles server exceptions gracefully (500)', async () => {
        vi.mocked(db.query).mockRejectedValueOnce(new Error('DB crash'));

        const res = await supertest(app)
          .post('/api/v1/assets/10/audio-spectral-profile')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp())
          .send({});

        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Internal Server Error');
      });
    });

    describe('GET /api/v1/assets/:id/audio-spectral-profiles', () => {
      it('returns 400 on invalid or <= 0 asset ID', async () => {
        const res1 = await supertest(app)
          .get('/api/v1/assets/abc/audio-spectral-profiles')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());
        expect(res1.status).toBe(400);

        const res2 = await supertest(app)
          .get('/api/v1/assets/0/audio-spectral-profiles')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());
        expect(res2.status).toBe(400);
      });

      it('returns 404 if asset not found', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([]);

        const res = await supertest(app)
          .get('/api/v1/assets/999/audio-spectral-profiles')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());

        expect(res.status).toBe(404);
      });

      it('returns 403 if ACL denies VIEW permission', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([{ id: 10 }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({
          allowed: false,
          reason: 'NO_VIEW_ACCESS',
        });

        const res = await supertest(app)
          .get('/api/v1/assets/10/audio-spectral-profiles')
          .set('Authorization', `Bearer ${clientToken}`)
          .set('X-Forwarded-For', getNextIp());

        expect(res.status).toBe(403);
      });

      it('returns 200 OK and list of profiles with and without query filter', async () => {
        // 1. With filter
        vi.mocked(db.query)
          .mockResolvedValueOnce([{ id: 10 }]) // asset exists
          .mockResolvedValueOnce([
            {
              id: 1,
              tenant_id: 100,
              asset_id: 10,
              version_id: 1,
              profile_type: 'MAINS_HUM_60HZ',
              base_frequency_hz: 60,
              harmonic_count: 3,
              attenuation_db: 18,
              spectral_noise_floor_db: -65,
              q_factor: 15,
              output_derivative_path: null,
              spectral_metadata: JSON.stringify({
                harmonics_detected: [60, 120, 180],
                bandwidth_hz: 4,
                snr_improvement_db: 13.5,
                filter_type: 'NOTCH_CASCADE',
                fft_bins: 2048,
                spectrogram_width: 800,
                spectrogram_height: 300,
              }),
            },
          ]);

        const res1 = await supertest(app)
          .get(
            '/api/v1/assets/10/audio-spectral-profiles?profile_type=MAINS_HUM_60HZ&limit=25&offset=5',
          )
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());

        expect(res1.status).toBe(200);
        expect(res1.body.data.length).toBe(1);

        // 2. Without filter (defaults)
        vi.mocked(db.query)
          .mockResolvedValueOnce([{ id: 10 }])
          .mockResolvedValueOnce([]);

        const res2 = await supertest(app)
          .get('/api/v1/assets/10/audio-spectral-profiles')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());

        expect(res2.status).toBe(200);
        expect(res2.body.data.length).toBe(0);
      });

      it('handles server exceptions gracefully (500)', async () => {
        vi.mocked(db.query).mockRejectedValueOnce(new Error('DB crash'));

        const res = await supertest(app)
          .get('/api/v1/assets/10/audio-spectral-profiles')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());

        expect(res.status).toBe(500);
      });
    });

    describe('GET /api/v1/assets/:id/audio-spectral-profiles/:profileId', () => {
      it('returns 400 on invalid or <= 0 params', async () => {
        const res1 = await supertest(app)
          .get('/api/v1/assets/10/audio-spectral-profiles/invalid')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());
        expect(res1.status).toBe(400);

        const res2 = await supertest(app)
          .get('/api/v1/assets/0/audio-spectral-profiles/1')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());
        expect(res2.status).toBe(400);

        const res3 = await supertest(app)
          .get('/api/v1/assets/10/audio-spectral-profiles/0')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());
        expect(res3.status).toBe(400);

        const res4 = await supertest(app)
          .get('/api/v1/assets/-1/audio-spectral-profiles/-2')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());
        expect(res4.status).toBe(400);
      });

      it('returns 404 if asset not found', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([]);

        const res = await supertest(app)
          .get('/api/v1/assets/999/audio-spectral-profiles/1')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());

        expect(res.status).toBe(404);
      });

      it('returns 403 if ACL denies VIEW permission', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([{ id: 10 }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({
          allowed: false,
          reason: 'NO_VIEW_ACCESS',
        });

        const res = await supertest(app)
          .get('/api/v1/assets/10/audio-spectral-profiles/1')
          .set('Authorization', `Bearer ${clientToken}`)
          .set('X-Forwarded-For', getNextIp());

        expect(res.status).toBe(403);
      });

      it('returns 404 if profile not found', async () => {
        vi.mocked(db.query)
          .mockResolvedValueOnce([{ id: 10 }]) // asset exists
          .mockResolvedValueOnce([]); // profile not found

        const res = await supertest(app)
          .get('/api/v1/assets/10/audio-spectral-profiles/999')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());

        expect(res.status).toBe(404);
        expect(res.body.message).toContain('Perfil espectral no encontrado');
      });

      it('returns 200 OK and profile detail', async () => {
        vi.mocked(db.query)
          .mockResolvedValueOnce([{ id: 10 }]) // asset exists
          .mockResolvedValueOnce([
            {
              id: 1,
              tenant_id: 100,
              asset_id: 10,
              version_id: 1,
              profile_type: 'GROUND_LOOP',
              base_frequency_hz: 120,
              harmonic_count: 4,
              attenuation_db: 24,
              spectral_noise_floor_db: -70,
              q_factor: 20,
              output_derivative_path: null,
              spectral_metadata: JSON.stringify({
                harmonics_detected: [120, 240, 360, 480],
                bandwidth_hz: 6,
                snr_improvement_db: 18,
                filter_type: 'COMB_FILTER',
                fft_bins: 2048,
                spectrogram_width: 800,
                spectrogram_height: 300,
              }),
            },
          ]);

        const res = await supertest(app)
          .get('/api/v1/assets/10/audio-spectral-profiles/1')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());

        expect(res.status).toBe(200);
        expect(res.body.data.profile_type).toBe('GROUND_LOOP');
      });

      it('handles server exceptions gracefully (500)', async () => {
        vi.mocked(db.query).mockRejectedValueOnce(new Error('DB crash'));

        const res = await supertest(app)
          .get('/api/v1/assets/10/audio-spectral-profiles/1')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());

        expect(res.status).toBe(500);
      });
    });

    describe('DELETE /api/v1/assets/:id/audio-spectral-profiles/:profileId', () => {
      it('returns 400 on invalid or <= 0 params', async () => {
        const res1 = await supertest(app)
          .delete('/api/v1/assets/invalid/audio-spectral-profiles/1')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());
        expect(res1.status).toBe(400);

        const res2 = await supertest(app)
          .delete('/api/v1/assets/0/audio-spectral-profiles/1')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());
        expect(res2.status).toBe(400);

        const res3 = await supertest(app)
          .delete('/api/v1/assets/10/audio-spectral-profiles/0')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());
        expect(res3.status).toBe(400);

        const res4 = await supertest(app)
          .delete('/api/v1/assets/-2/audio-spectral-profiles/-3')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());
        expect(res4.status).toBe(400);
      });

      it('returns 404 if asset not found', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([]);

        const res = await supertest(app)
          .delete('/api/v1/assets/999/audio-spectral-profiles/1')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());

        expect(res.status).toBe(404);
      });

      it('returns 403 if ACL denies EDIT permission', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([{ id: 10 }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({
          allowed: false,
          reason: 'NO_EDIT_ACCESS',
        });

        const res = await supertest(app)
          .delete('/api/v1/assets/10/audio-spectral-profiles/1')
          .set('Authorization', `Bearer ${clientToken}`)
          .set('X-Forwarded-For', getNextIp());

        expect(res.status).toBe(403);
      });

      it('returns 404 if profile not found for deletion', async () => {
        vi.mocked(db.query)
          .mockResolvedValueOnce([{ id: 10 }]) // asset exists
          .mockResolvedValueOnce([]); // profile not found

        const res = await supertest(app)
          .delete('/api/v1/assets/10/audio-spectral-profiles/999')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());

        expect(res.status).toBe(404);
        expect(res.body.message).toContain('Perfil espectral no encontrado para eliminar');
      });

      it('returns 200 OK on successful deletion', async () => {
        vi.mocked(db.query)
          .mockResolvedValueOnce([{ id: 10 }]) // asset exists
          .mockResolvedValueOnce([
            {
              id: 1,
              tenant_id: 100,
              asset_id: 10,
              version_id: 1,
              profile_type: 'HVAC_RUMBLE',
              base_frequency_hz: 40,
              harmonic_count: 2,
              attenuation_db: 20,
              spectral_noise_floor_db: -55,
              q_factor: 8,
              output_derivative_path: null,
              spectral_metadata: JSON.stringify({
                harmonics_detected: [40, 80],
                bandwidth_hz: 5,
                snr_improvement_db: 15,
                filter_type: 'NOTCH_CASCADE',
                fft_bins: 2048,
                spectrogram_width: 800,
                spectrogram_height: 300,
              }),
            },
          ]) // get profile
          .mockResolvedValueOnce({ affectedRows: 1 }); // delete query

        const res = await supertest(app)
          .delete('/api/v1/assets/10/audio-spectral-profiles/1')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());

        expect(res.status).toBe(200);
        expect(res.body.message).toContain('Perfil espectral de audio eliminado exitosamente');
      });

      it('handles server exceptions gracefully (500)', async () => {
        vi.mocked(db.query).mockRejectedValueOnce(new Error('DB crash'));

        const res = await supertest(app)
          .delete('/api/v1/assets/10/audio-spectral-profiles/1')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());

        expect(res.status).toBe(500);
      });
    });
  });
});
