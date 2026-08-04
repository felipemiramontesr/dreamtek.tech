import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

/**
 * Generic Zod boundary validation middleware (ISO 25010 Functional Suitability & OWASP A04/A05)
 */
export function validate(
  schema: ZodSchema,
  target: 'body' | 'query' | 'params' = 'body'
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      const formattedErrors = result.error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
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
