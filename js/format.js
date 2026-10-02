import { duracionTotal } from './workout.js';

const dos = (n) => String(n).padStart(2, '0');

function partes(segundos) {
  return { h: Math.floor(segundos / 3600), m: Math.floor((segundos % 3600) / 60), s: segundos % 60 };
}

export function formatoReloj(segundos) {
  const { h, m, s } = partes(Math.max(0, Math.round(segundos)));
  return h > 0 ? `${h}:${dos(m)}:${dos(s)}` : `${m}:${dos(s)}`;
}

export function duracionCorta(segundos) {
  const { h, m, s } = partes(segundos);
  const texto = [];
  if (h) texto.push(`${h} h`);
  if (m) texto.push(`${m} min`);
  if (s || texto.length === 0) texto.push(`${s} s`);
  return texto.join(' ');
}

export function zonaDeIntensidad(it) {
  if (it.tipo === 'zona') return it.valor;
  if (it.valor < 60) return 1;
  if (it.valor < 70) return 2;
  if (it.valor < 80) return 3;
  if (it.valor < 90) return 4;
  return 5;
}

export function claseColor(fase) {
  return fase.tipo === 'descanso' ? 'descanso' : `z${zonaDeIntensidad(fase.intensidad)}`;
}

export function textoIntensidad(it) {
  return it.tipo === 'zona' ? `ZONA ${it.valor}` : `${it.valor} %`;
}

export function textoIntensidadCorta(it) {
  return it.tipo === 'zona' ? `Z${it.valor}` : `${it.valor} %`;
}

export function textoPrincipal(fase) {
  return fase.tipo === 'descanso' ? 'DESCANSO' : textoIntensidad(fase.intensidad);
}

export function textoProgreso(fase, entreno) {
  switch (fase.tipo) {
    case 'calentamiento': return 'Calentamiento';
    case 'enfriamiento': return 'Enfriamiento';
    case 'descanso': return `Descanso · Ronda ${fase.ronda}/${entreno.rondas} hecha`;
    default: return `Ronda ${fase.ronda}/${entreno.rondas} · Rep ${fase.rep}/${entreno.repeticiones}`;
  }
}

export function textoSiguiente(fase) {
  if (!fase) return 'Siguiente: fin';
  const que = fase.tipo === 'descanso' ? 'Descanso' : textoIntensidadCorta(fase.intensidad);
  return `Siguiente: ${que} · ${duracionCorta(fase.segundos)}`;
}

export function resumenEntreno(e) {
  const zonas = e.intervalos.map((iv) => textoIntensidadCorta(iv.intensidad)).join('/');
  return `${duracionCorta(duracionTotal(e))} · ${e.rondas}×${e.repeticiones} · ${zonas}`;
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escaparHtml(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}
