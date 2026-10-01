"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.requireRole = requireRole;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function getJwtSecret() {
    if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
        throw new Error('FATAL SECURITY ERROR: JWT_SECRET environment variable is missing in production.');
    }
    return process.env.JWT_SECRET || 'dreamtek_dev_jwt_secret_key_2026';
}
/**
 * Require Authentication Middleware (Condition C-M2)
 * Extracts JWT token from HttpOnly cookie 'dreamtek_session' or Authorization header
 */
function requireAuth(req, res, next) {
    let token;
    // 1. Try from HttpOnly Cookie
    if (req.cookies && req.cookies.dreamtek_session) {
        token = req.cookies.dreamtek_session;
    }
    // 2. Try from Authorization Header
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    }
    if (!token) {
        res.status(401).json({
            status: 401,
            error: 'Unauthorized',
            message: 'Acceso no autorizado. Se requiere un token de sesión válido.',
        });
        return;
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, getJwtSecret(), { algorithms: ['HS512'] });
        // Condition C-M1 & C-M2: Standardize userId, email, and uppercase role
        req.user = {
            userId: decoded.userId || decoded.uid || decoded.id || 0,
            email: decoded.email,
            role: (decoded.role || 'CLIENT').toUpperCase(),
            tenantId: decoded.tenantId ? Number(decoded.tenantId) : undefined,
        };
        next();
    }
    catch (_err) {
        res.status(401).json({
            status: 401,
            error: 'Unauthorized',
            message: 'Token de sesión expirado o inválido.',
        });
    }
}
/**
 * Require Role Middleware (Condition C-M1)
 * Enforces Role-Based Access Control (RBAC) with uppercase role matching ('ADMIN', 'CLIENT')
 */
function requireRole(allowedRoles) {
    const upperAllowed = allowedRoles.map((r) => r.toUpperCase());
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({
                status: 401,
                error: 'Unauthorized',
                message: 'Usuario no autenticado.',
            });
            return;
        }
        if (!upperAllowed.includes(req.user.role)) {
            res.status(403).json({
                status: 403,
                error: 'Forbidden',
                message: `Acceso prohibido. Se requiere rol [${upperAllowed.join(', ')}].`,
            });
            return;
        }
        next();
    };
}
