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
