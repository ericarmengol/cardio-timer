export function crearVoz({
  synth = globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance,
  activada = true,
} = {}) {
  let encendida = activada;
  let voz = null;

  function elegirVoz() {
    const voces = synth.getVoices?.() ?? [];
    const lang = (v) => (v.lang ?? '').replace('_', '-').toLowerCase();
    voz = voces.find((v) => lang(v) === 'es-es') ?? voces.find((v) => lang(v).startsWith('es')) ?? null;
  }

  if (synth) {
    elegirVoz();
    synth.addEventListener?.('voiceschanged', elegirVoz);
  }

  return {
    get disponible() { return Boolean(synth); },
    get activada() { return encendida; },
    set activada(valor) {
      encendida = valor;
      if (!valor) synth?.cancel();
    },
    desbloquear() {
      if (!synth) return;
      const u = new Utterance(' ');
      u.volume = 0;
      synth.speak(u);
    },
    decir(texto) {
      if (!encendida || !synth) return;
      synth.cancel();
      const u = new Utterance(texto);
      u.lang = 'es-ES';
      if (voz) u.voice = voz;
      u.rate = 1.05;
      synth.speak(u);
    },
    callar() {
      synth?.cancel();
    },
  };
}
