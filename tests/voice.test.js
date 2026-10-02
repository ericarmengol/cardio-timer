import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearVoz } from '../js/voice.js';

function falsoContexto() {
  const ctx = {
    currentTime: 10,
    destination: {},
    iniciados: [],
    detenidos: 0,
    reanudado: 0,
    resume() { this.reanudado++; return Promise.resolve(); },
    createBuffer: () => ({ id: 'vacio', duration: 0 }),
    createBufferSource() {
      const src = {
        connect() {},
        start: (at) => { if (src.buffer.id !== 'vacio') ctx.iniciados.push([src.buffer.id, Number(at.toFixed(2))]); },
        stop: () => { ctx.detenidos++; },
      };
      return src;
    },
  };
  return ctx;
}

const cargar = (ctx, id) => (id === 'roto' ? Promise.reject(new Error('404')) : Promise.resolve({ id, duration: 0.5 }));

function crear(opciones = {}) {
  const ctx = falsoContexto();
  const voz = crearVoz({ crearContexto: () => ctx, cargar, pausaSeg: 0.2, ...opciones });
  return { ctx, voz };
}

test('decir encadena los clips con pausas', async () => {
  const { ctx, voz } = crear();
  voz.desbloquear();
  await voz.decir(['zona', 'n4', '_', 'n20', 'segundos']);
  assert.deepEqual(ctx.iniciados, [['zona', 10.02], ['n4', 10.52], ['n20', 11.22], ['segundos', 11.72]]);
});

test('una frase nueva sustituye a la que aún estaba cargando', async () => {
  const { ctx, voz } = crear();
  voz.desbloquear();
  const primera = voz.decir(['n1']);
  await voz.decir(['n2']);
  await primera;
  assert.deepEqual(ctx.iniciados.map(([id]) => id), ['n2']);
});

test('una frase nueva corta la que estaba sonando', async () => {
  const { ctx, voz } = crear();
  voz.desbloquear();
  await voz.decir(['n1', 'n2']);
  await voz.decir(['n3']);
  assert.equal(ctx.detenidos, 2);
});

test('un clip que no carga se salta', async () => {
  const { ctx, voz } = crear();
  voz.desbloquear();
  await voz.decir(['roto', 'n3']);
  assert.deepEqual(ctx.iniciados, [['n3', 10.02]]);
});

test('callar cancela lo pendiente', async () => {
  const { ctx, voz } = crear();
  voz.desbloquear();
  const p = voz.decir(['n1']);
  voz.callar();
  await p;
  assert.deepEqual(ctx.iniciados, []);
});

test('desactivada no suena y al desactivar se calla', async () => {
  const { ctx, voz } = crear({ activada: false });
  voz.desbloquear();
  await voz.decir(['n1']);
  assert.deepEqual(ctx.iniciados, []);
  voz.activada = true;
  await voz.decir(['n1']);
  voz.activada = false;
  assert.equal(voz.activada, false);
  assert.equal(ctx.detenidos, 1);
});

test('sin desbloquear no suena', async () => {
  const { ctx, voz } = crear();
  await voz.decir(['n1']);
  assert.deepEqual(ctx.iniciados, []);
});

test('desbloquear crea el contexto una sola vez y reactivar lo reanuda', () => {
  let creados = 0;
  const ctx = falsoContexto();
  const voz = crearVoz({ crearContexto: () => { creados++; return ctx; }, cargar });
  voz.desbloquear();
  voz.desbloquear();
  voz.reactivar();
  assert.equal(creados, 1);
  assert.equal(ctx.reanudado, 3);
});

test('sin Web Audio no falla', async () => {
  const voz = crearVoz({ crearContexto: () => { throw new Error('no hay audio'); }, cargar });
  voz.desbloquear();
  await voz.decir(['n1']);
  voz.callar();
  voz.reactivar();
});
