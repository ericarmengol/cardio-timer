import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLIPS, PAUSA, fragmentosFase, fragmentosDuracion, fragmentosCuenta, FRAGMENTOS_FIN } from '../js/frases.js';

const z = (valor) => ({ tipo: 'zona', valor });
const pct = (valor) => ({ tipo: 'pct', valor });
const iv = (segundos, intensidad) => ({ tipo: 'intervalo', segundos, intensidad });

test('duraciones', () => {
  assert.deepEqual(fragmentosDuracion(1), ['un', 'segundo']);
  assert.deepEqual(fragmentosDuracion(20), ['n20', 'segundos']);
  assert.deepEqual(fragmentosDuracion(60), ['un', 'minuto']);
  assert.deepEqual(fragmentosDuracion(90), ['un', 'minuto', 'n30', 'segundos']);
  assert.deepEqual(fragmentosDuracion(300), ['n5', 'minutos']);
  assert.deepEqual(fragmentosDuracion(3660), ['una', 'hora', 'un', 'minuto']);
  assert.deepEqual(fragmentosDuracion(7200), ['n2', 'horas']);
});

test('fases', () => {
  assert.deepEqual(fragmentosFase(iv(20, z(4))), ['zona', 'n4', PAUSA, 'n20', 'segundos']);
  assert.deepEqual(fragmentosFase(iv(10, pct(100))), ['n100', 'por_ciento', PAUSA, 'n10', 'segundos']);
  assert.deepEqual(fragmentosFase(iv(20, pct(0))), ['n0', 'por_ciento', PAUSA, 'n20', 'segundos']);
  assert.deepEqual(fragmentosFase({ tipo: 'descanso', segundos: 60, intensidad: null }), ['descanso', PAUSA, 'un', 'minuto']);
  assert.deepEqual(fragmentosFase({ tipo: 'calentamiento', segundos: 300, intensidad: z(2) }), ['calentamiento', PAUSA, 'zona', 'n2', PAUSA, 'n5', 'minutos']);
  assert.deepEqual(fragmentosFase({ tipo: 'enfriamiento', segundos: 120, intensidad: pct(50) }), ['enfriamiento', PAUSA, 'n50', 'por_ciento', PAUSA, 'n2', 'minutos']);
});

test('cuenta atrás y fin', () => {
  assert.deepEqual(fragmentosCuenta(3), ['n3']);
  assert.deepEqual(FRAGMENTOS_FIN, ['entreno_terminado']);
});

test('todo fragmento que se puede pedir tiene clip', () => {
  const usados = new Set(FRAGMENTOS_FIN);
  for (let s = 1; s <= 3 * 3600; s += 7) fragmentosDuracion(s).forEach((f) => usados.add(f));
  for (let v = 0; v <= 100; v++) fragmentosFase(iv(20, pct(v))).forEach((f) => usados.add(f));
  for (let v = 1; v <= 5; v++) fragmentosFase(iv(20, z(v))).forEach((f) => usados.add(f));
  for (const tipo of ['descanso', 'calentamiento', 'enfriamiento']) fragmentosFase({ tipo, segundos: 61, intensidad: z(1) }).forEach((f) => usados.add(f));
  usados.delete(PAUSA);
  for (const f of usados) assert.ok(f in CLIPS, `falta el clip ${f}`);
});

test('cada clip tiene texto', () => {
  assert.equal(CLIPS.n21, '21');
  assert.equal(CLIPS.por_ciento, 'por ciento');
  for (const [id, texto] of Object.entries(CLIPS)) assert.ok(/^[a-z0-9_]+$/.test(id) && texto.length > 0, id);
});
