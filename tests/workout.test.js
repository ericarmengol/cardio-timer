import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generarFases, duracionTotal, validar, entrenoNuevo } from '../js/workout.js';

const z = (valor) => ({ tipo: 'zona', valor });
const base = () => ({
  id: 'a',
  nombre: 'Test',
  calentamiento: null,
  intervalos: [{ segundos: 20, intensidad: z(4) }, { segundos: 10, intensidad: z(1) }],
  repeticiones: 2,
  rondas: 2,
  descansoSegundos: 60,
  enfriamiento: null,
});
const resumen = (fases) => fases.map((f) => `${f.tipo}:${f.segundos}`);

test('repite los intervalos por ronda y pone descanso solo entre rondas', () => {
  assert.deepEqual(resumen(generarFases(base())), [
    'intervalo:20', 'intervalo:10', 'intervalo:20', 'intervalo:10',
    'descanso:60',
    'intervalo:20', 'intervalo:10', 'intervalo:20', 'intervalo:10',
  ]);
});

test('una sola ronda no tiene descanso', () => {
  const e = { ...base(), rondas: 1 };
  assert.ok(!generarFases(e).some((f) => f.tipo === 'descanso'));
});

test('descanso de 0 segundos no genera fase', () => {
  const e = { ...base(), descansoSegundos: 0 };
  assert.ok(!generarFases(e).some((f) => f.tipo === 'descanso'));
});

test('numera ronda, rep e indiceIntervalo', () => {
  const fases = generarFases(base());
  assert.deepEqual(
    fases.map((f) => [f.ronda, f.rep, f.indiceIntervalo]),
    [[1, 1, 0], [1, 1, 1], [1, 2, 0], [1, 2, 1], [1, null, null], [2, 1, 0], [2, 1, 1], [2, 2, 0], [2, 2, 1]],
  );
  assert.equal(fases[4].intensidad, null);
  assert.deepEqual(fases[0].intensidad, z(4));
});

test('calentamiento al principio y enfriamiento al final', () => {
  const e = { ...base(), rondas: 1, repeticiones: 1, calentamiento: { segundos: 300, intensidad: z(2) }, enfriamiento: { segundos: 120, intensidad: z(1) } };
  const fases = generarFases(e);
  assert.deepEqual(resumen(fases), ['calentamiento:300', 'intervalo:20', 'intervalo:10', 'enfriamiento:120']);
  assert.deepEqual([fases[0].ronda, fases[0].rep, fases[0].indiceIntervalo], [null, null, null]);
  assert.deepEqual(fases[3].intensidad, z(1));
});

test('duracionTotal suma todas las fases', () => {
  assert.equal(duracionTotal(base()), 30 * 2 * 2 + 60);
});

test('validar acepta un entreno correcto', () => {
  assert.deepEqual(validar(base()), []);
  assert.deepEqual(validar({ ...base(), intervalos: [{ segundos: 30, intensidad: { tipo: 'pct', valor: 80 } }] }), []);
});

test('entrenoNuevo es válido en cuanto tiene nombre', () => {
  const e = entrenoNuevo('x');
  assert.equal(e.id, 'x');
  assert.equal(e.nombre, '');
  assert.equal(validar(e).length, 1);
  assert.deepEqual(validar({ ...e, nombre: 'Algo' }), []);
});

test('validar detecta cada error', () => {
  const casos = [
    { ...base(), nombre: '   ' },
    { ...base(), intervalos: [] },
    { ...base(), intervalos: [{ segundos: 0, intensidad: z(3) }] },
    { ...base(), intervalos: [{ segundos: 1.5, intensidad: z(3) }] },
    { ...base(), intervalos: [{ segundos: 20, intensidad: z(6) }] },
    { ...base(), intervalos: [{ segundos: 20, intensidad: { tipo: 'pct', valor: 0 } }] },
    { ...base(), intervalos: [{ segundos: 20, intensidad: { tipo: 'pct', valor: 101 } }] },
    { ...base(), repeticiones: NaN },
    { ...base(), repeticiones: 0 },
    { ...base(), rondas: NaN },
    { ...base(), descansoSegundos: -1 },
    { ...base(), descansoSegundos: NaN },
    { ...base(), calentamiento: { segundos: 0, intensidad: z(2) } },
    { ...base(), enfriamiento: { segundos: 60, intensidad: { tipo: 'otra', valor: 1 } } },
  ];
  for (const caso of casos) {
    const errores = validar(caso);
    assert.equal(errores.length, 1, `esperaba 1 error en ${JSON.stringify(caso)}, hubo ${JSON.stringify(errores)}`);
    assert.equal(typeof errores[0], 'string');
  }
});
