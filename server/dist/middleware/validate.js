"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = validate;
/**
 * Generic Zod boundary validation middleware (ISO 25010 Functional Suitability & OWASP A04/A05)
 */
function validate(schema, target = 'body') {
    return (req, res, next) => {
        const result = schema.safeParse(req[target]);
        if (!result.success) {
            const formattedErrors = result.error.issues.map((issue) => ({
                field: issue.path.join('.'),
                message: issue.message,
            }));
            res.status(400).json({
                status: 400,
                error: 'Validation Error',
                message: 'Los datos enviados en la solicitud no cumplen con el formato requerido.',
                details: formattedErrors,
            });
            return;
        }
        // Replace req[target] with sanitized parsed data
        req[target] = result.data;
        next();
    };
}
