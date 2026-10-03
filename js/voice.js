import { CLIPS, PAUSA } from './frases.js';

// La voz suena con clips pregrabados vía Web Audio. Sesión 'ambient': se mezcla con la
// música de otras apps pero no suena con el modo silencio (en iOS no hay modo que haga
// las dos cosas: 'playback' suena en silencio pero para la música; probado en el iPhone).

function nuevoContexto() {
  const Contexto = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  return new Contexto();
}

async function cargarClip(ctx, id) {
  const respuesta = await fetch(`./audio/${id}.mp3`);
  if (!respuesta.ok) throw new Error(`audio/${id}.mp3: ${respuesta.status}`);
  return ctx.decodeAudioData(await respuesta.arrayBuffer());
}

export function crearVoz({
  crearContexto = nuevoContexto,
  cargar = cargarClip,
  sesionAudio = globalThis.navigator?.audioSession,
  activada = true,
  pausaSeg = 0.15,
  modoSesion = 'ambient',
} = {}) {
  let modo = modoSesion;
  let encendida = activada;
  let ctx = null;
  let turno = 0;
  let fuentes = [];
  const buffers = new Map();
  let cargados = 0;
  const fallidos = [];

  function buffer(id) {
    if (!buffers.has(id)) {
      buffers.set(id, cargar(ctx, id).then((b) => { cargados++; return b; }, () => { fallidos.push(id); return null; }));
    }
    return buffers.get(id);
  }

  function callar() {
    turno++;
    for (const src of fuentes) {
      try { src.stop(); } catch { /* ya había terminado */ }
    }
    fuentes = [];
  }

  return {
    get modoSesion() { return modo; },
    set modoSesion(valor) { modo = valor; },
    get activada() { return encendida; },
    set activada(valor) {
      encendida = valor;
      if (!valor) callar();
    },
    desbloquear() {
      try {
        if (sesionAudio) sesionAudio.type = modo;
      } catch {
        // sin control de sesión: sonará según el modo silencio
      }
      try {
        ctx ??= crearContexto();
      } catch {
        return;
      }
      ctx.resume?.();
      const vacio = ctx.createBufferSource();
      vacio.buffer = ctx.createBuffer(1, 1, 22050);
      vacio.connect(ctx.destination);
      vacio.start(0);
      for (const id of Object.keys(CLIPS)) buffer(id);
    },
    async decir(ids) {
      if (!encendida || !ctx) return;
      callar();
      const miTurno = turno;
      const partes = await Promise.all(ids.map((id) => (id === PAUSA ? PAUSA : buffer(id))));
      if (miTurno !== turno || !encendida) return;
      let en = ctx.currentTime + 0.02;
      for (const parte of partes) {
        if (parte === PAUSA) {
          en += pausaSeg;
        } else if (parte) {
          const src = ctx.createBufferSource();
          src.buffer = parte;
          src.connect(ctx.destination);
          src.start(en);
          fuentes.push(src);
          en += parte.duration;
        }
      }
    },
    callar,
    pitido() {
      if (!ctx) return;
      const o = ctx.createOscillator();
      o.frequency.value = 880;
      o.connect(ctx.destination);
      const t = ctx.currentTime;
      o.start(t);
      o.stop(t + 0.3);
    },
    estado() {
      return { contexto: ctx ? (ctx.state ?? 'desconocido') : 'sin crear', cargados, fallidos: [...fallidos] };
    },
    reactivar() {
      ctx?.resume?.();
    },
  };
}
