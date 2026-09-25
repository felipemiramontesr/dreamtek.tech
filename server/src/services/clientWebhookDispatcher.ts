/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'crypto';
import dns from 'dns';
import { query } from '../db.js';
import { decryptField } from '../utils/crypto.js';

export interface WebhookValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Valida una URL de webhook de cliente contra ataques SSRF y acceso a redes privadas (OWASP A05 / C-053.2).
 */
export async function validateClientWebhookUrl(urlStr: string): Promise<WebhookValidationResult> {
  try {
    const parsed = new URL(urlStr);

    // Protocol check: solo HTTPS en producción
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { valid: false, error: 'Protocolo no permitido. Se requiere HTTPS.' };
    }

    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'En entorno de producción se requiere protocolo HTTPS seguro.' };
    }

    const rawHostname = parsed.hostname.toLowerCase();
    const hostname = rawHostname.replace(/^\[|\]$/g, '');

    // Hostnames locales y loopback
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname === '::1' ||
      hostname === '0.0.0.0'
    ) {
      return { valid: false, error: 'Destino no permitido (dirección local o loopback).' };
    }

    // Servicios de metadatos de infraestructura cloud
    if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
      return { valid: false, error: 'Destino bloqueado (servicio de metadatos cloud).' };
    }

    // Rangos IPv4 privados (RFC 1918) y link-local
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipMatch = hostname.match(ipv4Regex);
    if (ipMatch) {
      const octet1 = parseInt(ipMatch[1], 10);
      const octet2 = parseInt(ipMatch[2], 10);

      if (octet1 === 10) {
        return { valid: false, error: 'Destino no permitido (red privada 10.0.0.0/8).' };
      }
      if (octet1 === 172 && octet2 >= 16 && octet2 <= 31) {
        return { valid: false, error: 'Destino no permitido (red privada 172.16.0.0/12).' };
      }
      if (octet1 === 192 && octet2 === 168) {
        return { valid: false, error: 'Destino no permitido (red privada 192.168.0.0/16).' };
      }
      if (octet1 === 169 && octet2 === 254) {
        return { valid: false, error: 'Destino no permitido (dirección link-local 169.254.0.0/16).' };
      }
      if (octet1 === 127) {
        return { valid: false, error: 'Destino no permitido (rango loopback).' };
      }
    }

    // Rangos IPv6 privados y link-local
    if (
      hostname.startsWith('fe80:') ||
      hostname.startsWith('fc00:') ||
      hostname.startsWith('fd00:') ||
      hostname.startsWith('::ffff:') ||
      hostname.includes('ffff:')
    ) {
      return { valid: false, error: 'Destino no permitido (rango IPv6 privado o mapeado).' };
    }

    // Mitigación anti-DNS rebinding (C-053.2): resolución DNS previa si no es IP directa
    if (!ipMatch) {
      try {
        const lookup = await dns.promises.lookup(hostname);
        const resolvedIp = lookup.address;

        const resolvedMatch = resolvedIp.match(ipv4Regex);
        if (resolvedMatch) {
          const r1 = parseInt(resolvedMatch[1], 10);
          const r2 = parseInt(resolvedMatch[2], 10);
          if (
            r1 === 10 ||
            (r1 === 172 && r2 >= 16 && r2 <= 31) ||
            (r1 === 192 && r2 === 168) ||
            (r1 === 169 && r2 === 254) ||
            r1 === 127 ||
            r1 === 0
          ) {
            return {
              valid: false,
              error: 'Destino no permitido (el dominio resuelve a una red privada o reservada).',
            };
          }
        } else if (
          resolvedIp === '::1' ||
          resolvedIp.startsWith('fe80:') ||
          resolvedIp.startsWith('fc00:') ||
          resolvedIp.startsWith('fd00:') ||
          resolvedIp.includes('ffff:')
        ) {
          return {
            valid: false,
            error: 'Destino no permitido (el dominio resuelve a una dirección IPv6 privada o local).',
          };
        }
      } catch (_dnsErr) {
        return { valid: false, error: 'No se pudo resolver el nombre de host de destino.' };
      }
    }

    return { valid: true };
  } catch (_err) {
    return { valid: false, error: 'Formato de URL inválido.' };
  }
}

/**
 * Despacha un evento de webhook asíncrono hacia todos los webhooks activos del tenant (C-053.4).
 * Fail-open: no interrumpe el flujo principal si una entrega remota falla.
 */
export async function dispatchClientWebhook(
  tenantId: number,
  eventType: string,
  payload: Record<string, any>,
): Promise<void> {
  // Ejecución asíncrona no bloqueante
  setImmediate(async () => {
    try {
      const subscriptions = await query<any[]>(
        'SELECT id, target_url, secret_encrypted, events FROM client_webhook_subscriptions WHERE tenant_id = ? AND is_active = 1',
        [tenantId],
      );

      for (const sub of subscriptions) {
        let subscribedEvents: string[] = [];
        try {
          subscribedEvents = typeof sub.events === 'string' ? JSON.parse(sub.events) : sub.events;
        } catch {
          subscribedEvents = [];
        }

        if (!subscribedEvents.includes(eventType) && !subscribedEvents.includes('*')) {
          continue;
        }

        await executeWebhookDelivery(sub.id, tenantId, sub.target_url, sub.secret_encrypted, eventType, payload);
      }
    } catch (_err) {
      // Fail-open: registrar error silenciosamente sin bloquear
    }
  });
}

/**
 * Ejecuta la entrega física con firma HMAC-SHA256 y reintentos exponenciales.
 */
async function executeWebhookDelivery(
  subscriptionId: number,
  tenantId: number,
  targetUrl: string,
  secretEncrypted: string,
  eventType: string,
  dataPayload: Record<string, any>,
): Promise<{ success: boolean; statusCode?: number; durationMs: number }> {
  const secret = decryptField(secretEncrypted);
  const timestamp = Math.floor(Date.now() / 1000);
  const payloadString = JSON.stringify({
    event: eventType,
    timestamp,
    data: dataPayload,
  });

  // Firma canónica HMAC-SHA256: t={t},v1={hash} (C-053.4)
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payloadString}`)
    .digest('hex');

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Dreamtek-Webhook-Dispatcher/1.0',
    'X-Dreamtek-Signature': `t=${timestamp},v1=${signature}`,
    'X-Dreamtek-Event': eventType,
  };

  const startTime = Date.now();
  let attempts = 0;
  let success = false;
  let statusCode: number | undefined;
  let responseBody = '';

  const maxAttempts = 3;

  for (let i = 1; i <= maxAttempts; i++) {
    attempts = i;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: payloadString,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      statusCode = response.status;
      responseBody = (await response.text()).slice(0, 1024);

      if (response.ok) {
        success = true;
        break;
      }
    } catch (err: any) {
      responseBody = err.message || 'Error de conexión o timeout';
    }

    // Si falló y quedan intentos, esperar con backoff
    if (i < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 50 * Math.pow(2, i)));
    }
  }

  const durationMs = Date.now() - startTime;

  // Registrar en client_webhook_deliveries
  try {
    await query(
      `INSERT INTO client_webhook_deliveries 
       (subscription_id, tenant_id, event_type, payload, status_code, status, attempts, response_body, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        subscriptionId,
        tenantId,
        eventType,
        payloadString,
        statusCode || null,
        success ? 'SUCCESS' : 'FAILED',
        attempts,
        responseBody,
        durationMs,
      ],
    );
  } catch (_dbErr) {
    // Fail-open
  }

  return { success, statusCode, durationMs };
}

/**
 * Despacha un evento de prueba 'ping' a una suscripción específica.
 */
export async function dispatchTestWebhook(
  subscriptionId: number,
  tenantId: number,
): Promise<{ success: boolean; statusCode?: number; durationMs: number }> {
  const subs = await query<any[]>(
    'SELECT target_url, secret_encrypted FROM client_webhook_subscriptions WHERE id = ? AND tenant_id = ? LIMIT 1',
    [subscriptionId, tenantId],
  );

  if (subs.length === 0) {
    throw new Error('Suscripción de webhook no encontrada para este tenant.');
  }

  const sub = subs[0];
  return executeWebhookDelivery(
    subscriptionId,
    tenantId,
    sub.target_url,
    sub.secret_encrypted,
    'ping',
    { message: 'Test ping connection from Dreamtek Client Portal', test: true },
  );
}
