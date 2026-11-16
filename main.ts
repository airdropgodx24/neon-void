// Neon Void — a best-game-01 entry (Node 22, standard library only).
//
// The game itself is the game/ folder beside this file: plain static files a desktop browser
// loads fully offline (game/index.html and its ES modules — no library, no network request).
// This program hands it in: it copies game/ and screenshots/ to the output directory, writes
// dossier.json there with the vendored make.fun library (exactly the summary the judge
// reads), then verifies its own hand-in and prints a one-line summary of what was handed in.
//
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The caps are the scorer's own (the kit's gate): 3 or 4 screenshots of at most 256 KiB
// each, at most 993 files and 48 MiB under game/, no game path over 1,000 bytes, the
// dossier's source text capped at 160 KiB and the dossier itself at 1.5 MiB. buildDossier
// refuses an entry the scorer would refuse; the checks below report the same limits in
// plain words before that, so a broken hand-in fails with a readable reason.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};
const DOSSIER_MAX_BYTES = 1.5 * 1024 * 1024;

function checkScreenshots(dir) {
  const shots = existsSync(dir)
    ? readdirSync(dir).filter((name) => !name.startsWith('.')).sort()
    : [];
  if (shots.length < 3 || shots.length > CAPS.screenshots.max) {
    throw new Error(`screenshots/: expected 3 or 4 screenshots, found ${shots.length}`);
  }
  for (const name of shots) {
    const size = statSync(join(dir, name)).size;
    if (size > CAPS.screenshots.max_bytes) {
      throw new Error(`screenshots/${name}: ${size} bytes is over the 256 KiB cap`);
    }
  }
  return shots;
}

const shots = checkScreenshots(join(here, 'screenshots'));

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

const dossierPath = join(out, 'dossier.json');
writeFileSync(dossierPath, buildDossier(out, CAPS));

// Verify the hand-in the way the scorer will read it: the dossier parses, it is inside its
// size limit, and it carries the screenshots that were checked above, cover first.
const dossier = JSON.parse(readFileSync(dossierPath, 'utf8'));
const dossierBytes = statSync(dossierPath).size;
if (dossierBytes > DOSSIER_MAX_BYTES) {
  throw new Error(`dossier.json: ${dossierBytes} bytes is over the 1.5 MiB limit`);
}
if (!Array.isArray(dossier.images) || dossier.images.length !== shots.length) {
  throw new Error(`dossier.json: expected ${shots.length} images, found ${dossier.images?.length ?? 0}`);
}
console.log(`Neon Void handed in: ${shots.length} screenshots (${shots.join(', ')}), dossier.json ${dossierBytes} bytes.`);
