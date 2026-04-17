/* ═══════════════════════════════════════════════════════════════
   Email Service — Remarketing + Personalized Routines
   ═══════════════════════════════════════════════════════════════ */

const nodemailer = require('nodemailer');

function createTransport(config) {
  const host = config.smtpHost || process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = config.smtpPort || process.env.SMTP_PORT || 587;
  const user = config.smtpUser || process.env.SMTP_USER;
  const pass = config.smtpPass || process.env.SMTP_PASS;
  if (!user || !pass) return null;
  return nodemailer.createTransport({ host, port: parseInt(port), secure: port == 465, auth: { user, pass } });
}

const TEMPLATES = {
  discount: {
    name: 'Descuento Especial',
    subject: 'Tenemos un descuento exclusivo para ti',
    build: (data) => `
      <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;">
        <div style="background:${data.primaryColor || '#d32f2f'};padding:32px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;">${data.storeName || 'Tu Tienda'}</h1>
        </div>
        <div style="padding:32px;">
          <p style="font-size:16px;color:#333;">Hola${data.name ? ' ' + data.name : ''},</p>
          <p style="font-size:15px;color:#555;line-height:1.6;">Tenemos un descuento exclusivo para ti.${data.message ? ' ' + data.message : ''}</p>
          ${data.code ? `<div style="text-align:center;margin:28px 0;"><div style="display:inline-block;background:#f5f5f5;border:2px dashed ${data.primaryColor || '#d32f2f'};padding:12px 32px;font-size:22px;font-weight:700;letter-spacing:2px;color:${data.primaryColor || '#d32f2f'};border-radius:8px;">${data.code}</div></div>` : ''}
          <div style="text-align:center;margin-top:24px;">
            <a href="https://${data.shop || '#'}" style="background:${data.primaryColor || '#d32f2f'};color:#fff;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:600;">Ver productos</a>
          </div>
        </div>
        <div style="padding:16px 32px;border-top:1px solid #eee;font-size:12px;color:#999;text-align:center;">${data.storeName || 'Tu Tienda'}</div>
      </div>`
  },
  reminder: {
    name: 'Recordatorio de Objetivo',
    subject: 'No olvides tu objetivo',
    build: (data) => `
      <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;">
        <div style="background:${data.primaryColor || '#d32f2f'};padding:32px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;">${data.storeName || 'Tu Tienda'}</h1>
        </div>
        <div style="padding:32px;">
          <p style="font-size:16px;color:#333;">Hola${data.name ? ' ' + data.name : ''},</p>
          <p style="font-size:15px;color:#555;line-height:1.6;">Recordamos que tu objetivo es <strong>${data.goal || 'alcanzar tus metas'}</strong>. Estamos aqui para ayudarte.</p>
          ${data.message ? `<p style="font-size:15px;color:#555;line-height:1.6;">${data.message}</p>` : ''}
          <div style="text-align:center;margin-top:24px;">
            <a href="https://${data.shop || '#'}" style="background:${data.primaryColor || '#d32f2f'};color:#fff;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:600;">Explorar opciones</a>
          </div>
        </div>
        <div style="padding:16px 32px;border-top:1px solid #eee;font-size:12px;color:#999;text-align:center;">${data.storeName || 'Tu Tienda'}</div>
      </div>`
  },
  newproduct: {
    name: 'Nuevo Producto',
    subject: 'Nuevo producto que te puede interesar',
    build: (data) => `
      <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;">
        <div style="background:${data.primaryColor || '#d32f2f'};padding:32px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;">${data.storeName || 'Tu Tienda'}</h1>
        </div>
        <div style="padding:32px;">
          <p style="font-size:16px;color:#333;">Hola${data.name ? ' ' + data.name : ''},</p>
          <p style="font-size:15px;color:#555;line-height:1.6;">Tenemos novedades que creemos te van a interesar.${data.message ? ' ' + data.message : ''}</p>
          <div style="text-align:center;margin-top:24px;">
            <a href="https://${data.shop || '#'}" style="background:${data.primaryColor || '#d32f2f'};color:#fff;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:600;">Descubrir ahora</a>
          </div>
        </div>
        <div style="padding:16px 32px;border-top:1px solid #eee;font-size:12px;color:#999;text-align:center;">${data.storeName || 'Tu Tienda'}</div>
      </div>`
  }
};

async function sendRemarketing(config, to, templateId, customData = {}) {
  const transport = createTransport(config);
  if (!transport) throw new Error('SMTP no configurado');
  const from = `${config.fromName || 'Asesor Digital'} <${config.fromEmail || config.smtpUser || process.env.SMTP_USER}>`;
  // Custom template passed via customData.customTemplate wins over builtin
  const custom = customData.customTemplate;
  if (custom && custom.html) {
    const ctx = { name: customData.name || '', email: to, code: customData.code || '', message: customData.message || '', goal: customData.goal || '', storeName: customData.storeName || '' };
    const rendered = String(custom.html).replace(/\{\{(\w+)\}\}/g, (_, k) => ctx[k] != null ? ctx[k] : '');
    const subj = (custom.subject || '').replace(/\{\{(\w+)\}\}/g, (_, k) => ctx[k] != null ? ctx[k] : '');
    await transport.sendMail({ from, to, subject: customData.subject || subj || 'Mensaje', html: rendered });
    return;
  }
  const tmpl = TEMPLATES[templateId];
  if (!tmpl) throw new Error('Template no encontrado: ' + templateId);
  const html = tmpl.build({ ...customData, shop: process.env.SHOPIFY_SHOP });
  await transport.sendMail({ from, to, subject: customData.subject || tmpl.subject, html });
}

async function sendCustomEmail(config, to, subject, html) {
  const transport = createTransport(config);
  if (!transport) throw new Error('SMTP no configurado');
  const from = `${config.fromName || 'Asesor Digital'} <${config.fromEmail || config.smtpUser || process.env.SMTP_USER}>`;
  await transport.sendMail({ from, to, subject, html });
}

function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function buildRoutineHtml({ name, goalLabel, routine, products = [], brand = {}, shop = '', discountCode = '', cartUrl = '' }) {
  const primary = brand.primaryColor || '#D4502A';
  const dark = brand.secondaryColor || '#1E1E1E';
  const storeName = brand.storeName || 'Asesor Digital';
  const firstName = (name || '').trim().split(/\s+/)[0] || '';
  const safeShop = shop ? (shop.startsWith('http') ? shop : 'https://' + shop) : '#';

  // Grid de ejercicios por día
  const daysHtml = (routine?.week || []).map(day => {
    const blocks = (day.blocks || []).map(b => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f1f1;font-size:13px;color:#1f2937;font-weight:500;">${esc(b.name)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f1f1;font-size:12px;color:#6b7280;text-align:center;white-space:nowrap;">${esc(b.sets)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f1f1;font-size:12px;color:#6b7280;text-align:center;white-space:nowrap;">${esc(b.reps)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f1f1;font-size:12px;color:#6b7280;text-align:center;white-space:nowrap;">${esc(b.rir)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f1f1;font-size:12px;color:#6b7280;text-align:center;white-space:nowrap;">${esc(b.rest)}</td>
      </tr>`).join('');
    if (!blocks) {
      return `<div style="margin:18px 0;"><div style="font-weight:600;font-size:14px;color:${dark};padding:10px 14px;background:#f9fafb;border-left:3px solid ${primary};border-radius:4px;">${esc(day.day)}</div></div>`;
    }
    return `
      <div style="margin:18px 0;">
        <div style="font-weight:600;font-size:14px;color:${dark};padding:10px 14px;background:#f9fafb;border-left:3px solid ${primary};border-radius:4px;margin-bottom:6px;">${esc(day.day)}</div>
        <table role="presentation" style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
          <thead><tr style="background:#f3f4f6;">
            <th style="text-align:left;padding:8px 12px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.3px;">Ejercicio</th>
            <th style="text-align:center;padding:8px 12px;font-size:11px;color:#6b7280;font-weight:600;">Sets</th>
            <th style="text-align:center;padding:8px 12px;font-size:11px;color:#6b7280;font-weight:600;">Reps</th>
            <th style="text-align:center;padding:8px 12px;font-size:11px;color:#6b7280;font-weight:600;">RIR</th>
            <th style="text-align:center;padding:8px 12px;font-size:11px;color:#6b7280;font-weight:600;">Descanso</th>
          </tr></thead>
          <tbody>${blocks}</tbody>
        </table>
      </div>`;
  }).join('');

  // Grid de productos recomendados
  const prodHtml = products.length ? `
    <h2 style="color:${dark};font-size:17px;margin:32px 0 12px;font-weight:600;">Productos recomendados para tu plan</h2>
    <table role="presentation" style="width:100%;border-collapse:separate;border-spacing:8px;">
      <tr>
        ${products.slice(0, 4).map(p => `
          <td style="width:25%;vertical-align:top;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center;">
            ${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" style="width:100%;height:110px;object-fit:contain;border-radius:6px;background:#f9fafb;" />` : ''}
            <div style="font-size:12px;font-weight:600;color:${dark};margin:10px 0 4px;line-height:1.3;">${esc(p.name)}</div>
            ${p.price ? `<div style="font-size:13px;font-weight:700;color:${primary};margin-bottom:8px;">S/ ${esc(p.price)}</div>` : ''}
            ${p.url ? `<a href="${esc(p.url)}" style="font-size:11px;color:#fff;background:${primary};padding:6px 12px;border-radius:4px;text-decoration:none;display:inline-block;font-weight:600;">Ver producto</a>` : ''}
          </td>`).join('')}
      </tr>
    </table>` : '';

  const principlesHtml = `
    <div style="background:#fef9f6;border:1px solid #f3d6c5;border-radius:8px;padding:16px 18px;margin:18px 0;">
      <div style="font-size:13px;font-weight:600;color:${dark};margin-bottom:8px;">Principios clave</div>
      <ul style="margin:0;padding-left:18px;font-size:12.5px;color:#4b5563;line-height:1.7;">
        <li><strong>Progresión:</strong> +2.5kg cada 2 semanas en compuestos (sobrecarga progresiva).</li>
        <li><strong>Descanso:</strong> dormir 7-9h es NO negociable para recuperación.</li>
        <li><strong>Adherencia:</strong> 3 días consistentes supera a 6 días inconsistentes.</li>
        <li><strong>Deload:</strong> cada 4-6 semanas bajar volumen 40-50% una semana.</li>
      </ul>
    </div>`;

  const ctaHtml = cartUrl ? `
    <div style="text-align:center;margin:28px 0 12px;">
      <a href="${esc(cartUrl)}" style="background:${primary};color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:600;display:inline-block;font-size:14px;">Activar mi plan — ir al carrito</a>
    </div>` : `
    <div style="text-align:center;margin:28px 0 12px;">
      <a href="${safeShop}" style="background:${primary};color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:600;display:inline-block;font-size:14px;">Ver tienda</a>
    </div>`;

  const discountHtml = discountCode ? `
    <div style="text-align:center;margin:20px 0;">
      <div style="display:inline-block;background:#fff;border:2px dashed ${primary};padding:12px 28px;font-size:18px;font-weight:700;letter-spacing:2px;color:${primary};border-radius:8px;">${esc(discountCode)}</div>
      <p style="font-size:12px;color:#6b7280;margin:6px 0 0;">Cupón exclusivo válido por 24h</p>
    </div>` : '';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><title>Tu rutina personalizada</title></head>
<body style="margin:0;padding:0;background:#f1f1f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:680px;margin:0 auto;background:#fff;">
    <div style="background:${dark};padding:28px 32px;text-align:center;">
      <div style="color:#fff;font-size:12px;letter-spacing:3px;text-transform:uppercase;opacity:.7;margin-bottom:6px;">${esc(storeName)}</div>
      <h1 style="color:#fff;margin:0;font-size:26px;font-weight:700;letter-spacing:-.3px;">Tu rutina personalizada</h1>
      ${goalLabel ? `<div style="color:${primary};font-size:13px;font-weight:600;margin-top:10px;text-transform:uppercase;letter-spacing:1.5px;">${esc(goalLabel)}</div>` : ''}
    </div>
    <div style="background:${primary};height:4px;"></div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 6px;font-size:22px;color:${dark};font-weight:700;">Hola${firstName ? ' ' + esc(firstName) : ''} 👋</h2>
      <p style="font-size:15px;color:#4b5563;line-height:1.6;margin:0 0 8px;">Aquí está tu plan completo, armado para ti según la conversación que tuvimos.</p>
      ${routine ? `
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 18px;margin:16px 0;">
          <table role="presentation" style="width:100%;">
            <tr>
              <td style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Programa</td>
              <td style="font-size:13px;color:${dark};font-weight:600;text-align:right;">${esc(routine.name || '')}</td>
            </tr>
            <tr>
              <td style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;padding-top:6px;">Duración</td>
              <td style="font-size:13px;color:${dark};text-align:right;padding-top:6px;">${esc(routine.duration || '')}</td>
            </tr>
            <tr>
              <td style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;padding-top:6px;">Frecuencia</td>
              <td style="font-size:13px;color:${dark};text-align:right;padding-top:6px;">${esc(routine.frequency || '')}</td>
            </tr>
            <tr>
              <td style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;padding-top:6px;">Nivel</td>
              <td style="font-size:13px;color:${dark};text-align:right;padding-top:6px;">${esc(routine.level || '')}</td>
            </tr>
            ${routine.split ? `<tr>
              <td style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;padding-top:6px;">Split</td>
              <td style="font-size:13px;color:${dark};text-align:right;padding-top:6px;">${esc(routine.split)}</td>
            </tr>` : ''}
          </table>
        </div>
        <h2 style="color:${dark};font-size:17px;margin:28px 0 6px;font-weight:600;">Plan semanal</h2>
        ${daysHtml}
        ${routine.nutrition_note ? `
          <h2 style="color:${dark};font-size:17px;margin:28px 0 6px;font-weight:600;">Nota nutricional</h2>
          <p style="font-size:13.5px;color:#4b5563;line-height:1.6;margin:0;background:#fff7ed;border-left:3px solid ${primary};padding:12px 14px;border-radius:4px;">${esc(routine.nutrition_note)}</p>` : ''}
      ` : ''}
      ${prodHtml}
      ${principlesHtml}
      ${discountHtml}
      ${ctaHtml}
      <p style="font-size:13px;color:#6b7280;line-height:1.6;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:16px;">¿Dudas sobre algún ejercicio o cómo combinar tu alimentación con este plan? Responde este correo o vuelve al chat y te ayudamos a ajustarlo.</p>
    </div>
    <div style="background:#f9fafb;padding:18px 32px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;">
      ${esc(storeName)}${shop ? ' · ' + esc(shop) : ''}
    </div>
  </div>
</body></html>`;
}

async function sendRoutine(config, to, routineData) {
  const transport = createTransport(config);
  if (!transport) throw new Error('SMTP no configurado');
  const { name, goalLabel, routine, brand = {}, shop = '', products = [], discountCode = '', cartUrl = '' } = routineData;
  const storeName = brand.storeName || config.fromName || 'Asesor Digital';
  const from = `${config.fromName || storeName} <${config.fromEmail || config.smtpUser || process.env.SMTP_USER}>`;
  if (!isValidEmail(to)) throw new Error('Email invalido: ' + to);
  const html = buildRoutineHtml({ name, goalLabel, routine, products, brand, shop, discountCode, cartUrl });
  const firstName = (name || '').trim().split(/\s+/)[0];
  const subject = firstName
    ? `${firstName}, tu rutina personalizada${goalLabel ? ' — ' + goalLabel : ''}`
    : `Tu rutina personalizada${goalLabel ? ' — ' + goalLabel : ''}`;
  await transport.sendMail({ from, to, subject, html });
}

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

// ── Send personalized plan with PDF attachment ──
async function sendPlanEmail(config, to, planData) {
  if (!isValidEmail(to)) throw new Error('Email invalido: ' + to);
  const transport = createTransport(config);
  if (!transport) throw new Error('SMTP no configurado');
  const { name, goalLabel, cartUrl, discountCode, pdfBuffer, brand = {}, shop = '' } = planData;
  const from = `${config.fromName || brand.storeName || 'Dr Lab'} <${config.fromEmail || config.smtpUser || process.env.SMTP_USER}>`;
  const primary = brand.primaryColor || '#D4502A';
  const storeName = brand.storeName || config.fromName || 'Dr Lab';
  const subject = `Tu plan personalizado${goalLabel ? ' - ' + goalLabel : ''}`;

  const html = `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;">
      <div style="background:${brand.secondaryColor || '#1E1E1E'};padding:32px;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:24px;">${storeName}</h1>
        <p style="color:#ccc;margin:4px 0 0;font-size:12px;">${brand.tagline || 'Tu asesor nutricional inteligente'}</p>
      </div>
      <div style="background:${primary};padding:6px 0;"></div>
      <div style="padding:32px;">
        <h2 style="color:${primary};margin:0 0 16px;font-size:20px;">Hola${name ? ' ' + name.split(' ')[0] : ''},</h2>
        <p style="font-size:15px;color:#333;line-height:1.6;">Tu plan personalizado esta listo${goalLabel ? ' y enfocado en <strong>' + goalLabel + '</strong>' : ''}. Adjuntamos el PDF completo con tu rutina, nutricion, suplementacion y productos recomendados.</p>
        ${cartUrl ? `<div style="background:#FAF4F1;border-left:4px solid ${primary};padding:20px;margin:24px 0;border-radius:6px;">
          <p style="margin:0 0 12px;font-size:14px;color:#333;font-weight:600;">Ya te anadimos todos los productos al carrito:</p>
          <a href="${cartUrl}" style="background:${primary};color:#fff;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:600;display:inline-block;">Ir al carrito</a>
        </div>` : ''}
        ${discountCode ? `<div style="text-align:center;margin:24px 0;">
          <div style="display:inline-block;background:#fff;border:2px dashed ${primary};padding:14px 32px;font-size:20px;font-weight:700;letter-spacing:2px;color:${primary};border-radius:8px;">${discountCode}</div>
          <p style="font-size:13px;color:#666;margin:8px 0 0;">Cupon valido por 24 horas</p>
        </div>` : ''}
        <p style="font-size:13px;color:#666;line-height:1.6;margin-top:24px;">Cualquier duda sobre tu plan, responde este correo o vuelve a chatear con nosotros.</p>
      </div>
      <div style="padding:16px 32px;border-top:1px solid #eee;font-size:12px;color:#999;text-align:center;">${storeName}${shop ? ' · ' + shop : ''}</div>
    </div>`;

  const attachments = [];
  if (pdfBuffer) {
    attachments.push({
      filename: `Plan-${(name || 'Cliente').replace(/[^a-z0-9]/gi,'_')}-${Date.now()}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    });
  }

  await transport.sendMail({ from, to, subject, html, attachments });
}

function getTemplates() { return Object.entries(TEMPLATES).map(([id, t]) => ({ id, name: t.name, subject: t.subject })); }

module.exports = { sendRemarketing, sendCustomEmail, sendRoutine, sendPlanEmail, getTemplates, isValidEmail, buildRoutineHtml };
