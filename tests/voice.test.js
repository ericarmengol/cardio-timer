import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearVoz } from '../js/voice.js';

class FalsoUtterance {
  constructor(text) { this.text = text; }
}

function falsoSynth(voces) {
  return {
    dichos: [],
    cancelaciones: 0,
    getVoices: () => voces,
    addEventListener() {},
    speak(u) { this.dichos.push(u); },
    cancel() { this.cancelaciones++; },
  };
}

test('prefiere una voz es-ES', () => {
  const synth = falsoSynth([{ lang: 'en-US' }, { lang: 'es-MX' }, { lang: 'es-ES', name: 'Mónica' }]);
  const voz = crearVoz({ synth, Utterance: FalsoUtterance });
  voz.decir('Zona 4, 20 segundos');
  assert.equal(synth.dichos.length, 1);
  assert.equal(synth.dichos[0].text, 'Zona 4, 20 segundos');
  assert.equal(synth.dichos[0].voice.name, 'Mónica');
  assert.equal(synth.dichos[0].lang, 'es-ES');
});

test('si no hay es-ES usa otra voz en español', () => {
  const synth = falsoSynth([{ lang: 'en-US' }, { lang: 'es-MX', name: 'Paulina' }]);
  crearVoz({ synth, Utterance: FalsoUtterance }).decir('hola');
  assert.equal(synth.dichos[0].voice.name, 'Paulina');
});

test('sin voz española no asigna voz', () => {
  const synth = falsoSynth([{ lang: 'en-US' }]);
  crearVoz({ synth, Utterance: FalsoUtterance }).decir('hola');
  assert.equal(synth.dichos[0].voice, undefined);
});

test('decir interrumpe lo anterior', () => {
  const synth = falsoSynth([]);
  const voz = crearVoz({ synth, Utterance: FalsoUtterance });
  voz.decir('a');
  voz.decir('b');
  assert.equal(synth.cancelaciones, 2);
  assert.deepEqual(synth.dichos.map((u) => u.text), ['a', 'b']);
});

test('desactivada no habla y al desactivar se calla', () => {
  const synth = falsoSynth([]);
  const voz = crearVoz({ synth, Utterance: FalsoUtterance, activada: false });
  voz.decir('a');
  assert.equal(synth.dichos.length, 0);
  voz.activada = true;
  voz.decir('b');
  voz.activada = false;
  assert.equal(voz.activada, false);
  assert.equal(synth.dichos.length, 1);
  assert.equal(synth.cancelaciones, 2);
});

test('sin speechSynthesis no falla', () => {
  const voz = crearVoz({ synth: null, Utterance: FalsoUtterance });
  assert.equal(voz.disponible, false);
  voz.desbloquear();
  voz.decir('a');
  voz.callar();
});
