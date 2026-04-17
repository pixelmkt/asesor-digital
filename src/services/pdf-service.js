/* ═══════════════════════════════════════════════════════════════
   PDF Service v1 — Asesor Digital
   Generates branded plan PDFs (routine + nutrition + products)
   Stream-based — works with SMTP attachments and HTTP responses
   ═══════════════════════════════════════════════════════════════ */

const PDFDocument = require('pdfkit');
const https = require('https');
const http = require('http');

// ── Brand defaults (override per call via opts.brand) ──
const BRAND_DEFAULTS = {
  storeName: 'Dr Lab',
  tagline: 'Tu asesor nutricional inteligente',
  primaryColor: '#D4502A',
  secondaryColor: '#1E1E1E',
  accentColor: '#F5A623',
  bgColor: '#FFFFFF',
  textColor: '#2C2C2C',
  mutedColor: '#6B6B6B',
  footerText: 'Plan generado por Dr Lab · Basado en evidencia científica 2026'
};

function mergeBrand(brand = {}) {
  return { ...BRAND_DEFAULTS, ...brand };
}

// ── Download image buffer (for logos/avatars) ──
function fetchBuffer(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, (res) => {
      if (res.statusCode !== 200) { res.resume(); return resolve(null); }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', () => resolve(null));
    req.setTimeout(5000, () => { req.destroy(); resolve(null); });
  });
}

// ── Helpers ──
function drawHeader(doc, brand, title) {
  doc.save();
  doc.rect(0, 0, doc.page.width, 110).fill(brand.secondaryColor);
  doc.rect(0, 110, doc.page.width, 4).fill(brand.primaryColor);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(22).text(brand.storeName, 50, 35);
  doc.fillColor('#CCCCCC').font('Helvetica').fontSize(10).text(brand.tagline, 50, 62);
  doc.fillColor(brand.accentColor).font('Helvetica-Bold').fontSize(11).text(title.toUpperCase(), 50, 80);
  doc.restore();
  doc.moveDown(4);
  doc.y = 140;
}

function drawFooter(doc, brand, pageNumber, totalPages) {
  const y = doc.page.height - 40;
  doc.save();
  doc.fillColor(brand.mutedColor).font('Helvetica').fontSize(8);
  doc.text(brand.footerText, 50, y, { width: doc.page.width - 200, align: 'left' });
  doc.text(`Pagina ${pageNumber}${totalPages ? ' / ' + totalPages : ''}`, doc.page.width - 100, y, { width: 50, align: 'right' });
  doc.restore();
}

function sectionTitle(doc, brand, text) {
  ensureSpace(doc, 60);
  doc.moveDown(0.8);
  doc.fillColor(brand.primaryColor).font('Helvetica-Bold').fontSize(14).text(text.toUpperCase());
  doc.moveTo(doc.x, doc.y + 2).lineTo(doc.x + 60, doc.y + 2).stroke(brand.primaryColor);
  doc.moveDown(0.5);
  doc.fillColor(brand.textColor).font('Helvetica').fontSize(10);
}

function subTitle(doc, brand, text) {
  ensureSpace(doc, 40);
  doc.moveDown(0.4);
  doc.fillColor(brand.secondaryColor).font('Helvetica-Bold').fontSize(11).text(text);
  doc.moveDown(0.2);
  doc.fillColor(brand.textColor).font('Helvetica').fontSize(10);
}

function bodyText(doc, brand, text, opts = {}) {
  doc.fillColor(brand.textColor).font('Helvetica').fontSize(opts.size || 10).text(text, { align: opts.align || 'left', ...opts });
}

function bullet(doc, brand, text) {
  doc.fillColor(brand.primaryColor).font('Helvetica-Bold').text('• ', { continued: true });
  doc.fillColor(brand.textColor).font('Helvetica').text(text);
}

function callout(doc, brand, label, value) {
  const startY = doc.y;
  const w = doc.page.width - 100;
  doc.rect(50, startY, w, 22).fill('#FAF4F1');
  doc.fillColor(brand.primaryColor).font('Helvetica-Bold').fontSize(9).text(label.toUpperCase(), 60, startY + 7);
  doc.fillColor(brand.textColor).font('Helvetica').fontSize(10).text(value, 200, startY + 6, { width: w - 160 });
  doc.y = startY + 28;
}

function ensureSpace(doc, needed = 80) {
  if (doc.y + needed > doc.page.height - 60) doc.addPage();
}

// ── MAIN: Generate plan PDF (returns readable stream) ──
async function generatePlanPDF(opts = {}) {
  const brand = mergeBrand(opts.brand || {});
  const customerName = opts.customerName || 'Atleta';
  const customerEmail = opts.customerEmail || '';
  const goalLabel = opts.goalLabel || 'Tu objetivo';
  const routine = opts.routine || null;         // from exercise-kb
  const nutrition = opts.nutrition || null;     // { calories, protein, carbs, fats, meals }
  const products = opts.products || [];
  const cartUrl = opts.cartUrl || '';
  const discountCode = opts.discountCode || '';
  const supplementsContext = opts.supplementsContext || null;
  const logoBuffer = opts.logoBuffer || null;
  const stickerBuffer = opts.stickerBuffer || null;

  const doc = new PDFDocument({ size: 'A4', margin: 50, info: {
    Title: `Plan de ${goalLabel} - ${customerName}`,
    Author: brand.storeName,
    Subject: 'Plan personalizado de entrenamiento y nutricion',
    Keywords: 'fitness, nutricion, plan, entrenamiento'
  }});

  let pageNumber = 0;
  doc.on('pageAdded', () => { pageNumber++; drawHeader(doc, brand, 'Tu Plan Personalizado'); drawFooter(doc, brand, pageNumber); });
  pageNumber = 1;
  drawHeader(doc, brand, 'Tu Plan Personalizado');
  drawFooter(doc, brand, pageNumber);

  // ── PORTADA / HERO ──
  doc.fillColor(brand.secondaryColor).font('Helvetica-Bold').fontSize(26)
     .text(`Hola, ${customerName.split(' ')[0]}`, { align: 'left' });
  doc.moveDown(0.2);
  doc.fillColor(brand.primaryColor).font('Helvetica-Bold').fontSize(18).text(goalLabel);
  doc.moveDown(0.3);
  doc.fillColor(brand.mutedColor).font('Helvetica').fontSize(11)
     .text('Este plan fue generado por tu asesor nutricional en base a tu perfil, tus objetivos y tus respuestas durante la conversacion. Todo lo que lees aqui esta respaldado por evidencia cientifica actualizada 2026.');
  doc.moveDown(0.8);

  // Snapshot card
  const snapY = doc.y;
  doc.rect(50, snapY, doc.page.width - 100, 90).fillAndStroke('#FAF4F1', brand.primaryColor);
  doc.fillColor(brand.secondaryColor).font('Helvetica-Bold').fontSize(12).text('Resumen del plan', 65, snapY + 12);
  const snapLines = [];
  if (routine) snapLines.push(`Rutina: ${routine.name} (${routine.duration} semanas, ${routine.frequency})`);
  if (nutrition?.calories) snapLines.push(`Nutricion: ${nutrition.calories} kcal - ${nutrition.protein}g proteina`);
  if (products.length) snapLines.push(`Productos recomendados: ${products.length}`);
  if (discountCode) snapLines.push(`Cupon activo: ${discountCode}`);
  doc.fillColor(brand.textColor).font('Helvetica').fontSize(10);
  snapLines.forEach((l, i) => doc.text('• ' + l, 65, snapY + 35 + i * 13));
  doc.y = snapY + 100;
  doc.moveDown(0.8);

  // ── RUTINA ──
  if (routine) {
    sectionTitle(doc, brand, '1. Tu Rutina de Entrenamiento');
    callout(doc, brand, 'Nivel', routine.level || 'intermedio');
    callout(doc, brand, 'Duracion', `${routine.duration} semanas`);
    callout(doc, brand, 'Frecuencia', routine.frequency || '4-5 dias/semana');
    if (routine.split) callout(doc, brand, 'Split', routine.split);
    if (routine.cardio) callout(doc, brand, 'Cardio', routine.cardio);
    if (routine.rir) callout(doc, brand, 'RIR objetivo', String(routine.rir));
    doc.moveDown(0.5);

    if (routine.nutrition_note) {
      subTitle(doc, brand, 'Nota nutricional');
      bodyText(doc, brand, routine.nutrition_note);
      doc.moveDown(0.4);
    }

    if (routine.principles) {
      subTitle(doc, brand, 'Principios de entrenamiento (evidencia 2026)');
      (Array.isArray(routine.principles) ? routine.principles : [routine.principles]).forEach(p => bullet(doc, brand, p));
      doc.moveDown(0.4);
    }

    if (Array.isArray(routine.week)) {
      subTitle(doc, brand, 'Plan semanal (semana tipo)');
      routine.week.forEach((day, idx) => {
        ensureSpace(doc, 80);
        doc.moveDown(0.3);
        doc.fillColor(brand.primaryColor).font('Helvetica-Bold').fontSize(11).text(`DIA ${idx + 1} - ${day.name || day.focus || 'Entrenamiento'}`);
        doc.moveDown(0.15);
        if (day.warmup) {
          doc.fillColor(brand.mutedColor).font('Helvetica-Oblique').fontSize(9).text('Calentamiento: ' + day.warmup);
          doc.moveDown(0.15);
        }
        const blocks = day.blocks || day.exercises || [];
        blocks.forEach(ex => {
          ensureSpace(doc, 32);
          doc.fillColor(brand.textColor).font('Helvetica-Bold').fontSize(10).text('• ' + (ex.name || ex.exercise || 'Ejercicio'), { continued: false });
          const parts = [];
          if (ex.sets) parts.push(`${ex.sets} series`);
          if (ex.reps) parts.push(`${ex.reps} reps`);
          if (ex.rir !== undefined) parts.push(`RIR ${ex.rir}`);
          if (ex.rest) parts.push(`desc: ${ex.rest}`);
          if (ex.tempo) parts.push(`tempo ${ex.tempo}`);
          if (parts.length) {
            doc.fillColor(brand.mutedColor).font('Helvetica').fontSize(9).text('   ' + parts.join(' · '));
          }
          if (ex.notes) {
            doc.fillColor(brand.mutedColor).font('Helvetica-Oblique').fontSize(9).text('   ' + ex.notes);
          }
        });
        if (day.finisher) {
          doc.fillColor(brand.accentColor).font('Helvetica-Bold').fontSize(9).text('Finisher: ' + day.finisher);
        }
        if (day.cardio) {
          doc.fillColor(brand.accentColor).font('Helvetica-Bold').fontSize(9).text('Cardio: ' + day.cardio);
        }
      });
      doc.moveDown(0.4);
    }
  }

  // ── NUTRICION ──
  if (nutrition) {
    sectionTitle(doc, brand, '2. Tu Plan Nutricional');
    if (nutrition.calories) callout(doc, brand, 'Calorias diarias', `${nutrition.calories} kcal`);
    if (nutrition.protein)  callout(doc, brand, 'Proteina',          `${nutrition.protein} g/dia`);
    if (nutrition.carbs)    callout(doc, brand, 'Carbohidratos',     `${nutrition.carbs} g/dia`);
    if (nutrition.fats)     callout(doc, brand, 'Grasas',            `${nutrition.fats} g/dia`);
    if (nutrition.water)    callout(doc, brand, 'Agua',              `${nutrition.water} L/dia`);
    doc.moveDown(0.3);

    if (Array.isArray(nutrition.meals) && nutrition.meals.length) {
      subTitle(doc, brand, 'Distribucion de comidas');
      nutrition.meals.forEach(m => bullet(doc, brand, `${m.name || 'Comida'}: ${m.description || m.items || ''}`));
      doc.moveDown(0.3);
    }

    if (Array.isArray(nutrition.tips) && nutrition.tips.length) {
      subTitle(doc, brand, 'Tips claves');
      nutrition.tips.forEach(t => bullet(doc, brand, t));
      doc.moveDown(0.3);
    }
  }

  // ── SUPLEMENTACION ──
  if (supplementsContext) {
    sectionTitle(doc, brand, '3. Suplementacion Recomendada');
    if (typeof supplementsContext === 'string') {
      bodyText(doc, brand, supplementsContext);
    } else if (Array.isArray(supplementsContext)) {
      supplementsContext.forEach(s => {
        subTitle(doc, brand, s.name || 'Suplemento');
        if (s.dosis) bullet(doc, brand, `Dosis: ${s.dosis}`);
        if (s.timing) bullet(doc, brand, `Timing: ${s.timing}`);
        if (Array.isArray(s.beneficios)) s.beneficios.forEach(b => bullet(doc, brand, b));
      });
    }
    doc.moveDown(0.3);
  }

  // ── PRODUCTOS ──
  if (products.length) {
    sectionTitle(doc, brand, '4. Tus Productos Recomendados');
    products.forEach((p, i) => {
      ensureSpace(doc, 70);
      const startY = doc.y;
      doc.rect(50, startY, doc.page.width - 100, 60).fillAndStroke('#FAFAFA', '#E5E5E5');
      const tierColor = p.tier === 1 ? brand.primaryColor : p.tier === 3 ? '#888' : brand.accentColor;
      const tierLabel = p.tier === 1 ? 'PREMIUM' : p.tier === 3 ? 'ESENCIAL' : 'RECOMENDADO';
      doc.fillColor(tierColor).font('Helvetica-Bold').fontSize(8).text(tierLabel, 60, startY + 8);
      doc.fillColor(brand.secondaryColor).font('Helvetica-Bold').fontSize(12).text(`${i+1}. ${p.title || p.name || 'Producto'}`, 60, startY + 20);
      if (p.price) doc.fillColor(brand.primaryColor).font('Helvetica-Bold').fontSize(13).text(`S/ ${p.price}`, 60, startY + 38);
      if (p.note || p.reason) doc.fillColor(brand.mutedColor).font('Helvetica').fontSize(9).text(p.note || p.reason, 200, startY + 20, { width: doc.page.width - 260 });
      doc.y = startY + 70;
    });
    doc.moveDown(0.4);
  }

  // ── CART LINK + DISCOUNT ──
  if (cartUrl || discountCode) {
    ensureSpace(doc, 100);
    sectionTitle(doc, brand, '5. Activa Tu Plan');
    const y = doc.y;
    doc.rect(50, y, doc.page.width - 100, 85).fill(brand.primaryColor);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(13).text('LISTO PARA EMPEZAR?', 65, y + 12);
    if (cartUrl) {
      doc.fillColor('#FFFFFF').font('Helvetica').fontSize(10).text('Anadimos todos tus productos al carrito:', 65, y + 32);
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10).text(cartUrl, 65, y + 46, { link: cartUrl, underline: true, width: doc.page.width - 130 });
    }
    if (discountCode) {
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(11).text(`Usa el codigo ${discountCode} - valido 24h`, 65, y + 65);
    }
    doc.y = y + 95;
  }

  // ── FOOTER CIENTIFICO ──
  ensureSpace(doc, 80);
  doc.moveDown(0.6);
  doc.fillColor(brand.mutedColor).font('Helvetica-Oblique').fontSize(8).text(
    'Este plan fue generado con base en literatura cientifica actualizada (ISSN 2023-2025, ACSM 2024, NSCA, Schoenfeld et al. 2024). Los resultados dependen de consistencia, descanso y ajuste progresivo. Ante cualquier condicion medica, consulta a tu profesional de salud antes de iniciar.',
    { align: 'justify' }
  );

  doc.end();
  return doc;
}

// ── Convenience: buffer the PDF entirely (for SMTP attachment) ──
async function generatePlanPDFBuffer(opts) {
  const doc = await generatePlanPDF(opts);
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

module.exports = { generatePlanPDF, generatePlanPDFBuffer, fetchBuffer };
