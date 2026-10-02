// Frases habladas como secuencias de clips pregrabados (audio/<id>.mp3).
// Si cambias CLIPS, regenera el audio con `node tools/generar-audio.mjs`.

export const PAUSA = '_';

export const CLIPS = {
  ...Object.fromEntries(Array.from({ length: 101 }, (_, n) => [`n${n}`, String(n)])),
  un: 'un',
  una: 'una',
  zona: 'zona',
  por_ciento: 'por ciento',
  segundo: 'segundo',
  segundos: 'segundos',
  minuto: 'minuto',
  minutos: 'minutos',
  hora: 'hora',
  horas: 'horas',
  descanso: 'descanso',
  calentamiento: 'calentamiento',
  enfriamiento: 'enfriamiento',
  entreno_terminado: 'entreno terminado',
};

export const FRAGMENTOS_FIN = ['entreno_terminado'];

function cantidad(n, uno, singular, plural) {
  return n === 1 ? [uno, singular] : [`n${n}`, plural];
}

export function fragmentosDuracion(segundos) {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  const partes = [];
  if (h) partes.push(...cantidad(h, 'una', 'hora', 'horas'));
  if (m) partes.push(...cantidad(m, 'un', 'minuto', 'minutos'));
  if (s || partes.length === 0) partes.push(...cantidad(s, 'un', 'segundo', 'segundos'));
  return partes;
}

function fragmentosIntensidad(it) {
  return it.tipo === 'zona' ? ['zona', `n${it.valor}`] : [`n${it.valor}`, 'por_ciento'];
}

export function fragmentosFase(fase) {
  const duracion = fragmentosDuracion(fase.segundos);
  switch (fase.tipo) {
    case 'descanso': return ['descanso', PAUSA, ...duracion];
    case 'calentamiento':
    case 'enfriamiento': return [fase.tipo, PAUSA, ...fragmentosIntensidad(fase.intensidad), PAUSA, ...duracion];
    default: return [...fragmentosIntensidad(fase.intensidad), PAUSA, ...duracion];
  }
}

export function fragmentosCuenta(n) {
  return [`n${n}`];
}
