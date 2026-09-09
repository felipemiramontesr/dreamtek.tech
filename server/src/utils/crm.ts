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
  checkoutUrl?: string | null;
  depositAmount?: number | null;
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
      case 'PAYMENT_LINK_INVITATION': {
        const payUrl = context.checkoutUrl || 'https://dreamtek.tech/en#contact';
        const formattedAmount = context.depositAmount
          ? `$${context.depositAmount.toLocaleString()} ${currency}`
          : 'Project Deposit';

        defaultSubject = `Project Deposit & Architecture Activation — Dreamtek & ${context.company || context.fullName}`;
        bodyHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
            <div style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 32px 24px; text-align: center; border-radius: 12px 12px 0 0;">
              <h1 style="color: #38bdf8; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px;">DREAMTEK</h1>
              <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 14px;">Sovereign Software Engineering & Defensive Cybersecurity</p>
            </div>
            <div style="background: #ffffff; padding: 32px 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
              <p style="font-size: 16px; margin-top: 0;">Hello <strong>${safeName}</strong>,</p>
              <p>Following our technical evaluation for <strong>${safeCompany}</strong>, we have generated your secure project formalization and deposit link.</p>
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <p style="margin: 0; font-size: 14px; color: #64748b;">Deposit Amount / Commitment:</p>
                <p style="margin: 4px 0 0 0; font-size: 20px; font-weight: 800; color: #0284c7;">${formattedAmount}</p>
                <p style="margin: 8px 0 0 0; font-size: 11px; color: #94a3b8; font-style: italic;">* Initial deposit to formalize architecture and sprint scheduling. Remaining balance governed by milestone agreements.</p>
              </div>
              ${safeCustomMsg ? `<div style="margin: 20px 0; padding: 16px; background: #f8fafc; border-left: 4px solid #38bdf8; font-style: italic; color: #334155;">${safeCustomMsg}</div>` : ''}
              <div style="margin: 32px 0; text-align: center;">
                <a href="${payUrl}" style="background: #0284c7; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">Complete Deposit via Stripe Checkout ↗</a>
              </div>
              <p style="font-size: 12px; color: #64748b;">This secure payment link is valid for 72 hours. All transactions are encrypted and processed by Stripe.</p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
              <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">Dreamtek Sovereign Tech · Commercial closing & deposit confirmation.</p>
            </div>
          </div>
        `;
        bodyText = `Hello ${context.fullName || defaultName},\n\nWe have generated your secure project deposit link for ${context.company || defaultCompany}.\n\nDeposit Amount: ${formattedAmount}\nPayment URL: ${payUrl}\n\n${customMessage ? `Notes:\n${customMessage}\n\n` : ''}This link expires in 72 hours.\n\nBest regards,\nDreamtek Team`;
        break;
      }
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
      case 'PAYMENT_LINK_INVITATION': {
        const payUrl = context.checkoutUrl || 'https://dreamtek.tech/#contacto';
        const formattedAmount = context.depositAmount
          ? `$${context.depositAmount.toLocaleString()} ${currency}`
          : 'Anticipo de Proyecto';

        defaultSubject = `Enlace de Anticipo y Formalización de Proyecto — Dreamtek & ${context.company || context.fullName}`;
        bodyHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
            <div style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 32px 24px; text-align: center; border-radius: 12px 12px 0 0;">
              <h1 style="color: #38bdf8; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px;">DREAMTEK</h1>
              <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 14px;">Ingeniería de Software Soberana & Ciberseguridad Defensiva</p>
            </div>
            <div style="background: #ffffff; padding: 32px 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
              <p style="font-size: 16px; margin-top: 0;">Hola <strong>${safeName}</strong>,</p>
              <p>Tras nuestra evaluación técnica para <strong>${safeCompany}</strong>, hemos generado tu enlace seguro de formalización y anticipo de proyecto.</p>
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <p style="margin: 0; font-size: 14px; color: #64748b;">Monto de Anticipo / Compromiso:</p>
                <p style="margin: 4px 0 0 0; font-size: 20px; font-weight: 800; color: #0284c7;">${formattedAmount}</p>
                <p style="margin: 8px 0 0 0; font-size: 11px; color: #94a3b8; font-style: italic;">* Anticipo inicial para formalizar arquitectura y reserva de sprints. El saldo restante se liquida según los hitos pactados.</p>
              </div>
              ${safeCustomMsg ? `<div style="margin: 20px 0; padding: 16px; background: #f8fafc; border-left: 4px solid #38bdf8; font-style: italic; color: #334155;">${safeCustomMsg}</div>` : ''}
              <div style="margin: 32px 0; text-align: center;">
                <a href="${payUrl}" style="background: #0284c7; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">Completar Anticipo vía Stripe Checkout ↗</a>
              </div>
              <p style="font-size: 12px; color: #64748b;">Este enlace seguro de pago tiene una vigencia de 72 horas. Todas las transacciones están encriptadas y procesadas por Stripe.</p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
              <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">Dreamtek Sovereign Tech · Cierre comercial y formalización de anticipo.</p>
            </div>
          </div>
        `;
        bodyText = `Hola ${context.fullName || defaultName},\n\nHemos generado tu enlace seguro de anticipo de proyecto para ${context.company || defaultCompany}.\n\nMonto de Anticipo: ${formattedAmount}\nEnlace de Pago: ${payUrl}\n\n${customMessage ? `Notas:\n${customMessage}\n\n` : ''}Este enlace expira en 72 horas.\n\nAtentamente,\nEquipo Dreamtek`;
        break;
      }
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

export interface MilestoneReviewEmailContext {
  fullName: string;
  email: string;
  projectName: string;
  milestoneTitle: string;
  milestoneIndex: number;
  stagingUrl?: string | null;
  dashboardUrl: string;
  locale?: 'es' | 'en' | string | null;
}

export function renderMilestoneReviewEmail(context: MilestoneReviewEmailContext): RenderedLeadEmail {
  const isEn = context.locale === 'en';
  const safeName = escapeHtml(context.fullName || (isEn ? 'Valued Client' : 'Estimado/a Cliente'));
  const safeProject = escapeHtml(context.projectName);
  const safeMilestone = escapeHtml(context.milestoneTitle);
  const safeStaging = context.stagingUrl ? escapeHtml(context.stagingUrl) : null;
  const safeDashboard = escapeHtml(context.dashboardUrl);

  const subject = isEn
    ? `Deliverable Ready for Review: ${safeMilestone} — ${safeProject}`
    : `Entregable listo para revisión: ${safeMilestone} — ${safeProject}`;

  const bodyHtml = isEn
    ? `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 32px 24px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: #38bdf8; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px;">DREAMTEK</h1>
          <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 14px;">B2B Project Workspace</p>
        </div>
        <div style="background: #ffffff; padding: 32px 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
          <p style="font-size: 16px; margin-top: 0;">Hello <strong>${safeName}</strong>,</p>
          <p>We are pleased to inform you that milestone <strong>#${context.milestoneIndex}: ${safeMilestone}</strong> for project <strong>${safeProject}</strong> is ready for your review.</p>
          ${safeStaging ? `<div style="margin: 20px 0; padding: 16px; background: #f0fdf4; border-left: 4px solid #22c55e; border-radius: 4px;"><p style="margin: 0; font-size: 14px; color: #15803d;"><strong>Staging Environment URL:</strong> <a href="${safeStaging}" style="color: #0284c7; word-break: break-all;" target="_blank">${safeStaging}</a></p></div>` : ''}
          <p>Please log in to your Client Portal to review the progress and provide your formal sign-off:</p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${safeDashboard}" style="background: #0284c7; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; display: inline-block;">Access Project Portal</a>
          </div>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">Dreamtek Sovereign Tech · Automated Project Notification</p>
        </div>
      </div>
    `
    : `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 32px 24px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: #38bdf8; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px;">DREAMTEK</h1>
          <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 14px;">Portal de Proyectos B2B</p>
        </div>
        <div style="background: #ffffff; padding: 32px 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
          <p style="font-size: 16px; margin-top: 0;">Hola <strong>${safeName}</strong>,</p>
          <p>Te informamos que el hito <strong>#${context.milestoneIndex}: ${safeMilestone}</strong> para el proyecto <strong>${safeProject}</strong> está listo para tu revisión.</p>
          ${safeStaging ? `<div style="margin: 20px 0; padding: 16px; background: #f0fdf4; border-left: 4px solid #22c55e; border-radius: 4px;"><p style="margin: 0; font-size: 14px; color: #15803d;"><strong>Ambiente de Staging:</strong> <a href="${safeStaging}" style="color: #0284c7; word-break: break-all;" target="_blank">${safeStaging}</a></p></div>` : ''}
          <p>Por favor ingresa a tu Portal de Cliente para revisar el avance y otorgar tu visto bueno formal:</p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${safeDashboard}" style="background: #0284c7; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; display: inline-block;">Ingresar al Portal</a>
          </div>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">Dreamtek Sovereign Tech · Notificación de Proyecto Automatizada</p>
        </div>
      </div>
    `;

  const bodyText = isEn
    ? `Hello ${context.fullName || 'Valued Client'},\n\nMilestone #${context.milestoneIndex}: ${context.milestoneTitle} for project "${context.projectName}" is ready for your review.\n\n${context.stagingUrl ? `Staging URL: ${context.stagingUrl}\n\n` : ''}Access your project portal: ${context.dashboardUrl}\n\nBest regards,\nDreamtek Team`
    : `Hola ${context.fullName || 'Estimado/a Cliente'},\n\nEl hito #${context.milestoneIndex}: ${context.milestoneTitle} del proyecto "${context.projectName}" está listo para tu revisión.\n\n${context.stagingUrl ? `URL de Staging: ${context.stagingUrl}\n\n` : ''}Accede a tu portal: ${context.dashboardUrl}\n\nAtentamente,\nEquipo Dreamtek`;

  return { subject, html: bodyHtml, text: bodyText };
}

export interface FinalSettlementReceiptEmailContext {
  fullName: string;
  email: string;
  projectName: string;
  amountCents: number;
  currency: string;
  dashboardUrl: string;
  locale?: 'es' | 'en' | string | null;
}

export function renderFinalSettlementReceiptEmail(context: FinalSettlementReceiptEmailContext): RenderedLeadEmail {
  const isEn = context.locale === 'en';
  const currency = context.currency.toUpperCase();
  const formattedAmount = (context.amountCents / 100).toLocaleString(isEn ? 'en-US' : 'es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const safeName = escapeHtml(context.fullName || (isEn ? 'Valued Client' : 'Estimado/a Cliente'));
  const safeProject = escapeHtml(context.projectName);
  const safeDashboard = escapeHtml(context.dashboardUrl);

  const subject = isEn
    ? `Final Settlement Confirmation & Delivery: ${safeProject} — Dreamtek`
    : `Constancia de Finiquito y Entrega Final: ${safeProject} — Dreamtek`;

  const bodyHtml = isEn
    ? `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 32px 24px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: #38bdf8; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px;">DREAMTEK</h1>
          <p style="color: #22c55e; margin: 8px 0 0 0; font-size: 15px; font-weight: 700;">PROYECTO ENTREGADO & FINIQUITADO</p>
        </div>
        <div style="background: #ffffff; padding: 32px 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
          <p style="font-size: 16px; margin-top: 0;">Hello <strong>${safeName}</strong>,</p>
          <p>We confirm receipt of the final settlement payment for project <strong>${safeProject}</strong>.</p>
          <div style="margin: 24px 0; padding: 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; text-align: center;">
            <p style="margin: 0; font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Final Settlement Amount Paid</p>
            <p style="margin: 8px 0 0 0; font-size: 28px; font-weight: 800; color: #0f172a;">$${formattedAmount} ${currency}</p>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: #16a34a; font-weight: 600;">Status: 100% Fully Settled</p>
          </div>
          <p>All project deliverables, repository assets, and deployment environments have been released and marked as Delivered in your workspace.</p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${safeDashboard}" style="background: #0284c7; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; display: inline-block;">View Workspace Deliverables</a>
          </div>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">Dreamtek Sovereign Tech · Official Settlement Receipt</p>
        </div>
      </div>
    `
    : `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 32px 24px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: #38bdf8; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px;">DREAMTEK</h1>
          <p style="color: #22c55e; margin: 8px 0 0 0; font-size: 15px; font-weight: 700;">PROYECTO ENTREGADO & FINIQUITADO</p>
        </div>
        <div style="background: #ffffff; padding: 32px 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
          <p style="font-size: 16px; margin-top: 0;">Hola <strong>${safeName}</strong>,</p>
          <p>Confirmamos la recepción del pago de finiquito para el proyecto <strong>${safeProject}</strong>.</p>
          <div style="margin: 24px 0; padding: 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; text-align: center;">
            <p style="margin: 0; font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Monto de Finiquito Liquidado</p>
            <p style="margin: 8px 0 0 0; font-size: 28px; font-weight: 800; color: #0f172a;">$${formattedAmount} ${currency}</p>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: #16a34a; font-weight: 600;">Estado: 100% Finiquitado</p>
          </div>
          <p>Todos los entregables, repositorio de código y accesos de despliegue han sido formalmente liberados y marcados como Entregados en tu workspace.</p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${safeDashboard}" style="background: #0284c7; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; display: inline-block;">Ver Entregables en Portal</a>
          </div>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">Dreamtek Sovereign Tech · Constancia Oficial de Finiquito</p>
        </div>
      </div>
    `;

  const bodyText = isEn
    ? `Hello ${context.fullName || 'Valued Client'},\n\nWe confirm receipt of the final settlement for "${context.projectName}": $${formattedAmount} ${currency}.\n\nYour project is now 100% settled and delivered. Access your workspace: ${context.dashboardUrl}\n\nBest regards,\nDreamtek Team`
    : `Hola ${context.fullName || 'Estimado/a Cliente'},\n\nConfirmamos la recepción del pago de finiquito para "${context.projectName}": $${formattedAmount} ${currency}.\n\nTu proyecto está 100% finiquitado y entregado. Accede a tu workspace: ${context.dashboardUrl}\n\nAtentamente,\nEquipo Dreamtek`;

  return { subject, html: bodyHtml, text: bodyText };
}
