import { FollowUpTemplateId } from '../schemas/crm.schema.js';

/**
 * Escapes characters with HTML entities to prevent XSS (C-041.5)
 */
export function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escapes LIKE wildcards (% and _) and backslashes to avoid wildcard injection (C-041.3)
 */
export function escapeLikeWildcards(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

export interface LeadEmailContext {
  fullName: string;
  email: string;
  company?: string | null;
  projectVertical?: string | null;
  estimatedBudgetMin?: number | null;
  estimatedBudgetMax?: number | null;
  estimatedWeeksMin?: number | null;
  estimatedWeeksMax?: number | null;
  currency?: 'MXN' | 'USD' | string | null;
  locale?: 'es' | 'en' | string | null;
}

export interface RenderedLeadEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Generates corporate email HTML and plaintext for manual follow-up templates (FC 041 & FC 042 bilingüe)
 */
export function renderLeadFollowUpEmail(
  context: LeadEmailContext,
  templateId: FollowUpTemplateId,
  customSubject?: string,
  customMessage?: string,
): RenderedLeadEmail {
  const currency = context.currency === 'USD' ? 'USD' : 'MXN';
  const isEn = context.locale === 'en';

  const defaultName = isEn ? 'Valued Client' : 'Estimado/a';
  const defaultCompany = isEn ? 'your organization' : 'su organización';
  const defaultVertical = isEn ? 'Technology & Cybersecurity' : 'Tecnología & Ciberseguridad';

  const safeName = escapeHtml(context.fullName || defaultName);
  const safeCompany = context.company ? escapeHtml(context.company) : defaultCompany;
  const safeVertical = context.projectVertical ? escapeHtml(context.projectVertical) : defaultVertical;
  const safeCustomMsg = customMessage ? escapeHtml(customMessage) : '';

  let defaultSubject = '';
  let bodyHtml = '';
  let bodyText = '';

  if (isEn) {
    // English templates (FC 042 / Anglo-Saxon market)
    switch (templateId) {
      case 'DIAGNOSTIC_INVITATION': {
        defaultSubject = `Technical Architecture Diagnostic Invitation — Dreamtek & ${context.company || context.fullName}`;
        bodyHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
            <div style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 32px 24px; text-align: center; border-radius: 12px 12px 0 0;">
              <h1 style="color: #38bdf8; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px;">DREAMTEK</h1>
              <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 14px;">Sovereign Software Engineering & Defensive Cybersecurity</p>
            </div>
            <div style="background: #ffffff; padding: 32px 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
              <p style="font-size: 16px; margin-top: 0;">Hello <strong>${safeName}</strong>,</p>
              <p>Thank you for your interest in Dreamtek's engineering capabilities for <strong>${safeCompany}</strong> in the <strong>${safeVertical}</strong> domain.</p>
              <p>We would like to invite you to an executive 30-minute technical architecture diagnostic session at no cost with our senior engineering team to review critical requirements, security scope, and technology roadmap.</p>
              ${safeCustomMsg ? `<div style="margin: 20px 0; padding: 16px; background: #f8fafc; border-left: 4px solid #38bdf8; font-style: italic; color: #334155;">${safeCustomMsg}</div>` : ''}
              <div style="margin: 32px 0; text-align: center;">
                <a href="https://dreamtek.tech/en#contact" style="background: #0284c7; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">Schedule Diagnostic Session</a>
              </div>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
              <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">Dreamtek Sovereign Tech · Personalized commercial follow-up from the executive team.</p>
            </div>
          </div>
        `;
        bodyText = `Hello ${context.fullName || defaultName},\n\nThank you for your interest in Dreamtek's engineering capabilities for ${context.company || defaultCompany}.\n\nWe would like to invite you to an executive 30-minute technical architecture diagnostic session at no cost with our architecture team to review requirements and roadmap.\n\n${customMessage ? `Additional notes:\n${customMessage}\n\n` : ''}To schedule, reply to this email or visit https://dreamtek.tech/en#contact.\n\nBest regards,\nDreamtek Team`;
        break;
      }
      case 'PROPOSAL_SUBMITTED': {
        defaultSubject = `Tailored Commercial & Technical Proposal — Dreamtek`;
        bodyHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
            <div style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 32px 24px; text-align: center; border-radius: 12px 12px 0 0;">
              <h1 style="color: #38bdf8; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px;">DREAMTEK</h1>
              <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 14px;">Technical Proposal & Scope Estimation</p>
            </div>
            <div style="background: #ffffff; padding: 32px 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
              <p style="font-size: 16px; margin-top: 0;">Hello <strong>${safeName}</strong>,</p>
              <p>We have prepared the preliminary technical and commercial proposal for <strong>${safeCompany}</strong> regarding the <strong>${safeVertical}</strong> initiative.</p>
              ${context.estimatedBudgetMin && context.estimatedBudgetMax ? `<p style="background: #f1f5f9; padding: 12px 16px; border-radius: 8px; font-size: 14px;"><strong>Projected Investment Range:</strong> $${context.estimatedBudgetMin.toLocaleString()} - $${context.estimatedBudgetMax.toLocaleString()} ${currency}</p>` : ''}
              ${context.estimatedWeeksMin && context.estimatedWeeksMax ? `<p style="background: #f1f5f9; padding: 12px 16px; border-radius: 8px; font-size: 14px;"><strong>Estimated Delivery Time:</strong> ${context.estimatedWeeksMin} to ${context.estimatedWeeksMax} weeks</p>` : ''}
              ${safeCustomMsg ? `<div style="margin: 20px 0; padding: 16px; background: #f8fafc; border-left: 4px solid #10b981; color: #334155;">${safeCustomMsg}</div>` : ''}
              <p>We remain at your service to review any adjustments to scope or address technical inquiries.</p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
              <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">Dreamtek Sovereign Tech · On-demand commercial follow-up.</p>
            </div>
          </div>
        `;
        bodyText = `Hello ${context.fullName || defaultName},\n\nWe have prepared the technical and commercial proposal for ${context.company || defaultCompany}.\n\n${customMessage ? `Details:\n${customMessage}\n\n` : ''}We remain at your service for any technical questions.\n\nBest regards,\nDreamtek Team`;
        break;
      }
      case 'CUSTOM_FOLLOWUP':
      default: {
        defaultSubject = `Follow-up regarding your project inquiry — Dreamtek`;
        bodyHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
            <div style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 32px 24px; text-align: center; border-radius: 12px 12px 0 0;">
              <h1 style="color: #38bdf8; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px;">DREAMTEK</h1>
              <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 14px;">Executive Communication</p>
            </div>
            <div style="background: #ffffff; padding: 32px 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
              <p style="font-size: 16px; margin-top: 0;">Hello <strong>${safeName}</strong>,</p>
              ${safeCustomMsg ? `<p style="white-space: pre-wrap;">${safeCustomMsg}</p>` : `<p>We are reaching out to follow up on your recent inquiry at Dreamtek for ${safeCompany}. Please let us know if you have any questions or if you'd like to schedule a brief call.</p>`}
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
              <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">Dreamtek Sovereign Tech · Personalized commercial follow-up.</p>
            </div>
          </div>
        `;
        bodyText = `Hello ${context.fullName || defaultName},\n\n${customMessage || `We are reaching out to follow up on your inquiry at Dreamtek for ${context.company || defaultCompany}.`}\n\nBest regards,\nDreamtek Team`;
        break;
      }
    }
  } else {
    // Spanish templates
    switch (templateId) {
      case 'DIAGNOSTIC_INVITATION': {
        defaultSubject = `Invitación a Diagnóstico Técnico de Arquitectura — Dreamtek & ${context.company || context.fullName}`;
        bodyHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
            <div style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 32px 24px; text-align: center; border-radius: 12px 12px 0 0;">
              <h1 style="color: #38bdf8; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px;">DREAMTEK</h1>
              <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 14px;">Ingeniería de Software Soberana & Ciberseguridad Defensiva</p>
            </div>
            <div style="background: #ffffff; padding: 32px 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
              <p style="font-size: 16px; margin-top: 0;">Hola <strong>${safeName}</strong>,</p>
              <p>Gracias por tu interés en las capacidades técnicas de Dreamtek para <strong>${safeCompany}</strong> en el sector de <strong>${safeVertical}</strong>.</p>
              <p>Nos gustaría invitarte a una sesión ejecutiva de diagnóstico técnico (30 minutos) sin costo con nuestro equipo de arquitectura para revisar tus requerimientos críticos, alcances de seguridad y hoja de ruta tecnológica.</p>
              ${safeCustomMsg ? `<div style="margin: 20px 0; padding: 16px; background: #f8fafc; border-left: 4px solid #38bdf8; font-style: italic; color: #334155;">${safeCustomMsg}</div>` : ''}
              <div style="margin: 32px 0; text-align: center;">
                <a href="https://dreamtek.tech/#contacto" style="background: #0284c7; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">Agendar Sesión de Diagnóstico</a>
              </div>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
              <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">Dreamtek Sovereign Tech · Seguimiento comercial personalizado emitido por el equipo directivo.</p>
            </div>
          </div>
        `;
        bodyText = `Hola ${context.fullName || defaultName},\n\nGracias por tu interés en las capacidades técnicas de Dreamtek para ${context.company || defaultCompany}.\n\nNos gustaría invitarte a una sesión ejecutiva de diagnóstico técnico (30 minutos) sin costo con nuestro equipo de arquitectura para revisar requerimientos y hoja de ruta.\n\n${customMessage ? `Mensaje adicional:\n${customMessage}\n\n` : ''}Para agendar, responde a este correo o visita https://dreamtek.tech/#contacto.\n\nAtentamente,\nEquipo Dreamtek`;
        break;
      }
      case 'PROPOSAL_SUBMITTED': {
        defaultSubject = `Propuesta Comercial y Técnica Personalizada — Dreamtek`;
        bodyHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
            <div style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 32px 24px; text-align: center; border-radius: 12px 12px 0 0;">
              <h1 style="color: #38bdf8; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px;">DREAMTEK</h1>
              <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 14px;">Propuesta Técnica & Estimación de Alcance</p>
            </div>
            <div style="background: #ffffff; padding: 32px 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
              <p style="font-size: 16px; margin-top: 0;">Hola <strong>${safeName}</strong>,</p>
              <p>Hemos preparado la propuesta técnica y comercial preliminar para <strong>${safeCompany}</strong> referente a la iniciativa de <strong>${safeVertical}</strong>.</p>
              ${context.estimatedBudgetMin && context.estimatedBudgetMax ? `<p style="background: #f1f5f9; padding: 12px 16px; border-radius: 8px; font-size: 14px;"><strong>Rango de Inversión Proyectado:</strong> $${context.estimatedBudgetMin.toLocaleString()} - $${context.estimatedBudgetMax.toLocaleString()} ${currency}</p>` : ''}
              ${context.estimatedWeeksMin && context.estimatedWeeksMax ? `<p style="background: #f1f5f9; padding: 12px 16px; border-radius: 8px; font-size: 14px;"><strong>Tiempo Estimado de Entrega:</strong> ${context.estimatedWeeksMin} a ${context.estimatedWeeksMax} semanas</p>` : ''}
              ${safeCustomMsg ? `<div style="margin: 20px 0; padding: 16px; background: #f8fafc; border-left: 4px solid #10b981; color: #334155;">${safeCustomMsg}</div>` : ''}
              <p>Quedamos a tu entera disposición para revisar cualquier ajuste a los términos o resolver dudas técnicas.</p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
              <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">Dreamtek Sovereign Tech · Seguimiento comercial manual bajo demanda.</p>
            </div>
          </div>
        `;
        bodyText = `Hola ${context.fullName || defaultName},\n\nHemos preparado la propuesta técnica y comercial para ${context.company || defaultCompany}.\n\n${customMessage ? `Detalles:\n${customMessage}\n\n` : ''}Quedamos a tu disposición para revisar cualquier duda técnica.\n\nAtentamente,\nEquipo Dreamtek`;
        break;
      }
      case 'CUSTOM_FOLLOWUP':
      default: {
        defaultSubject = `Seguimiento a tu solicitud de proyecto — Dreamtek`;
        bodyHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
            <div style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 32px 24px; text-align: center; border-radius: 12px 12px 0 0;">
              <h1 style="color: #38bdf8; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px;">DREAMTEK</h1>
              <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 14px;">Comunicación Ejecutiva</p>
            </div>
            <div style="background: #ffffff; padding: 32px 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
              <p style="font-size: 16px; margin-top: 0;">Hola <strong>${safeName}</strong>,</p>
              ${safeCustomMsg ? `<p style="white-space: pre-wrap;">${safeCustomMsg}</p>` : `<p>Te contactamos para dar seguimiento a tu reciente solicitud en Dreamtek para ${safeCompany}. Por favor dinos si tienes alguna duda adicional o si deseas coordinar una breve llamada.</p>`}
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
              <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">Dreamtek Sovereign Tech · Seguimiento comercial personalizado.</p>
            </div>
          </div>
        `;
        bodyText = `Hola ${context.fullName || defaultName},\n\n${customMessage || `Te contactamos para dar seguimiento a tu solicitud en Dreamtek para ${context.company || defaultCompany}.`}\n\nAtentamente,\nEquipo Dreamtek`;
        break;
      }
    }
  }

  return {
    subject: customSubject?.trim() || defaultSubject,
    html: bodyHtml,
    text: bodyText,
  };
}
