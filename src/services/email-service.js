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
  const tmpl = TEMPLATES[templateId];
  if (!tmpl) throw new Error('Template no encontrado: ' + templateId);
  const from = `${config.fromName || 'Asesor Digital'} <${config.fromEmail || config.smtpUser || process.env.SMTP_USER}>`;
  const html = tmpl.build({ ...customData, shop: process.env.SHOPIFY_SHOP });
  await transport.sendMail({ from, to, subject: customData.subject || tmpl.subject, html });
}

async function sendCustomEmail(config, to, subject, html) {
  const transport = createTransport(config);
  if (!transport) throw new Error('SMTP no configurado');
  const from = `${config.fromName || 'Asesor Digital'} <${config.fromEmail || config.smtpUser || process.env.SMTP_USER}>`;
  await transport.sendMail({ from, to, subject, html });
}

async function sendRoutine(config, to, routineData) {
  const transport = createTransport(config);
  if (!transport) throw new Error('SMTP no configurado');
  const from = `${config.fromName || 'Asesor Digital'} <${config.fromEmail || config.smtpUser || process.env.SMTP_USER}>`;
  const { name, goal, routine, nutrition, supplements, trainerNotes } = routineData;

  const sections = [];
  if (routine) sections.push(`<h2 style="color:#d32f2f;font-size:18px;margin:24px 0 12px;">Rutina de Entrenamiento</h2><pre style="background:#f5f5f5;padding:16px;border-radius:6px;font-size:14px;line-height:1.6;white-space:pre-wrap;">${routine}</pre>`);
  if (nutrition) sections.push(`<h2 style="color:#d32f2f;font-size:18px;margin:24px 0 12px;">Plan de Nutricion</h2><pre style="background:#f5f5f5;padding:16px;border-radius:6px;font-size:14px;line-height:1.6;white-space:pre-wrap;">${nutrition}</pre>`);
  if (supplements) sections.push(`<h2 style="color:#d32f2f;font-size:18px;margin:24px 0 12px;">Suplementacion Recomendada</h2><pre style="background:#f5f5f5;padding:16px;border-radius:6px;font-size:14px;line-height:1.6;white-space:pre-wrap;">${supplements}</pre>`);
  if (trainerNotes) sections.push(`<h2 style="color:#d32f2f;font-size:18px;margin:24px 0 12px;">Notas Adicionales</h2><p style="font-size:14px;color:#555;line-height:1.6;">${trainerNotes}</p>`);

  const html = `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;">
      <div style="background:#d32f2f;padding:32px;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:24px;">Tu Plan Personalizado</h1>
      </div>
      <div style="padding:32px;">
        <p style="font-size:16px;color:#333;">Hola${name ? ' ' + name : ''},</p>
        <p style="font-size:15px;color:#555;line-height:1.6;">Te hemos preparado un plan personalizado${goal ? ' enfocado en <strong>' + goal + '</strong>' : ''}.</p>
        ${sections.join('')}
      </div>
      <div style="padding:16px 32px;border-top:1px solid #eee;font-size:12px;color:#999;text-align:center;">Creado por tu Asesor Digital</div>
    </div>`;

  await transport.sendMail({ from, to, subject: `Tu plan personalizado${goal ? ' — ' + goal : ''}`, html });
}

function getTemplates() { return Object.entries(TEMPLATES).map(([id, t]) => ({ id, name: t.name, subject: t.subject })); }

module.exports = { sendRemarketing, sendCustomEmail, sendRoutine, getTemplates };
