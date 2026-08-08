"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onboardingRouter = void 0;
const express_1 = require("express");
const db_js_1 = require("../db.js");
const validate_js_1 = require("../middleware/validate.js");
const onboarding_schema_js_1 = require("../schemas/onboarding.schema.js");
const cache_js_1 = require("../utils/cache.js");
exports.onboardingRouter = (0, express_1.Router)();
/**
 * POST /api/v1/onboarding/lead
 */
exports.onboardingRouter.post('/lead', (0, validate_js_1.validate)(onboarding_schema_js_1.leadSchema), async (req, res) => {
    try {
        const { email, full_name, phone, company, step_reached } = req.body;
        if (!email || !full_name || !phone) {
            res.status(400).json({ status: 'error', message: 'Nombre, email y teléfono son requeridos.' });
            return;
        }
        const existing = await (0, db_js_1.query)('SELECT id FROM leads WHERE email = ? LIMIT 1', [email]);
        // Condition C-L2: Invalidate lead cache on write operation
        await (0, cache_js_1.invalidateCache)('lead');
        if (existing.length > 0) {
            await (0, db_js_1.query)('UPDATE leads SET full_name = ?, phone = ?, company = ?, step_reached = ? WHERE id = ?', [
                full_name,
                phone,
                company || '',
                step_reached || 1,
                existing[0].id,
            ]);
            res.json({ status: 'success', lead_id: existing[0].id, message: 'Prospecto actualizado.' });
        }
        else {
            const result = await (0, db_js_1.query)('INSERT INTO leads (full_name, email, phone, company, step_reached) VALUES (?, ?, ?, ?, ?)', [
                full_name,
                email,
                phone,
                company || '',
                step_reached || 1,
            ]);
            res.json({ status: 'success', lead_id: result.insertId, message: 'Prospecto registrado.' });
        }
    }
    catch (err) {
        res.status(500).json({ status: 'error', message: err.message || 'Error al procesar el prospecto.' });
    }
});
/**
 * POST /api/v1/onboarding/domain
 */
exports.onboardingRouter.post('/domain', (0, validate_js_1.validate)(onboarding_schema_js_1.domainCheckSchema), (req, res) => {
    const { domain } = req.body;
    if (!domain || typeof domain !== 'string') {
        res.status(400).json({ status: 'error', message: 'Nombre de dominio requerido.' });
        return;
    }
    const cleanDomain = domain.trim().toLowerCase();
    const isAvailable = !cleanDomain.includes('reservado') && !cleanDomain.includes('google');
    res.json({
        status: 'success',
        available: isAvailable,
        domain: cleanDomain,
    });
});
