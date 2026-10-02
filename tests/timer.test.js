import { test } from 'node:test';
import assert from 'node:assert/strict';
import { posicionEn, inicioDeFase, Temporizador } from '../js/timer.js';

const f = (segundos) => ({ tipo: 'intervalo', segundos, intensidad: { tipo: 'zona', valor: 1 } });
const FASES = [f(10), f(5)];

test('posicionEn recorre las fases', () => {
  assert.deepEqual(posicionEn(FASES, -50), { indiceFase: 0, msRestantesFase: 10000, terminado: false });
  assert.deepEqual(posicionEn(FASES, 0), { indiceFase: 0, msRestantesFase: 10000, terminado: false });
  assert.deepEqual(posicionEn(FASES, 9999), { indiceFase: 0, msRestantesFase: 1, terminado: false });
  assert.deepEqual(posicionEn(FASES, 10000), { indiceFase: 1, msRestantesFase: 5000, terminado: false });
  assert.deepEqual(posicionEn(FASES, 15000), { indiceFase: 2, msRestantesFase: 0, terminado: true });
  assert.deepEqual(posicionEn(FASES, 99999), { indiceFase: 2, msRestantesFase: 0, terminado: true });
});

test('inicioDeFase', () => {
  assert.equal(inicioDeFase(FASES, 0), 0);
  assert.equal(inicioDeFase(FASES, 1), 10000);
  assert.equal(inicioDeFase(FASES, 2), 15000);
});

function crear(fases = FASES) {
  let t = 1_000_000;
  const eventos = [];
  const tm = new Temporizador(fases, {
    ahora: () => t,
    programar: () => 1,
    cancelar: () => eventos.push(['cancelado']),
    onFase: (fase, i, seg) => eventos.push(['fase', i, seg]),
    onSegundo: (seg, i) => eventos.push(['seg', i, seg]),
    onFin: () => eventos.push(['fin']),
  });
  return { tm, eventos, avanzar(ms) { t += ms; tm.actualizar(); } };
}

test('emite la primera fase al iniciar y un evento por segundo', () => {
  const { tm, eventos, avanzar } = crear();
  tm.iniciar();
  avanzar(400);
  avanzar(600);
  avanzar(1000);
  assert.deepEqual(eventos, [['fase', 0, 10], ['seg', 0, 9], ['seg', 0, 8]]);
});

test('cambia de fase y termina una sola vez', () => {
  const { tm, eventos, avanzar } = crear();
  tm.iniciar();
  avanzar(10000);
  avanzar(5000);
  avanzar(5000);
  assert.deepEqual(eventos, [['fase', 0, 10], ['fase', 1, 5], ['cancelado'], ['fin']]);
  assert.equal(tm.terminado, true);
});

test('la pausa congela el tiempo', () => {
  const { tm, eventos, avanzar } = crear();
  tm.iniciar();
  avanzar(2000);
  tm.pausar();
  assert.equal(tm.pausado, true);
  avanzar(60000);
  assert.equal(tm.transcurrido(), 2000);
  tm.continuar();
  avanzar(1000);
  assert.equal(tm.transcurrido(), 3000);
  assert.deepEqual(eventos, [['fase', 0, 10], ['seg', 0, 8], ['seg', 0, 7]]);
});

test('saltar va al inicio de la siguiente fase', () => {
  const { tm, eventos, avanzar } = crear();
  tm.iniciar();
  avanzar(3000);
  tm.saltar();
  assert.equal(tm.transcurrido(), 10000);
  assert.deepEqual(eventos.at(-1), ['fase', 1, 5]);
});

test('saltar en pausa cambia de fase y sigue en pausa', () => {
  const { tm, eventos, avanzar } = crear();
  tm.iniciar();
  tm.pausar();
  tm.saltar();
  assert.equal(tm.pausado, true);
  assert.deepEqual(eventos.at(-1), ['fase', 1, 5]);
  const antes = eventos.length;
  avanzar(30000);
  assert.equal(eventos.length, antes);
});

test('saltar la última fase termina', () => {
  const { tm, eventos } = crear();
  tm.iniciar();
  tm.saltar();
  tm.saltar();
  assert.deepEqual(eventos.at(-1), ['fin']);
  tm.saltar();
  assert.deepEqual(eventos.at(-1), ['fin']);
});

test('al volver de segundo plano salta directo a la fase correcta', () => {
  const { tm, eventos, avanzar } = crear([f(10), f(5), f(20)]);
  tm.iniciar();
  avanzar(17000);
  assert.deepEqual(eventos, [['fase', 0, 10], ['fase', 2, 18]]);
});

test('al volver de segundo plano tras el final emite fin', () => {
  const { tm, eventos, avanzar } = crear();
  tm.iniciar();
  avanzar(600000);
  assert.deepEqual(eventos, [['fase', 0, 10], ['cancelado'], ['fin']]);
});

test('terminar detiene sin emitir fin', () => {
  const { tm, eventos, avanzar } = crear();
  tm.iniciar();
  tm.terminar();
  avanzar(20000);
  assert.deepEqual(eventos, [['fase', 0, 10], ['cancelado']]);
  assert.equal(tm.terminado, true);
});
