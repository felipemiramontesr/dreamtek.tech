import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno desde .env local o producción
dotenv.config({ path: path.join(__dirname, '../.env') });

export function getDbConfig() {
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'dreamtek',
  };
}

const config = getDbConfig();

export const pool = mysql.createPool({
  host: config.host,
  port: config.port,
  user: config.user,
  password: config.password,
  database: config.database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

/**
 * Función auxiliar para ejecutar queries tipadas de forma segura.
 */
export async function query<T = any>(sql: string, params: any[] = []): Promise<T> {
  const [rows] = await pool.execute(sql, params);
  return rows as T;
}

export interface DBConnection {
  query: <T = any>(sql: string, params?: any[]) => Promise<T>;
}

/**
 * Executes a callback within a single dedicated connection transaction (ACID compliant).
 * Ensures beginTransaction, commit, rollback, and release occur on the exact same connection.
 */
export async function withTransaction<T>(
  callback: (conn: DBConnection) => Promise<T>,
): Promise<T> {
  if (!pool || typeof pool.getConnection !== 'function') {
    return callback({ query });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const conn: DBConnection = {
      query: async <R = any>(sql: string, params: any[] = []): Promise<R> => {
        const [rows] = await connection.execute(sql, params);
        return rows as R;
      },
    };
    const result = await callback(conn);
    await connection.commit();
    return result;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

