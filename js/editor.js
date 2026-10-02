import { duracionTotal, validar } from './workout.js';
import { duracionCorta, escaparHtml } from './format.js';

const leerNumero = (valor, siVacio) => (valor.trim() === '' ? siVacio : Number(valor));
const mostrarNumero = (n) => (Number.isFinite(n) ? n : '');

function campoDuracion(segundos, attrs) {
  const valido = Number.isFinite(segundos);
  const min = valido ? Math.floor(segundos / 60) : '';
  const seg = valido ? segundos % 60 : '';
  return `<span class="duracion">
    <input type="number" inputmode="numeric" min="0" ${attrs} data-parte="min" value="${min}" aria-label="Minutos"><span>min</span>
    <input type="number" inputmode="numeric" min="0" max="59" ${attrs} data-parte="seg" value="${seg}" aria-label="Segundos"><span>s</span>
  </span>`;
}

function campoIntensidad(it, attrs) {
  const seleccion = it.tipo === 'zona' ? `z${it.valor}` : 'pct';
  const opciones = [1, 2, 3, 4, 5]
    .map((n) => `<option value="z${n}" ${seleccion === `z${n}` ? 'selected' : ''}>Zona ${n}</option>`)
    .join('');
  const pct = it.tipo === 'pct'
    ? `<input type="number" inputmode="numeric" min="1" max="100" ${attrs} data-parte="pct" value="${mostrarNumero(it.valor)}" aria-label="Porcentaje"><span>%</span>`
    : '';
  return `<select ${attrs} data-parte="intensidad" aria-label="Intensidad">${opciones}<option value="pct" ${seleccion === 'pct' ? 'selected' : ''}>%</option></select>${pct}`;
}

export function montarEditor(form, totalEl) {
  let estado = null;

  const bloque = (el) => (el.dataset.bloque === 'intervalo' ? estado.intervalos[Number(el.dataset.indice)] : estado[el.dataset.bloque]);

  function bloqueOpcional(clave, etiqueta) {
    const b = estado[clave];
    const attrs = `data-bloque="${clave}"`;
    return `<fieldset class="grupo${b ? '' : ' plegado'}">
      <legend><label class="interruptor"><input type="checkbox" data-accion="activar" data-clave="${clave}" ${b ? 'checked' : ''}> ${etiqueta}</label></legend>
      ${b ? `<div class="fila">${campoDuracion(b.segundos, attrs)}${campoIntensidad(b.intensidad, attrs)}</div>` : ''}
    </fieldset>`;
  }

  function intervalo(iv, i, total) {
    const attrs = `data-bloque="intervalo" data-indice="${i}"`;
    return `<div class="intervalo">
      <div class="intervalo-cabecera">
        <strong>Intervalo ${i + 1}</strong>
        <span class="botones-mini">
          <button type="button" class="btn mini" data-accion="subir" data-indice="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
          <button type="button" class="btn mini" data-accion="bajar" data-indice="${i}" ${i === total - 1 ? 'disabled' : ''} aria-label="Bajar">↓</button>
          <button type="button" class="btn mini" data-accion="borrar" data-indice="${i}" ${total === 1 ? 'disabled' : ''} aria-label="Borrar">✕</button>
        </span>
      </div>
      <div class="fila">${campoDuracion(iv.segundos, attrs)}${campoIntensidad(iv.intensidad, attrs)}</div>
    </div>`;
  }

  function actualizarTotal() {
    const valido = validar({ ...estado, nombre: 'x' }).length === 0;
    totalEl.textContent = `Duración total: ${valido ? duracionCorta(duracionTotal(estado)) : '—'}`;
  }

  function render() {
    form.innerHTML = `
      <label class="campo"><span>Nombre</span>
        <input type="text" data-campo="nombre" value="${escaparHtml(estado.nombre)}" placeholder="Ej. Tabata cinta" autocomplete="off">
      </label>
      ${bloqueOpcional('calentamiento', 'Calentamiento')}
      <fieldset class="grupo">
        <legend>Intervalos de la ronda</legend>
        ${estado.intervalos.map((iv, i) => intervalo(iv, i, estado.intervalos.length)).join('')}
        <button type="button" class="btn" data-accion="anadir">+ Añadir intervalo</button>
      </fieldset>
      <fieldset class="grupo">
        <legend>Repeticiones y rondas</legend>
        <label class="campo-num"><span>Repeticiones por ronda</span>
          <input type="number" inputmode="numeric" min="1" data-campo="repeticiones" value="${mostrarNumero(estado.repeticiones)}">
        </label>
        <label class="campo-num"><span>Rondas</span>
          <input type="number" inputmode="numeric" min="1" data-campo="rondas" value="${mostrarNumero(estado.rondas)}">
        </label>
        <div class="campo-num"><span>Descanso entre rondas</span>${campoDuracion(estado.descansoSegundos, 'data-campo="descansoSegundos"')}</div>
      </fieldset>
      ${bloqueOpcional('enfriamiento', 'Enfriamiento')}`;
    actualizarTotal();
  }

  function aplicar(el) {
    const { campo, parte } = el.dataset;
    if (parte === 'min' || parte === 'seg') {
      const span = el.closest('.duracion');
      const segundos = leerNumero(span.querySelector('[data-parte="min"]').value, 0) * 60
        + leerNumero(span.querySelector('[data-parte="seg"]').value, 0);
      if (campo === 'descansoSegundos') estado.descansoSegundos = segundos;
      else bloque(el).segundos = segundos;
    } else if (parte === 'pct') {
      bloque(el).intensidad = { tipo: 'pct', valor: leerNumero(el.value, NaN) };
    } else if (campo === 'nombre') {
      estado.nombre = el.value;
    } else if (campo) {
      estado[campo] = leerNumero(el.value, NaN);
    }
  }

  form.addEventListener('submit', (ev) => ev.preventDefault());

  form.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.tagName === 'SELECT' || el.type === 'checkbox') return;
    aplicar(el);
    actualizarTotal();
  });

  form.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.dataset.accion === 'activar') {
      const zona = el.dataset.clave === 'calentamiento' ? 2 : 1;
      estado[el.dataset.clave] = el.checked ? { segundos: 300, intensidad: { tipo: 'zona', valor: zona } } : null;
      render();
    } else if (el.tagName === 'SELECT') {
      const b = bloque(el);
      if (el.value !== 'pct') b.intensidad = { tipo: 'zona', valor: Number(el.value.slice(1)) };
      else if (b.intensidad.tipo !== 'pct') b.intensidad = { tipo: 'pct', valor: 80 };
      render();
    }
  });

  form.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-accion]');
    if (!btn) return;
    const ivs = estado.intervalos;
    const i = Number(btn.dataset.indice);
    switch (btn.dataset.accion) {
      case 'subir': [ivs[i - 1], ivs[i]] = [ivs[i], ivs[i - 1]]; break;
      case 'bajar': [ivs[i], ivs[i + 1]] = [ivs[i + 1], ivs[i]]; break;
      case 'borrar': ivs.splice(i, 1); break;
      case 'anadir': ivs.push({ segundos: 30, intensidad: { tipo: 'zona', valor: 3 } }); break;
      default: return;
    }
    render();
  });

  return {
    cargar(entreno) {
      estado = structuredClone(entreno);
      render();
    },
    obtener() {
      return structuredClone(estado);
    },
  };
}
