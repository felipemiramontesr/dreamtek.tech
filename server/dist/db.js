"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.getDbConfig = getDbConfig;
exports.query = query;
exports.withTransaction = withTransaction;
const promise_1 = __importDefault(require("mysql2/promise"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Cargar variables de entorno desde .env local o producción
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../.env') });
function getDbConfig() {
    return {
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT || '3306', 10),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'dreamtek',
    };
}
const config = getDbConfig();
exports.pool = promise_1.default.createPool({
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
async function query(sql, params = []) {
    const [rows] = await exports.pool.execute(sql, params);
    return rows;
}
/**
 * Executes a callback within a single dedicated connection transaction (ACID compliant).
 * Ensures beginTransaction, commit, rollback, and release occur on the exact same connection.
 */
async function withTransaction(callback) {
    if (!exports.pool || typeof exports.pool.getConnection !== 'function') {
        return callback({ query });
    }
    const connection = await exports.pool.getConnection();
    try {
        await connection.beginTransaction();
        const conn = {
            query: async (sql, params = []) => {
                const [rows] = await connection.execute(sql, params);
                return rows;
            },
        };
        const result = await callback(conn);
        await connection.commit();
        return result;
    }
    catch (err) {
        await connection.rollback();
        throw err;
    }
    finally {
        connection.release();
    }
}
