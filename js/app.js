import { entrenoNuevo, generarFases, validar } from './workout.js';
import { posicionEn } from './timer.js';
import { crearAlmacen, exportar, parsearImportacion } from './storage.js';
import { crearVoz } from './voice.js';
import { escaparHtml, formatoReloj, resumenEntreno } from './format.js';
import { montarEditor } from './editor.js';
import { montarEjecucion } from './ejecucion.js';
import { PAUSA } from './frases.js';
import { VERSION } from './version.js';

const $ = (sel) => document.querySelector(sel);
const almacen = crearAlmacen();
let entrenos = almacen.cargarEntrenos();
const voz = crearVoz({ activada: almacen.vozActivada() });
const editor = montarEditor($('#form-editor'), $('#editor-total'));
const ejecucion = montarEjecucion($('#pantalla-ejecucion'), {
  voz,
  onVozCambiada: (activada) => almacen.guardarVoz(activada),
  sesion: { guardar: (s) => almacen.guardarSesion(s), borrar: () => almacen.borrarSesion() },
  onFin: ({ entreno, segundos, completado }) => {
    $('#fin-titulo').textContent = completado ? '¡Hecho!' : 'Entreno terminado';
    $('#fin-nombre').textContent = entreno.nombre;
    $('#fin-tiempo').textContent = formatoReloj(segundos);
    mostrar('final');
  },
});

function mostrar(nombre) {
  for (const p of document.querySelectorAll('.pantalla')) p.hidden = p.id !== `pantalla-${nombre}`;
  if (nombre === 'lista') renderSesion();
  window.scrollTo(0, 0);
}

function guardar() {
  try {
    almacen.guardarEntrenos(entrenos);
    return true;
  } catch {
    alert('No se pudo guardar en este dispositivo.');
    return false;
  }
}

function renderLista() {
  $('#lista-vacia').hidden = entrenos.length > 0;
  $('#lista-entrenos').innerHTML = entrenos.map((e) => `
    <li class="tarjeta" data-id="${escaparHtml(e.id)}">
      <div class="tarjeta-info"><strong>${escaparHtml(e.nombre)}</strong><span>${escaparHtml(resumenEntreno(e))}</span></div>
      <div class="tarjeta-acciones">
        <button class="btn primario grande" data-accion="empezar">Empezar</button>
        <button class="btn" data-accion="editar">Editar</button>
        <button class="btn" data-accion="duplicar">Duplicar</button>
        <button class="btn peligro" data-accion="borrar">Borrar</button>
      </div>
    </li>`).join('');
}

function abrirEditor(entreno, titulo) {
  $('#editor-titulo').textContent = titulo;
  $('#editor-errores').innerHTML = '';
  editor.cargar(entreno);
  mostrar('editor');
}

$('#lista-entrenos').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-accion]');
  if (!btn) return;
  const e = entrenos.find((x) => x.id === btn.closest('li').dataset.id);
  if (!e) return;
  switch (btn.dataset.accion) {
    case 'empezar':
      mostrar('ejecucion');
      ejecucion.empezar(e);
      break;
    case 'editar':
      abrirEditor(e, 'Editar entreno');
      break;
    case 'duplicar':
      entrenos.splice(entrenos.indexOf(e) + 1, 0, { ...structuredClone(e), id: crypto.randomUUID(), nombre: `${e.nombre} (copia)` });
      guardar();
      renderLista();
      break;
    case 'borrar':
      if (confirm(`¿Borrar "${e.nombre}"?`)) {
        entrenos = entrenos.filter((x) => x !== e);
        guardar();
        renderLista();
      }
      break;
  }
});

$('#btn-nuevo').addEventListener('click', () => abrirEditor(entrenoNuevo(crypto.randomUUID()), 'Nuevo entreno'));
$('#btn-editor-cancelar').addEventListener('click', () => mostrar('lista'));
$('#btn-fin-volver').addEventListener('click', () => mostrar('lista'));

$('#btn-editor-guardar').addEventListener('click', () => {
  const e = editor.obtener();
  e.nombre = e.nombre.trim();
  const errores = validar(e);
  if (errores.length) {
    $('#editor-errores').innerHTML = errores.map((t) => `<li>${escaparHtml(t)}</li>`).join('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  const i = entrenos.findIndex((x) => x.id === e.id);
  if (i >= 0) entrenos[i] = e;
  else entrenos.push(e);
  if (guardar()) {
    renderLista();
    mostrar('lista');
  }
});

$('#btn-exportar').addEventListener('click', async () => {
  if (!entrenos.length) {
    alert('No hay entrenos que exportar.');
    return;
  }
  const nombre = `cardio-timer-${new Date().toISOString().slice(0, 10)}.json`;
  const archivo = new File([exportar(entrenos)], nombre, { type: 'application/json' });
  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo] });
    } catch (err) {
      if (err.name !== 'AbortError') alert('No se pudo exportar.');
    }
    return;
  }
  const url = URL.createObjectURL(archivo);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$('#btn-importar').addEventListener('click', () => $('#input-importar').click());

$('#input-importar').addEventListener('change', async (ev) => {
  const archivo = ev.target.files[0];
  ev.target.value = '';
  if (!archivo) return;
  const r = parsearImportacion(await archivo.text());
  if (!r.ok) {
    alert(`No se pudo importar: ${r.error}`);
    return;
  }
  if (!confirm(`Se reemplazarán tus ${entrenos.length} entrenos por los ${r.entrenos.length} del archivo. ¿Continuar?`)) return;
  entrenos = r.entrenos;
  if (guardar()) renderLista();
});

function sesionPendiente() {
  const sesion = almacen.cargarSesion();
  const entreno = sesion && entrenos.find((e) => e.id === sesion.entrenoId);
  if (!entreno) return null;
  const ms = (sesion.pausadoEn ?? Date.now()) - sesion.inicio - sesion.msPausado;
  return posicionEn(generarFases(entreno), ms).terminado ? null : { sesion, entreno };
}

function renderSesion() {
  const pendiente = sesionPendiente();
  if (!pendiente) almacen.borrarSesion();
  $('#aviso-sesion').hidden = !pendiente;
  if (pendiente) $('#sesion-nombre').textContent = pendiente.entreno.nombre;
}

$('#btn-sesion-seguir').addEventListener('click', () => {
  const pendiente = sesionPendiente();
  $('#aviso-sesion').hidden = true;
  if (!pendiente) return;
  mostrar('ejecucion');
  ejecucion.empezar(pendiente.entreno, pendiente.sesion);
});

$('#btn-sesion-descartar').addEventListener('click', () => {
  almacen.borrarSesion();
  $('#aviso-sesion').hidden = true;
});

$('#btn-version').textContent = VERSION;

function anotarSonido(texto) {
  $('#panel-log').textContent += `${texto}
`;
}

function estadoSonido() {
  const e = voz.estado();
  const fallidos = e.fallidos.length ? ` (${e.fallidos.slice(0, 5).join(', ')})` : '';
  anotarSonido(`audio: ${e.contexto} · clips: ${e.cargados} · fallidos: ${e.fallidos.length}${fallidos} · sesión: ${navigator.audioSession?.type ?? 'no disponible'} · voz: ${voz.activada ? 'activada' : 'desactivada'}`);
}

$('#btn-version').addEventListener('click', () => {
  const panel = $('#panel-sonido');
  panel.hidden = !panel.hidden;
  $('#panel-log').textContent = '';
  if (!panel.hidden) estadoSonido();
});

$('#btn-probar-voz').addEventListener('click', () => {
  voz.desbloquear();
  if (!voz.activada) anotarSonido('La voz está desactivada: actívala con 🔊 durante un entreno.');
  voz.decir(['zona', 'n4', PAUSA, 'n20', 'segundos']);
  setTimeout(estadoSonido, 2000);
});

$('#btn-probar-pitido').addEventListener('click', () => {
  voz.desbloquear();
  voz.pitido();
  setTimeout(estadoSonido, 500);
});

renderLista();
mostrar('lista');

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
