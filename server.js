// Servidor de Polvo de Estrella: guarda en memoria el estado de la sala global
// y lo sincroniza entre los navegadores con Socket.IO. No transmite audio.
// Es la autoridad sobre la física de las gemas (30 pasos por segundo) y sobre la vida de cada
// módulo: inactividad, disolución, límite de 3 por dispositivo y final de la obra.

const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const sala = require('./sala');

const PORT = process.env.PORT || 3000;

// Orígenes que pueden conectarse: el frontend en local (Vite) y el publicado (FRONTEND_URL).
const ORIGENES = ['http://localhost:5173', 'http://127.0.0.1:5173', process.env.FRONTEND_URL]
  .filter(Boolean)
  .map((url) => url.replace(/\/$/, ''));
const opcionesCors = { origin: ORIGENES };

const app = express();
app.use(cors(opcionesCors));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    tripulantes: sala.estado.tripulantes.length,
    instrumentos: sala.estado.instrumentos.length,
  });
});

const server = http.createServer(app);
const io = new Server(server, { cors: opcionesCors });

// Responde al cliente si mandó callback (ack).
function responder(ack, datos) {
  if (typeof ack === 'function') ack(datos);
}

io.on('connection', (socket) => {
  // Envuelve cada evento: exige haberse unido y atrapa errores de validación.
  function manejar(evento, fn) {
    socket.on(evento, (datos, ack) => {
      if (typeof datos === 'function') { ack = datos; datos = {}; }
      if (!sala.buscarTripulante(socket.id)) {
        return responder(ack, { ok: false, error: 'Primero debes unirte' });
      }
      try {
        responder(ack, { ok: true, ...fn(datos || {}) });
      } catch (err) {
        responder(ack, { ok: false, error: err.message });
      }
    });
  }

  socket.on('unirse', (datos, ack) => {
    if (typeof datos === 'function') ack = datos;
    let tripulante = sala.buscarTripulante(socket.id);
    if (!tripulante) {
      tripulante = sala.agregarTripulante(socket.id);
      socket.broadcast.emit('tripulante:unido', tripulante);
    }
    responder(ack, { ok: true, tu: tripulante, estado: sala.instantanea() });
  });

  // Interacción del dueño: reinicia su reloj de inactividad y revive el módulo si se disolvía.
  function interactuar(id) {
    const { revive, disueltos } = sala.interaccion(socket.id, id);
    if (revive) io.emit('instrumento:revive', { id });
    disueltos.forEach((d) => io.emit('instrumento:disolviendo', d));
  }

  manejar('instrumento:agregar', (datos) => {
    const { instrumento, disueltos } = sala.agregarInstrumento(socket.id, datos);
    io.emit('instrumento:agregado', instrumento);
    disueltos.forEach((d) => io.emit('instrumento:disolviendo', d)); // límite de 3 por dispositivo
    return { instrumento };
  });

  manejar('instrumento:editar', (datos) => {
    const instrumento = sala.editarInstrumento(socket.id, datos.id, datos);
    io.emit('instrumento:editado', instrumento);
    interactuar(datos.id);
    return { instrumento };
  });

  // Seleccionar (tocar) un módulo propio también cuenta como interacción.
  manejar('instrumento:tocar', (datos) => {
    interactuar(datos.id);
    return {};
  });

  // Arrastre: llega muy seguido. La física lo reparte a todos en el siguiente paso;
  // además se reenvía al instante a los demás.
  manejar('instrumento:mover', (datos) => {
    const instrumento = sala.moverInstrumento(socket.id, datos.id, datos.x, datos.z, !!datos.final);
    socket.broadcast.emit('instrumento:movido', { id: instrumento.id, x: instrumento.x, z: instrumento.z });
    interactuar(datos.id);
    return { x: instrumento.x, z: instrumento.z };
  });

  manejar('instrumento:eliminar', (datos) => {
    sala.eliminarInstrumento(socket.id, datos.id);
    io.emit('instrumento:eliminado', { id: datos.id });
    return {};
  });

  manejar('tempo:cambiar', (datos) => {
    const tempo = sala.cambiarTempo(datos.tempo);
    io.emit('tempo:cambiado', { tempo, por: socket.id });
    return { tempo };
  });

  manejar('escala:cambiar', (datos) => {
    const escala = sala.cambiarEscala(datos);
    io.emit('escala:cambiada', { escala, por: socket.id });
    return { escala };
  });

  // --- Director ---
  manejar('ajustes:cambiar', (datos) => {
    const ajustes = sala.cambiarAjustes(datos);
    io.emit('ajustes:cambiados', ajustes);
    return { ajustes };
  });
  manejar('obra:final', () => {
    const { duracion, disolviendo } = sala.iniciarFinal();
    io.emit('obra:final', { duracion });
    disolviendo.forEach((d) => io.emit('instrumento:disolviendo', d)); // todas a la vez
    return { duracion };
  });
  manejar('obra:reabrir', () => {
    sala.reabrir();
    io.emit('obra:reabierta', {});
    return {};
  });

  socket.on('disconnect', () => {
    const salida = sala.quitarTripulante(socket.id);
    if (salida) io.emit('tripulante:salio', salida);
  });
});

// Bucle del servidor: física, inactividad y disoluciones, ~30 veces por segundo.
const PASO_MS = 33;
let ultimoPaso = Date.now();
setInterval(() => {
  const ahora = Date.now();
  const dt = Math.min((ahora - ultimoPaso) / 1000, 0.1);
  ultimoPaso = ahora;
  if (!sala.estado.instrumentos.length && sala.estado.obra !== 'finalizando') return;
  const r = sala.paso(dt, ahora);
  if (r.movidos.length) io.emit('fisica', r.movidos);
  r.choques.forEach((c) => io.emit('choque', c));
  r.disolviendo.forEach((d) => io.emit('instrumento:disolviendo', d));
  r.eliminados.forEach((e) => io.emit('instrumento:eliminado', e));
  if (r.cerrada) io.emit('obra:cerrada', {});
}, PASO_MS);

server.listen(PORT, () => {
  console.log(`Polvo de Estrella · backend escuchando en el puerto ${PORT}`);
  console.log(`Orígenes permitidos: ${ORIGENES.join(', ')}`);
});
