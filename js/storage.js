import { validar } from './workout.js';

const CLAVE_ENTRENOS = 'cardio-timer:entrenos';
const CLAVE_VOZ = 'cardio-timer:voz';

const entrenoValido = (e) => validar(e).length === 0 && typeof e.id === 'string' && e.id !== '';

export function crearAlmacen(storage = globalThis.localStorage) {
  return {
    cargarEntrenos() {
      try {
        const datos = JSON.parse(storage.getItem(CLAVE_ENTRENOS) ?? '[]');
        return Array.isArray(datos) ? datos.filter(entrenoValido) : [];
      } catch {
        return [];
      }
    },
    guardarEntrenos(lista) {
      storage.setItem(CLAVE_ENTRENOS, JSON.stringify(lista));
    },
    vozActivada() {
      try {
        return storage.getItem(CLAVE_VOZ) !== 'false';
      } catch {
        return true;
      }
    },
    guardarVoz(activada) {
      try {
        storage.setItem(CLAVE_VOZ, String(activada));
      } catch {
        // preferencia no crítica
      }
    },
  };
}

export function exportar(entrenos) {
  return JSON.stringify({ version: 1, entrenos }, null, 2);
}

export function parsearImportacion(texto) {
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    return { ok: false, error: 'el archivo no es un JSON válido' };
  }
  if (!datos || typeof datos !== 'object' || datos.version !== 1 || !Array.isArray(datos.entrenos)) {
    return { ok: false, error: 'el archivo no es una copia de Cardio Timer' };
  }
  const ids = new Set();
  for (const [i, e] of datos.entrenos.entries()) {
    const nombre = typeof e?.nombre === 'string' ? ` ("${e.nombre}")` : '';
    if (typeof e?.id !== 'string' || e.id === '') return { ok: false, error: `el entreno ${i + 1}${nombre} no tiene id` };
    if (ids.has(e.id)) return { ok: false, error: `el entreno ${i + 1}${nombre} tiene un id repetido` };
    ids.add(e.id);
    const errores = validar(e);
    if (errores.length) return { ok: false, error: `entreno ${i + 1}${nombre}: ${errores[0]}` };
  }
  return { ok: true, entrenos: datos.entrenos };
}
