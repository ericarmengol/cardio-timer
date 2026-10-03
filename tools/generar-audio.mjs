// Genera audio/<id>.mp3 para cada clip de js/frases.js y actualiza la lista AUDIO de sw.js.
// Requiere Windows (voces es-ES de System.Speech) y ffmpeg en el PATH.
// Uso: node tools/generar-audio.mjs [nombre de voz]   (por defecto "Microsoft Laura")
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIPS } from '../js/frases.js';

const voz = process.argv[2] ?? 'Microsoft Laura';
const raiz = fileURLToPath(new URL('..', import.meta.url));
const destino = join(raiz, 'audio');
const temporal = mkdtempSync(join(tmpdir(), 'cardio-audio-'));
mkdirSync(destino, { recursive: true });

writeFileSync(join(temporal, 'clips.json'), JSON.stringify(CLIPS), 'utf8');
writeFileSync(join(temporal, 'sintetizar.ps1'), `
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice('${voz}')
$s.Rate = 1
$clips = Get-Content -Raw -Encoding UTF8 '${join(temporal, 'clips.json')}' | ConvertFrom-Json
foreach ($p in $clips.PSObject.Properties) {
  $s.SetOutputToWaveFile((Join-Path '${temporal}' ($p.Name + '.wav')))
  $s.Speak($p.Value)
}
$s.SetOutputToNull()
`, 'utf8');
execFileSync('pwsh', ['-NoProfile', '-File', join(temporal, 'sintetizar.ps1')], { stdio: 'inherit' });

const recorte = 'silenceremove=start_periods=1:start_threshold=-60dB,areverse,silenceremove=start_periods=1:start_threshold=-60dB,areverse,adelay=25,apad=pad_dur=0.04';
// Volumen alto y comprimido para oírse por encima de la música (~-12 LUFS, pico -1 dB).
const realce = 'highpass=f=100,acompressor=threshold=-30dB:ratio=6:attack=3:release=80:makeup=2,volume=16dB,alimiter=limit=0.89:level=disabled';
for (const id of Object.keys(CLIPS)) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(temporal, `${id}.wav`), '-af', `${recorte},${realce}`, '-ac', '1', '-ar', '24000', '-b:a', '48k', join(destino, `${id}.mp3`)]);
}
rmSync(temporal, { recursive: true, force: true });

const sw = join(raiz, 'sw.js');
const lista = Object.keys(CLIPS).map((id) => `  './audio/${id}.mp3'`).join(',\n');
writeFileSync(sw, readFileSync(sw, 'utf8').replace(/const AUDIO = \[[\s\S]*?\];/, `const AUDIO = [\n${lista}\n];`), 'utf8');
console.log(`${Object.keys(CLIPS).length} clips generados con la voz "${voz}"`);
