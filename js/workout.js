const esEntero = (n, min, max = Infinity) => Number.isInteger(n) && n >= min && n <= max;

function intensidadValida(it) {
  if (!it || typeof it !== 'object') return false;
  if (it.tipo === 'zona') return esEntero(it.valor, 1, 5);
  if (it.tipo === 'pct') return esEntero(it.valor, 0, 100);
  return false;
}

function fase(tipo, segundos, intensidad, ronda = null, rep = null, indiceIntervalo = null) {
  return { tipo, segundos, intensidad, ronda, rep, indiceIntervalo };
}

export function generarFases(e) {
  const fases = [];
  if (e.calentamiento) fases.push(fase('calentamiento', e.calentamiento.segundos, e.calentamiento.intensidad));
  for (let ronda = 1; ronda <= e.rondas; ronda++) {
    for (let rep = 1; rep <= e.repeticiones; rep++) {
      e.intervalos.forEach((iv, i) => fases.push(fase('intervalo', iv.segundos, iv.intensidad, ronda, rep, i)));
    }
    if (ronda < e.rondas && e.descansoSegundos > 0) fases.push(fase('descanso', e.descansoSegundos, null, ronda));
  }
  if (e.enfriamiento) fases.push(fase('enfriamiento', e.enfriamiento.segundos, e.enfriamiento.intensidad));
  return fases;
}

export function duracionTotal(e) {
  return generarFases(e).reduce((total, f) => total + f.segundos, 0);
}

export function validar(e) {
  if (!e || typeof e !== 'object') return ['Entreno no válido'];
  const errores = [];
  if (typeof e.nombre !== 'string' || e.nombre.trim() === '') errores.push('Pon un nombre al entreno');
  for (const clave of ['calentamiento', 'enfriamiento']) {
    const b = e[clave];
    if (b === null || b === undefined) continue;
    if (!esEntero(b.segundos, 1)) errores.push(`La duración del ${clave} debe ser un número entero mayor que 0`);
    else if (!intensidadValida(b.intensidad)) errores.push(`La intensidad del ${clave} no es válida`);
  }
  if (!Array.isArray(e.intervalos) || e.intervalos.length === 0) {
    errores.push('Añade al menos un intervalo');
  } else {
    e.intervalos.forEach((iv, i) => {
      if (!esEntero(iv?.segundos, 1)) errores.push(`Intervalo ${i + 1}: la duración debe ser un número entero mayor que 0`);
      else if (!intensidadValida(iv.intensidad)) errores.push(`Intervalo ${i + 1}: la intensidad debe ser zona 1–5 o 0–100 %`);
    });
  }
  if (!esEntero(e.repeticiones, 1)) errores.push('Las repeticiones por ronda deben ser al menos 1');
  if (!esEntero(e.rondas, 1)) errores.push('Las rondas deben ser al menos 1');
  if (!esEntero(e.descansoSegundos, 0)) errores.push('El descanso entre rondas debe ser 0 o más segundos');
  return errores;
}

export function entrenoNuevo(id) {
  return {
    id,
    nombre: '',
    calentamiento: null,
    intervalos: [
      { segundos: 20, intensidad: { tipo: 'zona', valor: 4 } },
      { segundos: 10, intensidad: { tipo: 'zona', valor: 1 } },
    ],
    repeticiones: 8,
    rondas: 3,
    descansoSegundos: 60,
    enfriamiento: null,
  };
}
