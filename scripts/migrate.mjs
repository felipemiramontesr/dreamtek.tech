import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import mariadb from 'mariadb';
import dotenv from 'dotenv';

dotenv.config();

const isDryRun = process.argv.includes('--dry-run');
const isProd = process.argv.includes('--env') && process.argv[process.argv.indexOf('--env') + 1] === 'production';

// Condition C-K2: In production mode, force localhost SSH tunnel port 127.0.0.1:3307
const dbHost = isProd ? '127.0.0.1' : (process.env.DB_HOST || '127.0.0.1');
const dbPort = isProd ? 3307 : parseInt(process.env.DB_PORT || '3306', 10);
const dbUser = process.env.DB_USER || 'root';
const dbPassword = process.env.DB_PASSWORD || '';
const dbName = process.env.DB_NAME || 'dreamtek_db';

/**
 * Compute SHA-256 checksum of file content (Condition C-K3 / OWASP A02)
 */
function computeChecksum(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

async function runMigrations() {
  console.log(`🚀 Starting Database Migration Runner (Env: ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'}, Dry-Run: ${isDryRun})`);
  console.log(`🔌 Target Host: ${dbHost}:${dbPort} | Database: ${dbName}`);

  const pool = mariadb.createPool({
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPassword,
    database: dbName,
    connectionLimit: 5,
  });

  let conn;
  try {
    conn = await pool.getConnection();

    // Condition C-K4: Auto-bootstrap schema_migrations table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        version VARCHAR(50) NOT NULL UNIQUE,
        filename VARCHAR(255) NOT NULL,
        checksum VARCHAR(64) NOT NULL,
        execution_time_ms INT NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Fetch applied migrations
    const appliedRows = await conn.query('SELECT version, filename, checksum FROM schema_migrations ORDER BY id ASC');
    const appliedMap = new Map(appliedRows.map((r) => [r.filename, r]));

    // Read migrations directory
    const migrationsDir = path.join(process.cwd(), 'database', 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.error(`❌ Migrations directory not found at: ${migrationsDir}`);
      process.exit(1);
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));

    console.log(`📁 Found ${files.length} migration file(s) on disk.`);

    const pending = [];

    for (const filename of files) {
      const filePath = path.join(migrationsDir, filename);
      const sqlContent = fs.readFileSync(filePath, 'utf-8');
      const currentChecksum = computeChecksum(sqlContent);

      if (appliedMap.has(filename)) {
        const applied = appliedMap.get(filename);
        // Condition C-K3: Checksum mismatch HALT
        if (applied.checksum !== currentChecksum) {
          console.error(`❌ CHECKSUM MISMATCH HALT: Migration file '${filename}' has been modified on disk after application!`);
          console.error(`   Applied Checksum: ${applied.checksum}`);
          console.error(`   Current Checksum: ${currentChecksum}`);
          console.error(`   Aborting execution to prevent database corruption.`);
          process.exit(1);
        }
      } else {
        pending.push({ filename, filePath, sqlContent, checksum: currentChecksum });
      }
    }

    if (pending.length === 0) {
      console.log(`✅ Database schema is up-to-date. 0 pending migrations.`);
      if (conn) conn.release();
      await pool.end();
      return;
    }

    console.log(`📋 Found ${pending.length} pending migration(s):`);
    pending.forEach((p) => console.log(`   - ${p.filename} (sha256: ${p.checksum.substring(0, 8)}...)`));

    if (isDryRun) {
      console.log(`🔍 [DRY-RUN MODE] Migration execution skipped. No database changes were applied.`);
      if (conn) conn.release();
      await pool.end();
      return;
    }

    // Condition C-K5: Honest DDL execution per migration
    for (const item of pending) {
      const startTime = Date.now();
      console.log(`⏳ Applying migration '${item.filename}'...`);

      // Split SQL file into statements by semicolon (ignoring comments/empty)
      const statements = item.sqlContent
        .split(/;\s*$/m)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const statement of statements) {
        await conn.query(statement);
      }

      const durationMs = Date.now() - startTime;
      const versionStr = item.filename.split('_')[0];

      await conn.query(
        'INSERT INTO schema_migrations (version, filename, checksum, execution_time_ms) VALUES (?, ?, ?, ?)',
        [versionStr, item.filename, item.checksum, durationMs]
      );

      console.log(`✅ Migration '${item.filename}' applied successfully in ${durationMs}ms.`);
    }

    console.log(`🎉 All ${pending.length} pending migration(s) applied successfully.`);
  } catch (err) {
    console.error(`❌ Migration failed:`, err);
    process.exit(1);
  } finally {
    if (conn) conn.release();
    await pool.end();
  }
}

// Execute if called directly from CLI
if (process.argv[1] && process.argv[1].endsWith('migrate.mjs')) {
  runMigrations();
}

export { computeChecksum, runMigrations };
