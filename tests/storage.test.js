import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearAlmacen, exportar, parsearImportacion } from '../js/storage.js';

function memoria() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}

const entreno = (id, nombre = 'E') => ({
  id, nombre, calentamiento: null, enfriamiento: null, repeticiones: 2, rondas: 1, descansoSegundos: 0,
  intervalos: [{ segundos: 20, intensidad: { tipo: 'zona', valor: 4 } }],
});

test('sin datos devuelve lista vacía', () => {
  assert.deepEqual(crearAlmacen(memoria()).cargarEntrenos(), []);
});

test('guarda y carga entrenos', () => {
  const s = memoria();
  crearAlmacen(s).guardarEntrenos([entreno('a'), entreno('b')]);
  assert.deepEqual(crearAlmacen(s).cargarEntrenos(), [entreno('a'), entreno('b')]);
  assert.ok(s.m.has('cardio-timer:entrenos'));
});

test('datos corruptos devuelven lista vacía', () => {
  const s = memoria();
  s.setItem('cardio-timer:entrenos', '{no es json');
  assert.deepEqual(crearAlmacen(s).cargarEntrenos(), []);
  s.setItem('cardio-timer:entrenos', '{"a":1}');
  assert.deepEqual(crearAlmacen(s).cargarEntrenos(), []);
});

test('descarta entrenos guardados que no son válidos', () => {
  const s = memoria();
  s.setItem('cardio-timer:entrenos', JSON.stringify([entreno('a'), { id: 'b' }]));
  assert.deepEqual(crearAlmacen(s).cargarEntrenos(), [entreno('a')]);
});

test('voz activada por defecto y persistente', () => {
  const s = memoria();
  const a = crearAlmacen(s);
  assert.equal(a.vozActivada(), true);
  a.guardarVoz(false);
  assert.equal(crearAlmacen(s).vozActivada(), false);
  a.guardarVoz(true);
  assert.equal(crearAlmacen(s).vozActivada(), true);
});

test('exportar e importar ida y vuelta', () => {
  const lista = [entreno('a', 'Uno'), entreno('b', 'Dos')];
  const texto = exportar(lista);
  assert.equal(JSON.parse(texto).version, 1);
  assert.deepEqual(parsearImportacion(texto), { ok: true, entrenos: lista });
});

test('importación rechaza archivos incorrectos', () => {
  const casos = [
    'esto no es json',
    JSON.stringify([entreno('a')]),
    JSON.stringify({ version: 2, entrenos: [entreno('a')] }),
    JSON.stringify({ version: 1, entrenos: 'x' }),
    JSON.stringify({ version: 1, entrenos: [entreno('a'), { ...entreno('b'), rondas: 0 }] }),
    JSON.stringify({ version: 1, entrenos: [{ ...entreno('a'), id: '' }] }),
    JSON.stringify({ version: 1, entrenos: [entreno('a'), entreno('a')] }),
  ];
  for (const texto of casos) {
    const r = parsearImportacion(texto);
    assert.equal(r.ok, false, texto);
    assert.equal(typeof r.error, 'string');
    assert.ok(r.error.length > 0);
  }
});
