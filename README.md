# Polvo de Estrella · backend

Servidor de **Polvo de Estrella** (la carpeta local del proyecto se llama OnlineBandApp), una app web de creación musical colectiva en tiempo real pensada como instalación interactiva para el domo del Planetario de Bogotá: una sala global donde cada persona (tripulante), desde su celular o computador, agrega instrumentos representados como gemas 3D en un universo compartido.

Este servidor guarda en memoria el estado de la sala (tempo, escala, tripulantes e instrumentos; al encender: 70 BPM en Re dórico) y lo sincroniza entre los navegadores con Socket.IO. No transmite audio: cada navegador genera el sonido a partir del estado compartido. La obra es efímera; no hay base de datos.

El frontend está en [polvo-de-estrella-frontend](https://github.com/ouiea-studio/polvo-de-estrella-frontend). Publicado en https://polvo-de-estrella-backend.onrender.com (el frontend, en https://polvo-de-estrella.onrender.com).

## Correrlo en local

Necesitas Node.js 20 o más reciente.

```bash
npm install
npm start
```

El servidor queda en http://localhost:3000. Para comprobar que está vivo: http://localhost:3000/api/health

Con el servidor encendido, `npm test` conecta dos tripulantes de prueba y revisa las reglas de la sala.

## Variables de entorno

| Variable | Para qué sirve | Por defecto |
| --- | --- | --- |
| `PORT` | Puerto en el que escucha. Render lo define solo. | `3000` |
| `FRONTEND_URL` | URL del frontend publicado, para permitirlo en CORS (por ejemplo `https://polvo-de-estrella.onrender.com`). `http://localhost:5173` siempre está permitido. | sin valor |

Hay un ejemplo en `.env.example`.

## Archivos

- `server.js`: Express y Socket.IO; recibe los eventos y avisa a todos los conectados.
- `sala.js`: el estado de la sala y sus reglas (solo el dueño edita, mueve o elimina sus instrumentos; tempo y escala son de todos).
- `prueba.js`: prueba automática con dos tripulantes.

## Eventos de Socket.IO

Del cliente al servidor: `unirse`, `instrumento:agregar`, `instrumento:editar`, `instrumento:tocar`, `instrumento:mover` (con `final: true` al soltar), `instrumento:eliminar`, `tempo:cambiar`, `escala:cambiar` ({ tonica } y/o { modo }: jonico, dorico, frigio, lidio, mixolidio, eolico, locrio, pentatonica_mayor, pentatonica_menor), `ajustes:cambiar`, `obra:final`, `obra:reabrir` y `reloj:hora` (devuelve la hora del servidor y el ancla del pulso; no exige haberse unido). Al desconectarse un tripulante, sus instrumentos se eliminan.

Del servidor a todos: `fisica` (posiciones, ~30 por segundo), `choque`, `instrumento:disolviendo`, `instrumento:revive`, `instrumento:eliminado` (con `motivo`), `ajustes:cambiados`, `obra:final`, `obra:cerrada` y `obra:reabierta`, además de los de siempre.

El servidor también es la referencia del pulso (reloj compartido): guarda un ancla `{ t0, pulsos0, bpm }` que cambia con el tempo sin saltos; va en el estado y en `tempo:cambiado`, y cada navegador alinea su secuenciador a ella.

El servidor es la autoridad sobre la física (las gemas chocan y se asientan) y sobre la vida de los módulos: si el dueño no interactúa con uno durante `inactividad` segundos (45 por defecto) se disuelve en `disolucion` segundos (2,5) y se elimina, salvo que su dueño lo toque antes; cada tripulante tiene como máximo 3 módulos vivos. El final de la obra disuelve todo y deja la estación cerrada hasta reabrirla (en el computador del director, el audio hace un "wash" de reverb y delay: ver el frontend).

Cada instrumento llega con un patrón por defecto que suena de inmediato. En la percusión el patrón es encendido/apagado por paso; en la armonía y la melodía guarda grados de la escala (0 a 6), así se reinterpreta solo cuando cambia la escala. Los parámetros se validan por rango u opciones (ver `ESQUEMA` en `sala.js`); lo que llega fuera de rango se recorta y las claves desconocidas se ignoran:

| Instrumento | Parámetros |
| --- | --- |
| Percusión | `sonido` (kick, snare, hat, perc), `pitch` (−12 a 12), `decay` (0,02 a 1,5 s); sin LFO |
| Armonía | `voicing` (0 cerrado a 1 abierto), `filtro` (0 cerrado a 1 abierto), `envolvente` (0 corto a 1 largo), `lfoFiltro`, `lfoFiltroForma`, `lfoEnv`, `lfoEnvForma` |
| Melodía | `octava` (−1, 0 o +1), `filtro`, `envolvente`, y los mismos LFO |
| Los tres | `fx` (reverb, delay o phaser) y `cantidad` (0 a 1); al nacer, un FX al azar con cantidad 0,10–0,25 (la percusión con delay nace en 0) |
| Los LFO | valor 0 a 1 (0 = apagado; más = más profundo y más rápido) y forma: seno, azar o sierra |
| Espacio (los tres) | `espacio` (−100 a 100): la gema gira alrededor de su lugar; lo calcula la física del servidor |

No hay volumen: lo define la distancia de la pieza al centro.
