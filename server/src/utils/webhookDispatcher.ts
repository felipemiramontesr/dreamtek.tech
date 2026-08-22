/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'crypto';
import { query } from '../db';
import type { WebhookEvent } from '../schemas/webhook.schema';

/**
 * Validate webhook URL against SSRF and private network access (OWASP A10).
 */
export function validateWebhookUrl(urlStr: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(urlStr);

    // Protocol check
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { valid: false, error: 'Protocolo no permitido. Se requiere HTTP o HTTPS.' };
    }

    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'En entorno de producción se requiere protocolo HTTPS seguro.' };
    }

    const rawHostname = parsed.hostname.toLowerCase();
    const hostname = rawHostname.replace(/^\[|\]$/g, '');

    // Loopback and local hostnames
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname === '::1' ||
      hostname === '0.0.0.0'
    ) {
      return { valid: false, error: 'Destino no permitido (dirección local/loopback).' };
    }

    // Cloud Metadata Services
    if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
      return { valid: false, error: 'Destino bloqueado (servicio de metadatos de infraestructura).' };
    }

    // IPv4 Private Ranges (RFC 1918 & Link-Local)
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipMatch = hostname.match(ipv4Regex);
    if (ipMatch) {
      const octet1 = parseInt(ipMatch[1], 10);
      const octet2 = parseInt(ipMatch[2], 10);

      // 10.0.0.0/8
      if (octet1 === 10) {
        return { valid: false, error: 'Destino no permitido (red privada 10.0.0.0/8).' };
      }
      // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
      if (octet1 === 172 && octet2 >= 16 && octet2 <= 31) {
        return { valid: false, error: 'Destino no permitido (red privada 172.16.0.0/12).' };
      }
      // 192.168.0.0/16
      if (octet1 === 192 && octet2 === 168) {
        return { valid: false, error: 'Destino no permitido (red privada 192.168.0.0/16).' };
      }
      // 169.254.0.0/16 (Link-Local)
      if (octet1 === 169 && octet2 === 254) {
        return { valid: false, error: 'Destino no permitido (dirección link-local 169.254.0.0/16).' };
      }
      // 127.0.0.0/8
      if (octet1 === 127) {
        return { valid: false, error: 'Destino no permitido (rango loopback).' };
      }
    }

    // IPv6 Private, Link-Local & IPv4-mapped (OWASP A10)
    if (
      hostname.startsWith('fe80:') ||
      hostname.startsWith('fc00:') ||
      hostname.startsWith('fd00:') ||
      hostname.startsWith('::ffff:') ||
      hostname.includes('ffff:')
    ) {
      return { valid: false, error: 'Destino no permitido (rango IPv6 privado, link-local o mapeado).' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Formato de URL inválido.' };
  }
}

/**
 * Generate cryptographic HMAC-SHA256 signature with timestamp anti-replay header (OWASP A02).
 */
export function generateWebhookSignature(
  secret: string,
  payloadStr: string,
  timestamp: number = Math.floor(Date.now() / 1000),
): { timestamp: number; signature: string; header: string } {
  const signedPayload = `${timestamp}.${payloadStr}`;
  const signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  const header = `t=${timestamp},v1=${signature}`;
  return { timestamp, signature, header };
}

/**
 * Generate a cryptographically secure 32-byte hex secret for new webhooks.
 */
export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Dispatch an outbound webhook event asynchronously (fire-and-forget).
 */
export async function dispatchWebhookEvent(
  tenantId: number,
  eventType: WebhookEvent,
  eventData: Record<string, any>,
  autoDispatch: boolean = process.env.NODE_ENV !== 'test',
): Promise<number[]> {
  try {
    // 1. Find active webhook endpoints for this tenant
    const endpoints = await query<any[]>(
      `SELECT id, url, secret, events 
       FROM webhook_endpoints 
       WHERE tenant_id = ? AND is_active = 1`,
      [tenantId],
    );

    if (!endpoints || endpoints.length === 0) {
      return [];
    }

    // 2. Filter matching endpoints
    const matchingEndpoints = endpoints.filter((ep) => {
      let eventsArray: string[] = [];
      try {
        eventsArray = Array.isArray(ep.events) ? ep.events : JSON.parse(ep.events);
      } catch {
        eventsArray = [];
      }
      return eventsArray.includes(eventType) || eventsArray.includes('*');
    });

    if (matchingEndpoints.length === 0) {
      return [];
    }

    const payloadObj = {
      id: `evt_${crypto.randomUUID()}`,
      event: eventType,
      tenant_id: tenantId,
      timestamp: Math.floor(Date.now() / 1000),
      data: eventData,
    };
    const payloadStr = JSON.stringify(payloadObj);

    const createdDeliveryIds: number[] = [];

    for (const ep of matchingEndpoints) {
      const res = await query<any>(
        `INSERT INTO webhook_deliveries (tenant_id, webhook_endpoint_id, event_type, payload, status, attempts, max_attempts)
         VALUES (?, ?, ?, ?, 'PENDING', 0, 3)`,
        [tenantId, ep.id, eventType, payloadStr],
      );
      const deliveryId = res.insertId;
      createdDeliveryIds.push(deliveryId);

      if (autoDispatch) {
        setImmediate(() => {
          void deliverWebhook(deliveryId);
        });
      }
    }

    return createdDeliveryIds;
  } catch (err) {
    console.error('Error dispatching webhook event:', err);
    return [];
  }
}

/**
 * Deliver a specific webhook execution attempt with timeout and HMAC signature.
 */
export async function deliverWebhook(
  deliveryId: number,
  timeoutMs: number = 5000,
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  try {
    const rows = await query<any[]>(
      `SELECT d.id, d.tenant_id, d.webhook_endpoint_id, d.event_type, d.payload, d.attempts, d.max_attempts,
              e.url, e.secret, e.is_active
       FROM webhook_deliveries d
       JOIN webhook_endpoints e ON e.id = d.webhook_endpoint_id
       WHERE d.id = ?`,
      [deliveryId],
    );

    if (!rows || rows.length === 0) {
      return { success: false, error: 'Delivery record not found' };
    }

    const delivery = rows[0];

    if (!delivery.is_active) {
      await query(
        `UPDATE webhook_deliveries 
         SET status = 'FAILED', error_message = 'Webhook endpoint is inactive', updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [deliveryId],
      );
      return { success: false, error: 'Webhook endpoint is inactive' };
    }

    // SSRF re-check
    const urlValidation = validateWebhookUrl(delivery.url);
    if (!urlValidation.valid) {
      await query(
        `UPDATE webhook_deliveries 
         SET status = 'FAILED', error_message = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [urlValidation.error, deliveryId],
      );
      return { success: false, error: urlValidation.error };
    }

    const currentAttempts = delivery.attempts + 1;
    const payloadStr =
      typeof delivery.payload === 'string' ? delivery.payload : JSON.stringify(delivery.payload);

    const { header } = generateWebhookSignature(delivery.secret, payloadStr);

    let statusCode = 0;
    let responseBody = '';
    let isSuccess = false;
    let errorMessage = 'Delivery failed';

    try {
      const response = await fetch(delivery.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Dreamtek-Webhooks/1.0',
          'X-Dreamtek-Signature': header,
          'X-Dreamtek-Event': delivery.event_type,
          'X-Dreamtek-Delivery': String(delivery.id),
        },
        body: payloadStr,
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error',
      });

      statusCode = response.status;
      const rawText = await response.text();
      responseBody = rawText.slice(0, 1024);

      if (response.ok) {
        isSuccess = true;
      } else {
        errorMessage = `HTTP error status ${response.status}`;
      }
    } catch (err: any) {
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    if (isSuccess) {
      await query(
        `UPDATE webhook_deliveries 
         SET status = 'SUCCESS', status_code = ?, response_body = ?, error_message = NULL,
             attempts = ?, delivered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [statusCode, responseBody, currentAttempts, deliveryId],
      );
      return { success: true, statusCode };
    }

    const finalStatus = currentAttempts >= delivery.max_attempts ? 'EXHAUSTED' : 'FAILED';

    await query(
      `UPDATE webhook_deliveries 
       SET status = ?, status_code = ?, response_body = ?, error_message = ?,
           attempts = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [finalStatus, statusCode || null, responseBody || null, errorMessage, currentAttempts, deliveryId],
    );

    return {
      success: false,
      statusCode: statusCode > 0 ? statusCode : undefined,
      error: errorMessage,
    };
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    try {
      await query(
        `UPDATE webhook_deliveries 
         SET status = 'FAILED', error_message = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [msg, deliveryId],
      );
    } catch {
      // ignore
    }
    return { success: false, error: msg };
  }
}
