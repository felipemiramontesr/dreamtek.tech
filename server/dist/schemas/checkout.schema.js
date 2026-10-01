"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkoutSessionSchema = void 0;
const zod_1 = require("zod");
exports.checkoutSessionSchema = zod_1.z.object({
    planId: zod_1.z.string().min(1, 'El identificador de plan es requerido.'),
    billingCycle: zod_1.z.enum(['monthly', 'annual']).default('monthly'),
    currency: zod_1.z.string().optional().default('mxn'),
});
