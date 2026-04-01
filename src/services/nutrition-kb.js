/* ═══════════════════════════════════════════════════════════════
   Nutrition Knowledge Base v1 — Asesor Digital
   Evidence-based sports nutrition protocols
   Sources: ISSN Position Stands, ACSM, WHO, clinical reviews
   ═══════════════════════════════════════════════════════════════ */

const NUTRITION_KB = {

  // ── SUPLEMENTOS: Ficha técnica por categoría ──────────────────
  supplements: {

    whey_protein: {
      name: 'Proteína Whey',
      category: 'Proteínas',
      types: {
        concentrate: { purity: '70-80%', lactose: 'contiene', absorcion: '1-2h', ideal: 'Post-entreno general, snack proteico' },
        isolate: { purity: '90%+', lactose: 'mínima/nula', absorcion: '30-60min', ideal: 'Post-entreno rápido, intolerantes a lactosa' },
        hydrolyzed: { purity: '90%+', lactose: 'nula', absorcion: '15-30min', ideal: 'Máxima absorción, atletas de competencia' }
      },
      dosis: '1.6–2.2 g/kg de peso corporal diario de proteína total. Cada scoop aporta aprox. 24-30g.',
      timing: 'Post-entreno (dentro de 2h) es óptimo, pero total diario importa más que timing exacto.',
      beneficios: ['Síntesis de proteína muscular', 'Recuperación', 'Saciedad', 'Preservar músculo en déficit calórico'],
      contraindicaciones: ['Alergia a lácteos (usar vegana)', 'Intolerancia a lactosa severa (usar isolate o vegana)'],
      stackCon: ['Creatina (sinergia)', 'BCAA (redundante si ya tomas whey suficiente)', 'Glutamina']
    },

    creatine: {
      name: 'Creatina',
      category: 'Rendimiento',
      types: {
        monohydrate: { evidencia: 'Máxima (gold standard)', dosis: '3-5g/día', carga: 'Opcional: 20g/día x 5 días, luego 5g/día' },
        hcl: { evidencia: 'Moderada', dosis: '1-2g/día', ventaja: 'Mejor solubilidad, menos retención hídrica reportada' },
        micronized: { evidencia: 'Igual que mono, mejor disolución', dosis: '3-5g/día', ventaja: 'Se mezcla mejor' }
      },
      dosis: '3-5 gramos diarios. No necesita ciclarse. El timing no importa tanto — consistencia diaria es clave.',
      timing: 'Cualquier momento del día, idealmente con comida o post-entreno con tu batido.',
      beneficios: ['Fuerza +5-10%', 'Masa muscular', 'Rendimiento en ejercicios de alta intensidad', 'Neuroprotección', 'Recuperación entre series'],
      mitos: ['NO daña los riñones en personas sanas', 'NO causa calvicie', 'La retención de agua es intracelular (buena)'],
      contraindicaciones: ['Enfermedad renal preexistente (consultar médico)'],
      stackCon: ['Whey (sinergia perfecta)', 'Pre-workout', 'Beta-alanina'],
      universal: true // Se recomienda para TODOS los objetivos
    },

    bcaa: {
      name: 'BCAAs (Aminoácidos Ramificados)',
      category: 'Recuperación',
      dosis: '5-10g durante o post-entreno',
      timing: 'Intra-entreno o post-entreno',
      beneficios: ['Reducir fatiga', 'Preservar músculo en ayuno', 'Recuperación'],
      nota: 'Si ya consumes suficiente proteína whey (2+ scoops/día), los BCAAs adicionales tienen beneficio marginal. Son más útiles en entrenamiento en ayunas o dietas muy restrictivas.',
      stackCon: ['Electrolitos', 'Glutamina']
    },

    pre_workout: {
      name: 'Pre-Workout',
      category: 'Energía',
      ingredientes_clave: {
        cafeina: { dosis: '150-300mg', efecto: 'Energía, enfoque, rendimiento +3-5%' },
        beta_alanina: { dosis: '3.2-6.4g/día', efecto: 'Buffer ácido láctico, +resistencia en series de 60-240s' },
        citrulina: { dosis: '6-8g', efecto: 'Vasodilatación, bombeo muscular, +flujo sanguíneo' },
        creatina: { dosis: '3-5g', efecto: 'Muchos pre-workouts ya la incluyen' }
      },
      timing: '20-30 minutos antes de entrenar',
      advertencia: 'No tomar después de las 4pm si afecta el sueño. No exceder 400mg de cafeína total al día.',
      stackCon: ['No combinar con café extra si el pre ya tiene 300mg+ de cafeína']
    },

    l_carnitine: {
      name: 'L-Carnitina',
      category: 'Quema de grasa',
      dosis: '2-3g/día, idealmente con carbohidratos o insulina elevada',
      timing: 'Pre-entreno (30min antes) o con comida principal',
      mecanismo: 'Transporta ácidos grasos a la mitocondria para ser usados como energía',
      nota: 'Funciona SOLO combinada con ejercicio. No es una pillora mágica. Necesita semanas de uso constante para saturar tejidos.',
      beneficios: ['Oxidación de grasa durante ejercicio', 'Reducir fatiga', 'Recuperación'],
      stackCon: ['Termogénico (sinergia)', 'CLA', 'Pre-workout']
    },

    omega3: {
      name: 'Omega-3 (EPA/DHA)',
      category: 'Salud General',
      dosis: 'Mínimo 1g EPA+DHA combinado. Óptimo: 2-3g/día.',
      fuentes: 'Aceite de pescado, krill. Vegano: aceite de algas.',
      beneficios: ['Antiinflamatorio', 'Salud cardiovascular', 'Función cerebral', 'Recuperación muscular', 'Salud articular'],
      timing: 'Con comida que contenga grasa (mejora absorción)',
      universal: true
    },

    glutamine: {
      name: 'Glutamina',
      category: 'Recuperación',
      dosis: '5-10g/día',
      timing: 'Post-entreno o antes de dormir',
      beneficios: ['Salud intestinal', 'Sistema inmune', 'Recuperación en entrenamientos intensos'],
      nota: 'Más útil en periodos de entrenamiento muy intenso o dietas restrictivas. En personas con dieta balanceada, el beneficio es menor.'
    },

    collagen: {
      name: 'Colágeno',
      category: 'Salud Articular',
      dosis: '10-15g/día de colágeno hidrolizado',
      timing: '30-60 min antes de entrenar (para tendones/ligamentos) o con cualquier comida',
      beneficios: ['Salud de articulaciones', 'Tendones y ligamentos', 'Piel y cabello', 'Recuperación de lesiones'],
      stackCon: ['Vitamina C (potencia la síntesis de colágeno)']
    },

    multivitamin: {
      name: 'Multivitamínico',
      category: 'Salud General',
      uso: 'Seguro de nutrición — cubre deficiencias que la dieta no alcanza',
      beneficios: ['Llenar gaps nutricionales', 'Sistema inmune', 'Energía', 'Fundamentos de salud'],
      nota: 'Especialmente importante si tu dieta no es variada o estás en déficit calórico.',
      universal: true
    },

    mass_gainer: {
      name: 'Mass Gainer / Ganador de Masa',
      category: 'Ganancia de peso',
      dosis: '1 serving (500-1200 cal dependiendo del producto)',
      ideal_para: 'Ectomorfos, personas con dificultad para subir de peso, alto metabolismo',
      beneficios: ['Alto en calorías y proteína', 'Fácil de consumir', 'Carbohidratos + Proteína en proporción'],
      nota: 'NO recomendado para pérdida de peso. Solo para quienes necesitan superávit calórico significativo.',
      contraindicaciones: ['Personas que quieren bajar de peso', 'Diabéticos (por alto contenido de carbos)']
    }
  },

  // ── PROTOCOLOS POR OBJETIVO ──────────────────────────────────
  protocols: {

    perdida_peso: {
      name: 'Pérdida de peso / Definición',
      principios: [
        'Déficit calórico moderado (300-500 kcal/día bajo mantenimiento)',
        'Proteína alta (2.0-2.4g/kg) para preservar músculo',
        'Entrenamiento de fuerza + cardio moderado',
        'Hidratación mínima: 2.5-3L agua/día'
      ],
      stack_ideal: ['Whey Isolate', 'L-Carnitina', 'Creatina', 'Omega-3', 'Termogénico (opcional)'],
      errores_comunes: [
        'Dejar de comer proteína por miedo a calorías',
        'Solo hacer cardio sin pesas (pierdes musculo)',
        'Suplementos sin déficit calórico no funcionan',
        'Cortar carbos totalmente (baja rendimiento y adherencia)'
      ],
      timeline: 'Resultados visibles: 4-8 semanas con consistencia'
    },

    ganar_musculo: {
      name: 'Ganancia muscular / Hipertrofia',
      principios: [
        'Superávit calórico moderado (+300-500 kcal/día)',
        'Proteína 1.6-2.2g/kg de peso corporal',
        'Entrenamiento de fuerza progresivo 4-6x/semana',
        'Descanso: 7-9h sueño, mínimo 48h entre mismo grupo muscular'
      ],
      stack_ideal: ['Whey Protein', 'Creatina Monohidratada', 'Pre-Workout', 'BCAA/Glutamina'],
      errores_comunes: [
        'Comer demasiado (grasa innecesaria)',
        'No progresar en peso/reps',
        'No dormir suficiente',
        'Depender solo de suplementos sin dieta sólida'
      ],
      timeline: 'Principiante: 0.5-1kg/mes de músculo. Avanzado: 0.25-0.5kg/mes'
    },

    rendimiento: {
      name: 'Rendimiento deportivo',
      principios: [
        'Nutrición periodizada según fase de entrenamiento',
        'Carbohidratos adecuados para rendimiento (5-10g/kg según intensidad)',
        'Hidratación con electrolitos',
        'Recuperación prioritaria'
      ],
      stack_ideal: ['Whey Protein', 'Creatina', 'Electrolitos', 'Pre-Workout', 'BCAA intra-entreno'],
      sports: ['CrossFit', 'Running', 'Ciclismo', 'Funcional', 'Natación', 'Artes marciales']
    },

    salud_general: {
      name: 'Salud general / Bienestar',
      principios: [
        'Dieta balanceada y variada',
        'Actividad física regular (150min/semana moderada)',
        'Sueño de calidad 7-9h',
        'Manejo de estrés'
      ],
      stack_ideal: ['Multivitamínico', 'Omega-3', 'Colágeno', 'Proteína (si no alcanzas con dieta)'],
      nota: 'No necesitas 10 suplementos. Empieza con los fundamentales y evalúa.'
    },

    principiante: {
      name: 'Principiante',
      principios: [
        'Establece el hábito de entrenar 3-4x/semana primero',
        'Aprende técnica antes de subir peso',
        'No necesitas MUCHOS suplementos al inicio',
        'Ajusta dieta gradualmente — no hagas cambios drásticos'
      ],
      stack_ideal: ['Whey Protein (base)', 'Creatina (beneficio universal)', 'Multivitamínico'],
      consejo: 'Empieza con lo fundamental: proteína + creatina. Cuando lleves 2-3 meses consistente, evalúa agregar más según tu objetivo específico.'
    }
  },

  // ── PERFILES DE USUARIO ──────────────────────────────────────
  profiles: {
    ectomorph: {
      name: 'Ectomorfo (metabolismo rápido, delgado)',
      nutricion: 'Necesitas superávit calórico alto. Mass gainer es tu aliado. Comidas frecuentes.',
      supl_priority: ['Mass Gainer', 'Whey Protein', 'Creatina']
    },
    mesomorph: {
      name: 'Mesomorfo (constitución atlética)',
      nutricion: 'Respondes bien a todo. Mantén proteína alta y ajusta calorías según objetivo.',
      supl_priority: ['Whey Protein', 'Creatina', 'Pre-Workout']
    },
    endomorph: {
      name: 'Endomorfo (tiende a acumular grasa)',
      nutricion: 'Control calórico es clave. Isolate sobre concentrate. L-Carnitina te ayuda.',
      supl_priority: ['Whey Isolate', 'L-Carnitina', 'Creatina', 'Termogénico']
    }
  },

  // ── REGLAS DE INTERACCIÓN ENTRE SUPLEMENTOS ──────────────────
  interactions: [
    { combo: ['Creatina', 'Cafeína'], safe: true, note: 'Seguro. La cafeína no anula la creatina a pesar del mito. Se complementan.' },
    { combo: ['Whey', 'Creatina'], safe: true, note: 'Combo perfecto. Puedes mezclarlos en el mismo batido post-entreno.' },
    { combo: ['Pre-workout', 'Café'], safe: false, note: 'Riesgo de exceder 400mg de cafeína. Elige uno u otro, no ambos.' },
    { combo: ['L-Carnitina', 'Termogénico'], safe: true, note: 'Sinergia para quema de grasa. La carnitina transporta grasa, el termogénico acelera metabolismo.' },
    { combo: ['BCAA', 'Whey'], safe: true, note: 'Seguro pero potencialmente redundante. La whey ya contiene BCAAs. Los BCAAs extra son más útiles si entrenas en ayuno.' },
    { combo: ['Colágeno', 'Vitamina C'], safe: true, note: 'Excelente. La vitamina C potencia la síntesis de colágeno. Tómalos juntos.' }
  ],

  // ── PREGUNTAS DE DIAGNÓSTICO ─────────────────────────────────
  diagnostic_questions: {
    goal: '¿Cuál es tu objetivo principal? (bajar grasa, ganar músculo, más energía, salud general)',
    experience: '¿Cuánto tiempo llevas entrenando? (principiante <6 meses, intermedio 6m-2 años, avanzado 2+ años)',
    training: '¿Cuántas veces a la semana entrenas y qué tipo de ejercicio haces?',
    diet: '¿Cómo es tu alimentación actual? ¿Comes suficiente proteína?',
    restrictions: '¿Tienes alguna restricción alimentaria? (vegetariano, vegano, intolerante a lactosa, alergias)',
    supplements_current: '¿Qué suplementos tomas actualmente, si alguno?',
    budget: '¿Tienes un presupuesto aproximado en mente?'
  }
};

/**
 * Generate a compact context string for the system prompt
 * based on detected user goal and profile
 */
function getContextForGoal(goalId) {
  const protocol = NUTRITION_KB.protocols[goalId];
  if (!protocol) return '';

  let ctx = `\n═══ PROTOCOLO: ${protocol.name} ═══\n`;
  ctx += `Principios: ${protocol.principios.join('. ')}.\n`;
  ctx += `Stack ideal: ${protocol.stack_ideal.join(' + ')}.\n`;
  if (protocol.errores_comunes) ctx += `Errores comunes a corregir: ${protocol.errores_comunes.join('. ')}.\n`;
  if (protocol.timeline) ctx += `Timeline esperado: ${protocol.timeline}\n`;
  if (protocol.consejo) ctx += `Consejo clave: ${protocol.consejo}\n`;
  return ctx;
}

/**
 * Get supplement info for a specific supplement type
 */
function getSupplementInfo(suppId) {
  return NUTRITION_KB.supplements[suppId] || null;
}

/**
 * Generate full nutrition context for the system prompt
 * This gives the AI deep knowledge to draw from
 */
function getFullNutritionContext() {
  let ctx = '═══ BASE DE CONOCIMIENTO NUTRICIONAL (ISSN / Evidencia Científica) ═══\n\n';

  // Supplements overview
  ctx += '── SUPLEMENTOS DISPONIBLES ──\n';
  for (const [id, supp] of Object.entries(NUTRITION_KB.supplements)) {
    ctx += `• ${supp.name} [${supp.category}]: ${supp.dosis || supp.uso || ''}`;
    if (supp.timing) ctx += ` | Timing: ${supp.timing}`;
    if (supp.nota) ctx += ` | Nota: ${supp.nota}`;
    ctx += '\n';
  }

  // Protocols overview
  ctx += '\n── PROTOCOLOS POR OBJETIVO ──\n';
  for (const [id, prot] of Object.entries(NUTRITION_KB.protocols)) {
    ctx += `• ${prot.name}: Stack → ${prot.stack_ideal.join(' + ')}\n`;
  }

  // Key interactions
  ctx += '\n── INTERACCIONES IMPORTANTES ──\n';
  for (const inter of NUTRITION_KB.interactions) {
    ctx += `• ${inter.combo.join(' + ')}: ${inter.safe ? '✅' : '⚠️'} ${inter.note}\n`;
  }

  // Diagnostic flow
  ctx += '\n── PREGUNTAS DE DIAGNÓSTICO (usa según contexto, NO todas de golpe) ──\n';
  for (const [key, q] of Object.entries(NUTRITION_KB.diagnostic_questions)) {
    ctx += `• ${key}: ${q}\n`;
  }

  return ctx;
}

/**
 * Detect goal from user message text
 */
function detectGoalFromText(text) {
  const lower = (text || '').toLowerCase();
  const GOAL_MAP = [
    { id: 'perdida_peso', keywords: ['bajar','perder','adelgazar','quemar','grasa','peso','corte','definir','definicion','flaco','dieta','reducir'] },
    { id: 'ganar_musculo', keywords: ['musculo','masa','hipertrofia','fuerza','volumen','bulk','ganar','tonificar','grande','crecer'] },
    { id: 'rendimiento', keywords: ['rendimiento','atletismo','resistencia','velocidad','deporte','crossfit','correr','energia','energía','funcional'] },
    { id: 'salud_general', keywords: ['salud','bienestar','vitamina','inmunidad','dormir','estres','colesterol','articulaciones','general'] },
    { id: 'principiante', keywords: ['principiante','empezar','comenzar','primera vez','nunca','nuevo'] }
  ];
  for (const goal of GOAL_MAP) {
    if (goal.keywords.some(kw => lower.includes(kw))) return goal.id;
  }
  return null;
}

module.exports = {
  NUTRITION_KB,
  getContextForGoal,
  getSupplementInfo,
  getFullNutritionContext,
  detectGoalFromText
};
