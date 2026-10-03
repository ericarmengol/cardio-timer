import { validar } from './workout.js';

const CLAVE_ENTRENOS = 'cardio-timer:entrenos';
const CLAVE_VOZ = 'cardio-timer:voz';
const CLAVE_SESION = 'cardio-timer:sesion';

const esNumero = (n) => typeof n === 'number' && Number.isFinite(n);
const sesionValida = (s) => Boolean(s) && typeof s.entrenoId === 'string' && esNumero(s.inicio)
  && esNumero(s.msPausado) && (s.pausadoEn === null || esNumero(s.pausadoEn));

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
        return storage.getItem(CLAVE_VOZ) === 'true';
      } catch {
        return false;
      }
    },
    cargarSesion() {
      try {
        const sesion = JSON.parse(storage.getItem(CLAVE_SESION) ?? 'null');
        return sesionValida(sesion) ? sesion : null;
      } catch {
        return null;
      }
    },
    guardarSesion(sesion) {
      try {
        storage.setItem(CLAVE_SESION, JSON.stringify(sesion));
      } catch {
        // sin sesión guardada solo se pierde poder reanudar
      }
    },
    borrarSesion() {
      try {
        storage.removeItem(CLAVE_SESION);
      } catch {
        // nada que hacer
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
