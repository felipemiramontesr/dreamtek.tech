"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedProjectMilestones = seedProjectMilestones;
exports.extractRows = extractRows;
exports.provisionClientProjectForLead = provisionClientProjectForLead;
const crypto_1 = __importDefault(require("crypto"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const auth_js_1 = require("../routes/auth.js");
/**
 * Genera y persiste los 4 hitos canónicos escalonados proporcionalmente
 * según las semanas estimadas del proyecto (Condición C-044.6)
 */
async function seedProjectMilestones(conn, projectId, estimatedWeeks) {
    const safeWeeks = Math.max(1, Math.floor(estimatedWeeks) || 4);
    const w1 = Math.max(1, Math.round(safeWeeks * 0.25));
    const w2 = Math.max(w1, Math.round(safeWeeks * 0.5));
    const w3 = Math.max(w2, Math.round(safeWeeks * 0.75));
    const w4 = Math.max(w3, safeWeeks);
    const milestones = [
        {
            milestone_index: 1,
            title: 'Arquitectura Técnica & Briefing',
            description: 'Definición de requerimientos, especificaciones de arquitectura y accesos de infraestructura.',
            target_week: w1,
        },
        {
            milestone_index: 2,
            title: 'Desarrollo Core & Base de Datos',
            description: 'Modelado relacional, servicios de backend, endpoints de API y lógica de negocio.',
            target_week: w2,
        },
        {
            milestone_index: 3,
            title: 'Integración Frontend & Staging',
            description: 'Construcción de interfaces interactivas, integración de APIs y despliegue en ambiente de pruebas.',
            target_week: w3,
        },
        {
            milestone_index: 4,
            title: 'QA, Ciberseguridad & Despliegue',
            description: 'Auditoría de seguridad OWASP, pruebas de estrés, hardening final y entrega en producción.',
            target_week: w4,
        },
    ];
    for (const m of milestones) {
        await conn.query(`INSERT INTO client_project_milestones (
         project_id, milestone_index, title, description, target_week, status
       ) VALUES (?, ?, ?, ?, ?, 'PENDING')`, [projectId, m.milestone_index, m.title, m.description, m.target_week]);
    }
    return milestones;
}
function extractRows(result) {
    if (!Array.isArray(result))
        return [];
    if (Array.isArray(result[0]))
        return result[0];
    return result;
}
/**
 * Aprovisiona de forma atómica e idempotente un proyecto B2B para un lead (Condiciones C-044)
 */
async function provisionClientProjectForLead(conn, leadId, options) {
    // Idempotencia absoluta ante replays de webhook (C-044.2)
    const existingProjects = await conn.query('SELECT id, tenant_id, user_id FROM client_projects WHERE lead_id = ? LIMIT 1', [leadId]);
    // Obtener datos del lead
    const leadRowsRaw = await conn.query('SELECT * FROM leads WHERE id = ? LIMIT 1', [leadId]);
    const leadRows = extractRows(leadRowsRaw);
    const lead = leadRows.length > 0 ? leadRows[0] : null;
    const leadEmail = lead?.email || `lead_${leadId}@dreamtek.tech`;
    const leadName = lead?.name || lead?.company || 'Cliente B2B';
    const existingRows = extractRows(existingProjects);
    if (existingRows.length > 0) {
        const existing = existingRows[0];
        const existingUserId = Number(existing.user_id);
        const existingToken = jsonwebtoken_1.default.sign({
            userId: existingUserId,
            email: leadEmail,
            role: 'CLIENT',
            action: 'B2B_PORTAL_INVITE',
        }, (0, auth_js_1.getJwtSecret)(), { algorithm: 'HS512', expiresIn: '7d' });
        return {
            projectId: Number(existing.id),
            userId: existingUserId,
            tenantId: Number(existing.tenant_id),
            created: false,
            inviteToken: existingToken,
            inviteUrl: `/auth/activate?token=${existingToken}`,
        };
    }
    // Buscar o crear usuario (C-044.1: random bcrypt hash >= 12, cero dummy hash, cero plaintext)
    let userId;
    const userRowsRaw = await conn.query('SELECT id FROM users WHERE email = ? LIMIT 1', [leadEmail]);
    const userRows = extractRows(userRowsRaw);
    if (userRows.length > 0) {
        userId = Number(userRows[0].id);
    }
    else {
        const randomEntropy = crypto_1.default.randomBytes(24).toString('hex');
        const tempPassHash = await bcryptjs_1.default.hash(randomEntropy, 12);
        const insertUserRes = await conn.query('INSERT INTO users (email, password_hash, full_name, role) VALUES (?, ?, ?, "CLIENT")', [leadEmail, tempPassHash, leadName]);
        userId = Number(insertUserRes.insertId || insertUserRes[0]?.insertId);
    }
    // Buscar o crear tenant con FK formal (C-044.3)
    let tenantId;
    const tenantRowsRaw = await conn.query('SELECT id FROM tenants WHERE owner_user_id = ? LIMIT 1', [
        userId,
    ]);
    const tenantRows = extractRows(tenantRowsRaw);
    if (tenantRows.length > 0) {
        tenantId = Number(tenantRows[0].id);
    }
    else {
        const companyName = lead?.company || `${leadName} Corporate`;
        const insertTenantRes = await conn.query('INSERT INTO tenants (name, owner_user_id) VALUES (?, ?)', [companyName, userId]);
        tenantId = Number(insertTenantRes.insertId || insertTenantRes[0]?.insertId);
    }
    // Derivación financiera estricta (C-044.4)
    const paidCents = options?.paidAmountCents ?? 0;
    const leadBudgetCents = lead?.estimated_budget_min
        ? Math.round(Number(lead.estimated_budget_min) * 100)
        : 0;
    const budgetCents = leadBudgetCents > 0 ? leadBudgetCents : paidCents > 0 ? paidCents * 2 : 100000;
    const pendingBalanceCents = Math.max(0, budgetCents - paidCents);
    const currency = (lead?.currency || 'USD').toUpperCase();
    const estimatedWeeks = options?.estimatedWeeks ?? Math.max(1, Number(lead?.estimated_weeks_min) || 4);
    const projectName = options?.projectName ||
        (lead?.company ? `Proyecto ${lead.company}` : `Proyecto B2B #${leadId}`);
    const vertical = options?.vertical || lead?.project_vertical || 'custom_dev';
    // Inserción en client_projects
    const insertProjectRes = await conn.query(`INSERT INTO client_projects (
       tenant_id, user_id, lead_id, project_name, vertical,
       status, currency, budget_cents, paid_amount_cents, pending_balance_cents,
       estimated_weeks, briefing_data
     ) VALUES (?, ?, ?, ?, ?, 'ONBOARDING_BRIEF', ?, ?, ?, ?, ?, NULL)`, [
        tenantId,
        userId,
        leadId,
        projectName,
        vertical,
        currency,
        budgetCents,
        paidCents,
        pendingBalanceCents,
        estimatedWeeks,
    ]);
    const projectId = Number(insertProjectRes.insertId || insertProjectRes[0]?.insertId);
    // Sembrar hitos escalonados (C-044.6)
    await seedProjectMilestones(conn, projectId, estimatedWeeks);
    const inviteToken = jsonwebtoken_1.default.sign({
        userId,
        email: leadEmail,
        role: 'CLIENT',
        action: 'B2B_PORTAL_INVITE',
    }, (0, auth_js_1.getJwtSecret)(), { algorithm: 'HS512', expiresIn: '7d' });
    return {
        projectId,
        userId,
        tenantId,
        created: true,
        inviteToken,
        inviteUrl: `/auth/activate?token=${inviteToken}`,
    };
}
