import fs from 'node:fs';
import path from 'node:path';

/**
 * CUTOFF CONSTANT & FROZEN HISTORICAL MIGRATIONS (001–048)
 * Strictly immutable. Renaming breaks schema_migrations.filename in production.
 */
export const CUTOFF_MIGRATION_NUMBER = 49;

export const FROZEN_HISTORICAL_MIGRATIONS = Object.freeze([
  '001_initial_schema.sql',
  '002_sessions_and_rate_limit.sql',
  '003_leads_and_templates.sql',
  '004_security_audit_logs.sql',
  '005_dam_assets_schema.sql',
  '006_dam_shares_schema.sql',
  '007_dam_tags_metadata_schema.sql',
  '008_dam_acl_schema.sql',
  '009_dam_asset_rights_schema.sql',
  '010_dam_processing_jobs_schema.sql',
  '011_dam_webhooks_schema.sql',
  '012_dam_deduplication_schema.sql',
  '013_dam_archival_schema.sql',
  '014_dam_ai_metadata_schema.sql',
  '015_dam_embeddings_schema.sql',
  '016_dam_workflows_schema.sql',
  '017_dam_analytics_schema.sql',
  '018_dam_portals_schema.sql',
  '019_dam_video_scenes_schema.sql',
  '020_dam_video_highlights_schema.sql',
  '021_dam_audio_cleaning_schema.sql',
  '022_dam_subtitles_schema.sql',
  '023_dam_smart_crops_schema.sql',
  '024_dam_image_enhancements_schema.sql',
  '025_dam_background_replacements_schema.sql',
  '026_dam_face_blurrings_schema.sql',
  '027_dam_super_resolutions_schema.sql',
  '028_dam_compressions_schema.sql',
  '029_dam_watermarks_schema.sql',
  '030_dam_banner_adaptations_schema.sql',
  '031_dam_video_transcodings_schema.sql',
  '032_dam_video_thumbnails_schema.sql',
  '033_dam_video_chapters_summaries_schema.sql',
  '034_dam_audio_spectral_profiles_schema.sql',
  '035_dam_video_watermarks_schema.sql',
  '036_escolta_web_provisioning_schema.sql',
  '037_users_username_column.sql',
  '038_quote_funnel_leads.sql',
  '039_lead_crm_pipeline.sql',
  '040_multi_currency_i18n_leads.sql',
  '041_lead_deposit_payments.sql',
  '042_b2b_client_projects.sql',
  '043_b2b_milestone_approvals_and_settlement.sql',
  '044_b2b_handover_and_tax_invoicing.sql',
  '045_auth_mfa_2fa.sql',
  '046_user_email_verification.sql',
  '047_enterprise_mfa_totp.sql',
  '048_client_notifications_and_webhooks.sql',
]);

const FROZEN_SET = new Set(FROZEN_HISTORICAL_MIGRATIONS);

/**
 * Regex for Canonical Format (≥ 049):
 * NNN_V<semver>_<MILESTONE>_<AAAAMMDD>_<descripcion>.sql
 */
export const CANONICAL_MIGRATION_REGEX =
  /^([0-9]{3})_V([0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.]+)?)(?:_|\b)(FC[0-9]{3}(?:-[A-Za-z0-9]+)?)_([0-9]{8})_([a-z0-9_]+)\.sql$/;

/**
 * Validate calendar date in Gregorian calendar (strict arithmetic)
 */
export function isValidGregorianDate(dateStr) {
  if (!/^[0-9]{8}$/.test(dateStr)) return false;
  const year = parseInt(dateStr.substring(0, 4), 10);
  const month = parseInt(dateStr.substring(4, 6), 10);
  const day = parseInt(dateStr.substring(6, 8), 10);

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const dateObj = new Date(Date.UTC(year, month - 1, day));
  return (
    dateObj.getUTCFullYear() === year &&
    dateObj.getUTCMonth() === month - 1 &&
    dateObj.getUTCDate() === day
  );
}

/**
 * Validate SQL header line:
 * Must be in the format: -- <MILESTONE> · <YYYY-MM-DD>
 */
export function validateSqlHeader(firstLine, expectedMilestone, expectedDateStr) {
  if (!firstLine || !firstLine.startsWith('--')) {
    return {
      valid: false,
      error: 'La primera línea del archivo SQL debe ser un comentario de cabecera que empiece con "--"',
    };
  }

  // Regex to extract milestone and YYYY-MM-DD
  const headerMatch = firstLine.match(
    /^--\s+(FC[0-9]{3}(?:-[A-Za-z0-9]+)?)\s+[·•-]\s+([0-9]{4}-[0-9]{2}-[0-9]{2})/i,
  );

  if (!headerMatch) {
    return {
      valid: false,
      error: `Formato de cabecera inválido. Debe ser: "-- <MILESTONE> · <AAAA-MM-DD>" (encontrado: "${firstLine.trim()}")`,
    };
  }

  const [, milestone, headerDate] = headerMatch;
  const formattedExpectedDate = `${expectedDateStr.substring(0, 4)}-${expectedDateStr.substring(4, 6)}-${expectedDateStr.substring(6, 8)}`;

  if (milestone.toUpperCase() !== expectedMilestone.toUpperCase()) {
    return {
      valid: false,
      error: `Milestone en cabecera ("${milestone}") no coincide con el nombre del archivo ("${expectedMilestone}")`,
    };
  }

  if (headerDate !== formattedExpectedDate) {
    return {
      valid: false,
      error: `Fecha en cabecera ("${headerDate}") no coincide con la fecha del archivo ("${formattedExpectedDate}")`,
    };
  }

  return { valid: true };
}

/**
 * Validate a single migration file
 */
export function verifyMigrationFile(filename, fileContent = null, migrationsDir = null) {
  // 1. If it is in the frozen historical set
  if (FROZEN_SET.has(filename)) {
    return { valid: true, isHistorical: true };
  }

  // Extract prefix number
  const prefixMatch = filename.match(/^([0-9]{3})_/);
  if (!prefixMatch) {
    return {
      valid: false,
      error: `NOMBRE_INVALIDO: El archivo "${filename}" no empieza con un prefijo numérico de 3 dígitos (NNN_).`,
    };
  }

  const num = parseInt(prefixMatch[1], 10);

  // Check cutoff violation
  if (num < CUTOFF_MIGRATION_NUMBER) {
    return {
      valid: false,
      error: `CUTOFF_VIOLATION: El archivo "${filename}" tiene número ${prefixMatch[1]} inferior al corte ${CUTOFF_MIGRATION_NUMBER} y no está en la lista congelada.`,
    };
  }

  // Check canonical regex
  const canonicalMatch = filename.match(CANONICAL_MIGRATION_REGEX);
  if (!canonicalMatch) {
    return {
      valid: false,
      error: `FORMATO_INVALIDO: El archivo "${filename}" no cumple el formato canónico "NNN_V<versión>_<MILESTONE>_<AAAAMMDD>_<descripcion>.sql".`,
    };
  }

  const [, _nnnStr, semver, milestone, dateStr, description] = canonicalMatch;

  // Validate Gregorian calendar date
  if (!isValidGregorianDate(dateStr)) {
    return {
      valid: false,
      error: `FECHA_INVALIDA: La fecha "${dateStr}" en "${filename}" no existe en el calendario gregoriano.`,
    };
  }

  // If content is provided or can be read from migrationsDir, validate SQL header
  let content = fileContent;
  if (content === null && migrationsDir) {
    const fullPath = path.join(migrationsDir, filename);
    if (fs.existsSync(fullPath)) {
      content = fs.readFileSync(fullPath, 'utf8');
    }
  }

  if (typeof content === 'string') {
    const lines = content.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    const firstLine = lines[0] || '';
    const headerResult = validateSqlHeader(firstLine, milestone, dateStr);
    if (!headerResult.valid) {
      return {
        valid: false,
        error: `CABECERA_INVALIDA (${filename}): ${headerResult.error}`,
      };
    }
  }

  return {
    valid: true,
    isHistorical: false,
    details: {
      number: num,
      semver,
      milestone,
      date: dateStr,
      description,
    },
  };
}

/**
 * Verify full migrations directory
 */
export function verifyMigrationsDirectory(migrationsDir) {
  if (!fs.existsSync(migrationsDir)) {
    return {
      valid: false,
      errors: [`Directorio no encontrado: ${migrationsDir}`],
    };
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    return {
      valid: false,
      errors: ['No se encontraron archivos de migración .sql en el directorio.'],
    };
  }

  const errors = [];
  const seenNumbers = new Map();
  let verifiedCount = 0;
  let historicalCount = 0;
  let canonicalCount = 0;

  for (const filename of files) {
    const prefixMatch = filename.match(/^([0-9]{3})_/);
    if (prefixMatch) {
      const numStr = prefixMatch[1];
      if (seenNumbers.has(numStr)) {
        errors.push(
          `NUMERO_DUPLICADO: Prefijo "${numStr}" repetido en "${filename}" y "${seenNumbers.get(numStr)}".`,
        );
      } else {
        seenNumbers.set(numStr, filename);
      }
    }

    const fullPath = path.join(migrationsDir, filename);
    const content = fs.readFileSync(fullPath, 'utf8');
    const result = verifyMigrationFile(filename, content);

    if (!result.valid) {
      errors.push(result.error);
    } else {
      verifiedCount++;
      if (result.isHistorical) {
        historicalCount++;
      } else {
        canonicalCount++;
      }
    }
  }

  // Verify monotonicity: sequence numbers must be continuous without unassigned gaps
  const numbers = Array.from(seenNumbers.keys())
    .map((n) => parseInt(n, 10))
    .sort((a, b) => a - b);

  for (let i = 0; i < numbers.length; i++) {
    const expected = i + 1;
    if (numbers[i] !== expected) {
      errors.push(
        `SECUENCIA_ROTA: Se esperaba la migración ${String(expected).padStart(3, '0')}, pero se encontró ${String(numbers[i]).padStart(3, '0')}.`,
      );
      break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    totalFiles: files.length,
    verifiedCount,
    historicalCount,
    canonicalCount,
  };
}

/**
 * CLI Runner
 */
export function runCli(argv = process.argv.slice(2)) {
  const migrationsDir = path.join(process.cwd(), 'database', 'migrations');

  // Single file check mode: --file <filename>
  const fileArgIndex = argv.indexOf('--file');
  if (fileArgIndex !== -1 && argv[fileArgIndex + 1]) {
    const targetFile = argv[fileArgIndex + 1];
    const filename = path.basename(targetFile);
    const fullPath = path.isAbsolute(targetFile)
      ? targetFile
      : path.join(migrationsDir, filename);

    if (!fs.existsSync(fullPath)) {
      console.error(`❌ [FAIL] verifyMigrations: Archivo no encontrado en disco: ${fullPath}`);
      return 1;
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    const result = verifyMigrationFile(filename, content);

    if (!result.valid) {
      console.error(`❌ [FAIL] verifyMigrations: ${result.error}`);
      return 1;
    }

    console.log(`✅ [OK] verifyMigrations: Archivo "${filename}" verificado con éxito.`);
    return 0;
  }

  // Full directory scan mode
  console.log(`🔍 [RUN] verifyMigrations: Analizando directorio database/migrations/ (Corte: ${CUTOFF_MIGRATION_NUMBER})...`);
  const result = verifyMigrationsDirectory(migrationsDir);

  if (!result.valid) {
    console.error(`❌ [FAIL] verifyMigrations encontró ${result.errors.length} error(es):`);
    result.errors.forEach((err) => console.error(`   - ${err}`));
    return 1;
  }

  console.log(
    `✅ [OK] verifyMigrations: ${result.verifiedCount} migraciones verificadas (${result.historicalCount} congeladas, ${result.canonicalCount} canónicas). Cero violaciones.`,
  );
  return 0;
}

// Direct execution guard
const isDirectCall =
  process.argv[1] &&
  (process.argv[1].endsWith('verifyMigrations.mjs') ||
    process.argv[1].endsWith('verifyMigrations'));

if (isDirectCall) {
  const exitCode = runCli();
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}
