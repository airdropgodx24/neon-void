// The screenshot scenes behind ?shot=start|play|frenzy|end. Each scene runs the real simulation
// forward from a seeded world, so every frame is a genuine moment of play and the same seed
// always stages the same frame. Two pilots fly the ship: a strong one for the action scenes
// (aims at the nearest hostile, strafes away from pressure), and for the end scene a camper —
// it holds the centre with a lagging aim, the way a stubborn player does, and is overrun.

import { STEP, VIEW } from './config.js';
import { EVENT_OVER, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

function nearestEnemy(state) {
  const p = state.player;
  let nearest = null;
  let nearestD2 = Infinity;
  for (const e of state.enemies) {
    if (e.spawnIn > 0) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < nearestD2) {
      nearestD2 = d2;
      nearest = e;
    }
  }
  return { nearest, nearestD2 };
}

/** The strong pilot: evade the local pack, strafe, and fire on the nearest hostile. */
function strongControl(state) {
  const p = state.player;
  if (!p || !p.alive) return { moveX: 0, moveY: 0, aimX: p ? p.x + 100 : 0, aimY: p ? p.y : 0, firing: false };
  const { nearest, nearestD2 } = nearestEnemy(state);
  let cx = 0;
  let cy = 0;
  let near = 0;
  for (const e of state.enemies) {
    if (e.spawnIn > 0) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    if (dx * dx + dy * dy < 260 * 260) {
      cx += e.x;
      cy += e.y;
      near += 1;
    }
  }
  let moveX = 0;
  let moveY = 0;
  if (near > 0) {
    moveX = p.x - cx / near;
    moveY = p.y - cy / near;
    moveX += -moveY * 0.8; // strafe sideways while backing off
    moveY += (p.x - cx / near) * 0.8;
  }
  if (p.x < 130) moveX += 1.6;
  if (p.x > VIEW.width - 130) moveX -= 1.6;
  if (p.y < 130) moveY += 1.6;
  if (p.y > VIEW.height - 130) moveY -= 1.6;
  if (near === 0) {
    moveX += (VIEW.width / 2 - p.x) * 0.004;
    moveY += (VIEW.height / 2 - p.y) * 0.004;
  }
  const len = Math.hypot(moveX, moveY);
  if (len > 1) {
    moveX /= len;
    moveY /= len;
  }
  let aimX = p.x + 120;
  let aimY = p.y;
  let firing = false;
  if (nearest) {
    const lead = Math.min(0.35, Math.sqrt(nearestD2) / 1600);
    aimX = nearest.x + nearest.vx * lead;
    aimY = nearest.y + nearest.vy * lead;
    firing = nearestD2 < 620 * 620;
  }
  return { moveX, moveY, aimX, aimY, firing };
}

/** The camper: no movement, an aim that only updates a few times a second, fire when in range. */
function makeCamperControl() {
  let aimX = 0;
  let aimY = 0;
  let sinceUpdate = 1;
  return (state) => {
    const p = state.player;
    if (!p || !p.alive) return { moveX: 0, moveY: 0, aimX, aimY, firing: false };
    sinceUpdate += STEP;
    const { nearest, nearestD2 } = nearestEnemy(state);
    if (nearest && sinceUpdate > 0.35) {
      sinceUpdate = 0;
      aimX = nearest.x;
      aimY = nearest.y;
    }
    return { moveX: 0, moveY: 0, aimX, aimY, firing: nearest !== null && nearestD2 < 700 * 700 };
  };
}

/** The last resort for the end scene: charge the nearest hostile and never fire. */
function suicideControl(state) {
  const p = state.player;
  if (!p || !p.alive) return { moveX: 0, moveY: 0, aimX: 0, aimY: 0, firing: false };
  const { nearest } = nearestEnemy(state);
  if (!nearest) return { moveX: 0, moveY: 0, aimX: p.x + 100, aimY: p.y, firing: false };
  let moveX = nearest.x - p.x;
  let moveY = nearest.y - p.y;
  const len = Math.hypot(moveX, moveY) || 1;
  return { moveX: moveX / len, moveY: moveY / len, aimX: nearest.x, aimY: nearest.y, firing: false };
}

const IDLE = { moveX: 0, moveY: 0, aimX: VIEW.width / 2 + 160, aimY: VIEW.height / 2, firing: false };

/** Step the world for up to `seconds`; stop early on game over or victory. Returns the events. */
function runSeconds(world, seconds, controlFn, attract = false) {
  const steps = Math.round(seconds / STEP);
  let events = 0;
  for (let i = 0; i < steps; i += 1) {
    events = world.step(STEP, controlFn(world.state), attract);
    if (events & (EVENT_OVER | EVENT_WIN)) break;
  }
  return events;
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * start: the title over the attract field. play: mid wave-2 action. frenzy: a later wave under
 * real pressure, topped up until the field is busy. end: the game-over screen of a lost run.
 */
export function stageShot(name, world) {
  if (name === 'play' || name === 'frenzy') {
    world.startRun();
    runSeconds(world, name === 'play' ? 14 : 38, strongControl);
    if (world.state.won) {
      // The pilot charged the core early: restart and take a shorter run for an action frame.
      world.startRun();
      runSeconds(world, 9, strongControl);
    }
    // Top the frame up until there is a real fight on screen (a wave break can freeze empty).
    let extra = 0;
    while (world.state.enemies.length < 6 && !world.state.over && !world.state.won && extra < 14) {
      runSeconds(world, 0.5, strongControl);
      extra += 0.5;
    }
    // Photo finish: fly step by step until the freeze catches the exact frame of a kill —
    // a fresh particle burst with hostiles pressed in close — rather than a quiet gap.
    const maxSteps = Math.round(24 / STEP);
    for (let i = 0; i < maxSteps && !world.state.over && !world.state.won; i += 1) {
      const p = world.state.player;
      let close = 0;
      for (const e of world.state.enemies) {
        if (e.spawnIn <= 0 && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < 400 * 400) close += 1;
      }
      const sparks = world.state.particles.length;
      if ((sparks >= 26 && close >= 2) || (sparks >= 14 && close >= 3)) break;
      world.step(STEP, strongControl(world.state), false);
    }
    return { screen: SCREEN_PLAY };
  }
  if (name === 'end') {
    world.startRun();
    let events = runSeconds(world, 240, makeCamperControl());
    if (!(events & EVENT_OVER) && !world.state.won) {
      events = runSeconds(world, 150, suicideControl);
    }
    if (world.state.won) {
      // It won instead of falling: run it again with the pilot that cannot score.
      world.startRun();
      runSeconds(world, 240, suicideControl);
    }
    return { screen: SCREEN_OVER };
  }
  world.reset();
  runSeconds(world, 4, () => IDLE, true);
  return { screen: SCREEN_TITLE };
}
