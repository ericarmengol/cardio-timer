import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { CLIPS } from '../js/frases.js';

const leer = (ruta) => readFileSync(new URL(`../${ruta}`, import.meta.url), 'utf8');

function lista(nombre) {
  const coincidencia = leer('sw.js').match(new RegExp(`const ${nombre} = (\\[[\\s\\S]*?\\]);`));
  assert.ok(coincidencia, `sw.js debe declarar const ${nombre} = [...]`);
  return JSON.parse(coincidencia[1].replace(/'/g, '"'));
}

const archivosCacheados = () => [...lista('ARCHIVOS'), ...lista('AUDIO')];

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

test('la instalación descarga los archivos saltándose la caché HTTP', () => {
  assert.match(leer('sw.js'), /addAll\(\[\.\.\.ARCHIVOS, \.\.\.AUDIO\]\.map\(\(u\) => new Request\(u, \{ cache: 'reload' \}\)\)\)/);
});

test('cada clip de voz tiene su mp3 y está cacheado', () => {
  const audio = lista('AUDIO');
  for (const id of Object.keys(CLIPS)) {
    assert.ok(audio.includes(`./audio/${id}.mp3`), `sw.js no cachea audio/${id}.mp3`);
    assert.ok(existsSync(new URL(`../audio/${id}.mp3`, import.meta.url)), `falta audio/${id}.mp3`);
  }
});

test('la instalación cachea también el audio', () => {
  assert.match(leer('sw.js'), /[...ARCHIVOS, ...AUDIO]/);
});
