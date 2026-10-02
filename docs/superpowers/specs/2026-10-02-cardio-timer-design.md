# Cardio Timer — Diseño

Fecha: 2026-10-02

## Objetivo

PWA personal para iPhone 17 Pro que hace de temporizador de intervalos para cardio en el gimnasio. Permite configurar entrenos (intervalos con intensidad, repeticiones, rondas y descansos), guardarlos en el dispositivo y ejecutarlos con avisos visuales grandes y voz en cada cambio de fase.

**Éxito:** el usuario instala la app desde Safari en la pantalla de inicio, crea un entreno en segundos, lo ejecuta con el móvil delante (pantalla siempre encendida) y sabe en todo momento qué toca, mirando o escuchando.

## Alcance

**Incluido**
- Lista de entrenos guardados (crear, editar, duplicar, borrar).
- Editor con estructura fija: calentamiento opcional → [intervalos] × repeticiones = ronda → rondas con descanso entre ellas → enfriamiento opcional.
- Ronda con 1 o más intervalos; cada intervalo tiene duración e intensidad.
- Intensidad: Zona 1–5 o porcentaje (1–100 %).
- Pantalla de ejecución: intensidad enorme, cuenta atrás grande, color de fondo por zona, progreso (ronda/rep), siguiente fase.
- Controles: pausa/continuar, saltar fase, terminar, interruptor de voz.
- Voz en español: anuncio de cada fase ("Zona 4, 20 segundos", "Descanso, 60 segundos") y cuenta atrás "3, 2, 1" al final de cada fase.
- Pantalla siempre encendida durante el entreno (Screen Wake Lock API).
- Funciona sin conexión (service worker).
- Exportar/importar entrenos a archivo JSON (copia de seguridad).
- Pantalla final con tiempo total.

**Excluido (por ahora)**
- Historial de sesiones, estadísticas.
- Bloques libres / estructuras arbitrarias.
- Funcionamiento con pantalla bloqueada (no es posible en una PWA de iOS).
- Cuentas, sincronización, backend.

## Arquitectura

HTML + CSS + JavaScript vanilla con módulos ES. Sin build ni dependencias de ejecución. Publicado en GitHub Pages (repositorio público `cardio-timer`, URL `https://ericarmengol.github.io/cardio-timer/`).

```
index.html          estructura de las pantallas (lista, editor, ejecución, final)
styles.css          estilos, colores por zona, layout móvil
manifest.json       PWA: nombre, iconos, colores, display standalone
sw.js               service worker: cachea los archivos para uso offline
icons/              iconos de la app (incl. apple-touch-icon)
js/app.js           navegación entre pantallas y conexión de las piezas
js/storage.js       cargar/guardar entrenos (localStorage), exportar/importar
js/workout.js       entreno → lista plana de fases; duración total; validación
js/timer.js         motor del temporizador basado en reloj real
js/voice.js         síntesis de voz (es-ES), interruptor on/off
js/editor.js        formulario del editor de entrenos
tests/              tests con node:test
```

Cada módulo tiene una sola responsabilidad. `workout.js` y `timer.js` son lógica pura (sin DOM) y se prueban con Node.

## Modelo de datos

```js
// Intensidad
{ tipo: "zona", valor: 1..5 } | { tipo: "pct", valor: 1..100 }

// Entreno
{
  id: string,
  nombre: string,
  calentamiento: { segundos, intensidad } | null,
  intervalos: [ { segundos, intensidad }, ... ],   // mínimo 1
  repeticiones: number,        // ≥ 1, veces que se repiten los intervalos por ronda
  rondas: number,              // ≥ 1
  descansoSegundos: number,    // ≥ 0, entre rondas (no tras la última)
  enfriamiento: { segundos, intensidad } | null
}
```

Almacenamiento: `localStorage` con clave `cardio-timer:entrenos` (array de entrenos) y `cardio-timer:voz` (booleano). Archivo de exportación: `{ version: 1, entrenos: [...] }`.

## Generación de fases (`workout.js`)

`generarFases(entreno)` devuelve una lista plana:

```js
{ tipo: "calentamiento" | "intervalo" | "descanso" | "enfriamiento",
  segundos, intensidad /* null en descanso */,
  ronda, rep /* null fuera de intervalos */, indiceIntervalo }
```

Orden: calentamiento (si hay) → para cada ronda r en 1..rondas: para cada rep en 1..repeticiones: cada intervalo → descanso si r < rondas y descansoSegundos > 0 → enfriamiento (si hay).

También: `duracionTotal(entreno)` y `validar(entreno)` → lista de errores (vacía si es válido).

## Temporizador (`timer.js`)

- Basado en reloj real: guarda el instante de inicio y el tiempo pausado acumulado; la posición actual se calcula a partir de `Date.now()`. No acumula deriva.
- Función pura `posicionEn(fases, msTranscurridos)` → `{ indiceFase, msRestantesFase, terminado }`.
- La clase `Temporizador` hace tick con `requestAnimationFrame`/`setInterval` (~4/s), detecta cambios de fase y segundos restantes, y emite eventos: `fase` (nueva fase), `segundo` (segundos restantes enteros), `fin`.
- Pausa/continuar, saltar fase (adelanta el tiempo transcurrido al inicio de la siguiente fase), terminar.
- Al volver de segundo plano, el entreno ha seguido corriendo: se recalcula la posición, se salta a la fase correcta y se anuncia.

## Voz (`voice.js`)

- `speechSynthesis` con voz `es-ES` preferida, si no cualquier `es-*`.
- Se desbloquea en el toque de "Empezar" (requisito de iOS: primer `speak` en un gesto de usuario).
- Anuncios: al empezar cada fase ("Zona 4, 20 segundos", "80 por ciento, 30 segundos", "Descanso, 60 segundos", "Calentamiento, 5 minutos", "Enfriamiento…"); "3", "2", "1" en los últimos 3 segundos de cada fase (solo si la fase dura más de 5 s); "Entreno terminado" al final.
- Interruptor persistente; si está apagado no se habla.
- Duraciones habladas en formato natural ("1 minuto 30 segundos").

## Pantalla de ejecución

- Fondo por intensidad: Z1 azul, Z2 verde, Z3 amarillo, Z4 naranja, Z5 rojo. Porcentaje mapeado por tramos: <60 Z1, 60–69 Z2, 70–79 Z3, 80–89 Z4, ≥90 Z5. Descanso: gris oscuro. Calentamiento/enfriamiento: color de su intensidad.
- Texto principal enorme ("ZONA 4" / "80 %" / "DESCANSO"), cuenta atrás grande (mm:ss), línea de progreso "Ronda 2/3 · Rep 5/8", "Siguiente: Z1 · 10 s".
- Botones grandes: pausa/continuar, saltar, terminar (con confirmación), 🔊/🔇.
- Wake Lock: se solicita al empezar; se vuelve a solicitar en `visibilitychange` cuando la app vuelve a primer plano; se libera al terminar.

## Errores y validación

- El editor no permite guardar si: nombre vacío, ningún intervalo, alguna duración ≤ 0, repeticiones o rondas < 1, descanso < 0, zona fuera de 1–5, porcentaje fuera de 1–100. Se muestran los errores junto al formulario.
- Importar: se valida el archivo (formato y cada entreno) antes de reemplazar nada; se pide confirmación; si es inválido se muestra el motivo y no se toca nada.
- Si Wake Lock no está disponible, se muestra un aviso discreto ("La pantalla podría apagarse").
- Si no hay voz en español disponible, se usa la voz por defecto.

## Pruebas

- Automáticas (`node --test`): `generarFases` (orden, sin descanso tras la última ronda, calentamiento/enfriamiento opcionales, varios intervalos, repeticiones), `duracionTotal`, `validar`, `posicionEn` (límites de fase, fin, tiempos intermedios), validación de importación y formato de duraciones habladas.
- Manuales en el iPhone (checklist): instalar en pantalla de inicio, abrir sin conexión, voz al cambiar de fase y cuenta atrás, interruptor de voz, pantalla no se apaga, salir a otra app y volver (fase correcta + anuncio), pausa/saltar/terminar, voz con modo silencio activado, voz sobre música con auriculares, exportar/importar.

## Publicación

- Repositorio git local en `C:\Users\erica\Documents\@projects\cardio-timer`.
- Repositorio público `ericarmengol/cardio-timer` en GitHub, creado con `gh`.
- GitHub Pages desde la rama `main`, raíz del repositorio.
- Todas las rutas relativas (la app vive bajo `/cardio-timer/`).
- El service worker usa una versión de caché; al publicar cambios se sube la versión para que el iPhone descargue lo nuevo.
