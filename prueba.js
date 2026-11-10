// Prueba rápida: conecta dos tripulantes al servidor y revisa las reglas de la sala.
// Uso: con el servidor encendido, `npm test` (o URL=http://... npm test).

const { io } = require('socket.io-client');

const URL = process.env.URL || 'http://localhost:3000';
let fallos = 0;

function revisar(condicion, descripcion) {
  console.log(`${condicion ? 'OK   ' : 'FALLA'} ${descripcion}`);
  if (!condicion) fallos += 1;
}

function conectar() {
  return new Promise((resolve) => {
    const s = io(URL, { transports: ['websocket'] });
    s.on('connect', () => resolve(s));
  });
}

const pedir = (s, evento, datos) => new Promise((resolve) => s.emit(evento, datos, resolve));
const esperar = (s, evento) => new Promise((resolve) => s.once(evento, resolve));

(async () => {
  const salud = await (await fetch(URL + '/api/health')).json();
  revisar(salud.ok === true, '/api/health responde ok');
  const inicial = { tripulantes: salud.tripulantes, instrumentos: salud.instrumentos }; // puede haber otros navegadores conectados

  const a = await conectar();
  const b = await conectar();

  const sinUnirse = await pedir(a, 'tempo:cambiar', { tempo: 100 });
  revisar(!sinUnirse.ok, 'no se puede actuar sin unirse');

  const ua = await pedir(a, 'unirse', {});
  const ub = await pedir(b, 'unirse', {});
  revisar(/^TRIPULANTE \d{2,}$/.test(ua.tu.indicativo), `indicativo: ${ua.tu.indicativo}`);
  revisar(ua.tu.color !== ub.tu.color, `colores distintos: ${ua.tu.color} / ${ub.tu.color}`);

  const avisoB = esperar(b, 'instrumento:agregado');
  const nuevo = await pedir(a, 'instrumento:agregar', { tipo: 'percusion', x: 3, z: -2, pasos: 8 });
  const inst = nuevo.instrumento;
  revisar(nuevo.ok && inst.patron.length === 8, 'A agrega percusión de 8 pasos');
  revisar((await avisoB).id === inst.id, 'B recibe el instrumento nuevo');

  revisar(!(await pedir(a, 'instrumento:agregar', { tipo: 'bajo' })).ok, 'rechaza tipo inválido');
  revisar(!(await pedir(a, 'instrumento:editar', { id: inst.id, pasos: 40 })).ok, 'rechaza 40 pasos');

  const editado = await pedir(a, 'instrumento:editar', {
    id: inst.id, pasos: 4, patron: [1, 0, 1, 0, 1, 1], parametros: { sonido: 'snare', decay: 0.5, inventado: 1 },
  });
  revisar(editado.ok && editado.instrumento.patron.join() === 'true,false,true,false', 'A edita pasos y patrón');
  revisar(editado.instrumento.parametros.sonido === 'snare' && !('inventado' in editado.instrumento.parametros),
    'parámetros: acepta los conocidos e ignora los inventados');

  revisar(!(await pedir(b, 'instrumento:editar', { id: inst.id, pasos: 2 })).ok, 'B no puede editar el de A');
  revisar(!(await pedir(b, 'instrumento:mover', { id: inst.id, x: 0, z: 0 })).ok, 'B no puede mover el de A');
  revisar(!(await pedir(b, 'instrumento:eliminar', { id: inst.id })).ok, 'B no puede eliminar el de A');

  const movidoB = esperar(b, 'instrumento:movido');
  const movido = await pedir(a, 'instrumento:mover', { id: inst.id, x: 30, z: 0 });
  revisar(movido.ok && movido.x === 12, 'mover fuera del radio queda en 12');
  revisar((await movidoB).x === 12, 'B recibe la nueva posición');

  const tempoA = esperar(a, 'tempo:cambiado');
  revisar((await pedir(b, 'tempo:cambiar', { tempo: 128 })).ok, 'B cambia el tempo');
  revisar((await tempoA).tempo === 128, 'A recibe el tempo nuevo');
  revisar(!(await pedir(b, 'tempo:cambiar', { tempo: 999 })).ok, 'rechaza tempo 999');

  const escala = await pedir(b, 'escala:cambiar', { tonica: 'D', modo: 'dorico' });
  revisar(escala.ok && escala.escala.tonica === 'D', 'B cambia la escala a D dórico');
  const soloModo = await pedir(a, 'escala:cambiar', { modo: 'pentatonica_mayor' });
  revisar(soloModo.ok && soloModo.escala.tonica === 'D' && soloModo.escala.modo === 'pentatonica_mayor', 'cambiar solo el modo conserva la tonalidad');
  const soloTon = await pedir(a, 'escala:cambiar', { tonica: 'F#' });
  revisar(soloTon.ok && soloTon.escala.tonica === 'F#' && soloTon.escala.modo === 'pentatonica_mayor', 'cambiar solo la tonalidad conserva el modo');
  revisar(!(await pedir(a, 'escala:cambiar', { modo: 'blues' })).ok && (await pedir(a, 'escala:cambiar', { modo: 'menor' })).escala.modo === 'eolico', 'modos: rechaza blues; menor = eólico');
  await pedir(a, 'escala:cambiar', { tonica: 'D', modo: 'dorico' });

  // V2: patrones por defecto, grados de la escala y parámetros con rango
  const perc2 = (await pedir(b, 'instrumento:agregar', { tipo: 'percusion' })).instrumento;
  revisar(perc2.parametros.sonido === 'hat' && perc2.patron.filter(Boolean).length === 4, 'la segunda percusión llega como hat con su patrón');
  const arm = (await pedir(b, 'instrumento:agregar', { tipo: 'armonia' })).instrumento;
  revisar(arm.pasos === 16 && arm.subdivision === 'corchea' && arm.patron.join() === '0,,,,5,,,,3,,,,4,,,', 'armonía por defecto: i–VI–iv–v en corcheas');
  const mel = (await pedir(b, 'instrumento:agregar', { tipo: 'melodia' })).instrumento;
  revisar(mel.pasos === 32 && mel.patron.filter((g) => g !== null).length === 19, 'melodía por defecto: 32 semicorcheas');
  const mel2 = (await pedir(b, 'instrumento:editar', { id: mel.id, pasos: 4, patron: [6, 7, 'x', null, 2], parametros: { filtro: 5, envolvente: -1 } })).instrumento;
  revisar(mel2.patron.join() === '6,,,', 'grados fuera de 0–6 se vuelven silencio');
  revisar(mel2.parametros.filtro === 1 && mel2.parametros.envolvente === 0, 'parámetros fuera de rango se recortan');
  const mel3 = (await pedir(b, 'instrumento:editar', { id: mel.id, pasos: 8 })).instrumento;
  revisar(mel3.patron.join() === '6,,,,6,,,', 'al subir los pasos el patrón se repite');
  revisar(!(await pedir(a, 'instrumento:editar', { id: mel.id, patron: [0] })).ok, 'A no puede editar la melodía de B');
  // Polvo de Estrella: parámetros nuevos, sin volumen ni envíos sueltos
  const fxAlNacer = (i) => ['reverb', 'delay', 'phaser'].includes(i.parametros.fx) && (i.tipo === 'percusion' && i.parametros.fx === 'delay' ? i.parametros.cantidad === 0 : i.parametros.cantidad >= 0.1 && i.parametros.cantidad <= 0.25);
  revisar(arm.parametros.voicing === 0.3 && arm.parametros.filtro === 0.5 && fxAlNacer(arm), 'armonía trae voicing, filtro y un FX al azar con 10–25 %');
  revisar(!['volumen', 'acorde', 'inversion', 'cutoff', 'resonancia', 'envioReverb', 'envioLFE'].some((k) => k in arm.parametros), 'armonía sin volumen, acorde, inversión ni envíos viejos');
  revisar(mel.parametros.octava === 0 && fxAlNacer(mel) && !('glide' in mel.parametros), 'melodía trae octava y FX al azar, sin glide');
  revisar(fxAlNacer(perc2) && !('volumen' in perc2.parametros), 'el hat llega con FX al azar y sin volumen');
  revisar(fxAlNacer(inst) && !('envioLFE' in inst.parametros), 'el kick llega con FX al azar; el LFE lo decide el frontend');
  const percDelay = []; // la percusión con delay nace en 0
  const dp = await conectar(); await pedir(dp, 'unirse', {});
  for (let k = 0; k < 30 && percDelay.length < 3; k++) { const t = (await pedir(dp, 'instrumento:agregar', { tipo: 'percusion' })).instrumento; if (t.parametros.fx === 'delay') percDelay.push(t.parametros.cantidad); await pedir(dp, 'instrumento:eliminar', { id: t.id }); }
  dp.disconnect();
  revisar(percDelay.length > 0 && percDelay.every((c) => c === 0), 'percusión con delay al nacer: cantidad 0 (' + percDelay.join(', ') + ')');
  const fxVistos = new Set();
  const d = await conectar(); await pedir(d, 'unirse', {}); // otro dispositivo: no toca el límite de 3 de B
  for (let k = 0; k < 12; k++) { const t = (await pedir(d, 'instrumento:agregar', { tipo: 'armonia' })).instrumento; fxVistos.add(t.parametros.fx); await pedir(d, 'instrumento:eliminar', { id: t.id }); }
  d.disconnect();
  revisar(fxVistos.size >= 2, 'el FX al nacer cambia de un módulo a otro (' + [...fxVistos].join(', ') + ')');
  const mel4 = (await pedir(b, 'instrumento:editar', { id: mel.id, parametros: { octava: 1.4, fx: 'phaser', cantidad: 3 } })).instrumento;
  revisar(mel4.parametros.octava === 1 && mel4.parametros.fx === 'phaser' && mel4.parametros.cantidad === 1, 'octava entera, FX phaser y cantidad recortada');
  const mel5 = (await pedir(b, 'instrumento:editar', { id: mel.id, parametros: { fx: 'flanger', octava: -3, volumen: 1 } })).instrumento;
  revisar(mel5.parametros.fx === 'phaser' && mel5.parametros.octava === -1 && !('volumen' in mel5.parametros), 'rechaza FX desconocido, recorta octava e ignora volumen');
  const arm3 = (await pedir(b, 'instrumento:editar', { id: arm.id, parametros: { voicing: 2, envolvente: 3 } })).instrumento;
  revisar(arm3.parametros.voicing === 1 && arm3.parametros.envolvente === 1, 'voicing y amplitud (env) se recortan a su rango');
  revisar(arm.parametros.envolvente === 0.6 && mel.parametros.envolvente === 0.3 && !('ataque' in arm.parametros) && !('relajacion' in mel.parametros), 'Amplitud (Env) reemplaza ataque y release');
  // LFO
  // LFO junto a cada parámetro y Espacio
  revisar(arm.parametros.lfoFiltro === 0 && arm.parametros.lfoEnv === 0 && arm.parametros.lfoFiltroForma === 'seno' && arm.parametros.espacio === 0, 'armonía: LFO de filtro y de env apagados, espacio 0');
  revisar(!('lfoGolpe' in perc2.parametros) && perc2.parametros.espacio === 0 && !('lfoDestino' in perc2.parametros), 'percusión: sin ningún LFO');
  const l1 = (await pedir(b, 'instrumento:editar', { id: mel.id, parametros: { lfoFiltro: 0.7, lfoEnvForma: 'azar', espacio: -140.4, lfoDestino: 'tono' } })).instrumento.parametros;
  revisar(l1.lfoFiltro === 0.7 && l1.lfoEnvForma === 'azar' && l1.espacio === -100 && !('lfoDestino' in l1), 'LFO y espacio se guardan y se recortan (espacio entero −100 a 100)');
  const l2 = (await pedir(b, 'instrumento:editar', { id: perc2.id, parametros: { lfoFiltro: 0.5, lfoGolpe: 0.5, lfoGolpeForma: 'seno' } })).instrumento.parametros;
  revisar(!('lfoFiltro' in l2) && !('lfoGolpe' in l2) && !('lfoGolpeForma' in l2), 'la percusión rechaza cualquier LFO');
  const l3 = (await pedir(b, 'instrumento:editar', { id: mel.id, parametros: { lfoEnvForma: 'cuadrada' } })).instrumento.parametros;
  revisar(l3.lfoEnvForma === 'azar', 'rechaza formas de LFO desconocidas');
  for (const i of [perc2, arm, mel]) await pedir(b, 'instrumento:eliminar', { id: i.id });

  const inst2 = (await pedir(a, 'instrumento:agregar', { tipo: 'melodia' })).instrumento;
  const borradoA = await pedir(a, 'instrumento:eliminar', { id: inst2.id });
  revisar(borradoA.ok, 'A elimina su propio instrumento');

  const salida = esperar(b, 'tripulante:salio');
  a.disconnect();
  const s = await salida;
  revisar(s.instrumentosEliminados.includes(inst.id), 'al desconectarse A, sus instrumentos se eliminan');

  // --- Vida de los módulos, límite de 3, física y final de la obra ---
  const c = await conectar();
  const u = await pedir(c, 'unirse', {});
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const agregarEn = async (x, z, tipo = 'melodia') => (await pedir(c, 'instrumento:agregar', { tipo, x, z })).instrumento;
  revisar(u.estado.ajustes.inactividad === 45 && u.estado.ajustes.disolucion === 2.5, 'valores por defecto: 45 s sin interacción y 2,5 s de disolución');
  const m1 = await agregarEn(-9, -9), m2 = await agregarEn(9, -9), m3 = await agregarEn(-9, 9);
  const limite = esperar(c, 'instrumento:disolviendo');
  const m4 = await agregarEn(9, 9);
  const d1 = await limite;
  revisar(d1.id === m1.id && d1.motivo === 'limite', 'al crear un cuarto módulo, el más antiguo se disuelve');
  const revive = esperar(c, 'instrumento:revive');
  const otro = esperar(c, 'instrumento:disolviendo');
  await pedir(c, 'instrumento:tocar', { id: m1.id });
  revisar((await revive).id === m1.id, 'el dueño lo toca mientras se disuelve: revive');
  revisar((await otro).id === m2.id, 'y entonces se disuelve el siguiente más antiguo (siguen 3 vivos)');
  revisar(!(await pedir(b, 'instrumento:tocar', { id: m1.id })).ok, 'otro tripulante no puede tocar (revivir) un módulo ajeno');

  const aj = await pedir(c, 'ajustes:cambiar', { inactividad: 3, disolucion: 1, final: 500 });
  revisar(aj.ok && aj.ajustes.inactividad === 3 && aj.ajustes.final === 120, 'ajustes del director (con rango)');
  const porInactividad = esperar(c, 'instrumento:disolviendo');
  const borrado = new Promise((r) => c.on('instrumento:eliminado', (e) => e.motivo === 'inactividad' && r(e)));
  const di = await porInactividad;
  revisar(di.motivo === 'inactividad' && di.duracion === 1, 'sin interacción se disuelve por inactividad');
  revisar([m1.id, m3.id, m4.id].includes((await borrado).id), 'al terminar la disolución el módulo se elimina');
  await espera(1300);
  await pedir(c, 'ajustes:cambiar', { inactividad: 600, disolucion: 6 });

  // física: dos percusiones; c arrastra una contra la otra
  const p1 = await agregarEn(-3, 0, 'percusion'), p2 = await agregarEn(0.3, 0, 'percusion');
  const choque = new Promise((r) => c.on('choque', (ch) => r(ch)));
  for (let x = -3; x <= 0; x += 0.25) { await pedir(c, 'instrumento:mover', { id: p1.id, x, z: 0 }); await espera(30); }
  await pedir(c, 'instrumento:mover', { id: p1.id, x: 0, z: 0, final: true });
  const ch = await Promise.race([choque, espera(2000).then(() => null)]);
  revisar(ch && [ch.a, ch.b].includes(p1.id) && [ch.a, ch.b].includes(p2.id), 'al arrastrar una gema contra otra, chocan (evento choque)');
  await espera(1200);
  const posP2 = (await new Promise((r) => { const s2 = io(URL, { transports: ['websocket'] }); s2.on('connect', async () => { const u = await pedir(s2, 'unirse', {}); s2.disconnect(); r(u.estado.instrumentos.find((i) => i.id === p2.id)); }); }));
  revisar(posP2 && Math.hypot(posP2.x, posP2.z) > 1.1, `la gema empujada se aleja y se asienta (x ${posP2 && posP2.x.toFixed(2)})`);

  // espacio: la gema gira alrededor de su lugar (calculado en el servidor)
  const gira = await agregarEn(-6, 6, 'melodia');
  await pedir(c, 'instrumento:editar', { id: gira.id, parametros: { espacio: 100 } });
  const posiciones = [];
  const oirFisica = (l) => { const f = l.find((m) => m[0] === gira.id); if (f) posiciones.push(f); };
  c.on('fisica', oirFisica);
  await espera(2500);
  c.off('fisica', oirFisica);
  const dist = posiciones.map(([, x, z]) => Math.hypot(x + 6, z - 6));
  revisar(posiciones.length > 20 && Math.max(...dist) > 1.5, `con espacio 100 la gema gira sola alrededor de su lugar (${posiciones.length} posiciones, hasta ${Math.max(0, ...dist).toFixed(2)} u)`);

  // final de la obra
  await pedir(c, 'ajustes:cambiar', { final: 5 });
  const fin = esperar(b, 'obra:final');
  const disolverFinal = esperar(b, 'instrumento:disolviendo');
  revisar((await pedir(b, 'obra:final', {})).ok && (await fin).duracion === 5, 'FINAL: todos reciben el final con su duración');
  const df = await disolverFinal;
  revisar(df.motivo === 'final' && df.duracion === 5, 'FINAL: cada gema avisa que se disuelve (motivo final)');
  revisar(!(await pedir(c, 'instrumento:agregar', { tipo: 'melodia' })).ok, 'durante el final no se pueden crear módulos');
  const cerrada = await Promise.race([esperar(b, 'obra:cerrada').then(() => true), espera(7000).then(() => false)]);
  revisar(cerrada, 'al terminar el final la estación queda cerrada');
  const vacia = await (await fetch(URL + '/api/health')).json();
  revisar(vacia.instrumentos === 0, 'después del final no queda ningún módulo');
  revisar(!(await pedir(c, 'instrumento:agregar', { tipo: 'melodia' })).ok, 'con la estación cerrada no se pueden crear módulos');
  revisar((await pedir(b, 'obra:reabrir', {})).ok, 'REABRIR habilita la estación');
  const tras = await agregarEn(0, 0);
  revisar(!!tras, 'reabierta, se pueden crear módulos de nuevo');
  await pedir(c, 'ajustes:cambiar', { inactividad: 45, disolucion: 2.5, final: 20 });
  c.disconnect();
  await espera(300);

  const final = await (await fetch(URL + '/api/health')).json();
  revisar(final.instrumentos === inicial.instrumentos && final.tripulantes === inicial.tripulantes + 1, 'estado final: solo queda B, sin instrumentos de la prueba');

  b.disconnect();
  console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodo bien');
  process.exit(fallos ? 1 : 0);
})();
