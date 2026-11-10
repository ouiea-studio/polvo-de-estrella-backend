// Estado en memoria de la sala global y las reglas que lo modifican.
// Las funciones lanzan un Error con un mensaje en español si algo no es válido.
// El servidor es la autoridad sobre la vida de cada módulo (inactividad, disolución, límite por
// dispositivo, final de la obra) y sobre su física (choques): ver paso().

const PALETA = ['#ff3fa4', '#2fe6ff', '#ffc247']; // magenta, cian, dorado
const TIPOS = ['percusion', 'armonia', 'melodia'];
const SUBDIVISIONES = ['corchea', 'tresillo', 'semicorchea', 'quintillo'];
const NOTAS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
// Tonalidad (12 notas) × modo: los siete modos griegos y las dos pentatónicas (10 de noviembre de 2026)
const MODOS = ['jonico', 'dorico', 'frigio', 'lidio', 'mixolidio', 'eolico', 'locrio', 'pentatonica_mayor', 'pentatonica_menor'];
const ALIAS_MODO = { mayor: 'jonico', menor: 'eolico' };
const RADIO_MAX = 12; // las piezas no pueden salir de este radio
const TEMPO_MIN = 40;
const TEMPO_MAX = 240;

const GRADOS = 7; // filas de la cuadrícula de armonía y melodía: grados 0 a 6 de la escala global

// Parámetros por tipo de instrumento: una lista de opciones o un rango [mínimo, máximo].
// Lo que llegue fuera de rango se recorta; las claves desconocidas se ignoran.
// Sin volumen: el volumen lo define la distancia al centro. El envío al subgrave (LFE) lo decide
// el frontend según el instrumento.
// FX: uno solo activo por instrumento. reverb y delay son envíos a los efectos compartidos;
// phaser es un efecto propio del instrumento. cantidad: 0 a 1.
const FX = { fx: ['reverb', 'delay', 'phaser'], cantidad: [0, 1] };
// Amplitud (Env): un macro de 0 (pluck: ataque y release cortos, sustain bajo) a 1 (pad: todo largo).
// LFO junto a un parámetro: un solo valor 0–1 (0 = apagado; más = más profundo y más rápido) y su forma.
// Espacio: −100 a +100, la gema gira alrededor de su lugar (el signo decide el sentido).
const FORMAS_LFO = ['seno', 'azar', 'sierra'];
const LFO_FILTRO = { lfoFiltro: [0, 1], lfoFiltroForma: FORMAS_LFO };
const LFO_ENV = { lfoEnv: [0, 1], lfoEnvForma: FORMAS_LFO };
const ESPACIO = { espacio: [-100, 100] };
const ESQUEMA = {
  // pitch: semitonos (Tono) · decay: segundos (Golpe)
  // (sin LFO: el de Golpe se quitó el 10 de noviembre)
  percusion: { sonido: ['kick', 'snare', 'hat', 'perc'], pitch: [-12, 12], decay: [0.02, 1.5], ...FX, ...ESPACIO },
  // voicing: 0 cerrado → 1 abierto · filtro: 0 cerrado (≈150 Hz, resonante) → 1 abierto (sin filtrar)
  armonia: { voicing: [0, 1], filtro: [0, 1], envolvente: [0, 1], ...FX, ...LFO_FILTRO, ...LFO_ENV, ...ESPACIO },
  // octava: −1, 0 o +1 respecto de la octava 4
  melodia: { octava: [-1, 1], filtro: [0, 1], envolvente: [0, 1], ...FX, ...LFO_FILTRO, ...LFO_ENV, ...ESPACIO },
};
const ENTEROS = new Set(['pitch', 'octava', 'espacio']);
const LFO_APAGADO = { lfoFiltro: 0, lfoFiltroForma: 'seno', lfoEnv: 0, lfoEnvForma: 'seno', espacio: 0 };

// Valores por defecto: cada módulo suena bien en cuanto se acopla.
// La percusión rota entre kick, hat, snare y perc según cuántas haya ya en la sala.
const SONIDOS_EN_ORDEN = ['kick', 'hat', 'snare', 'perc'];
const DECAY_PERC = { kick: 0.4, snare: 0.18, hat: 0.05, perc: 0.25 };
const FX_PERC = { // el kick casi seco; snare con sala; hat y perc con eco
  kick: { fx: 'reverb', cantidad: 0.05 },
  snare: { fx: 'reverb', cantidad: 0.25 },
  hat: { fx: 'delay', cantidad: 0.15 },
  perc: { fx: 'delay', cantidad: 0.3 },
};
const PATRON_PERC = { // x = golpe, en 16 semicorcheas (un compás)
  kick: 'x...x...x...x...',
  hat: '..x...x...x...x.',
  snare: '....x.......x...',
  perc: '...x..x....x.x..',
};
const _ = null; // paso sin nota
const POR_DEFECTO = {
  armonia: () => ({ // i – VI – iv – v en corcheas: un acorde cada medio compás, dos compases
    pasos: 16, subdivision: 'corchea',
    patron: [0, _, _, _, 5, _, _, _, 3, _, _, _, 4, _, _, _],
    parametros: { voicing: 0.3, filtro: 0.5, envolvente: 0.6, fx: 'reverb', cantidad: 0.45, ...LFO_APAGADO },
  }),
  melodia: () => ({ // arpegio en semicorcheas que sigue los acordes de la armonía, dos compases
    pasos: 32, subdivision: 'semicorchea',
    patron: [4, _, 2, _, 0, _, 2, 4, 5, _, 4, _, 2, _, 0, _, 3, _, 5, _, 0, _, 5, 3, 4, _, 6, _, 1, _, 6, 4],
    parametros: { octava: 0, filtro: 0.6, envolvente: 0.3, fx: 'delay', cantidad: 0.3, ...LFO_APAGADO },
  }),
  percusion: () => {
    const cuantas = estado.instrumentos.filter((i) => i.tipo === 'percusion').length;
    const sonido = SONIDOS_EN_ORDEN[cuantas % SONIDOS_EN_ORDEN.length];
    return {
      pasos: 16, subdivision: 'semicorchea',
      patron: [...PATRON_PERC[sonido]].map((c) => c === 'x'),
      parametros: { sonido, pitch: 0, decay: DECAY_PERC[sonido], ...FX_PERC[sonido], espacio: 0 },
    };
  },
};

// Ajustes del director (segundos): sin interacción antes de disolverse, duración de la disolución
// y duración del final de la obra.
const RANGO_AJUSTES = { inactividad: [3, 600], disolucion: [1, 30], final: [5, 120] };
const MAX_VIVOS = 3; // módulos vivos por dispositivo (tripulante)

// RELOJ COMPARTIDO (10 nov): el servidor es la referencia del pulso. ancla = { t0, pulsos0, bpm }:
// en el instante t0 (ms del reloj del servidor) el pulso iba en pulsos0 negras y desde ahí avanza a
// bpm. Cada cliente mide su desfase con el servidor y alinea su secuenciador y sus LFO a este pulso.
// Al cambiar el tempo se fija un ancla nueva en ese instante: el pulso sigue sin saltos (en fase).
const ahoraMs = () => performance.timeOrigin + performance.now();
const pulsosEn = (reloj, ms) => reloj.pulsos0 + (ms - reloj.t0) / 60000 * reloj.bpm;

const estado = {
  tempo: 70, // al iniciar la estación: 70 BPM en Re dórico (10 nov)
  reloj: { t0: ahoraMs(), pulsos0: 0, bpm: 70 },
  escala: { tonica: 'D', modo: 'dorico' },
  tripulantes: [],
  instrumentos: [],
  ajustes: { inactividad: 45, disolucion: 2.5, final: 20 },
  obra: 'abierta', // 'abierta' | 'finalizando' | 'cerrada'
};
// Datos internos que no se envían: física y tiempos de cada instrumento (id → cuerpo)
const cuerpos = new Map();
let finalHasta = 0;

let contadorTripulantes = 0;
let contadorInstrumentos = 0;

// --- Tripulantes ---

function buscarTripulante(id) {
  return estado.tripulantes.find((t) => t.id === id);
}

function mezclarColores(a, b, t) {
  const ca = parseInt(a.slice(1), 16);
  const cb = parseInt(b.slice(1), 16);
  const canal = (c, s) => (c >> s) & 255;
  const mix = (s) => Math.round(canal(ca, s) + (canal(cb, s) - canal(ca, s)) * t);
  return '#' + ((mix(16) << 16) | (mix(8) << 8) | mix(0)).toString(16).padStart(6, '0');
}

// Primero usa los tres colores puros; si ya están ocupados, genera mezclas
// entre ellos (siempre dentro de la paleta) hasta encontrar uno libre.
function colorLibre() {
  const usados = new Set(estado.tripulantes.map((t) => t.color));
  for (const c of PALETA) if (!usados.has(c)) return c;
  for (let divisiones = 2; divisiones < 64; divisiones *= 2) {
    for (let k = 1; k < divisiones; k += 2) {
      for (let i = 0; i < PALETA.length; i++) {
        const c = mezclarColores(PALETA[i], PALETA[(i + 1) % PALETA.length], k / divisiones);
        if (!usados.has(c)) return c;
      }
    }
  }
  return PALETA[contadorTripulantes % PALETA.length];
}

function agregarTripulante(id) {
  contadorTripulantes += 1;
  const tripulante = {
    id,
    indicativo: 'TRIPULANTE ' + String(contadorTripulantes).padStart(2, '0'),
    color: colorLibre(),
  };
  estado.tripulantes.push(tripulante);
  return tripulante;
}

// Quita al tripulante y todos sus instrumentos. Devuelve lo eliminado.
function quitarTripulante(id) {
  const tripulante = buscarTripulante(id);
  if (!tripulante) return null;
  estado.tripulantes = estado.tripulantes.filter((t) => t.id !== id);
  const instrumentosEliminados = estado.instrumentos.filter((i) => i.dueno === id).map((i) => i.id);
  estado.instrumentos = estado.instrumentos.filter((i) => i.dueno !== id);
  instrumentosEliminados.forEach((i) => cuerpos.delete(i));
  return { id, instrumentosEliminados };
}

// --- Validación ---

function numero(valor, nombre) {
  const n = Number(valor);
  if (valor === null || valor === '' || !Number.isFinite(n)) throw new Error(`${nombre} debe ser un número`);
  return n;
}

function limitarAlRadio(x, z) {
  const d = Math.hypot(x, z);
  if (d <= RADIO_MAX) return { x, z };
  return { x: (x / d) * RADIO_MAX, z: (z / d) * RADIO_MAX };
}

function validarPasos(pasos) {
  const n = numero(pasos, 'pasos');
  if (!Number.isInteger(n) || n < 1 || n > 32) throw new Error('pasos debe ser un entero entre 1 y 32');
  return n;
}

// Un paso del patrón. Percusión: encendido/apagado. Armonía y melodía: un grado (0 a 6) o null.
function limpiarPaso(tipo, valor) {
  if (tipo === 'percusion') return Boolean(valor);
  if (valor === null || valor === undefined || valor === false) return null;
  const g = Number(valor);
  return Number.isInteger(g) && g >= 0 && g < GRADOS ? g : null;
}

// Ajusta el patrón al número de pasos. Si se da un patrón nuevo, se recorta o se rellena
// con silencio; si solo cambia el número de pasos, el patrón actual se repite para llenar.
function ajustarPatron(tipo, patron, pasos, repetir = false) {
  const base = Array.isArray(patron) ? patron.map((v) => limpiarPaso(tipo, v)) : [];
  const vacio = tipo === 'percusion' ? false : null;
  return Array.from({ length: pasos }, (_, i) => {
    if (i < base.length) return base[i];
    return repetir && base.length ? base[i % base.length] : vacio;
  });
}

// Aplica los cambios de parámetros según ESQUEMA: opciones válidas y números dentro de su rango.
function mezclarParametros(tipo, actuales, cambios) {
  if (!cambios || typeof cambios !== 'object') return actuales;
  const resultado = { ...actuales };
  for (const [clave, valor] of Object.entries(cambios)) {
    const regla = ESQUEMA[tipo][clave];
    if (!regla) continue;
    if (typeof regla[0] === 'string') {
      if (regla.includes(valor)) resultado[clave] = valor;
    } else if (valor !== null && valor !== '' && Number.isFinite(Number(valor))) {
      let n = Math.min(regla[1], Math.max(regla[0], Number(valor)));
      if (ENTEROS.has(clave)) n = Math.round(n);
      resultado[clave] = n;
    }
  }
  return resultado;
}

// --- Instrumentos ---

function buscarPropio(duenoId, id) {
  const instrumento = estado.instrumentos.find((i) => i.id === id);
  if (!instrumento) throw new Error('El instrumento no existe');
  if (instrumento.dueno !== duenoId) throw new Error('Solo el dueño puede modificar este instrumento');
  return instrumento;
}

function agregarInstrumento(duenoId, datos, ahora = Date.now()) {
  if (estado.obra !== 'abierta') throw new Error('La estación está cerrada');
  if (!TIPOS.includes(datos.tipo)) throw new Error('tipo debe ser percusion, armonia o melodia');
  const tipo = datos.tipo;
  const base = POR_DEFECTO[tipo]();
  // Efecto al nacer: cada módulo nuevo empieza con un FX al azar (reverb, delay o phaser), ya
  // activado, con poca cantidad (10 % a 25 %). Si el cliente manda fx o cantidad, mandan esos.
  base.parametros.fx = FX.fx[Math.floor(Math.random() * FX.fx.length)];
  base.parametros.cantidad = Math.round((0.1 + 0.15 * Math.random()) * 100) / 100;
  // la percusión con delay nace con cantidad 0 (los ecos de un golpe ensucian el pulso)
  if (tipo === 'percusion' && base.parametros.fx === 'delay') base.parametros.cantidad = 0;
  const pasos = datos.pasos === undefined ? base.pasos : validarPasos(datos.pasos);
  const { x, z } = limitarAlRadio(
    datos.x === undefined ? 0 : numero(datos.x, 'x'),
    datos.z === undefined ? 0 : numero(datos.z, 'z'),
  );
  contadorInstrumentos += 1;
  const instrumento = {
    id: 'inst-' + contadorInstrumentos,
    tipo,
    dueno: duenoId,
    x,
    z,
    pasos,
    subdivision: SUBDIVISIONES.includes(datos.subdivision) ? datos.subdivision : base.subdivision,
    patron: ajustarPatron(tipo, datos.patron !== undefined ? datos.patron : base.patron, pasos, datos.patron === undefined),
    parametros: mezclarParametros(tipo, base.parametros, datos.parametros),
    disolucion: null, // { duracion, motivo } mientras se disuelve
  };
  estado.instrumentos.push(instrumento);
  cuerpos.set(instrumento.id, {
    vx: 0, vz: 0, creado: ahora, ultima: ahora, disuelveDesde: 0, arrastre: null, enviado: { x, z },
    angulo: Math.random() * Math.PI * 2, radio: 0, factor: 1, ox: 0, oz: 0, ovx: 0, ovz: 0, // giro de "Espacio"
  });
  // límite: si con este hay más de 3 vivos, el más antiguo empieza a disolverse
  const disueltos = aplicarLimite(duenoId, instrumento.id, ahora);
  return { instrumento, disueltos };
}

// --- Vida de los módulos ---

const vivo = (i) => !i.disolucion;
function empezarDisolucion(instrumento, duracion, motivo, ahora) {
  instrumento.disolucion = { duracion, motivo };
  const c = cuerpos.get(instrumento.id);
  c.disuelveDesde = ahora;
  c.vx = c.vz = 0;
  return { id: instrumento.id, duracion, motivo };
}
// Más de MAX_VIVOS vivos del mismo dueño → el más antiguo (salvo el que se acaba de tocar) se disuelve.
function aplicarLimite(duenoId, exceptoId, ahora) {
  const disueltos = [];
  let vivos = estado.instrumentos.filter((i) => i.dueno === duenoId && vivo(i));
  while (vivos.length > MAX_VIVOS) {
    const candidatos = vivos.filter((i) => i.id !== exceptoId)
      .sort((a, b) => cuerpos.get(a.id).creado - cuerpos.get(b.id).creado);
    disueltos.push(empezarDisolucion(candidatos[0], estado.ajustes.disolucion, 'limite', ahora));
    vivos = vivos.filter((i) => i !== candidatos[0]);
  }
  return disueltos;
}
// Interacción del dueño (seleccionar, arrastrar, editar): reinicia el reloj de inactividad y, si se
// estaba disolviendo, lo revive (salvo durante el final de la obra). Devuelve qué cambió.
function interaccion(duenoId, id, ahora = Date.now()) {
  const instrumento = buscarPropio(duenoId, id);
  cuerpos.get(id).ultima = ahora;
  if (vivo(instrumento) || estado.obra !== 'abierta') return { revive: false, disueltos: [] };
  instrumento.disolucion = null;
  return { revive: true, disueltos: aplicarLimite(duenoId, id, ahora) };
}

// Cambia pasos, subdivisión, patrón y/o parámetros. No cambia tipo, dueño ni posición.
function editarInstrumento(duenoId, id, cambios) {
  const instrumento = buscarPropio(duenoId, id);
  if (cambios.pasos !== undefined) instrumento.pasos = validarPasos(cambios.pasos);
  if (cambios.subdivision !== undefined) {
    if (!SUBDIVISIONES.includes(cambios.subdivision)) throw new Error('subdivisión no válida');
    instrumento.subdivision = cambios.subdivision;
  }
  const patronNuevo = cambios.patron !== undefined;
  instrumento.patron = ajustarPatron(
    instrumento.tipo,
    patronNuevo ? cambios.patron : instrumento.patron,
    instrumento.pasos,
    !patronNuevo,
  );
  instrumento.parametros = mezclarParametros(instrumento.tipo, instrumento.parametros, cambios.parametros);
  return instrumento;
}

// Arrastre del dueño: la pieza es "cinemática" (empuja a las demás con la velocidad del arrastre).
// final: true al soltar → se queda quieta donde la dejaron.
function moverInstrumento(duenoId, id, x, z, final = false, ahora = Date.now()) {
  const instrumento = buscarPropio(duenoId, id);
  const pos = limitarAlRadio(numero(x, 'x'), numero(z, 'z'));
  const c = cuerpos.get(id);
  const previo = c.arrastre;
  if (previo && ahora > previo.t) {
    const dt = Math.max((ahora - previo.t) / 1000, 0.016);
    const lim = (v) => Math.max(-VEL_MAX, Math.min(VEL_MAX, v));
    c.vx = lim(0.5 * c.vx + 0.5 * (pos.x - instrumento.x) / dt);
    c.vz = lim(0.5 * c.vz + 0.5 * (pos.z - instrumento.z) / dt);
  }
  instrumento.x = pos.x;
  instrumento.z = pos.z;
  if (final) { c.arrastre = null; c.vx = c.vz = 0; } else c.arrastre = { t: ahora };
  return instrumento;
}

function eliminarInstrumento(duenoId, id) {
  buscarPropio(duenoId, id);
  estado.instrumentos = estado.instrumentos.filter((i) => i.id !== id);
  cuerpos.delete(id);
}

// =====================================================================
// FÍSICA (unas 30 veces por segundo): las gemas chocan, rebotan con amortiguación y se asientan.
// Cada gema es un círculo en el plano. El radio sale del tipo y de los parámetros que cambian el
// tamaño de la gema (la MISMA fórmula que usa el frontend en main.js, escalaVisual).
// =====================================================================
const RADIO_BASE = { percusion: 0.62, armonia: 0.74, melodia: 0.66 };
const VEL_MAX = 6;          // unidades por segundo
const FRENO = 2.4;          // amortiguación de la velocidad (1/s)
const RESTITUCION = 0.45;   // cuánto rebota un choque (0 = nada, 1 = elástico)
const CHOQUE_MIN = 0.35;    // velocidad de acercamiento mínima para que suene un choque
const ARRASTRE_VIVO = 300;  // ms sin mensajes de arrastre para darlo por terminado
function escalaVisual(inst) {
  const p = inst.parametros;
  if (inst.tipo === 'percusion') return 2 ** (-(p.pitch || 0) / 12 * 0.35);
  if (inst.tipo === 'melodia') return [1.2, 1, 0.83][(p.octava || 0) + 1];
  return 0.9 + 0.4 * (p.voicing || 0);
}
const radio = (inst) => RADIO_BASE[inst.tipo] * escalaVisual(inst);
const ultimoChoque = new Map(); // 'a|b' → ms

// ESPACIO: la gema gira alrededor de su lugar (su "ancla", que es i.x, i.z). Radio hasta el 35 % del
// radio de la estación en ±100; velocidad al tempo, de 8 compases por vuelta (cerca de 0) a 2 compases
// (en ±100), nunca más rápido. El ángulo se acumula por pieza (cambiar la velocidad no la hace saltar)
// y el radio se suaviza; mientras su dueño la arrastra el giro se recoge (factor → 0) y luego vuelve.
// La posición que ven todos (y que suena en el 5.1) = ancla + giro.
const RADIO_ESPACIO = 0.35 * RADIO_MAX;
function girar(i, c, dt) {
  const v = Math.max(-100, Math.min(100, i.parametros.espacio || 0)) / 100, a = Math.abs(v);
  c.factor += ((c.arrastre ? 0 : 1) - c.factor) * (1 - Math.exp(-dt * 3));
  c.radio += (RADIO_ESPACIO * a - c.radio) * (1 - Math.exp(-dt * 2));
  if (c.radio < 1e-4 && a === 0) { c.radio = 0; c.ox = c.oz = c.ovx = c.ovz = 0; return; }
  const negrasPorVuelta = 32 * (8 / 32) ** a;
  const w = Math.sign(v || 1) * 2 * Math.PI * (estado.tempo / 60) / negrasPorVuelta; // rad/s
  c.angulo += w * dt;
  const r = c.radio * c.factor;
  c.ox = r * Math.cos(c.angulo); c.oz = r * Math.sin(c.angulo);
  c.ovx = -r * w * Math.sin(c.angulo); c.ovz = r * w * Math.cos(c.angulo);
}

function pasoFisica(dt, ahora) {
  const choques = [];
  const activos = estado.instrumentos.filter(vivo);
  for (const i of activos) {
    const c = cuerpos.get(i.id);
    if (c.arrastre && ahora - c.arrastre.t > ARRASTRE_VIVO) { c.arrastre = null; c.vx = c.vz = 0; }
    girar(i, c, dt);
    if (c.arrastre) continue; // la mueve su dueño
    if (c.vx === 0 && c.vz === 0) continue;
    i.x += c.vx * dt;
    i.z += c.vz * dt;
    const f = Math.exp(-FRENO * dt);
    c.vx *= f; c.vz *= f;
    if (Math.hypot(c.vx, c.vz) < 0.02) c.vx = c.vz = 0;
  }
  // choques entre pares (círculos), con la posición visible (ancla + giro); las correcciones
  // y los impulsos van al ancla, así el giro sigue alrededor del lugar nuevo
  for (let a = 0; a < activos.length; a++) {
    for (let b = a + 1; b < activos.length; b++) {
      const A = activos[a], B = activos[b];
      const ca = cuerpos.get(A.id), cb = cuerpos.get(B.id);
      if (ca.arrastre && cb.arrastre) continue;
      let dx = (B.x + cb.ox) - (A.x + ca.ox), dz = (B.z + cb.oz) - (A.z + ca.oz);
      let d = Math.hypot(dx, dz);
      const minimo = radio(A) + radio(B);
      if (d >= minimo) continue;
      if (d < 1e-4) { dx = Math.random() - 0.5; dz = Math.random() - 0.5; d = Math.hypot(dx, dz); }
      const nx = dx / d, nz = dz / d;
      // masa ∝ radio²; la pieza arrastrada es inamovible (masa infinita)
      const ia = ca.arrastre ? 0 : 1 / radio(A) ** 2, ib = cb.arrastre ? 0 : 1 / radio(B) ** 2;
      const suma = ia + ib;
      const solape = minimo - d;
      A.x -= nx * solape * (ia / suma); A.z -= nz * solape * (ia / suma);
      B.x += nx * solape * (ib / suma); B.z += nz * solape * (ib / suma);
      // el giro también cuenta para saber qué tan fuerte chocan
      const acercamiento = -((cb.vx + cb.ovx - ca.vx - ca.ovx) * nx + (cb.vz + cb.ovz - ca.vz - ca.ovz) * nz);
      if (acercamiento > 0) {
        const j = (1 + RESTITUCION) * acercamiento / suma;
        ca.vx -= j * ia * nx; ca.vz -= j * ia * nz;
        cb.vx += j * ib * nx; cb.vz += j * ib * nz;
        const clave = A.id + '|' + B.id;
        if (acercamiento > CHOQUE_MIN && ahora - (ultimoChoque.get(clave) || 0) > 250) {
          ultimoChoque.set(clave, ahora);
          choques.push({ a: A.id, b: B.id, fuerza: +Math.min(1, Math.max(0.15, acercamiento / 4)).toFixed(2) });
        }
      }
    }
  }
  // borde de la estación: la pieza (con su giro) rebota hacia adentro
  for (const i of activos) {
    const c = cuerpos.get(i.id);
    const px = i.x + c.ox, pz = i.z + c.oz, d = Math.hypot(px, pz);
    if (d <= RADIO_MAX) continue;
    const nx = px / d, nz = pz / d, exceso = d - RADIO_MAX;
    i.x -= nx * exceso; i.z -= nz * exceso;
    const v = c.vx * nx + c.vz * nz;
    if (v > 0) { c.vx -= 1.5 * v * nx; c.vz -= 1.5 * v * nz; }
  }
  // posiciones visibles que cambiaron desde el último envío
  const movidos = [];
  for (const i of activos) {
    const c = cuerpos.get(i.id);
    const px = i.x + c.ox, pz = i.z + c.oz;
    if (Math.abs(px - c.enviado.x) > 0.001 || Math.abs(pz - c.enviado.z) > 0.001) {
      c.enviado = { x: px, z: pz };
      movidos.push([i.id, +px.toFixed(3), +pz.toFixed(3)]);
    }
  }
  return { movidos, choques };
}

// Un paso del servidor: física + inactividad + fin de las disoluciones + fin de la obra.
function paso(dt, ahora = Date.now()) {
  const { movidos, choques } = pasoFisica(dt, ahora);
  const disolviendo = [], eliminados = [];
  let cerrada = false;
  for (const i of [...estado.instrumentos]) {
    const c = cuerpos.get(i.id);
    if (vivo(i)) {
      if (estado.obra === 'abierta' && ahora - c.ultima > estado.ajustes.inactividad * 1000) {
        disolviendo.push(empezarDisolucion(i, estado.ajustes.disolucion, 'inactividad', ahora));
      }
    } else if (ahora - c.disuelveDesde >= i.disolucion.duracion * 1000) {
      eliminados.push({ id: i.id, motivo: i.disolucion.motivo });
      estado.instrumentos = estado.instrumentos.filter((x) => x !== i);
      cuerpos.delete(i.id);
    }
  }
  if (estado.obra === 'finalizando' && ahora >= finalHasta) {
    estado.obra = 'cerrada';
    cerrada = true;
  }
  return { movidos, choques, disolviendo, eliminados, cerrada };
}

// Estado completo para quien se une: cada módulo que se disuelve lleva cuánto le falta.
function instantanea(ahora = Date.now()) {
  return {
    ...estado,
    instrumentos: estado.instrumentos.map((i) => (vivo(i) ? i : {
      ...i, disolucion: { ...i.disolucion, restante: Math.max(0, i.disolucion.duracion - (ahora - cuerpos.get(i.id).disuelveDesde) / 1000) },
    })),
  };
}

// --- Director: ajustes y final de la obra ---

function cambiarAjustes(cambios) {
  for (const [clave, [min, max]] of Object.entries(RANGO_AJUSTES)) {
    if (cambios[clave] === undefined) continue;
    estado.ajustes[clave] = Math.min(max, Math.max(min, numero(cambios[clave], clave)));
  }
  return estado.ajustes;
}

// Todas las gemas se disuelven a la vez durante "final" segundos; después la estación queda cerrada.
function iniciarFinal(ahora = Date.now()) {
  if (estado.obra !== 'abierta') throw new Error('La obra ya terminó');
  estado.obra = 'finalizando';
  const duracion = estado.ajustes.final;
  finalHasta = ahora + duracion * 1000;
  const disolviendo = estado.instrumentos.map((i) => empezarDisolucion(i, duracion, 'final', ahora));
  return { duracion, disolviendo };
}
function reabrir() {
  if (estado.obra === 'abierta') throw new Error('La estación ya está abierta');
  if (estado.obra === 'finalizando') throw new Error('Espera a que termine el final');
  estado.obra = 'abierta';
}

// --- Globales (cualquiera puede cambiarlos) ---

function cambiarTempo(tempo) {
  const n = numero(tempo, 'tempo');
  if (n < TEMPO_MIN || n > TEMPO_MAX) throw new Error(`tempo debe estar entre ${TEMPO_MIN} y ${TEMPO_MAX} BPM`);
  estado.tempo = n;
  const t = ahoraMs();
  estado.reloj = { t0: t, pulsos0: pulsosEn(estado.reloj, t), bpm: n };
  return n;
}

function cambiarEscala({ tonica, modo }) {
  const nueva = { ...estado.escala };
  if (tonica !== undefined) {
    if (!NOTAS.includes(tonica)) throw new Error('tónica no válida (usa C, C#, D…)');
    nueva.tonica = tonica;
  }
  if (modo !== undefined) {
    modo = ALIAS_MODO[modo] || modo;
    if (!MODOS.includes(modo)) throw new Error('modo no válido: ' + MODOS.join(', '));
    nueva.modo = modo;
  }
  estado.escala = nueva;
  return nueva;
}

module.exports = {
  ahoraMs,
  estado,
  instantanea,
  paso,
  interaccion,
  cambiarAjustes,
  iniciarFinal,
  reabrir,
  buscarTripulante,
  agregarTripulante,
  quitarTripulante,
  agregarInstrumento,
  editarInstrumento,
  moverInstrumento,
  eliminarInstrumento,
  cambiarTempo,
  cambiarEscala,
};
