// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps,
// and the renderer paints what is there. The game moves between title, play, paused, game over
// and victory screens, and translates world events into sound.
//
// ?seed=N fixes the run's random pattern. ?shot=start|play|frenzy|end (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets window.__shotReady so a
// screenshot can be taken of a real frame.

import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld, EVENT_BOOM, EVENT_EHIT, EVENT_HIT, EVENT_OVER, EVENT_PICKUP,
  EVENT_SHOOT, EVENT_WAVE, EVENT_WAVE_CLEAR, EVENT_WIN,
} from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25; // a longer stall (a hidden tab) is dropped, not replayed

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const input = createInput(canvas);
const audio = createAudio();
input.setViewTransform((x, y) => renderer.toView(x, y));
input.onGesture(() => audio.unlock());

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let best = readBest();
  if (scene.screen === SCREEN_OVER) best = Math.max(best, world.state.score);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.startRun();
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.uiClick();
    announce('Playing. Charge the core to 6,000. Do not let the hull reach zero.');
  }

  function finishRun(wonGame) {
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    screen = wonGame ? SCREEN_WIN : SCREEN_OVER;
    announce(wonGame
      ? `Victory. Final score ${world.state.score}.`
      : `Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function playEvents(events) {
    if (events & EVENT_SHOOT) audio.shoot();
    if (events & EVENT_EHIT) audio.enemyHit();
    if (events & EVENT_BOOM) audio.explosion(false);
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_WAVE) audio.waveStart();
    if (events & EVENT_WAVE_CLEAR) audio.waveClear();
    if (events & EVENT_HIT) {
      audio.hurt();
      announce(world.state.player.hp > 0 ? `Hit. Hull ${Math.ceil(world.state.player.hp)}.` : 'Ship destroyed.');
    }
    if (events & EVENT_WIN) {
      audio.victory();
      finishRun(true);
    } else if (events & EVENT_OVER) {
      audio.explosion(true);
      audio.gameOver();
      finishRun(false);
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      announce(audio.toggleMute() ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function control() {
    const dir = input.direction();
    const aim = input.aim();
    return { moveX: dir.x, moveY: dir.y, aimX: aim.x, aimY: aim.y, firing: input.firing() };
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        playEvents(world.step(STEP, control(), false));
        accumulator -= STEP;
      }
    } else if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN) {
      // the field stays alive behind the menus: particles drift, the attract hostiles wander
      while (accumulator >= STEP) {
        world.step(STEP, { moveX: 0, moveY: 0, aimX: world.state.player.x + 160, aimY: world.state.player.y, firing: false }, true);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Neon Void. Click or press Enter to play. WASD to move, mouse to aim, hold click to fire.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
