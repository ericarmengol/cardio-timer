# Cardio Timer — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PWA personal de temporizador de intervalos para cardio, instalable en iPhone, con entrenos guardados en el dispositivo, pantalla siempre encendida y avisos por voz.

**Architecture:** HTML/CSS/JS vanilla con módulos ES, sin build. La lógica pura (`workout.js`, `timer.js`, `format.js`, `storage.js`, `voice.js`) se prueba con `node --test`; la interfaz (`app.js`, `editor.js`, `ejecucion.js`) se verifica en navegador. Publicada en GitHub Pages.

**Tech Stack:** HTML5, CSS, JavaScript (ES2022, módulos nativos), Web Speech API, Screen Wake Lock API, Service Worker, localStorage, Node 24 (`node:test`) para tests, `gh` CLI para publicar.

**Spec:** `docs/superpowers/specs/2026-10-02-cardio-timer-design.md`

## Global Constraints

- Sin dependencias de ejecución ni paso de build; el navegador carga los módulos ES directamente.
- Todas las rutas relativas (`./…`): la app vive bajo `https://ericarmengol.github.io/cardio-timer/`.
- Textos de interfaz y voz en español.
- Tests con `node --test` (Node 24, sin dependencias).
- Claves de almacenamiento: `cardio-timer:entrenos` (array de entrenos) y `cardio-timer:voz` (`"true"`/`"false"`).
- Formato de exportación: `{ "version": 1, "entrenos": [...] }`.
- Intensidad: `{ tipo: "zona", valor: 1..5 }` o `{ tipo: "pct", valor: 1..100 }`.
- Colores: Z1 `#1e6fd9`, Z2 `#1f9d55`, Z3 `#e0b000`, Z4 `#f07f13`, Z5 `#d7263d`, descanso `#2b2f36`. Porcentaje → zona: <60 Z1, 60–69 Z2, 70–79 Z3, 80–89 Z4, ≥90 Z5.
- Cuenta atrás hablada "3, 2, 1" solo en fases de más de 5 s.
- No hay descanso tras la última ronda.
- Destino: Safari / PWA en pantalla de inicio, iOS 18.4+ (iPhone 17 Pro).

## Review Focus

1. **Campos numéricos vacíos o con decimales en el editor** (`""` → `NaN`, `1.5`): `validar` debe rechazarlos con un mensaje claro; nunca se guarda un entreno con `NaN`. → test en Task 1.
2. **Volver de segundo plano tras varias fases o después del final**: el temporizador salta directamente a la fase correcta emitiendo un solo evento `fase`, o emite `fin`. → test en Task 3.
3. **Saltar estando en pausa, o saltar la última fase**: se mantiene la pausa en la fase siguiente; saltar la última termina el entreno. → test en Task 3.
4. **Importar un archivo con un entreno inválido o ids duplicados**: se rechaza entero y los datos actuales no se tocan. → test en Task 4.
5. **Añadir un archivo a `js/` sin añadirlo a la caché del service worker**: la app se rompe sin conexión en el gimnasio. → test en Task 7.

---

## Estructura de archivos

```
.gitattributes         normaliza finales de línea
package.json           "type": "module", scripts test/serve
index.html             las 4 pantallas (lista, editor, ejecución, final)
styles.css             estilos móviles, colores por zona
manifest.json          PWA
sw.js                  service worker (caché offline)
icons/                 icon-192.png, icon-512.png, apple-touch-icon.png
js/workout.js          entreno → fases; duración total; validación; entreno nuevo
js/format.js           textos y formatos (reloj, duraciones, intensidad, frases de voz, colores, escape HTML)
js/timer.js            posicionEn, inicioDeFase, clase Temporizador
js/storage.js          almacén localStorage, exportar, parsearImportacion
js/voice.js            crearVoz (speechSynthesis)
js/editor.js           formulario del editor (DOM)
js/ejecucion.js        pantalla de ejecución + Wake Lock (DOM)
js/app.js              arranque, navegación, lista, export/import (DOM)
tools/servir.mjs       servidor estático local para pruebas
tools/generar-iconos.mjs  genera los PNG de iconos sin dependencias
tests/*.test.js        tests de node:test
```

Respecto al spec se añaden `js/format.js` y `js/ejecucion.js` para que `app.js` no acumule responsabilidades.

---

### Task 1: Base del proyecto y modelo de entreno (`workout.js`)

**Files:**
- Create: `.gitattributes`, `package.json`, `js/workout.js`
- Test: `tests/workout.test.js`

**Interfaces:**
- Produces:
  - `generarFases(entreno) → Fase[]`, con `Fase = { tipo: 'calentamiento'|'intervalo'|'descanso'|'enfriamiento', segundos: number, intensidad: Intensidad|null, ronda: number|null, rep: number|null, indiceIntervalo: number|null }`
  - `duracionTotal(entreno) → number` (segundos)
  - `validar(entreno) → string[]` (vacío si es válido)
  - `entrenoNuevo(id: string) → Entreno` (nombre vacío, 20 s Z4 + 10 s Z1, 8 reps, 3 rondas, 60 s descanso)

- [ ] **Step 1: Crear archivos base**

`.gitattributes`:
```
* text=auto eol=lf
*.png binary
```

`package.json`:
```json
{
  "name": "cardio-timer",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "serve": "node tools/servir.mjs"
  }
}
```

- [ ] **Step 2: Escribir los tests que fallan**

`tests/workout.test.js`:
```js
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
```

- [ ] **Step 3: Ejecutar y comprobar que falla**

Run: `node --test`
Expected: FAIL — `Cannot find module '.../js/workout.js'`.

- [ ] **Step 4: Implementar `js/workout.js`**

```js
const esEntero = (n, min, max = Infinity) => Number.isInteger(n) && n >= min && n <= max;

function intensidadValida(it) {
  if (!it || typeof it !== 'object') return false;
  if (it.tipo === 'zona') return esEntero(it.valor, 1, 5);
  if (it.tipo === 'pct') return esEntero(it.valor, 1, 100);
  return false;
}

function fase(tipo, segundos, intensidad, ronda = null, rep = null, indiceIntervalo = null) {
  return { tipo, segundos, intensidad, ronda, rep, indiceIntervalo };
}

export function generarFases(e) {
  const fases = [];
  if (e.calentamiento) fases.push(fase('calentamiento', e.calentamiento.segundos, e.calentamiento.intensidad));
  for (let ronda = 1; ronda <= e.rondas; ronda++) {
    for (let rep = 1; rep <= e.repeticiones; rep++) {
      e.intervalos.forEach((iv, i) => fases.push(fase('intervalo', iv.segundos, iv.intensidad, ronda, rep, i)));
    }
    if (ronda < e.rondas && e.descansoSegundos > 0) fases.push(fase('descanso', e.descansoSegundos, null, ronda));
  }
  if (e.enfriamiento) fases.push(fase('enfriamiento', e.enfriamiento.segundos, e.enfriamiento.intensidad));
  return fases;
}

export function duracionTotal(e) {
  return generarFases(e).reduce((total, f) => total + f.segundos, 0);
}

export function validar(e) {
  if (!e || typeof e !== 'object') return ['Entreno no válido'];
  const errores = [];
  if (typeof e.nombre !== 'string' || e.nombre.trim() === '') errores.push('Pon un nombre al entreno');
  for (const clave of ['calentamiento', 'enfriamiento']) {
    const b = e[clave];
    if (b === null || b === undefined) continue;
    if (!esEntero(b.segundos, 1)) errores.push(`La duración del ${clave} debe ser un número entero mayor que 0`);
    else if (!intensidadValida(b.intensidad)) errores.push(`La intensidad del ${clave} no es válida`);
  }
  if (!Array.isArray(e.intervalos) || e.intervalos.length === 0) {
    errores.push('Añade al menos un intervalo');
  } else {
    e.intervalos.forEach((iv, i) => {
      if (!esEntero(iv?.segundos, 1)) errores.push(`Intervalo ${i + 1}: la duración debe ser un número entero mayor que 0`);
      else if (!intensidadValida(iv.intensidad)) errores.push(`Intervalo ${i + 1}: la intensidad debe ser zona 1–5 o 1–100 %`);
    });
  }
  if (!esEntero(e.repeticiones, 1)) errores.push('Las repeticiones por ronda deben ser al menos 1');
  if (!esEntero(e.rondas, 1)) errores.push('Las rondas deben ser al menos 1');
  if (!esEntero(e.descansoSegundos, 0)) errores.push('El descanso entre rondas debe ser 0 o más segundos');
  return errores;
}

export function entrenoNuevo(id) {
  return {
    id,
    nombre: '',
    calentamiento: null,
    intervalos: [
      { segundos: 20, intensidad: { tipo: 'zona', valor: 4 } },
      { segundos: 10, intensidad: { tipo: 'zona', valor: 1 } },
    ],
    repeticiones: 8,
    rondas: 3,
    descansoSegundos: 60,
    enfriamiento: null,
  };
}
```

- [ ] **Step 5: Ejecutar los tests**

Run: `node --test`
Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
git add .gitattributes package.json js/workout.js tests/workout.test.js
git commit -m "Modelo de entreno: fases, duración y validación"
```

---

### Task 2: Textos y formatos (`format.js`)

**Files:**
- Create: `js/format.js`
- Test: `tests/format.test.js`

**Interfaces:**
- Consumes: `duracionTotal(entreno)` de `js/workout.js`; tipo `Fase` de Task 1.
- Produces:
  - `formatoReloj(segundos) → 'm:ss'` (o `'h:mm:ss'` si ≥ 1 h)
  - `duracionCorta(segundos) → '45 s' | '18 min' | '1 min 30 s' | '1 h 5 min'`
  - `duracionHablada(segundos) → '20 segundos' | '1 minuto 30 segundos' | …`
  - `zonaDeIntensidad(intensidad) → 1..5`
  - `claseColor(fase) → 'z1'..'z5' | 'descanso'`
  - `textoIntensidad(it) → 'ZONA 4' | '80 %'`; `textoIntensidadCorta(it) → 'Z4' | '80 %'`
  - `textoPrincipal(fase) → 'ZONA 4' | '80 %' | 'DESCANSO'`
  - `fraseFase(fase) → string` (lo que dice la voz)
  - `textoProgreso(fase, entreno) → string`
  - `textoSiguiente(fase | undefined) → string`
  - `resumenEntreno(entreno) → string`
  - `escaparHtml(texto) → string`

- [ ] **Step 1: Escribir los tests que fallan**

`tests/format.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatoReloj, duracionCorta, duracionHablada, zonaDeIntensidad, claseColor,
  textoIntensidad, textoIntensidadCorta, textoPrincipal, fraseFase, textoProgreso,
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

test('duracionHablada', () => {
  assert.equal(duracionHablada(1), '1 segundo');
  assert.equal(duracionHablada(20), '20 segundos');
  assert.equal(duracionHablada(60), '1 minuto');
  assert.equal(duracionHablada(90), '1 minuto 30 segundos');
  assert.equal(duracionHablada(300), '5 minutos');
  assert.equal(duracionHablada(3660), '1 hora 1 minuto');
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

test('fraseFase', () => {
  assert.equal(fraseFase(iv(20, z(4))), 'Zona 4, 20 segundos');
  assert.equal(fraseFase(iv(30, pct(80))), '80 por ciento, 30 segundos');
  assert.equal(fraseFase({ tipo: 'descanso', segundos: 60, intensidad: null }), 'Descanso, 1 minuto');
  assert.equal(fraseFase({ tipo: 'calentamiento', segundos: 300, intensidad: z(2) }), 'Calentamiento, zona 2, 5 minutos');
  assert.equal(fraseFase({ tipo: 'enfriamiento', segundos: 120, intensidad: z(1) }), 'Enfriamiento, zona 1, 2 minutos');
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
```

(14 min = 3 rondas × 8 × 30 s = 720 s + 2 descansos × 60 s = 840 s.)

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `node --test`
Expected: FAIL — `Cannot find module '.../js/format.js'`.

- [ ] **Step 3: Implementar `js/format.js`**

```js
import { duracionTotal } from './workout.js';

const dos = (n) => String(n).padStart(2, '0');
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

function partes(segundos) {
  return { h: Math.floor(segundos / 3600), m: Math.floor((segundos % 3600) / 60), s: segundos % 60 };
}

export function formatoReloj(segundos) {
  const { h, m, s } = partes(Math.max(0, Math.round(segundos)));
  return h > 0 ? `${h}:${dos(m)}:${dos(s)}` : `${m}:${dos(s)}`;
}

export function duracionCorta(segundos) {
  const { h, m, s } = partes(segundos);
  const texto = [];
  if (h) texto.push(`${h} h`);
  if (m) texto.push(`${m} min`);
  if (s || texto.length === 0) texto.push(`${s} s`);
  return texto.join(' ');
}

export function duracionHablada(segundos) {
  const { h, m, s } = partes(segundos);
  const texto = [];
  if (h) texto.push(plural(h, 'hora', 'horas'));
  if (m) texto.push(plural(m, 'minuto', 'minutos'));
  if (s || texto.length === 0) texto.push(plural(s, 'segundo', 'segundos'));
  return texto.join(' ');
}

export function zonaDeIntensidad(it) {
  if (it.tipo === 'zona') return it.valor;
  if (it.valor < 60) return 1;
  if (it.valor < 70) return 2;
  if (it.valor < 80) return 3;
  if (it.valor < 90) return 4;
  return 5;
}

export function claseColor(fase) {
  return fase.tipo === 'descanso' ? 'descanso' : `z${zonaDeIntensidad(fase.intensidad)}`;
}

export function textoIntensidad(it) {
  return it.tipo === 'zona' ? `ZONA ${it.valor}` : `${it.valor} %`;
}

export function textoIntensidadCorta(it) {
  return it.tipo === 'zona' ? `Z${it.valor}` : `${it.valor} %`;
}

function intensidadHablada(it) {
  return it.tipo === 'zona' ? `zona ${it.valor}` : `${it.valor} por ciento`;
}

export function textoPrincipal(fase) {
  return fase.tipo === 'descanso' ? 'DESCANSO' : textoIntensidad(fase.intensidad);
}

export function fraseFase(fase) {
  const duracion = duracionHablada(fase.segundos);
  switch (fase.tipo) {
    case 'descanso': return `Descanso, ${duracion}`;
    case 'calentamiento': return `Calentamiento, ${intensidadHablada(fase.intensidad)}, ${duracion}`;
    case 'enfriamiento': return `Enfriamiento, ${intensidadHablada(fase.intensidad)}, ${duracion}`;
    default: {
      const texto = intensidadHablada(fase.intensidad);
      return `${texto[0].toUpperCase()}${texto.slice(1)}, ${duracion}`;
    }
  }
}

export function textoProgreso(fase, entreno) {
  switch (fase.tipo) {
    case 'calentamiento': return 'Calentamiento';
    case 'enfriamiento': return 'Enfriamiento';
    case 'descanso': return `Descanso · Ronda ${fase.ronda}/${entreno.rondas} hecha`;
    default: return `Ronda ${fase.ronda}/${entreno.rondas} · Rep ${fase.rep}/${entreno.repeticiones}`;
  }
}

export function textoSiguiente(fase) {
  if (!fase) return 'Siguiente: fin';
  const que = fase.tipo === 'descanso' ? 'Descanso' : textoIntensidadCorta(fase.intensidad);
  return `Siguiente: ${que} · ${duracionCorta(fase.segundos)}`;
}

export function resumenEntreno(e) {
  const zonas = e.intervalos.map((iv) => textoIntensidadCorta(iv.intensidad)).join('/');
  return `${duracionCorta(duracionTotal(e))} · ${e.rondas}×${e.repeticiones} · ${zonas}`;
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escaparHtml(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}
```

- [ ] **Step 4: Ejecutar los tests**

Run: `node --test`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add js/format.js tests/format.test.js
git commit -m "Formatos de texto, duraciones y frases de voz"
```

---

### Task 3: Motor del temporizador (`timer.js`)

**Files:**
- Create: `js/timer.js`
- Test: `tests/timer.test.js`

**Interfaces:**
- Consumes: `Fase[]` (solo usa `fase.segundos`).
- Produces:
  - `posicionEn(fases, ms) → { indiceFase, msRestantesFase, terminado }` (si terminado: `indiceFase = fases.length`, `msRestantesFase = 0`)
  - `inicioDeFase(fases, indice) → ms`
  - `class Temporizador(fases, { ahora?, programar?, cancelar?, onFase?, onSegundo?, onFin? })`
    - `onFase(fase, indice, segundosRestantes)`, `onSegundo(segundosRestantes, indice)`, `onFin()`
    - métodos `iniciar()`, `actualizar()`, `pausar()`, `continuar()`, `saltar()`, `terminar()`, `transcurrido() → ms`; getters `pausado`, `terminado`
    - `segundosRestantes = Math.ceil(msRestantesFase / 1000)`

- [ ] **Step 1: Escribir los tests que fallan**

`tests/timer.test.js`:
```js
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
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `node --test`
Expected: FAIL — `Cannot find module '.../js/timer.js'`.

- [ ] **Step 3: Implementar `js/timer.js`**

```js
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
```

- [ ] **Step 4: Ejecutar los tests**

Run: `node --test`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add js/timer.js tests/timer.test.js
git commit -m "Motor del temporizador basado en reloj real"
```

---

### Task 4: Almacenamiento, exportación e importación (`storage.js`)

**Files:**
- Create: `js/storage.js`
- Test: `tests/storage.test.js`

**Interfaces:**
- Consumes: `validar(entreno)` de `js/workout.js`.
- Produces:
  - `crearAlmacen(storage = globalThis.localStorage) → { cargarEntrenos() → Entreno[], guardarEntrenos(lista) (lanza si falla), vozActivada() → boolean, guardarVoz(boolean) }`
  - `exportar(entrenos) → string` (JSON `{ version: 1, entrenos }`)
  - `parsearImportacion(texto) → { ok: true, entrenos } | { ok: false, error: string }`

- [ ] **Step 1: Escribir los tests que fallan**

`tests/storage.test.js`:
```js
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
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `node --test`
Expected: FAIL — `Cannot find module '.../js/storage.js'`.

- [ ] **Step 3: Implementar `js/storage.js`**

```js
import { validar } from './workout.js';

const CLAVE_ENTRENOS = 'cardio-timer:entrenos';
const CLAVE_VOZ = 'cardio-timer:voz';

const entrenoValido = (e) => validar(e).length === 0 && typeof e.id === 'string' && e.id !== '';

export function crearAlmacen(storage = globalThis.localStorage) {
  return {
    cargarEntrenos() {
      try {
        const datos = JSON.parse(storage.getItem(CLAVE_ENTRENOS) ?? '[]');
        return Array.isArray(datos) ? datos.filter(entrenoValido) : [];
      } catch {
        return [];
      }
    },
    guardarEntrenos(lista) {
      storage.setItem(CLAVE_ENTRENOS, JSON.stringify(lista));
    },
    vozActivada() {
      try {
        return storage.getItem(CLAVE_VOZ) !== 'false';
      } catch {
        return true;
      }
    },
    guardarVoz(activada) {
      try {
        storage.setItem(CLAVE_VOZ, String(activada));
      } catch {
        // preferencia no crítica
      }
    },
  };
}

export function exportar(entrenos) {
  return JSON.stringify({ version: 1, entrenos }, null, 2);
}

export function parsearImportacion(texto) {
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    return { ok: false, error: 'el archivo no es un JSON válido' };
  }
  if (!datos || typeof datos !== 'object' || datos.version !== 1 || !Array.isArray(datos.entrenos)) {
    return { ok: false, error: 'el archivo no es una copia de Cardio Timer' };
  }
  const ids = new Set();
  for (const [i, e] of datos.entrenos.entries()) {
    const nombre = typeof e?.nombre === 'string' ? ` ("${e.nombre}")` : '';
    if (typeof e?.id !== 'string' || e.id === '') return { ok: false, error: `el entreno ${i + 1}${nombre} no tiene id` };
    if (ids.has(e.id)) return { ok: false, error: `el entreno ${i + 1}${nombre} tiene un id repetido` };
    ids.add(e.id);
    const errores = validar(e);
    if (errores.length) return { ok: false, error: `entreno ${i + 1}${nombre}: ${errores[0]}` };
  }
  return { ok: true, entrenos: datos.entrenos };
}
```

- [ ] **Step 4: Ejecutar los tests**

Run: `node --test`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add js/storage.js tests/storage.test.js
git commit -m "Almacenamiento local y copia de seguridad"
```

---

### Task 5: Voz (`voice.js`)

**Files:**
- Create: `js/voice.js`
- Test: `tests/voice.test.js`

**Interfaces:**
- Produces: `crearVoz({ synth?, Utterance?, activada? }) → { disponible: boolean, activada: boolean (get/set), desbloquear(), decir(texto), callar() }`
  - `decir` cancela lo que se esté diciendo antes de hablar; no hace nada si `activada` es `false` o no hay `speechSynthesis`.
  - `activada = false` cancela lo que se esté diciendo.

- [ ] **Step 1: Escribir los tests que fallan**

`tests/voice.test.js`:
```js
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
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `node --test`
Expected: FAIL — `Cannot find module '.../js/voice.js'`.

- [ ] **Step 3: Implementar `js/voice.js`**

```js
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
```

- [ ] **Step 4: Ejecutar los tests**

Run: `node --test`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add js/voice.js tests/voice.test.js
git commit -m "Avisos por voz con speechSynthesis"
```

---

### Task 6: Interfaz (lista, editor, ejecución y final)

**Files:**
- Create: `tools/servir.mjs`, `index.html`, `styles.css`, `js/editor.js`, `js/ejecucion.js`, `js/app.js`

**Interfaces:**
- Consumes: todo lo producido en Tasks 1–5.
- Produces:
  - `montarEditor(form: HTMLFormElement, totalEl: HTMLElement) → { cargar(entreno), obtener() → Entreno }`
  - `montarEjecucion(raiz: HTMLElement, { voz, onVozCambiada(activada), onFin({ entreno, segundos, completado }) }) → { empezar(entreno) }`
  - IDs del DOM usados por `app.js`/`ejecucion.js` (definidos en `index.html` abajo).

- [ ] **Step 1: Servidor local `tools/servir.mjs`**

```js
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const puerto = Number(process.env.PORT) || 8080;
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

createServer(async (req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const archivo = normalize(join(raiz, ruta.endsWith('/') ? `${ruta}index.html` : ruta));
  if (!archivo.startsWith(raiz)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const datos = await readFile(archivo);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(datos);
  } catch {
    res.writeHead(404).end('No encontrado');
  }
}).listen(puerto, () => console.log(`http://localhost:${puerto}/`));
```

- [ ] **Step 2: `index.html`**

```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#111418">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Cardio">
  <link rel="manifest" href="manifest.json">
  <link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
  <link rel="icon" href="icons/icon-192.png">
  <link rel="stylesheet" href="styles.css">
  <title>Cardio Timer</title>
  <script type="module" src="js/app.js"></script>
</head>
<body>
  <section id="pantalla-lista" class="pantalla">
    <header class="barra"><h1>Mis entrenos</h1></header>
    <ul id="lista-entrenos" class="lista"></ul>
    <p id="lista-vacia" class="vacio" hidden>Aún no tienes entrenos. Crea el primero.</p>
    <div class="acciones-lista">
      <button id="btn-nuevo" class="btn primario grande">+ Nuevo entreno</button>
      <div class="fila">
        <button id="btn-exportar" class="btn">Exportar</button>
        <button id="btn-importar" class="btn">Importar</button>
      </div>
      <input id="input-importar" type="file" accept="application/json,.json" hidden>
    </div>
  </section>

  <section id="pantalla-editor" class="pantalla" hidden>
    <header class="barra">
      <button id="btn-editor-cancelar" class="btn texto">Cancelar</button>
      <h1 id="editor-titulo">Nuevo entreno</h1>
      <button id="btn-editor-guardar" class="btn texto fuerte">Guardar</button>
    </header>
    <ul id="editor-errores" class="errores"></ul>
    <form id="form-editor" class="form" novalidate></form>
    <p id="editor-total" class="total"></p>
  </section>

  <section id="pantalla-ejecucion" class="pantalla ejecucion" hidden>
    <div class="ej-arriba">
      <span id="ej-progreso"></span>
      <button id="ej-voz" class="btn redondo" aria-label="Silenciar voz">🔊</button>
    </div>
    <p id="ej-aviso" class="aviso" hidden>La pantalla podría apagarse</p>
    <div class="ej-centro">
      <div id="ej-intensidad" class="ej-intensidad"></div>
      <div id="ej-tiempo" class="ej-tiempo">0:00</div>
      <div id="ej-siguiente" class="ej-siguiente"></div>
    </div>
    <div class="ej-controles">
      <button id="ej-terminar" class="btn grande">Terminar</button>
      <button id="ej-saltar" class="btn grande">Saltar</button>
      <button id="ej-pausa" class="btn grande primario">Pausa</button>
    </div>
  </section>

  <section id="pantalla-final" class="pantalla final" hidden>
    <h1 id="fin-titulo">¡Hecho!</h1>
    <p id="fin-nombre"></p>
    <p id="fin-tiempo" class="fin-tiempo"></p>
    <button id="btn-fin-volver" class="btn primario grande">Volver a mis entrenos</button>
  </section>
</body>
</html>
```

- [ ] **Step 3: `styles.css`**

```css
:root {
  --fondo: #111418;
  --superficie: #1c2026;
  --borde: #2c323b;
  --texto: #f2f4f7;
  --suave: #9aa3ae;
  --primario: #f07f13;
  --error: #ff6b7d;
  --z1: #1e6fd9;
  --z2: #1f9d55;
  --z3: #e0b000;
  --z4: #f07f13;
  --z5: #d7263d;
  --descanso: #2b2f36;
  color-scheme: dark;
}

* { box-sizing: border-box; }
[hidden] { display: none !important; }

html, body {
  margin: 0;
  background: var(--fondo);
  color: var(--texto);
  font-family: -apple-system, system-ui, sans-serif;
  -webkit-text-size-adjust: 100%;
  -webkit-tap-highlight-color: transparent;
}

.pantalla {
  min-height: 100dvh;
  padding: calc(env(safe-area-inset-top) + 12px) 16px calc(env(safe-area-inset-bottom) + 16px);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.barra { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.barra h1 { margin: 0; flex: 1; text-align: center; font-size: 1.2rem; }
#pantalla-lista .barra h1 { text-align: left; font-size: 1.8rem; }

.btn {
  appearance: none;
  border: 1px solid var(--borde);
  background: var(--superficie);
  color: var(--texto);
  font: inherit;
  font-size: 1rem;
  padding: 10px 14px;
  border-radius: 12px;
  min-height: 44px;
  cursor: pointer;
}
.btn:disabled { opacity: .35; }
.btn.primario { background: var(--primario); border-color: var(--primario); color: #111; font-weight: 600; }
.btn.peligro { color: var(--error); }
.btn.texto { background: none; border: none; padding: 10px 4px; color: var(--primario); }
.btn.fuerte { font-weight: 700; }
.btn.grande { font-size: 1.15rem; padding: 14px 18px; min-height: 56px; }
.btn.mini { min-height: 36px; padding: 4px 12px; }
.btn.redondo { border-radius: 999px; width: 52px; height: 52px; padding: 0; font-size: 1.4rem; }

.lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.tarjeta { background: var(--superficie); border: 1px solid var(--borde); border-radius: 16px; padding: 14px; display: flex; flex-direction: column; gap: 12px; }
.tarjeta-info { display: flex; flex-direction: column; gap: 4px; }
.tarjeta-info strong { font-size: 1.15rem; }
.tarjeta-info span { color: var(--suave); }
.tarjeta-acciones { display: flex; flex-wrap: wrap; gap: 8px; }
.tarjeta-acciones .btn { flex: 1; }
.tarjeta-acciones .primario { flex: 1 1 100%; }
.vacio { color: var(--suave); text-align: center; margin: 32px 0; }
.acciones-lista { margin-top: auto; display: flex; flex-direction: column; gap: 10px; }

.fila { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.acciones-lista .fila .btn { flex: 1; }

.form { display: flex; flex-direction: column; gap: 16px; }
.campo { display: flex; flex-direction: column; gap: 6px; }
.campo > span { color: var(--suave); font-size: .9rem; }
input, select {
  font: inherit;
  font-size: 16px;
  color: var(--texto);
  background: var(--fondo);
  border: 1px solid var(--borde);
  border-radius: 10px;
  padding: 10px;
  min-height: 44px;
}
input[type=number] { width: 4.2em; text-align: center; }
input[type=checkbox] { width: 22px; height: 22px; min-height: 0; margin: 0; accent-color: var(--primario); }
.grupo { border: 1px solid var(--borde); border-radius: 16px; padding: 12px 14px 14px; margin: 0; display: flex; flex-direction: column; gap: 12px; background: var(--superficie); }
.grupo legend { padding: 0 6px; font-weight: 600; }
.interruptor { display: flex; align-items: center; gap: 8px; }
.intervalo { border-top: 1px solid var(--borde); padding-top: 12px; display: flex; flex-direction: column; gap: 8px; }
.intervalo:first-of-type { border-top: none; padding-top: 0; }
.intervalo-cabecera { display: flex; justify-content: space-between; align-items: center; }
.botones-mini { display: flex; gap: 6px; }
.duracion { display: inline-flex; align-items: center; gap: 4px; }
.duracion span, .fila > span { color: var(--suave); }
.campo-num { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.errores { margin: 0; padding: 10px 10px 10px 28px; color: var(--error); background: rgba(215, 38, 61, .12); border-radius: 12px; }
.errores:empty { display: none; }
.total { color: var(--suave); text-align: center; margin: 0 0 8px; }

.ejecucion { background: var(--descanso); justify-content: space-between; transition: background-color .3s; }
.ejecucion[data-zona="z1"] { background: var(--z1); }
.ejecucion[data-zona="z2"] { background: var(--z2); }
.ejecucion[data-zona="z3"] { background: var(--z3); color: #111; }
.ejecucion[data-zona="z4"] { background: var(--z4); }
.ejecucion[data-zona="z5"] { background: var(--z5); }
.ejecucion[data-zona="descanso"] { background: var(--descanso); }
.ejecucion .btn { background: rgba(0, 0, 0, .22); border-color: rgba(255, 255, 255, .25); color: inherit; }
.ejecucion .btn.primario { background: rgba(0, 0, 0, .5); border-color: transparent; color: #fff; }
.ej-arriba { display: flex; justify-content: space-between; align-items: center; font-size: 1.2rem; font-weight: 600; }
.ej-centro { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; }
.ej-intensidad { font-size: min(15vw, 7rem); font-weight: 800; line-height: 1; letter-spacing: -.02em; }
.ej-tiempo { font-size: min(28vw, 13rem); font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
.ej-siguiente { font-size: 1.3rem; opacity: .85; }
.pausado .ej-tiempo { opacity: .4; }
.ej-controles { display: grid; grid-template-columns: 1fr 1fr 1.4fr; gap: 10px; }
.aviso { margin: 0; text-align: center; background: rgba(0, 0, 0, .35); border-radius: 10px; padding: 8px; }

.final { justify-content: center; align-items: center; text-align: center; }
.final p { margin: 0; color: var(--suave); font-size: 1.2rem; }
.final .fin-tiempo { color: var(--texto); font-size: 4rem; font-weight: 700; font-variant-numeric: tabular-nums; }
```

- [ ] **Step 4: `js/editor.js`**

```js
import { duracionTotal, validar } from './workout.js';
import { duracionCorta, escaparHtml } from './format.js';

const leerNumero = (valor, siVacio) => (valor.trim() === '' ? siVacio : Number(valor));
const mostrarNumero = (n) => (Number.isFinite(n) ? n : '');

function campoDuracion(segundos, attrs) {
  const valido = Number.isFinite(segundos);
  const min = valido ? Math.floor(segundos / 60) : '';
  const seg = valido ? segundos % 60 : '';
  return `<span class="duracion">
    <input type="number" inputmode="numeric" min="0" ${attrs} data-parte="min" value="${min}" aria-label="Minutos"><span>min</span>
    <input type="number" inputmode="numeric" min="0" max="59" ${attrs} data-parte="seg" value="${seg}" aria-label="Segundos"><span>s</span>
  </span>`;
}

function campoIntensidad(it, attrs) {
  const seleccion = it.tipo === 'zona' ? `z${it.valor}` : 'pct';
  const opciones = [1, 2, 3, 4, 5]
    .map((n) => `<option value="z${n}" ${seleccion === `z${n}` ? 'selected' : ''}>Zona ${n}</option>`)
    .join('');
  const pct = it.tipo === 'pct'
    ? `<input type="number" inputmode="numeric" min="1" max="100" ${attrs} data-parte="pct" value="${mostrarNumero(it.valor)}" aria-label="Porcentaje"><span>%</span>`
    : '';
  return `<select ${attrs} data-parte="intensidad" aria-label="Intensidad">${opciones}<option value="pct" ${seleccion === 'pct' ? 'selected' : ''}>%</option></select>${pct}`;
}

export function montarEditor(form, totalEl) {
  let estado = null;

  const bloque = (el) => (el.dataset.bloque === 'intervalo' ? estado.intervalos[Number(el.dataset.indice)] : estado[el.dataset.bloque]);

  function bloqueOpcional(clave, etiqueta) {
    const b = estado[clave];
    const attrs = `data-bloque="${clave}"`;
    return `<fieldset class="grupo">
      <legend><label class="interruptor"><input type="checkbox" data-accion="activar" data-clave="${clave}" ${b ? 'checked' : ''}> ${etiqueta}</label></legend>
      ${b ? `<div class="fila">${campoDuracion(b.segundos, attrs)}${campoIntensidad(b.intensidad, attrs)}</div>` : ''}
    </fieldset>`;
  }

  function intervalo(iv, i, total) {
    const attrs = `data-bloque="intervalo" data-indice="${i}"`;
    return `<div class="intervalo">
      <div class="intervalo-cabecera">
        <strong>Intervalo ${i + 1}</strong>
        <span class="botones-mini">
          <button type="button" class="btn mini" data-accion="subir" data-indice="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
          <button type="button" class="btn mini" data-accion="bajar" data-indice="${i}" ${i === total - 1 ? 'disabled' : ''} aria-label="Bajar">↓</button>
          <button type="button" class="btn mini" data-accion="borrar" data-indice="${i}" ${total === 1 ? 'disabled' : ''} aria-label="Borrar">✕</button>
        </span>
      </div>
      <div class="fila">${campoDuracion(iv.segundos, attrs)}${campoIntensidad(iv.intensidad, attrs)}</div>
    </div>`;
  }

  function actualizarTotal() {
    const valido = validar({ ...estado, nombre: 'x' }).length === 0;
    totalEl.textContent = `Duración total: ${valido ? duracionCorta(duracionTotal(estado)) : '—'}`;
  }

  function render() {
    form.innerHTML = `
      <label class="campo"><span>Nombre</span>
        <input type="text" data-campo="nombre" value="${escaparHtml(estado.nombre)}" placeholder="Ej. Tabata cinta" autocomplete="off">
      </label>
      ${bloqueOpcional('calentamiento', 'Calentamiento')}
      <fieldset class="grupo">
        <legend>Intervalos de la ronda</legend>
        ${estado.intervalos.map((iv, i) => intervalo(iv, i, estado.intervalos.length)).join('')}
        <button type="button" class="btn" data-accion="anadir">+ Añadir intervalo</button>
      </fieldset>
      <fieldset class="grupo">
        <legend>Repeticiones y rondas</legend>
        <label class="campo-num"><span>Repeticiones por ronda</span>
          <input type="number" inputmode="numeric" min="1" data-campo="repeticiones" value="${mostrarNumero(estado.repeticiones)}">
        </label>
        <label class="campo-num"><span>Rondas</span>
          <input type="number" inputmode="numeric" min="1" data-campo="rondas" value="${mostrarNumero(estado.rondas)}">
        </label>
        <div class="campo-num"><span>Descanso entre rondas</span>${campoDuracion(estado.descansoSegundos, 'data-campo="descansoSegundos"')}</div>
      </fieldset>
      ${bloqueOpcional('enfriamiento', 'Enfriamiento')}`;
    actualizarTotal();
  }

  function aplicar(el) {
    const { campo, parte } = el.dataset;
    if (parte === 'min' || parte === 'seg') {
      const span = el.closest('.duracion');
      const segundos = leerNumero(span.querySelector('[data-parte="min"]').value, 0) * 60
        + leerNumero(span.querySelector('[data-parte="seg"]').value, 0);
      if (campo === 'descansoSegundos') estado.descansoSegundos = segundos;
      else bloque(el).segundos = segundos;
    } else if (parte === 'pct') {
      bloque(el).intensidad = { tipo: 'pct', valor: leerNumero(el.value, NaN) };
    } else if (campo === 'nombre') {
      estado.nombre = el.value;
    } else if (campo) {
      estado[campo] = leerNumero(el.value, NaN);
    }
  }

  form.addEventListener('submit', (ev) => ev.preventDefault());

  form.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.tagName === 'SELECT' || el.type === 'checkbox') return;
    aplicar(el);
    actualizarTotal();
  });

  form.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.dataset.accion === 'activar') {
      const zona = el.dataset.clave === 'calentamiento' ? 2 : 1;
      estado[el.dataset.clave] = el.checked ? { segundos: 300, intensidad: { tipo: 'zona', valor: zona } } : null;
      render();
    } else if (el.tagName === 'SELECT') {
      const b = bloque(el);
      if (el.value !== 'pct') b.intensidad = { tipo: 'zona', valor: Number(el.value.slice(1)) };
      else if (b.intensidad.tipo !== 'pct') b.intensidad = { tipo: 'pct', valor: 80 };
      render();
    }
  });

  form.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-accion]');
    if (!btn) return;
    const ivs = estado.intervalos;
    const i = Number(btn.dataset.indice);
    switch (btn.dataset.accion) {
      case 'subir': [ivs[i - 1], ivs[i]] = [ivs[i], ivs[i - 1]]; break;
      case 'bajar': [ivs[i], ivs[i + 1]] = [ivs[i + 1], ivs[i]]; break;
      case 'borrar': ivs.splice(i, 1); break;
      case 'anadir': ivs.push({ segundos: 30, intensidad: { tipo: 'zona', valor: 3 } }); break;
      default: return;
    }
    render();
  });

  return {
    cargar(entreno) {
      estado = structuredClone(entreno);
      render();
    },
    obtener() {
      return structuredClone(estado);
    },
  };
}
```

- [ ] **Step 5: `js/ejecucion.js`**

```js
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
```

- [ ] **Step 6: `js/app.js`**

```js
import { entrenoNuevo, validar } from './workout.js';
import { crearAlmacen, exportar, parsearImportacion } from './storage.js';
import { crearVoz } from './voice.js';
import { escaparHtml, formatoReloj, resumenEntreno } from './format.js';
import { montarEditor } from './editor.js';
import { montarEjecucion } from './ejecucion.js';

const $ = (sel) => document.querySelector(sel);
const almacen = crearAlmacen();
let entrenos = almacen.cargarEntrenos();
const voz = crearVoz({ activada: almacen.vozActivada() });
const editor = montarEditor($('#form-editor'), $('#editor-total'));
const ejecucion = montarEjecucion($('#pantalla-ejecucion'), {
  voz,
  onVozCambiada: (activada) => almacen.guardarVoz(activada),
  onFin: ({ entreno, segundos, completado }) => {
    $('#fin-titulo').textContent = completado ? '¡Hecho!' : 'Entreno terminado';
    $('#fin-nombre').textContent = entreno.nombre;
    $('#fin-tiempo').textContent = formatoReloj(segundos);
    mostrar('final');
  },
});

function mostrar(nombre) {
  for (const p of document.querySelectorAll('.pantalla')) p.hidden = p.id !== `pantalla-${nombre}`;
  window.scrollTo(0, 0);
}

function guardar() {
  try {
    almacen.guardarEntrenos(entrenos);
    return true;
  } catch {
    alert('No se pudo guardar en este dispositivo.');
    return false;
  }
}

function renderLista() {
  $('#lista-vacia').hidden = entrenos.length > 0;
  $('#lista-entrenos').innerHTML = entrenos.map((e) => `
    <li class="tarjeta" data-id="${escaparHtml(e.id)}">
      <div class="tarjeta-info"><strong>${escaparHtml(e.nombre)}</strong><span>${escaparHtml(resumenEntreno(e))}</span></div>
      <div class="tarjeta-acciones">
        <button class="btn primario grande" data-accion="empezar">Empezar</button>
        <button class="btn" data-accion="editar">Editar</button>
        <button class="btn" data-accion="duplicar">Duplicar</button>
        <button class="btn peligro" data-accion="borrar">Borrar</button>
      </div>
    </li>`).join('');
}

function abrirEditor(entreno, titulo) {
  $('#editor-titulo').textContent = titulo;
  $('#editor-errores').innerHTML = '';
  editor.cargar(entreno);
  mostrar('editor');
}

$('#lista-entrenos').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-accion]');
  if (!btn) return;
  const e = entrenos.find((x) => x.id === btn.closest('li').dataset.id);
  if (!e) return;
  switch (btn.dataset.accion) {
    case 'empezar':
      mostrar('ejecucion');
      ejecucion.empezar(e);
      break;
    case 'editar':
      abrirEditor(e, 'Editar entreno');
      break;
    case 'duplicar':
      entrenos.splice(entrenos.indexOf(e) + 1, 0, { ...structuredClone(e), id: crypto.randomUUID(), nombre: `${e.nombre} (copia)` });
      guardar();
      renderLista();
      break;
    case 'borrar':
      if (confirm(`¿Borrar "${e.nombre}"?`)) {
        entrenos = entrenos.filter((x) => x !== e);
        guardar();
        renderLista();
      }
      break;
  }
});

$('#btn-nuevo').addEventListener('click', () => abrirEditor(entrenoNuevo(crypto.randomUUID()), 'Nuevo entreno'));
$('#btn-editor-cancelar').addEventListener('click', () => mostrar('lista'));
$('#btn-fin-volver').addEventListener('click', () => mostrar('lista'));

$('#btn-editor-guardar').addEventListener('click', () => {
  const e = editor.obtener();
  e.nombre = e.nombre.trim();
  const errores = validar(e);
  if (errores.length) {
    $('#editor-errores').innerHTML = errores.map((t) => `<li>${escaparHtml(t)}</li>`).join('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  const i = entrenos.findIndex((x) => x.id === e.id);
  if (i >= 0) entrenos[i] = e;
  else entrenos.push(e);
  if (guardar()) {
    renderLista();
    mostrar('lista');
  }
});

$('#btn-exportar').addEventListener('click', async () => {
  if (!entrenos.length) {
    alert('No hay entrenos que exportar.');
    return;
  }
  const nombre = `cardio-timer-${new Date().toISOString().slice(0, 10)}.json`;
  const archivo = new File([exportar(entrenos)], nombre, { type: 'application/json' });
  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo] });
    } catch (err) {
      if (err.name !== 'AbortError') alert('No se pudo exportar.');
    }
    return;
  }
  const url = URL.createObjectURL(archivo);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$('#btn-importar').addEventListener('click', () => $('#input-importar').click());

$('#input-importar').addEventListener('change', async (ev) => {
  const archivo = ev.target.files[0];
  ev.target.value = '';
  if (!archivo) return;
  const r = parsearImportacion(await archivo.text());
  if (!r.ok) {
    alert(`No se pudo importar: ${r.error}`);
    return;
  }
  if (!confirm(`Se reemplazarán tus ${entrenos.length} entrenos por los ${r.entrenos.length} del archivo. ¿Continuar?`)) return;
  entrenos = r.entrenos;
  if (guardar()) renderLista();
});

renderLista();
mostrar('lista');
```

- [ ] **Step 7: Comprobar los tests y arrancar el servidor**

Run: `node --test` → Expected: PASS (todos; esta task no añade tests de Node).
Run en segundo plano: `node tools/servir.mjs` → Expected: imprime `http://localhost:8080/`.

- [ ] **Step 8: Prueba en navegador (Playwright, viewport 402×874)**

1. Abrir `http://localhost:8080/`. Expected: "Mis entrenos", mensaje de lista vacía, sin errores en consola (los 404 de `manifest.json` e iconos son esperados hasta Task 7).
2. "+ Nuevo entreno" → "Guardar" sin nombre. Expected: aparece "Pon un nombre al entreno".
3. Poner nombre "Prueba", borrar el valor de "Rondas". Expected: "Duración total: —". Guardar → error de rondas.
4. Rondas = 2, repeticiones = 1, intervalos: 0 min 6 s Zona 4 y 0 min 4 s 80 %; descanso 0 min 3 s. Expected: "Duración total: 23 s". Pulsar "+ Añadir intervalo" y luego ✕ en él; ↑/↓ reordenan. Guardar.
5. Lista: tarjeta "Prueba" con "23 s · 2×1 · Z4/80 %". Duplicar → aparece "Prueba (copia)". Borrar la copia (aceptar confirm).
6. Recargar la página. Expected: "Prueba" sigue ahí.
7. "Empezar". Expected: fondo naranja, "ZONA 4", cuenta atrás desde 0:06, "Ronda 1/2 · Rep 1/1", "Siguiente: 80 % · 4 s". A los 6 s fondo naranja de nuevo (80 % → Z4) con "80 %"; luego "DESCANSO" gris; Pausa congela el tiempo y Continuar lo reanuda; Saltar avanza de fase; al final pantalla "¡Hecho!" con "0:23".
8. Empezar otra vez → Terminar (aceptar) → "Entreno terminado" con el tiempo transcurrido.
9. Exportar descarga `cardio-timer-AAAA-MM-DD.json`; Importar ese archivo y aceptar → la lista sigue igual. Importar un archivo `.json` con `{"version":1,"entrenos":[{"id":"a"}]}` → alerta "No se pudo importar: …" y la lista no cambia.
10. Comprobar que no hay scroll horizontal en ninguna pantalla.

- [ ] **Step 9: Commit**

```bash
git add tools/servir.mjs index.html styles.css js/editor.js js/ejecucion.js js/app.js
git commit -m "Interfaz: lista, editor, ejecución y pantalla final"
```

---

### Task 7: PWA (manifest, iconos, service worker)

**Files:**
- Create: `manifest.json`, `sw.js`, `tools/generar-iconos.mjs`, `icons/icon-192.png`, `icons/icon-512.png`, `icons/apple-touch-icon.png`
- Modify: `js/app.js` (registrar el service worker al final)
- Test: `tests/sw.test.js`

**Interfaces:**
- Consumes: lista de archivos de la app.
- Produces: `sw.js` con `const ARCHIVOS = [...]` (comillas simples, sin coma final; el test lo parsea) y `const VERSION = 'v1'`.

- [ ] **Step 1: Escribir el test que falla**

`tests/sw.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const leer = (ruta) => readFileSync(new URL(`../${ruta}`, import.meta.url), 'utf8');

function archivosCacheados() {
  const coincidencia = leer('sw.js').match(/const ARCHIVOS = (\[[\s\S]*?\]);/);
  assert.ok(coincidencia, 'sw.js debe declarar const ARCHIVOS = [...]');
  return JSON.parse(coincidencia[1].replace(/'/g, '"'));
}

test('todos los archivos cacheados existen', () => {
  for (const ruta of archivosCacheados().filter((r) => r !== './')) {
    assert.ok(existsSync(new URL(`../${ruta.slice(2)}`, import.meta.url)), `falta ${ruta}`);
  }
});

test('todos los módulos de js/, index, estilos, manifest e iconos están cacheados', () => {
  const lista = archivosCacheados();
  const esperados = [
    './', './index.html', './styles.css', './manifest.json',
    ...readdirSync(new URL('../js', import.meta.url)).map((f) => `./js/${f}`),
    ...readdirSync(new URL('../icons', import.meta.url)).map((f) => `./icons/${f}`),
  ];
  for (const ruta of esperados) assert.ok(lista.includes(ruta), `sw.js no cachea ${ruta}`);
});

test('el manifest apunta a iconos existentes', () => {
  const manifest = JSON.parse(leer('manifest.json'));
  assert.equal(manifest.start_url, './');
  for (const icono of manifest.icons) assert.ok(existsSync(new URL(`../${icono.src}`, import.meta.url)), icono.src);
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `node --test`
Expected: FAIL — `ENOENT ... sw.js`.

- [ ] **Step 3: Generador de iconos `tools/generar-iconos.mjs`**

Dibuja un cronómetro blanco sobre fondo naranja (`#f07f13`), con suavizado 4×4, y escribe PNG RGBA sin dependencias.

```js
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const TABLA = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABLA[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

function esBlanco(x, y, s) {
  const cx = s / 2, cy = s * 0.55, r = s * 0.29, grosor = s * 0.065;
  const d = Math.hypot(x - cx, y - cy);
  const aro = Math.abs(d - r) < grosor / 2;
  const aguja = Math.abs(x - cx) < grosor / 2 && y < cy && y > cy - r * 0.7;
  const centro = d < grosor * 0.8;
  const boton = Math.abs(x - cx) < s * 0.06 && y > cy - r - s * 0.11 && y < cy - r;
  return aro || aguja || centro || boton;
}

function png(s) {
  const fondo = [0xf0, 0x7f, 0x13];
  const fila = s * 4 + 1;
  const raw = Buffer.alloc(fila * s);
  for (let y = 0; y < s; y++) {
    raw[y * fila] = 0;
    for (let x = 0; x < s; x++) {
      let cobertura = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        if (esBlanco(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4, s)) cobertura++;
      }
      const a = cobertura / 16;
      const o = y * fila + 1 + x * 4;
      for (let c = 0; c < 3; c++) raw[o + c] = Math.round(fondo[c] * (1 - a) + 255 * a);
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(s, 0);
  ihdr.writeUInt32BE(s, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const destino = new URL('../icons/', import.meta.url);
mkdirSync(destino, { recursive: true });
for (const [nombre, tam] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(new URL(nombre, destino), png(tam));
  console.log(`icons/${nombre} (${tam}×${tam})`);
}
```

Run: `node tools/generar-iconos.mjs`
Expected: tres líneas `icons/… (N×N)`. Abrir `icons/icon-512.png` con Read para comprobar visualmente que es un cronómetro blanco sobre naranja.

- [ ] **Step 4: `manifest.json`**

```json
{
  "name": "Cardio Timer",
  "short_name": "Cardio",
  "lang": "es",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#111418",
  "theme_color": "#111418",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 5: `sw.js`**

```js
const VERSION = 'v1';
const CACHE = `cardio-timer-${VERSION}`;
const ARCHIVOS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './js/app.js',
  './js/editor.js',
  './js/ejecucion.js',
  './js/format.js',
  './js/storage.js',
  './js/timer.js',
  './js/voice.js',
  './js/workout.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k.startsWith('cardio-timer-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (ev) => {
  if (ev.request.method !== 'GET') return;
  ev.respondWith(caches.match(ev.request, { ignoreSearch: true }).then((r) => r ?? fetch(ev.request)));
});
```

- [ ] **Step 6: Registrar el service worker al final de `js/app.js`**

Añadir tras `mostrar('lista');`:
```js
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
```

- [ ] **Step 7: Ejecutar los tests**

Run: `node --test`
Expected: PASS (todos, incluidos los 3 de `sw.test.js`).

- [ ] **Step 8: Prueba en navegador**

Con `node tools/servir.mjs` corriendo, abrir `http://localhost:8080/` en Playwright, recargar una vez y evaluar:
```js
(async () => ({ sw: !!(await navigator.serviceWorker.getRegistration()), cache: (await caches.keys()) }))()
```
Expected: `sw: true`, `cache` contiene `"cardio-timer-v1"`. Sin errores 404 en consola.

- [ ] **Step 9: Commit**

```bash
git add manifest.json sw.js tools/generar-iconos.mjs icons js/app.js tests/sw.test.js
git commit -m "PWA: manifest, iconos y funcionamiento sin conexión"
```

---

### Task 8: Publicación en GitHub Pages

**Files:**
- Create: `README.md`

- [ ] **Step 1: `README.md`**

```markdown
# Cardio Timer

Temporizador de intervalos para cardio. PWA personal: https://ericarmengol.github.io/cardio-timer/

- Instalar en iPhone: abrir la URL en Safari → Compartir → "Añadir a pantalla de inicio".
- Tests: `node --test`
- Servidor local: `node tools/servir.mjs` → http://localhost:8080/
- Al publicar cambios, subir `VERSION` en `sw.js` para que el iPhone descargue la nueva versión.
```

- [ ] **Step 2: Commit y crear el repositorio público**

```bash
git add README.md
git commit -m "README con instrucciones"
gh repo create cardio-timer --public --source . --remote origin --push
```
Expected: `✓ Created repository ericarmengol/cardio-timer` y push de `main`.

- [ ] **Step 3: Activar GitHub Pages**

```bash
gh api -X POST repos/ericarmengol/cardio-timer/pages -f "source[branch]=main" -f "source[path]=/"
```
Expected: JSON con `"html_url": "https://ericarmengol.github.io/cardio-timer/"`.

- [ ] **Step 4: Esperar el despliegue y verificar**

```bash
gh api repos/ericarmengol/cardio-timer/pages/builds/latest --jq .status
```
Repetir hasta `built` (normalmente < 2 min). Luego:
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://ericarmengol.github.io/cardio-timer/
curl -s -o /dev/null -w "%{http_code}\n" https://ericarmengol.github.io/cardio-timer/sw.js
curl -s -o /dev/null -w "%{http_code}\n" https://ericarmengol.github.io/cardio-timer/icons/apple-touch-icon.png
```
Expected: `200` en los tres. Abrir la URL en Playwright y repetir los pasos 1, 4 y 7 de Task 6 Step 8.

---

### Task 9: Comprobación en el iPhone (la hace el usuario)

No hay código. Checklist para el usuario en su iPhone 17 Pro:

- [ ] Abrir `https://ericarmengol.github.io/cardio-timer/` en Safari → Compartir → "Añadir a pantalla de inicio". Aparece el icono "Cardio".
- [ ] Abrir desde el icono: se ve a pantalla completa, sin barra de Safari.
- [ ] Crear un entreno corto (p. ej. 2 rondas × 2 reps de 8 s Z4 / 4 s Z1, 10 s descanso) y empezarlo.
- [ ] La voz dice "Zona 4, 8 segundos" y cuenta "3, 2, 1" en las fases de 8 s y en el descanso de 10 s, pero no en las de 4 s (solo se cuenta en fases de más de 5 s).
- [ ] El botón 🔊/🔇 silencia y reactiva la voz; la preferencia se mantiene al reabrir.
- [ ] La pantalla no se apaga durante un entreno de varios minutos.
- [ ] Salir a otra app 20 s y volver: la fase mostrada es la correcta y se anuncia.
- [ ] Pausa, Saltar y Terminar funcionan.
- [ ] Con el interruptor de silencio activado: ¿se oye la voz? (Anotar el resultado.)
- [ ] Con música en auriculares: la voz se oye por encima.
- [ ] Modo avión → abrir la app desde el icono: funciona sin conexión.
- [ ] Exportar: aparece la hoja de compartir; guardar en Archivos. Importar ese archivo: funciona.
