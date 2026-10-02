import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatoReloj, duracionCorta, zonaDeIntensidad, claseColor,
  textoIntensidad, textoIntensidadCorta, textoPrincipal, textoProgreso,
  textoSiguiente, resumenEntreno, escaparHtml,
} from '../js/format.js';

const z = (valor) => ({ tipo: 'zona', valor });
const pct = (valor) => ({ tipo: 'pct', valor });
const iv = (segundos, intensidad, ronda = 1, rep = 1) => ({ tipo: 'intervalo', segundos, intensidad, ronda, rep, indiceIntervalo: 0 });

test('formatoReloj', () => {
  assert.equal(formatoReloj(0), '0:00');
  assert.equal(formatoReloj(5), '0:05');
  assert.equal(formatoReloj(75), '1:15');
  assert.equal(formatoReloj(600), '10:00');
  assert.equal(formatoReloj(3725), '1:02:05');
});

test('duracionCorta', () => {
  assert.equal(duracionCorta(0), '0 s');
  assert.equal(duracionCorta(45), '45 s');
  assert.equal(duracionCorta(1080), '18 min');
  assert.equal(duracionCorta(90), '1 min 30 s');
  assert.equal(duracionCorta(3900), '1 h 5 min');
});

test('zonaDeIntensidad mapea porcentajes por tramos', () => {
  assert.equal(zonaDeIntensidad(z(3)), 3);
  assert.deepEqual([1, 59, 60, 69, 70, 79, 80, 89, 90, 100].map((v) => zonaDeIntensidad(pct(v))), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
});

test('claseColor', () => {
  assert.equal(claseColor(iv(20, z(4))), 'z4');
  assert.equal(claseColor(iv(20, pct(85))), 'z4');
  assert.equal(claseColor({ tipo: 'descanso', segundos: 60, intensidad: null }), 'descanso');
});

test('textos de intensidad', () => {
  assert.equal(textoIntensidad(z(4)), 'ZONA 4');
  assert.equal(textoIntensidad(pct(80)), '80 %');
  assert.equal(textoIntensidadCorta(z(1)), 'Z1');
  assert.equal(textoIntensidadCorta(pct(75)), '75 %');
  assert.equal(textoPrincipal(iv(20, z(5))), 'ZONA 5');
  assert.equal(textoPrincipal({ tipo: 'descanso', segundos: 60, intensidad: null }), 'DESCANSO');
});

test('textoProgreso', () => {
  const e = { rondas: 3, repeticiones: 8 };
  assert.equal(textoProgreso(iv(20, z(4), 2, 5), e), 'Ronda 2/3 · Rep 5/8');
  assert.equal(textoProgreso({ tipo: 'descanso', segundos: 60, intensidad: null, ronda: 1 }, e), 'Descanso · Ronda 1/3 hecha');
  assert.equal(textoProgreso({ tipo: 'calentamiento', segundos: 60, intensidad: z(2) }, e), 'Calentamiento');
  assert.equal(textoProgreso({ tipo: 'enfriamiento', segundos: 60, intensidad: z(1) }, e), 'Enfriamiento');
});

test('textoSiguiente', () => {
  assert.equal(textoSiguiente(iv(10, z(1))), 'Siguiente: Z1 · 10 s');
  assert.equal(textoSiguiente({ tipo: 'descanso', segundos: 60, intensidad: null }), 'Siguiente: Descanso · 1 min');
  assert.equal(textoSiguiente(undefined), 'Siguiente: fin');
});

test('resumenEntreno', () => {
  const e = {
    nombre: 'T', calentamiento: null, enfriamiento: null, repeticiones: 8, rondas: 3, descansoSegundos: 60,
    intervalos: [{ segundos: 20, intensidad: z(4) }, { segundos: 10, intensidad: z(1) }],
  };
  assert.equal(resumenEntreno(e), '14 min · 3×8 · Z4/Z1');
});

test('escaparHtml', () => {
  assert.equal(escaparHtml(`<b>"Tom's" & co</b>`), '&lt;b&gt;&quot;Tom&#39;s&quot; &amp; co&lt;/b&gt;');
});
