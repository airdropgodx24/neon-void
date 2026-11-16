# neon-void

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/airdropgodx24/neon-void/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/airdropgodx24/neon-void/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

**Neon Void** is a twin-stick arena survival shooter that plays entirely in the browser, offline, from static files. The void is spawning waves of neon hostiles into your arena. Hold the line, chain kills into combo multipliers, and charge the core to **6,000 points** to drive the void back and win. Let your hull reach zero and the run ends.

Five enemy kinds keep the pressure varied: **Drifters** hunt you in packs, **Speeders** dart in fast, **Weavers** orbit and strafe, **Stingers** hang back and shoot, and **Brutes** soak up fire and split in two when they die. Downed hostiles drop pickups — hull repairs, cannon upgrades up to a triple shot, and an aegis shield — and every wave cleared pays a bonus. All sound is synthesised live with Web Audio; there are no audio files and no network requests.

## How to play

- **WASD / arrow keys** — move
- **Mouse** — aim
- **Hold click / Space** — fire
- **P** — pause, **M** — mute
- Reach 6,000 points to win; survive as many waves as you can on the way

## Run it

The game is plain static files under `game/` — no build step, no dependencies. Serve that folder with any static file server and open it in a desktop browser:

```sh
node serve.ts            # serves game/ on http://localhost:8080
```

then open <http://localhost:8080>. Or use any other static server rooted at `game/` (for example `python3 -m http.server -d game 8080`).

`main.ts` is the entry program that hands the game in: it copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with the vendored make.fun library.

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Screenshots are staged from the game itself: `game/index.html?shot=start|play|frenzy|end&seed=7` sets up a scene flown by an autopilot (see `shots.json` for the four captures in `screenshots/`).

---

<sub>Entered on [make.fun](https://make.fun/?ref=ty7xpzdw&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
