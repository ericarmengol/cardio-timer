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
