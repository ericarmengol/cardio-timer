import { duracionTotal, generarFases } from './workout.js';
import { Temporizador } from './timer.js';
import { claseColor, formatoReloj, fraseFase, textoPrincipal, textoProgreso, textoSiguiente } from './format.js';

export function montarEjecucion(raiz, { voz, onVozCambiada, onFin }) {
  const $ = (sel) => raiz.querySelector(sel);
  const el = {
    intensidad: $('#ej-intensidad'),
    tiempo: $('#ej-tiempo'),
    progreso: $('#ej-progreso'),
    siguiente: $('#ej-siguiente'),
    pausa: $('#ej-pausa'),
    saltar: $('#ej-saltar'),
    terminar: $('#ej-terminar'),
    voz: $('#ej-voz'),
    aviso: $('#ej-aviso'),
  };
  let entreno = null;
  let fases = [];
  let temporizador = null;
  let wakeLock = null;

  async function mantenerPantalla() {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      el.aviso.hidden = true;
    } catch {
      el.aviso.hidden = false;
    }
  }

  function soltarPantalla() {
    wakeLock?.release().catch(() => {});
    wakeLock = null;
  }

  function pintarVoz() {
    el.voz.textContent = voz.activada ? '🔊' : '🔇';
    el.voz.setAttribute('aria-label', voz.activada ? 'Silenciar voz' : 'Activar voz');
  }

  function pintarFase(i, segundos) {
    const fase = fases[i];
    raiz.dataset.zona = claseColor(fase);
    el.intensidad.textContent = textoPrincipal(fase);
    el.progreso.textContent = textoProgreso(fase, entreno);
    el.siguiente.textContent = textoSiguiente(fases[i + 1]);
    el.tiempo.textContent = formatoReloj(segundos);
  }

  function acabar(completado) {
    const segundos = completado ? duracionTotal(entreno) : Math.floor(temporizador.transcurrido() / 1000);
    temporizador.terminar();
    temporizador = null;
    soltarPantalla();
    onFin({ entreno, segundos, completado });
  }

  el.pausa.addEventListener('click', () => {
    if (!temporizador) return;
    if (temporizador.pausado) {
      temporizador.continuar();
      el.pausa.textContent = 'Pausa';
      raiz.classList.remove('pausado');
    } else {
      temporizador.pausar();
      voz.callar();
      el.pausa.textContent = 'Continuar';
      raiz.classList.add('pausado');
    }
  });

  el.saltar.addEventListener('click', () => temporizador?.saltar());

  el.terminar.addEventListener('click', () => {
    if (temporizador && confirm('¿Terminar el entreno?')) {
      voz.callar();
      acabar(false);
    }
  });

  el.voz.addEventListener('click', () => {
    voz.activada = !voz.activada;
    pintarVoz();
    onVozCambiada(voz.activada);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && temporizador) {
      mantenerPantalla();
      temporizador.actualizar();
    }
  });

  return {
    empezar(e) {
      voz.desbloquear();
      entreno = e;
      fases = generarFases(e);
      el.pausa.textContent = 'Pausa';
      raiz.classList.remove('pausado');
      pintarVoz();
      mantenerPantalla();
      temporizador = new Temporizador(fases, {
        onFase: (fase, i, segundos) => {
          pintarFase(i, segundos);
          voz.decir(fraseFase(fase));
        },
        onSegundo: (segundos, i) => {
          el.tiempo.textContent = formatoReloj(segundos);
          if (segundos <= 3 && fases[i].segundos > 5) voz.decir(String(segundos));
        },
        onFin: () => {
          voz.decir('Entreno terminado');
          acabar(true);
        },
      });
      temporizador.iniciar();
    },
  };
}
