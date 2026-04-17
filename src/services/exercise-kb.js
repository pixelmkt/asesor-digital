/* ═══════════════════════════════════════════════════════════════
   Exercise Knowledge Base v4 — REAL, updated 2026
   10 goal-based programs with periodization, RIR/RPE, modern programming
   Every routine follows current evidence-based training science
   ═══════════════════════════════════════════════════════════════ */

const EXERCISE_KB = {
  version: '4.0',
  lastUpdated: '2026-04',
  source: 'Dr. Lab — basado en NSCA, ACSM, Schoenfeld 2023-2025, meta-análisis recientes',

  // ═══ PRINCIPIOS GLOBALES ═══
  principles: {
    rir_rpe: 'RIR (Reps In Reserve): reps que puedes hacer antes del fallo. RPE 1-10 = esfuerzo percibido. RIR 2 ≈ RPE 8. Para hipertrofia: RIR 0-3. Para fuerza: RIR 3-5.',
    volume: 'Volumen semanal efectivo por grupo muscular: mínimo 10 series, óptimo 12-20, máximo 25 (avanzados). Medir series efectivas (RIR ≤ 4).',
    frequency: 'Frecuencia 2x/semana por músculo supera 1x para hipertrofia (Schoenfeld 2016-2024). Full body o upper/lower > splits tradicionales para principiantes.',
    progression: 'Sobrecarga progresiva: +2.5kg cada 2 semanas en compuestos, +1kg en aislados. Si no progresas 3 semanas → deload 40-50%.',
    warmup: 'Calentamiento: 5-8 min cardio suave + movilidad específica + 2-3 sets rampa (40-60-80% del peso de trabajo).',
    rest: 'Descanso entre series: compuestos 2-4 min, aislados 60-90 seg, metabólicos 30-60 seg.',
    deload: 'Cada 4-6 semanas: semana de deload (50-60% volumen, mismo peso). Previene sobreentrenamiento.',
    sleep: 'Dormir 7-9h es NO negociable. Sin sueño no hay hipertrofia ni fuerza ni pérdida de grasa eficiente.',
    adherencia: 'El mejor programa es el que CUMPLES. 3 días consistentes > 6 días inconsistentes.'
  },

  // ═══ 10 RUTINAS POR OBJETIVO ═══
  routines: {

    // 1) BAJAR DE PESO / PÉRDIDA DE GRASA
    bajar_peso: {
      id: 'bajar_peso',
      name: 'Quema de Grasa',
      icon: '🔥',
      goal: 'Pérdida de grasa preservando masa muscular',
      level: 'principiante-intermedio',
      duration: '8 semanas (periodización: 4 sem acumulación + 4 sem intensificación)',
      frequency: '4-5 días/semana',
      split: 'Upper/Lower + 2 cardios dedicados',
      cardio: 'HIIT 2x/semana (15-20 min) + LISS 1-2x (30-45 min zona 2)',
      rir: 'RIR 1-2 en todas las series principales',
      nutrition_note: 'Déficit calórico -15% a -20% del mantenimiento. Proteína 2.2g/kg. Carbs peri-entreno.',
      week: [
        {
          day: 'Lunes — Upper (Push/Pull)',
          blocks: [
            { name: 'Press banca con mancuernas', sets: 4, reps: '8-10', rir: 2, rest: '2 min', notes: 'Controla 2 seg excéntrica' },
            { name: 'Remo con barra (pendlay o bent-over)', sets: 4, reps: '8-10', rir: 2, rest: '2 min' },
            { name: 'Press militar', sets: 3, reps: '10-12', rir: 2, rest: '90 seg' },
            { name: 'Jalón al pecho agarre neutro', sets: 3, reps: '10-12', rir: 2, rest: '90 seg' },
            { name: 'Curl inclinado + Triceps polea superset', sets: 3, reps: '12-15', rir: 1, rest: '60 seg' },
            { name: 'Face pulls', sets: 3, reps: '15', rir: 1, rest: '45 seg', notes: 'Salud de hombro' }
          ]
        },
        {
          day: 'Martes — HIIT 20 min',
          blocks: [
            { name: 'Calentamiento bici/cinta', sets: 1, reps: '5 min zona 2', rir: '-', rest: '-' },
            { name: 'HIIT 30s sprint / 90s trote', sets: 8, reps: '1 ronda = 2 min', rir: '-', rest: '-', notes: 'Intensidad 90-95% FC máx' },
            { name: 'Enfriamiento', sets: 1, reps: '5 min caminata', rir: '-', rest: '-' }
          ]
        },
        {
          day: 'Miércoles — Lower (Fuerza + Glúteos)',
          blocks: [
            { name: 'Sentadilla trasera', sets: 4, reps: '6-8', rir: 2, rest: '3 min', notes: 'Core activo' },
            { name: 'Peso muerto rumano', sets: 4, reps: '8-10', rir: 2, rest: '2 min' },
            { name: 'Búlgara con mancuernas', sets: 3, reps: '10/pierna', rir: 1, rest: '90 seg' },
            { name: 'Hip thrust barra', sets: 4, reps: '10-12', rir: 1, rest: '90 seg' },
            { name: 'Elevación talones de pie', sets: 4, reps: '12-15', rir: 1, rest: '60 seg' },
            { name: 'Plancha frontal + lateral', sets: 3, reps: '45 seg', rir: '-', rest: '45 seg' }
          ]
        },
        {
          day: 'Jueves — LISS 40 min',
          blocks: [
            { name: 'Caminar inclinado / bici zona 2', sets: 1, reps: '40 min', rir: '-', rest: '-', notes: 'FC 60-70% max. Podcast o música ayuda' }
          ]
        },
        {
          day: 'Viernes — Upper Hipertrofia',
          blocks: [
            { name: 'Press inclinado mancuernas', sets: 4, reps: '10-12', rir: 1, rest: '90 seg' },
            { name: 'Remo a una mano', sets: 4, reps: '10-12/lado', rir: 1, rest: '90 seg' },
            { name: 'Fondos asistidos o paralelas', sets: 3, reps: '8-12', rir: 2, rest: '2 min' },
            { name: 'Pull-ups asistidos', sets: 3, reps: 'AMRAP', rir: 1, rest: '2 min' },
            { name: 'Elevaciones laterales', sets: 4, reps: '12-15', rir: 0, rest: '45 seg', notes: 'Drop set última' },
            { name: 'Curl martillo + Triceps mancuerna', sets: 3, reps: '12', rir: 1, rest: '60 seg' }
          ]
        },
        {
          day: 'Sábado — Finisher metabólico (30 min)',
          blocks: [
            { name: 'Circuito: burpees 10 + KB swing 15 + mountain climbers 20 + descanso 60s', sets: 5, reps: '1 vuelta', rir: '-', rest: '60 seg' },
            { name: 'Caminata 20 min', sets: 1, reps: '-', rir: '-', rest: '-' }
          ]
        },
        { day: 'Domingo — Descanso activo (caminata + movilidad)', blocks: [] }
      ],
      supplements_priority: ['l_carnitine', 'whey', 'creatine', 'multivitamin']
    },

    // 2) DEFINICIÓN MUSCULAR
    definicion: {
      id: 'definicion',
      name: 'Definición Muscular',
      icon: '✨',
      goal: 'Revelar músculo reduciendo grasa sin perder volumen',
      level: 'intermedio-avanzado',
      duration: '10-12 semanas',
      frequency: '5 días/semana',
      split: 'Push / Pull / Legs / Upper / Lower',
      cardio: 'LISS 3x 30 min + HIIT 1-2x/semana',
      rir: 'RIR 0-2 en la mayoría',
      nutrition_note: 'Déficit -10% a -15%. Proteína 2.4g/kg. Carbs altos en días de entreno pesado, bajos en descanso.',
      week: [
        {
          day: 'Lunes — Push (pecho/hombro/tríceps)',
          blocks: [
            { name: 'Press banca', sets: 4, reps: '6-8', rir: 1, rest: '3 min' },
            { name: 'Press inclinado mancuernas', sets: 4, reps: '8-10', rir: 1, rest: '2 min' },
            { name: 'Press militar sentado', sets: 4, reps: '8-10', rir: 1, rest: '2 min' },
            { name: 'Aperturas cable poleas', sets: 3, reps: '12-15', rir: 0, rest: '60 seg' },
            { name: 'Elevaciones laterales', sets: 4, reps: '15-20', rir: 0, rest: '45 seg' },
            { name: 'Triceps polea cuerda + fondos', sets: 3, reps: '12', rir: 1, rest: '60 seg' }
          ]
        },
        {
          day: 'Martes — Pull (espalda/bíceps) + LISS 20min',
          blocks: [
            { name: 'Dominadas lastradas', sets: 4, reps: '6-8', rir: 1, rest: '3 min' },
            { name: 'Remo barra T o pendlay', sets: 4, reps: '8-10', rir: 1, rest: '2 min' },
            { name: 'Jalón agarre ancho', sets: 3, reps: '10-12', rir: 1, rest: '90 seg' },
            { name: 'Remo sentado polea', sets: 3, reps: '10-12', rir: 1, rest: '90 seg' },
            { name: 'Curl barra Z + martillo', sets: 4, reps: '10 / 12', rir: 0, rest: '60 seg' },
            { name: 'LISS cinta 20 min zona 2', sets: 1, reps: '20min', rir: '-', rest: '-' }
          ]
        },
        {
          day: 'Miércoles — Legs (piernas completas)',
          blocks: [
            { name: 'Sentadilla trasera', sets: 4, reps: '6-8', rir: 1, rest: '3 min' },
            { name: 'Prensa 45°', sets: 4, reps: '10-12', rir: 1, rest: '2 min' },
            { name: 'Hip thrust', sets: 4, reps: '10', rir: 1, rest: '2 min' },
            { name: 'Extensión cuádriceps', sets: 3, reps: '12-15', rir: 0, rest: '60 seg' },
            { name: 'Femoral tumbado', sets: 4, reps: '12-15', rir: 0, rest: '60 seg' },
            { name: 'Gemelos pie de pie', sets: 5, reps: '12-15', rir: 0, rest: '45 seg' }
          ]
        },
        {
          day: 'Jueves — HIIT 25 min + abs',
          blocks: [
            { name: 'HIIT bici 30s/90s', sets: 10, reps: '1 ronda', rir: '-', rest: '-' },
            { name: 'Plancha + hollow + mountain climbers', sets: 3, reps: '45 seg c/u', rir: '-', rest: '60 seg' }
          ]
        },
        {
          day: 'Viernes — Upper metabólico',
          blocks: [
            { name: 'Superset: Press banca + Remo con barra', sets: 4, reps: '10 + 10', rir: 1, rest: '90 seg' },
            { name: 'Superset: Press militar + Jalón', sets: 4, reps: '12 + 12', rir: 0, rest: '90 seg' },
            { name: 'Triset laterales/curl/triceps', sets: 3, reps: '12 c/u', rir: 0, rest: '60 seg' },
            { name: 'LISS 20 min', sets: 1, reps: '20min', rir: '-', rest: '-' }
          ]
        },
        {
          day: 'Sábado — Lower volumen + glúteo',
          blocks: [
            { name: 'Peso muerto rumano', sets: 4, reps: '8-10', rir: 1, rest: '2 min' },
            { name: 'Hip thrust con pausa', sets: 4, reps: '10-12 + 3s pausa arriba', rir: 1, rest: '90 seg' },
            { name: 'Búlgara con mancuernas', sets: 3, reps: '10/pierna', rir: 1, rest: '90 seg' },
            { name: 'Patada glúteo polea', sets: 3, reps: '15/pierna', rir: 0, rest: '60 seg' },
            { name: 'Abductores máquina', sets: 4, reps: '15-20', rir: 0, rest: '45 seg' }
          ]
        },
        { day: 'Domingo — Descanso total', blocks: [] }
      ],
      supplements_priority: ['whey', 'l_carnitine', 'creatine', 'bcaa', 'multivitamin']
    },

    // 3) GANAR MÚSCULO / HIPERTROFIA
    ganar_musculo: {
      id: 'ganar_musculo',
      name: 'Ganar Músculo (Hipertrofia)',
      icon: '💪',
      goal: 'Maximizar masa muscular magra con volumen progresivo',
      level: 'intermedio',
      duration: '12 semanas con deload cada 5',
      frequency: '5-6 días/semana',
      split: 'Push/Pull/Legs x 2 (PPL PPL Off)',
      cardio: 'Opcional: LISS 20 min 1-2x/semana por salud cardiovascular',
      rir: 'RIR 1-3',
      nutrition_note: 'Superávit +200 a +400 kcal. Proteína 1.8-2.2g/kg. Carbs 4-6g/kg. Grasas 0.8-1g/kg.',
      week: [
        {
          day: 'Lunes — Push A (fuerza pecho)',
          blocks: [
            { name: 'Press banca', sets: 5, reps: '5-6', rir: 2, rest: '3 min' },
            { name: 'Press inclinado mancuernas', sets: 4, reps: '8-10', rir: 1, rest: '2 min' },
            { name: 'Fondos lastrados', sets: 3, reps: '8-10', rir: 1, rest: '2 min' },
            { name: 'Press militar sentado', sets: 4, reps: '8-10', rir: 1, rest: '2 min' },
            { name: 'Aperturas cable', sets: 3, reps: '12-15', rir: 0, rest: '60 seg' },
            { name: 'Triceps polea + fondos banca', sets: 3, reps: '10 + 12', rir: 1, rest: '60 seg' }
          ]
        },
        {
          day: 'Martes — Pull A (fuerza espalda)',
          blocks: [
            { name: 'Peso muerto convencional', sets: 4, reps: '4-6', rir: 2, rest: '3 min' },
            { name: 'Dominadas lastradas', sets: 4, reps: '6-8', rir: 1, rest: '2 min' },
            { name: 'Remo con barra', sets: 4, reps: '8-10', rir: 1, rest: '2 min' },
            { name: 'Pull over mancuerna', sets: 3, reps: '12', rir: 1, rest: '90 seg' },
            { name: 'Curl barra + martillo superset', sets: 4, reps: '8 + 10', rir: 1, rest: '60 seg' },
            { name: 'Face pulls', sets: 3, reps: '15', rir: 0, rest: '45 seg' }
          ]
        },
        {
          day: 'Miércoles — Legs A (cuádriceps)',
          blocks: [
            { name: 'Sentadilla trasera', sets: 5, reps: '5-6', rir: 2, rest: '3 min' },
            { name: 'Prensa 45° pies juntos', sets: 4, reps: '10-12', rir: 1, rest: '2 min' },
            { name: 'Zancadas con barra', sets: 3, reps: '10/pierna', rir: 1, rest: '90 seg' },
            { name: 'Extensión cuádriceps', sets: 4, reps: '12-15', rir: 0, rest: '60 seg' },
            { name: 'Gemelos de pie', sets: 5, reps: '10-12', rir: 0, rest: '60 seg' }
          ]
        },
        {
          day: 'Jueves — Push B (hombros)',
          blocks: [
            { name: 'Press militar de pie', sets: 5, reps: '5-6', rir: 2, rest: '3 min' },
            { name: 'Press banca inclinado con barra', sets: 4, reps: '8-10', rir: 1, rest: '2 min' },
            { name: 'Press Arnold', sets: 3, reps: '10-12', rir: 1, rest: '90 seg' },
            { name: 'Elevaciones laterales (lean-away)', sets: 5, reps: '12-15', rir: 0, rest: '45 seg' },
            { name: 'Press francés barra Z', sets: 4, reps: '10', rir: 1, rest: '90 seg' }
          ]
        },
        {
          day: 'Viernes — Pull B (volumen espalda)',
          blocks: [
            { name: 'Remo T-bar', sets: 4, reps: '8-10', rir: 1, rest: '2 min' },
            { name: 'Jalón agarre neutro', sets: 4, reps: '10-12', rir: 1, rest: '90 seg' },
            { name: 'Remo a una mano', sets: 3, reps: '12/lado', rir: 1, rest: '90 seg' },
            { name: 'Remo máquina Hammer', sets: 3, reps: '12', rir: 0, rest: '60 seg' },
            { name: 'Curl predicador + concentrado', sets: 4, reps: '10 + 12', rir: 0, rest: '60 seg' }
          ]
        },
        {
          day: 'Sábado — Legs B (posteriores/glúteo)',
          blocks: [
            { name: 'Peso muerto rumano', sets: 5, reps: '6-8', rir: 2, rest: '2 min' },
            { name: 'Hip thrust', sets: 4, reps: '8-10', rir: 1, rest: '2 min' },
            { name: 'Femoral sentado', sets: 4, reps: '10-12', rir: 1, rest: '90 seg' },
            { name: 'Búlgara', sets: 3, reps: '10/pierna', rir: 1, rest: '90 seg' },
            { name: 'Gemelos sentado', sets: 5, reps: '12-15', rir: 0, rest: '45 seg' }
          ]
        },
        { day: 'Domingo — Descanso', blocks: [] }
      ],
      supplements_priority: ['whey', 'creatine', 'mass_gainer', 'glutamine', 'multivitamin']
    },

    // 4) MASA / VOLUMEN
    subir_peso: {
      id: 'subir_peso',
      name: 'Subir Peso (Volumen)',
      icon: '📈',
      goal: 'Ganar peso total (músculo + algo de grasa aceptable) — para ectomorfos',
      level: 'principiante-intermedio',
      duration: '12-16 semanas',
      frequency: '4 días/semana',
      split: 'Upper / Lower (más frecuencia por grupo)',
      cardio: 'Mínimo, solo caminata ligera para apetito',
      rir: 'RIR 2-3 (preservar energía para comer y recuperar)',
      nutrition_note: 'Superávit agresivo +400 a +700 kcal. Mass gainer ideal entre comidas. Proteína 1.6-2g/kg. Come CADA 3h.',
      week: [
        {
          day: 'Lunes — Upper A',
          blocks: [
            { name: 'Press banca', sets: 5, reps: '5', rir: 3, rest: '3 min' },
            { name: 'Remo barra', sets: 5, reps: '5', rir: 3, rest: '3 min' },
            { name: 'Press inclinado mancuernas', sets: 4, reps: '8-10', rir: 2, rest: '2 min' },
            { name: 'Dominadas asistidas o jalón', sets: 4, reps: '8-10', rir: 2, rest: '2 min' },
            { name: 'Curl barra + Press francés', sets: 3, reps: '10 + 10', rir: 2, rest: '90 seg' }
          ]
        },
        {
          day: 'Martes — Lower A',
          blocks: [
            { name: 'Sentadilla trasera', sets: 5, reps: '5', rir: 3, rest: '3 min' },
            { name: 'Peso muerto rumano', sets: 4, reps: '6-8', rir: 2, rest: '2 min' },
            { name: 'Prensa', sets: 4, reps: '10', rir: 2, rest: '2 min' },
            { name: 'Extensión + femoral', sets: 3, reps: '12', rir: 1, rest: '90 seg' },
            { name: 'Gemelos', sets: 4, reps: '12', rir: 1, rest: '60 seg' }
          ]
        },
        { day: 'Miércoles — Descanso (comer mucho)', blocks: [] },
        {
          day: 'Jueves — Upper B',
          blocks: [
            { name: 'Press militar barra', sets: 5, reps: '5', rir: 3, rest: '3 min' },
            { name: 'Dominadas lastradas', sets: 5, reps: '5', rir: 3, rest: '3 min' },
            { name: 'Press banca inclinado', sets: 4, reps: '8-10', rir: 2, rest: '2 min' },
            { name: 'Remo pendlay', sets: 4, reps: '8', rir: 2, rest: '2 min' },
            { name: 'Elevación lateral + Curl martillo', sets: 3, reps: '12 + 10', rir: 1, rest: '60 seg' }
          ]
        },
        {
          day: 'Viernes — Lower B',
          blocks: [
            { name: 'Peso muerto convencional', sets: 5, reps: '5', rir: 3, rest: '3 min' },
            { name: 'Sentadilla frontal', sets: 4, reps: '6-8', rir: 2, rest: '3 min' },
            { name: 'Hip thrust', sets: 4, reps: '8-10', rir: 2, rest: '2 min' },
            { name: 'Zancadas con mancuernas', sets: 3, reps: '10/pierna', rir: 1, rest: '90 seg' },
            { name: 'Gemelos sentado', sets: 4, reps: '12', rir: 1, rest: '45 seg' }
          ]
        },
        { day: 'Sábado — Descanso o cardio ligero 15min', blocks: [] },
        { day: 'Domingo — Descanso', blocks: [] }
      ],
      supplements_priority: ['mass_gainer', 'whey', 'creatine', 'glutamine', 'multivitamin']
    },

    // 5) RENDIMIENTO ATLÉTICO
    rendimiento: {
      id: 'rendimiento',
      name: 'Rendimiento Atlético',
      icon: '⚡',
      goal: 'Potencia, velocidad, resistencia funcional — deportistas',
      level: 'intermedio-avanzado',
      duration: '8-12 semanas (periodización conjugada)',
      frequency: '5-6 días/semana',
      split: 'Fuerza-potencia / Conditioning / Deporte específico',
      cardio: 'Integrado: sprints, intervalos, circuitos funcionales',
      rir: 'RIR 2-3 en fuerza, explosividad técnica en potencia',
      nutrition_note: 'Mantenimiento o leve superávit. Carbs peri-entreno CRÍTICOS. Hidratación + electrolitos.',
      week: [
        {
          day: 'Lunes — Fuerza máxima lower',
          blocks: [
            { name: 'Sentadilla trasera', sets: 5, reps: '3-5', rir: 2, rest: '3-4 min' },
            { name: 'Peso muerto convencional', sets: 4, reps: '3', rir: 2, rest: '3 min' },
            { name: 'Búlgara', sets: 3, reps: '8/pierna', rir: 2, rest: '2 min' },
            { name: 'Core: plancha + anti-rotación', sets: 3, reps: '45 seg c/u', rir: '-', rest: '45 seg' }
          ]
        },
        {
          day: 'Martes — Potencia + sprint',
          blocks: [
            { name: 'Cargada colgada', sets: 5, reps: '3', rir: '-', rest: '2 min', notes: 'Técnica explosiva' },
            { name: 'Salto cajón altura', sets: 5, reps: '3', rir: '-', rest: '90 seg' },
            { name: 'Sprint 30m', sets: 6, reps: '1', rir: '-', rest: '2 min' },
            { name: 'Lanzamiento balón medicinal', sets: 4, reps: '5', rir: '-', rest: '90 seg' }
          ]
        },
        {
          day: 'Miércoles — Fuerza upper',
          blocks: [
            { name: 'Press banca', sets: 5, reps: '3-5', rir: 2, rest: '3 min' },
            { name: 'Dominadas lastradas', sets: 4, reps: '5', rir: 2, rest: '2 min' },
            { name: 'Push press', sets: 4, reps: '5', rir: 2, rest: '2 min' },
            { name: 'Remo pendlay', sets: 4, reps: '6', rir: 2, rest: '2 min' }
          ]
        },
        {
          day: 'Jueves — Conditioning (circuito)',
          blocks: [
            { name: 'AMRAP 20min: 10 burpees + 15 KB swing + 20 box jumps + 400m trote', sets: 1, reps: '-', rir: '-', rest: '-' },
            { name: 'Movilidad 10 min', sets: 1, reps: '-', rir: '-', rest: '-' }
          ]
        },
        {
          day: 'Viernes — Fuerza accesoria',
          blocks: [
            { name: 'Peso muerto rumano', sets: 4, reps: '6-8', rir: 2, rest: '2 min' },
            { name: 'Press militar', sets: 4, reps: '6-8', rir: 2, rest: '2 min' },
            { name: 'Remo una mano', sets: 3, reps: '8/lado', rir: 2, rest: '90 seg' },
            { name: 'Farmer walk', sets: 4, reps: '30m', rir: '-', rest: '90 seg' }
          ]
        },
        {
          day: 'Sábado — Deporte específico / intervalos largos',
          blocks: [
            { name: 'Calentamiento 10 min', sets: 1, reps: '-', rir: '-', rest: '-' },
            { name: 'Intervalos 4x800m al 85% FC max', sets: 4, reps: '800m', rir: '-', rest: '3 min' },
            { name: 'Enfriamiento 10 min', sets: 1, reps: '-', rir: '-', rest: '-' }
          ]
        },
        { day: 'Domingo — Descanso activo (yoga, movilidad, caminata)', blocks: [] }
      ],
      supplements_priority: ['pre_workout', 'creatine', 'whey', 'bcaa', 'multivitamin']
    },

    // 6) SALUD GENERAL
    salud_general: {
      id: 'salud_general',
      name: 'Salud General / Fitness Sostenible',
      icon: '❤️',
      goal: 'Bienestar, fuerza funcional, longevidad — no estético',
      level: 'todos',
      duration: 'Indefinido (estilo de vida)',
      frequency: '3-4 días/semana',
      split: 'Full body',
      cardio: 'Zona 2: 150 min/semana (ACSM). Caminar cuenta.',
      rir: 'RIR 2-3 (seguro, sostenible)',
      nutrition_note: 'Mantenimiento. Proteína 1.4-1.6g/kg. Omega-3 + vitamina D + multivit. Variedad real.',
      week: [
        {
          day: 'Lunes — Full body A',
          blocks: [
            { name: 'Sentadilla con barra o goblet', sets: 3, reps: '10', rir: 2, rest: '90 seg' },
            { name: 'Press banca mancuernas', sets: 3, reps: '10', rir: 2, rest: '90 seg' },
            { name: 'Remo una mano', sets: 3, reps: '12/lado', rir: 2, rest: '90 seg' },
            { name: 'Press militar sentado', sets: 3, reps: '10', rir: 2, rest: '90 seg' },
            { name: 'Plancha + dead bug', sets: 3, reps: '45 seg', rir: '-', rest: '45 seg' }
          ]
        },
        { day: 'Martes — 30 min caminata rápida + movilidad 10 min', blocks: [] },
        {
          day: 'Miércoles — Full body B',
          blocks: [
            { name: 'Peso muerto rumano con mancuernas', sets: 3, reps: '10', rir: 2, rest: '90 seg' },
            { name: 'Dominadas asistidas o jalón', sets: 3, reps: '10', rir: 2, rest: '90 seg' },
            { name: 'Press inclinado', sets: 3, reps: '10', rir: 2, rest: '90 seg' },
            { name: 'Hip thrust', sets: 3, reps: '12', rir: 2, rest: '90 seg' },
            { name: 'Curl + triceps', sets: 2, reps: '12 c/u', rir: 1, rest: '60 seg' }
          ]
        },
        { day: 'Jueves — 45 min bici/cinta zona 2', blocks: [] },
        {
          day: 'Viernes — Full body C',
          blocks: [
            { name: 'Goblet squat', sets: 3, reps: '12', rir: 2, rest: '90 seg' },
            { name: 'Remo sentado polea', sets: 3, reps: '12', rir: 2, rest: '90 seg' },
            { name: 'Press mancuernas pecho', sets: 3, reps: '12', rir: 2, rest: '90 seg' },
            { name: 'Zancadas alternadas', sets: 3, reps: '10/pierna', rir: 2, rest: '90 seg' },
            { name: 'Face pulls', sets: 3, reps: '15', rir: 1, rest: '45 seg' }
          ]
        },
        { day: 'Sábado — Actividad que disfrutes (senderismo, bici, natación, yoga)', blocks: [] },
        { day: 'Domingo — Descanso', blocks: [] }
      ],
      supplements_priority: ['multivitamin', 'omega3', 'whey', 'collagen']
    },

    // 7) PRINCIPIANTE ABSOLUTO
    principiante: {
      id: 'principiante',
      name: 'Principiante Absoluto',
      icon: '🌱',
      goal: 'Primera rutina — construir hábito y base técnica',
      level: 'principiante',
      duration: '8 semanas iniciales',
      frequency: '3 días/semana (lun/mié/vie)',
      split: 'Full body A/B alternando',
      cardio: 'Caminar 20-30 min los días libres',
      rir: 'RIR 3-4 (foco en técnica, NO llegar al fallo)',
      nutrition_note: 'Ligero déficit o mantenimiento. 3 comidas + 1 snack. Proteína 1.2-1.6g/kg.',
      week: [
        {
          day: 'Lunes — Full body A',
          blocks: [
            { name: 'Sentadilla con mancuernas (goblet)', sets: 3, reps: '10-12', rir: 3, rest: '90 seg', notes: 'Técnica > peso' },
            { name: 'Press banca con mancuernas', sets: 3, reps: '10-12', rir: 3, rest: '90 seg' },
            { name: 'Remo sentado polea', sets: 3, reps: '10-12', rir: 3, rest: '90 seg' },
            { name: 'Press militar sentado mancuernas', sets: 3, reps: '10-12', rir: 3, rest: '90 seg' },
            { name: 'Plancha frontal', sets: 3, reps: '30 seg', rir: '-', rest: '45 seg' }
          ]
        },
        { day: 'Martes — Caminar 25 min', blocks: [] },
        {
          day: 'Miércoles — Full body B',
          blocks: [
            { name: 'Peso muerto rumano mancuernas', sets: 3, reps: '10-12', rir: 3, rest: '90 seg', notes: 'Cuidar espalda recta' },
            { name: 'Jalón al pecho', sets: 3, reps: '10-12', rir: 3, rest: '90 seg' },
            { name: 'Press inclinado mancuernas', sets: 3, reps: '10-12', rir: 3, rest: '90 seg' },
            { name: 'Elevación lateral', sets: 3, reps: '12-15', rir: 2, rest: '60 seg' },
            { name: 'Crunch + plancha lateral', sets: 3, reps: '15 + 30s', rir: '-', rest: '45 seg' }
          ]
        },
        { day: 'Jueves — Caminar 25 min', blocks: [] },
        {
          day: 'Viernes — Full body A (progresión)',
          blocks: [
            { name: 'Sentadilla goblet', sets: 3, reps: '12', rir: 3, rest: '90 seg' },
            { name: 'Press banca mancuernas', sets: 3, reps: '12', rir: 3, rest: '90 seg' },
            { name: 'Remo polea', sets: 3, reps: '12', rir: 3, rest: '90 seg' },
            { name: 'Press militar', sets: 3, reps: '12', rir: 3, rest: '90 seg' },
            { name: 'Curl + triceps', sets: 2, reps: '12 c/u', rir: 2, rest: '60 seg' }
          ]
        },
        { day: 'Sábado — Caminar o clase que te guste (zumba, yoga)', blocks: [] },
        { day: 'Domingo — Descanso total', blocks: [] }
      ],
      supplements_priority: ['whey', 'multivitamin', 'creatine']
    },

    // 8) FUERZA MÁXIMA (powerlifting)
    fuerza: {
      id: 'fuerza',
      name: 'Fuerza Máxima',
      icon: '🏋️',
      goal: 'Maximizar 1RM en sentadilla, banca, peso muerto',
      level: 'intermedio-avanzado',
      duration: '12 semanas (bloque Sheiko/5x5 híbrido)',
      frequency: '4 días/semana',
      split: 'SBD (Squat / Bench / Deadlift) especializado',
      cardio: 'Mínimo — 1x caminata 30 min',
      rir: 'RIR 3-5 (intensidades 75-90% 1RM)',
      nutrition_note: 'Ligero superávit. Proteína 2g/kg. Carbs pre-entreno altos para energía.',
      week: [
        {
          day: 'Lunes — Sentadilla pesada',
          blocks: [
            { name: 'Sentadilla trasera', sets: 5, reps: '3', rir: 3, rest: '4 min', notes: '85% 1RM' },
            { name: 'Sentadilla pausa 2s', sets: 3, reps: '5', rir: 3, rest: '3 min', notes: '70%' },
            { name: 'Peso muerto rumano', sets: 4, reps: '6', rir: 2, rest: '2 min' },
            { name: 'Remo pendlay', sets: 4, reps: '6', rir: 2, rest: '2 min' },
            { name: 'Core ponderado: ab wheel', sets: 3, reps: '10', rir: 1, rest: '60 seg' }
          ]
        },
        {
          day: 'Martes — Press banca pesado',
          blocks: [
            { name: 'Press banca', sets: 5, reps: '3', rir: 3, rest: '4 min', notes: '85%' },
            { name: 'Press banca pausa', sets: 3, reps: '5', rir: 2, rest: '3 min', notes: '70%' },
            { name: 'Press militar', sets: 4, reps: '5', rir: 2, rest: '2 min' },
            { name: 'Dominadas lastradas', sets: 4, reps: '5', rir: 2, rest: '2 min' },
            { name: 'Triceps cerrado + curl', sets: 3, reps: '8 c/u', rir: 1, rest: '60 seg' }
          ]
        },
        { day: 'Miércoles — Descanso', blocks: [] },
        {
          day: 'Jueves — Peso muerto pesado',
          blocks: [
            { name: 'Peso muerto convencional', sets: 5, reps: '2', rir: 3, rest: '4 min', notes: '87%' },
            { name: 'Deficit deadlift', sets: 3, reps: '5', rir: 2, rest: '3 min' },
            { name: 'Sentadilla frontal', sets: 4, reps: '5', rir: 3, rest: '3 min' },
            { name: 'Remo T-bar', sets: 3, reps: '8', rir: 2, rest: '2 min' },
            { name: 'Gemelos + core', sets: 3, reps: '12 + 15', rir: 1, rest: '60 seg' }
          ]
        },
        {
          day: 'Viernes — Accesorios banca',
          blocks: [
            { name: 'Press banca (CAT speed)', sets: 6, reps: '3 explosivos', rir: '-', rest: '90 seg', notes: '65% velocidad máxima' },
            { name: 'Press inclinado mancuernas', sets: 4, reps: '8', rir: 2, rest: '2 min' },
            { name: 'Press militar push press', sets: 4, reps: '5', rir: 2, rest: '2 min' },
            { name: 'Remo Kroc (1 brazo pesado)', sets: 3, reps: '12/brazo', rir: 2, rest: '90 seg' },
            { name: 'Triceps + face pulls', sets: 3, reps: '10 + 15', rir: 1, rest: '60 seg' }
          ]
        },
        { day: 'Sábado — Descanso o caminata 30min', blocks: [] },
        { day: 'Domingo — Descanso', blocks: [] }
      ],
      supplements_priority: ['creatine', 'whey', 'pre_workout', 'glutamine', 'multivitamin']
    },

    // 9) GLÚTEOS / TREN INFERIOR
    gluteos: {
      id: 'gluteos',
      name: 'Glúteos / Tren Inferior',
      icon: '🍑',
      goal: 'Máximo desarrollo de glúteo + piernas firmes',
      level: 'intermedio',
      duration: '10 semanas',
      frequency: '5 días (3 dedicados a glúteo + 2 upper)',
      split: 'Glúteo A / Upper / Glúteo B / Upper / Glúteo C',
      cardio: 'LISS 2-3x / semana 25-30 min',
      rir: 'RIR 0-2 en glúteo (máximo estímulo)',
      nutrition_note: 'Ligero superávit o mantenimiento. Proteína 1.8g/kg. Carbs para bombeo.',
      week: [
        {
          day: 'Lunes — Glúteo A (pesado)',
          blocks: [
            { name: 'Hip thrust barra', sets: 5, reps: '6-8', rir: 1, rest: '2 min' },
            { name: 'Sentadilla trasera', sets: 4, reps: '8-10', rir: 2, rest: '2 min' },
            { name: 'Búlgara con mancuernas', sets: 4, reps: '10/pierna', rir: 1, rest: '90 seg' },
            { name: 'Peso muerto rumano', sets: 4, reps: '10', rir: 1, rest: '90 seg' },
            { name: 'Abductor máquina', sets: 4, reps: '15-20', rir: 0, rest: '45 seg' }
          ]
        },
        {
          day: 'Martes — Upper + cardio 20 min',
          blocks: [
            { name: 'Press banca mancuernas', sets: 3, reps: '10', rir: 2, rest: '90 seg' },
            { name: 'Remo polea', sets: 3, reps: '10', rir: 2, rest: '90 seg' },
            { name: 'Press militar', sets: 3, reps: '10', rir: 2, rest: '90 seg' },
            { name: 'Curl + triceps', sets: 3, reps: '12 c/u', rir: 1, rest: '60 seg' },
            { name: 'LISS 20 min', sets: 1, reps: '20 min', rir: '-', rest: '-' }
          ]
        },
        {
          day: 'Miércoles — Glúteo B (volumen)',
          blocks: [
            { name: 'Hip thrust máquina o pies elevados', sets: 4, reps: '12-15', rir: 1, rest: '90 seg' },
            { name: 'Peso muerto rumano con banda', sets: 4, reps: '12', rir: 1, rest: '90 seg' },
            { name: 'Patada polea + abducción', sets: 4, reps: '15 + 15', rir: 0, rest: '60 seg' },
            { name: 'Cable pull-through', sets: 3, reps: '15', rir: 0, rest: '60 seg' },
            { name: 'Puente glúteo banda', sets: 3, reps: '20', rir: 0, rest: '45 seg' }
          ]
        },
        {
          day: 'Jueves — Upper ligero',
          blocks: [
            { name: 'Jalón agarre neutro', sets: 3, reps: '12', rir: 1, rest: '90 seg' },
            { name: 'Press inclinado mancuernas', sets: 3, reps: '12', rir: 1, rest: '90 seg' },
            { name: 'Elevación lateral + face pulls', sets: 3, reps: '15 + 15', rir: 0, rest: '60 seg' },
            { name: 'LISS 25 min', sets: 1, reps: '25 min', rir: '-', rest: '-' }
          ]
        },
        {
          day: 'Viernes — Glúteo C (metabólico)',
          blocks: [
            { name: 'Hip thrust 3s pausa', sets: 4, reps: '10', rir: 0, rest: '60 seg' },
            { name: 'Frog pump', sets: 4, reps: '20', rir: 0, rest: '45 seg' },
            { name: 'Walking lunges mancuernas', sets: 3, reps: '20 pasos', rir: 1, rest: '90 seg' },
            { name: 'Abducción banda + kickback', sets: 4, reps: '20 c/u', rir: 0, rest: '45 seg' },
            { name: 'Drop set sentadilla goblet', sets: 3, reps: '15+10+6', rir: 0, rest: '2 min' }
          ]
        },
        { day: 'Sábado — Descanso activo / caminar', blocks: [] },
        { day: 'Domingo — Descanso', blocks: [] }
      ],
      supplements_priority: ['whey', 'creatine', 'collagen', 'multivitamin']
    },

    // 10) RECOMP (pérdida grasa + ganancia músculo simultánea)
    recomposicion: {
      id: 'recomposicion',
      name: 'Recomposición Corporal',
      icon: '⚖️',
      goal: 'Perder grasa y ganar músculo a la vez (posible en principiantes, retorno, sobrepeso)',
      level: 'principiante-intermedio',
      duration: '16 semanas',
      frequency: '5 días',
      split: 'Upper / Lower / Upper / Lower / Full body metabólico',
      cardio: 'HIIT 1x + LISS 2x / semana',
      rir: 'RIR 1-2',
      nutrition_note: 'Mantenimiento calórico con proteína MUY alta (2.4-2.8g/kg). Carbs peri-entreno. Grasas 0.8g/kg. Dormir 8h.',
      week: [
        {
          day: 'Lunes — Upper fuerza',
          blocks: [
            { name: 'Press banca', sets: 4, reps: '6-8', rir: 2, rest: '2 min' },
            { name: 'Remo barra', sets: 4, reps: '6-8', rir: 2, rest: '2 min' },
            { name: 'Press militar', sets: 4, reps: '8-10', rir: 1, rest: '90 seg' },
            { name: 'Dominadas asistidas', sets: 4, reps: '8', rir: 1, rest: '90 seg' },
            { name: 'Curl + triceps', sets: 3, reps: '10 c/u', rir: 1, rest: '60 seg' }
          ]
        },
        {
          day: 'Martes — Lower fuerza + LISS 20',
          blocks: [
            { name: 'Sentadilla', sets: 4, reps: '6-8', rir: 2, rest: '2 min' },
            { name: 'Peso muerto rumano', sets: 4, reps: '8', rir: 2, rest: '2 min' },
            { name: 'Prensa', sets: 3, reps: '10', rir: 1, rest: '90 seg' },
            { name: 'Hip thrust', sets: 3, reps: '10', rir: 1, rest: '90 seg' },
            { name: 'LISS 20 min', sets: 1, reps: '20 min', rir: '-', rest: '-' }
          ]
        },
        {
          day: 'Miércoles — HIIT 20 min + abs',
          blocks: [
            { name: 'HIIT bici 30/90', sets: 8, reps: '-', rir: '-', rest: '-' },
            { name: 'Plancha + dead bug + ab wheel', sets: 3, reps: '45s + 10 + 8', rir: '-', rest: '60 seg' }
          ]
        },
        {
          day: 'Jueves — Upper hipertrofia',
          blocks: [
            { name: 'Press inclinado mancuernas', sets: 4, reps: '10-12', rir: 1, rest: '90 seg' },
            { name: 'Jalón agarre ancho', sets: 4, reps: '10-12', rir: 1, rest: '90 seg' },
            { name: 'Press Arnold', sets: 3, reps: '12', rir: 1, rest: '90 seg' },
            { name: 'Remo mancuerna 1 brazo', sets: 3, reps: '12/lado', rir: 1, rest: '90 seg' },
            { name: 'Triset: elevación lateral + curl + triceps', sets: 3, reps: '12 c/u', rir: 0, rest: '60 seg' }
          ]
        },
        {
          day: 'Viernes — Lower hipertrofia + LISS',
          blocks: [
            { name: 'Hip thrust', sets: 4, reps: '10-12', rir: 1, rest: '90 seg' },
            { name: 'Búlgara', sets: 4, reps: '10/pierna', rir: 1, rest: '90 seg' },
            { name: 'Extensión cuádriceps', sets: 3, reps: '12-15', rir: 0, rest: '60 seg' },
            { name: 'Femoral sentado', sets: 3, reps: '12-15', rir: 0, rest: '60 seg' },
            { name: 'Gemelo + LISS 20 min', sets: 1, reps: '-', rir: '-', rest: '-' }
          ]
        },
        { day: 'Sábado — Descanso activo (movilidad + caminata)', blocks: [] },
        { day: 'Domingo — Descanso', blocks: [] }
      ],
      supplements_priority: ['whey', 'creatine', 'l_carnitine', 'multivitamin', 'omega3']
    }
  }
};

// ─── Helpers ───
function getRoutine(goalId) {
  return EXERCISE_KB.routines[goalId] || null;
}

function listRoutines() {
  return Object.values(EXERCISE_KB.routines).map(r => ({
    id: r.id, name: r.name, icon: r.icon, goal: r.goal, level: r.level,
    duration: r.duration, frequency: r.frequency
  }));
}

function detectGoalFromText(text = '') {
  const t = text.toLowerCase();
  if (/baj(ar|o)|adelga|perd(er|ida)|quema|reducir grasa|fat loss/.test(t)) return 'bajar_peso';
  if (/defin(ir|ici)|ton(o|ificar)|marcado|cortar|shred/.test(t)) return 'definicion';
  if (/fuerza|powerlift|1rm|maxim(o|al)/.test(t)) return 'fuerza';
  if (/principi(ante)?|nuevo|empezar|inici(ar|ando)/.test(t)) return 'principiante';
  if (/musculo|masa|hipertrof|muscul(oso|ar)/.test(t)) return 'ganar_musculo';
  if (/subir|gan(ar|a) peso|engord|volum(en)?|bulk/.test(t)) return 'subir_peso';
  if (/rendimi|atlet|velocid|potencia|crossfit|triathlon|funcional|deport/.test(t)) return 'rendimiento';
  if (/salud|bienestar|energi(a)?|longev|sano/.test(t)) return 'salud_general';
  if (/glut(e|é)o|pompi|cola|pierna/.test(t)) return 'gluteos';
  if (/recomp|perder grasa y ganar|a la vez|simultaneo/.test(t)) return 'recomposicion';
  return null;
}

function formatRoutineShort(goalId) {
  const r = getRoutine(goalId);
  if (!r) return '';
  return `${r.icon} ${r.name} (${r.duration}, ${r.frequency}): ${r.week.slice(0,3).map(d => d.day).join(' · ')}…`;
}

function getExerciseContext() {
  const lines = ['═══ PROGRAMAS DE ENTRENAMIENTO DISPONIBLES (Dr. Lab 2026) ═══'];
  Object.values(EXERCISE_KB.routines).forEach(r => {
    lines.push(`- ${r.icon} ${r.name} (${r.id}): ${r.goal} | ${r.frequency} | ${r.level}`);
  });
  lines.push('\nPRINCIPIOS: ' + Object.values(EXERCISE_KB.principles).slice(0,3).join(' | '));
  lines.push('Cuando recomiendes un plan, menciona el ID entre corchetes: [ROUTINE:bajar_peso]');
  return lines.join('\n');
}

module.exports = {
  EXERCISE_KB,
  getRoutine,
  listRoutines,
  detectGoalFromText,
  formatRoutineShort,
  getExerciseContext
};
