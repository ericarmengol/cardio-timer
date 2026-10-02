export function posicionEn(fases, ms) {
  const t = Math.max(0, ms);
  let inicio = 0;
  for (let i = 0; i < fases.length; i++) {
    const fin = inicio + fases[i].segundos * 1000;
    if (t < fin) return { indiceFase: i, msRestantesFase: fin - t, terminado: false };
    inicio = fin;
  }
  return { indiceFase: fases.length, msRestantesFase: 0, terminado: true };
}

export function inicioDeFase(fases, indice) {
  return fases.slice(0, indice).reduce((ms, f) => ms + f.segundos * 1000, 0);
}

const nada = () => {};

export class Temporizador {
  constructor(fases, {
    ahora = () => Date.now(),
    programar = (fn, ms) => setInterval(fn, ms),
    cancelar = (id) => clearInterval(id),
    onFase = nada,
    onSegundo = nada,
    onFin = nada,
  } = {}) {
    Object.assign(this, { fases, ahora, programar, cancelar, onFase, onSegundo, onFin });
    this.inicio = 0;
    this.pausadoEn = null;
    this.msPausado = 0;
    this.ultimaFase = -1;
    this.ultimoSegundo = null;
    this.idTick = null;
    this._terminado = false;
  }

  get pausado() { return this.pausadoEn !== null; }
  get terminado() { return this._terminado; }

  iniciar() {
    this.inicio = this.ahora();
    this.idTick = this.programar(() => this.actualizar(), 250);
    this.actualizar();
  }

  instantanea() {
    return { inicio: this.inicio, msPausado: this.msPausado, pausadoEn: this.pausadoEn };
  }

  reanudar({ inicio, msPausado, pausadoEn }) {
    Object.assign(this, { inicio, msPausado, pausadoEn });
    this.idTick = this.programar(() => this.actualizar(), 250);
    this.actualizar();
  }

  transcurrido() {
    const referencia = this.pausadoEn ?? this.ahora();
    return referencia - this.inicio - this.msPausado;
  }

  actualizar() {
    if (this._terminado) return;
    const pos = posicionEn(this.fases, this.transcurrido());
    if (pos.terminado) {
      this.terminar();
      this.onFin();
      return;
    }
    const segundos = Math.ceil(pos.msRestantesFase / 1000);
    if (pos.indiceFase !== this.ultimaFase) {
      this.ultimaFase = pos.indiceFase;
      this.ultimoSegundo = segundos;
      this.onFase(this.fases[pos.indiceFase], pos.indiceFase, segundos);
    } else if (segundos !== this.ultimoSegundo) {
      this.ultimoSegundo = segundos;
      this.onSegundo(segundos, pos.indiceFase);
    }
  }

  pausar() {
    if (!this.pausado && !this._terminado) this.pausadoEn = this.ahora();
  }

  continuar() {
    if (!this.pausado) return;
    this.msPausado += this.ahora() - this.pausadoEn;
    this.pausadoEn = null;
    this.actualizar();
  }

  saltar() {
    if (this._terminado) return;
    const pos = posicionEn(this.fases, this.transcurrido());
    this.inicio -= pos.msRestantesFase;
    this.actualizar();
  }

  terminar() {
    if (this._terminado) return;
    this._terminado = true;
    if (this.idTick !== null) this.cancelar(this.idTick);
    this.idTick = null;
  }
}
