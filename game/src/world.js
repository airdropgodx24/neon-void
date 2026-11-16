// The simulation: every entity and rule of Neon Void, advanced in fixed steps and driven only
// by the seeded random it was created with. It knows nothing of screens or sound; it reports
// what happened as event flags and lets the boot code react. Rendering reads the state, never
// changes it.

import { ENEMY_HP, ENEMY_RADIUS, GOAL_SCORE, KILL_SCORE, PALETTE, PLAYER, RAM_DAMAGE, VIEW } from './config.js';

export const EVENT_HIT = 1; // the player took damage
export const EVENT_OVER = 2; // the player died
export const EVENT_WIN = 4; // the core reached full charge
export const EVENT_WAVE = 8; // a new wave began
export const EVENT_WAVE_CLEAR = 16; // a wave was cleared
export const EVENT_PICKUP = 32; // a pickup was collected
export const EVENT_SHOOT = 64; // the player fired
export const EVENT_BOOM = 128; // an enemy died
export const EVENT_EHIT = 256; // a bullet struck an enemy

const TAU = Math.PI * 2;

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** The wave's spawn list: kinds unlock as waves climb, and the count grows with the wave. */
function buildWave(random, wave) {
  const list = [];
  const add = (kind, count) => {
    for (let i = 0; i < count; i += 1) list.push(kind);
  };
  add('drifter', 4 + wave * 2);
  if (wave >= 2) add('speeder', 1 + wave);
  if (wave >= 3) add('weaver', wave);
  if (wave >= 4) add('stinger', Math.floor(wave / 2));
  if (wave >= 5) add('brute', Math.floor((wave - 2) / 2));
  // Shuffle so kinds arrive mixed, not in blocks.
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random.next() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export function createWorld(random) {
  const state = {
    time: 0,
    score: 0,
    kills: 0,
    combo: 0,
    comboTimer: 0,
    multiplier: 1,
    wave: 0,
    phase: 'idle', // idle (title attract) | spawning | fighting | intermission | done
    intermission: 0,
    spawnQueue: [],
    spawnTimer: 0,
    player: null,
    enemies: [],
    bullets: [],
    enemyBullets: [],
    particles: [],
    floaters: [],
    pickups: [],
    portals: [],
    shockwaves: [],
    stars: [],
    nebulas: [],
    shake: 0,
    hitFlash: 0,
    banner: null, // { title, sub, timer }
    over: false,
    won: false,
  };

  function freshPlayer() {
    return {
      x: VIEW.width / 2, y: VIEW.height / 2, vx: 0, vy: 0, radius: PLAYER.radius,
      angle: -Math.PI / 2, hp: PLAYER.maxHp, alive: true,
      fireCd: 0, invuln: 0, weapon: 1, weaponTimer: 0, shieldTimer: 0, thrust: 0,
    };
  }

  function scatterBackdrop() {
    state.stars = [];
    for (let layer = 0; layer < 3; layer += 1) {
      const count = [70, 50, 30][layer];
      for (let i = 0; i < count; i += 1) {
        state.stars.push({
          x: random.range(0, VIEW.width), y: random.range(0, VIEW.height),
          z: layer, phase: random.range(0, TAU),
        });
      }
    }
    const nebulaColors = ['#173a6b', '#3d1454', '#0d3d4d', '#401b3a'];
    state.nebulas = nebulaColors.map((color) => ({
      x: random.range(0, VIEW.width), y: random.range(0, VIEW.height),
      r: random.range(220, 380), color,
    }));
  }

  function burst(x, y, color, count, speed, size, life) {
    for (let i = 0; i < count; i += 1) {
      if (state.particles.length > 420) return;
      const a = random.angle();
      const s = random.range(speed * 0.25, speed);
      state.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: random.range(life * 0.4, life), maxLife: life,
        size: random.range(size * 0.5, size), color,
      });
    }
  }

  function ring(x, y, color, maxR) {
    state.shockwaves.push({ x, y, r: 6, maxR, life: 0.35, maxLife: 0.35, color });
  }

  function floater(x, y, text, color) {
    state.floaters.push({ x, y, text, color, life: 0.9, maxLife: 0.9 });
  }

  function showBanner(title, sub, seconds) {
    state.banner = { title, sub, timer: seconds };
  }

  /** Reset to the title-screen attract scene: a parked ship and a few wandering hostiles. */
  function reset() {
    state.time = 0;
    state.score = 0;
    state.kills = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.multiplier = 1;
    state.wave = 0;
    state.phase = 'idle';
    state.spawnQueue = [];
    state.player = freshPlayer();
    state.enemies = [];
    state.bullets = [];
    state.enemyBullets = [];
    state.particles = [];
    state.floaters = [];
    state.pickups = [];
    state.portals = [];
    state.shockwaves = [];
    state.shake = 0;
    state.hitFlash = 0;
    state.banner = null;
    state.over = false;
    state.won = false;
    scatterBackdrop();
    for (let i = 0; i < 5; i += 1) {
      spawnEnemy(['drifter', 'weaver', 'speeder'][i % 3], random.range(80, VIEW.width - 80), random.range(80, VIEW.height - 80), true);
    }
  }

  /** Start a run: clear field, full hull, wave 1 incoming. */
  function startRun() {
    const backdrop = { stars: state.stars, nebulas: state.nebulas };
    reset();
    state.stars = backdrop.stars;
    state.nebulas = backdrop.nebulas;
    state.enemies = [];
    beginWave(1);
  }

  function beginWave(wave) {
    state.wave = wave;
    state.spawnQueue = buildWave(random, wave);
    state.spawnTimer = 0.4;
    state.phase = 'spawning';
    showBanner(`WAVE ${wave}`, wave === 1 ? 'CHARGE THE CORE TO 6,000' : 'HOSTILES INBOUND', 1.8);
  }

  function spawnPoint() {
    // On an arena edge, at least 280px from the player.
    const p = state.player;
    for (let tries = 0; tries < 12; tries += 1) {
      const edge = random.int(0, 3);
      const x = edge === 0 ? 30 : edge === 1 ? VIEW.width - 30 : random.range(30, VIEW.width - 30);
      const y = edge === 2 ? 30 : edge === 3 ? VIEW.height - 30 : random.range(30, VIEW.height - 30);
      if (!p || dist2(x, y, p.x, p.y) > 280 * 280) return { x, y };
    }
    return { x: 40, y: 40 };
  }

  function spawnEnemy(kind, x, y, instant = false) {
    const hpScale = 1 + Math.max(0, state.wave - 1) * 0.06;
    const enemy = {
      kind, x, y, vx: 0, vy: 0,
      hp: Math.round(ENEMY_HP[kind] * hpScale), maxHp: Math.round(ENEMY_HP[kind] * hpScale),
      radius: ENEMY_RADIUS[kind],
      age: random.range(0, 100), flash: 0, fireTimer: random.range(1.2, 2.4),
      spawnIn: instant ? 0 : 0.55, orbitDir: random.chance(0.5) ? 1 : -1,
    };
    state.enemies.push(enemy);
    if (!instant) state.portals.push({ x, y, kind, timer: 0.55, maxTimer: 0.55 });
    return enemy;
  }

  function damagePlayer(amount) {
    const p = state.player;
    if (!p.alive || p.invuln > 0 || p.shieldTimer > 0 || state.won) return 0;
    p.hp -= amount;
    p.invuln = PLAYER.invulnSeconds;
    state.hitFlash = 0.35;
    state.shake = Math.max(state.shake, 7);
    burst(p.x, p.y, '#ff5d5d', 12, 260, 3, 0.5);
    if (p.hp <= 0) {
      p.hp = 0;
      p.alive = false;
      state.over = true;
      state.shake = 18;
      burst(p.x, p.y, PALETTE.player, 60, 420, 4, 1.1);
      burst(p.x, p.y, '#ffffff', 24, 300, 3, 0.8);
      ring(p.x, p.y, PALETTE.player, 130);
      return EVENT_HIT | EVENT_OVER;
    }
    return EVENT_HIT;
  }

  function killEnemy(enemy, index, events) {
    const p = state.player;
    state.enemies.splice(index, 1);
    state.kills += 1;
    state.combo += 1;
    state.comboTimer = 2.5;
    state.multiplier = Math.min(8, 1 + Math.floor(state.combo / 6));
    const gained = KILL_SCORE[enemy.kind] * state.multiplier;
    state.score += gained;
    floater(enemy.x, enemy.y - enemy.radius, `+${gained}`, PALETTE[enemy.kind]);
    burst(enemy.x, enemy.y, PALETTE[enemy.kind], enemy.kind === 'brute' ? 34 : 16, enemy.kind === 'brute' ? 380 : 300, 3.5, 0.8);
    if (enemy.kind === 'brute') {
      state.shake = Math.max(state.shake, 8);
      ring(enemy.x, enemy.y, PALETTE.brute, 90);
      spawnEnemy('drifter', enemy.x - 18, enemy.y, true);
      spawnEnemy('drifter', enemy.x + 18, enemy.y, true);
    }
    maybeDropPickup(enemy.x, enemy.y);
    if (state.score >= GOAL_SCORE && !state.won && p.alive) {
      state.won = true;
      events |= EVENT_WIN;
      state.shake = 12;
      for (const other of state.enemies) burst(other.x, other.y, PALETTE[other.kind], 14, 320, 3.5, 0.9);
      state.enemies = [];
      state.enemyBullets = [];
      ring(p.x, p.y, '#ffffff', 220);
      showBanner('CORE CHARGED', 'THE VOID RETREATS', 2.6);
    }
    return events | EVENT_BOOM;
  }

  function maybeDropPickup(x, y) {
    if (state.pickups.length >= 3) return;
    const p = state.player;
    const roll = random.next();
    let kind = null;
    if (roll < 0.045) kind = 'repair';
    else if (roll < 0.115) kind = p.weapon < 3 ? 'weapon' : 'shield';
    else if (roll < 0.155) kind = 'shield';
    if (kind === 'repair' && p.hp > PLAYER.maxHp - 15) kind = 'shield';
    if (kind) state.pickups.push({ kind, x, y, age: 0, life: 9 });
  }

  function applyPickup(pickup) {
    const p = state.player;
    if (pickup.kind === 'repair') {
      p.hp = Math.min(PLAYER.maxHp, p.hp + 30);
      floater(p.x, p.y - 26, '+30 HULL', PALETTE.repair);
    } else if (pickup.kind === 'weapon') {
      p.weapon = Math.min(3, p.weapon + 1);
      p.weaponTimer = 14;
      floater(p.x, p.y - 26, p.weapon >= 3 ? 'TRIPLE CANNON' : 'TWIN CANNON', PALETTE.weapon);
    } else {
      p.shieldTimer = 6;
      floater(p.x, p.y - 26, 'AEGIS SHIELD', PALETTE.shield);
    }
    ring(p.x, p.y, PALETTE[pickup.kind], 46);
  }

  function fireBullets() {
    const p = state.player;
    const aim = Math.atan2(p.aimY - p.y, p.aimX - p.x);
    p.angle = aim;
    const spreads = p.weapon === 1 ? [0] : p.weapon === 2 ? [-0.06, 0.06] : [-0.13, 0, 0.13];
    for (const offset of spreads) {
      const a = aim + offset;
      state.bullets.push({
        x: p.x + Math.cos(aim) * 18, y: p.y + Math.sin(aim) * 18,
        vx: Math.cos(a) * PLAYER.bulletSpeed + p.vx * 0.3,
        vy: Math.sin(a) * PLAYER.bulletSpeed + p.vy * 0.3,
        life: PLAYER.bulletLife,
      });
    }
    burst(p.x + Math.cos(aim) * 22, p.y + Math.sin(aim) * 22, PALETTE.bullet, 2, 120, 2, 0.18);
  }

  function steerEnemy(enemy, dt) {
    const p = state.player;
    const dx = p.x - enemy.x;
    const dy = p.y - enemy.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d;
    const uy = dy / d;
    const waveSpeed = 1 + Math.max(0, state.wave - 1) * 0.03;
    let tx = 0;
    let ty = 0;
    let speed = 0;
    if (enemy.kind === 'drifter') {
      speed = 60 * waveSpeed; tx = ux; ty = uy;
    } else if (enemy.kind === 'speeder') {
      speed = 168 * waveSpeed;
      const wobble = Math.sin(enemy.age * 7) * 0.55;
      tx = ux - uy * wobble; ty = uy + ux * wobble;
    } else if (enemy.kind === 'weaver') {
      speed = 118 * waveSpeed;
      const orbit = d > 250 ? 0.25 : 1; // mostly approach far away, mostly orbit up close
      tx = ux * (1 - orbit) + -uy * enemy.orbitDir * orbit;
      ty = uy * (1 - orbit) + ux * enemy.orbitDir * orbit;
      if (d < 170) { tx = -uy * enemy.orbitDir - ux * 0.4; ty = ux * enemy.orbitDir - uy * 0.4; }
    } else if (enemy.kind === 'brute') {
      speed = 36 * waveSpeed; tx = ux; ty = uy;
    } else if (enemy.kind === 'stinger') {
      speed = 105 * waveSpeed;
      const radial = d > 300 ? 1 : d < 230 ? -1 : 0;
      tx = ux * radial + -uy * enemy.orbitDir * 0.5;
      ty = uy * radial + ux * enemy.orbitDir * 0.5;
    }
    const norm = Math.hypot(tx, ty) || 1;
    const accel = enemy.kind === 'brute' ? 130 : 340;
    enemy.vx += ((tx / norm) * speed - enemy.vx) * Math.min(1, accel * dt / Math.max(speed, 1));
    enemy.vy += ((ty / norm) * speed - enemy.vy) * Math.min(1, accel * dt / Math.max(speed, 1));
  }

  function step(dt, control, attract = false) {
    let events = 0;
    const p = state.player;
    state.time += dt;
    if (state.banner) {
      state.banner.timer -= dt;
      if (state.banner.timer <= 0) state.banner = null;
    }
    state.shake *= Math.exp(-6 * dt);
    if (state.shake < 0.05) state.shake = 0;
    state.hitFlash = Math.max(0, state.hitFlash - dt);

    // --- player ---
    if (p && p.alive) {
      p.aimX = control.aimX;
      p.aimY = control.aimY;
      if (!control.firing) p.angle = Math.atan2(control.aimY - p.y, control.aimX - p.x);
      const damping = Math.exp(-7 * dt);
      p.vx = (p.vx + control.moveX * PLAYER.accel * dt) * damping;
      p.vy = (p.vy + control.moveY * PLAYER.accel * dt) * damping;
      const spd = Math.hypot(p.vx, p.vy);
      if (spd > PLAYER.maxSpeed) {
        p.vx = (p.vx / spd) * PLAYER.maxSpeed;
        p.vy = (p.vy / spd) * PLAYER.maxSpeed;
      }
      p.x = Math.min(VIEW.width - p.radius, Math.max(p.radius, p.x + p.vx * dt));
      p.y = Math.min(VIEW.height - p.radius, Math.max(p.radius, p.y + p.vy * dt));
      p.thrust = Math.min(1, spd / PLAYER.maxSpeed);
      p.invuln = Math.max(0, p.invuln - dt);
      p.shieldTimer = Math.max(0, p.shieldTimer - dt);
      if (p.weaponTimer > 0) {
        p.weaponTimer -= dt;
        if (p.weaponTimer <= 0) p.weapon = 1;
      }
      p.fireCd -= dt;
      if (control.firing && p.fireCd <= 0 && !attract) {
        p.fireCd = PLAYER.fireInterval;
        fireBullets();
        events |= EVENT_SHOOT;
      }
      // engine trail
      if (spd > 60 && state.particles.length < 420) {
        state.particles.push({
          x: p.x - Math.cos(p.angle) * 14, y: p.y - Math.sin(p.angle) * 14,
          vx: -p.vx * 0.35 + random.range(-16, 16), vy: -p.vy * 0.35 + random.range(-16, 16),
          life: 0.32, maxLife: 0.32, size: 2.4, color: PALETTE.player,
        });
      }
    }

    // --- combo clock ---
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) {
        state.combo = 0;
        state.multiplier = 1;
      }
    }

    // --- wave flow ---
    if (!attract && !state.over && !state.won) {
      if (state.phase === 'spawning' || state.phase === 'fighting') {
        if (state.spawnQueue.length > 0) {
          state.phase = 'spawning';
          state.spawnTimer -= dt;
          if (state.spawnTimer <= 0) {
            state.spawnTimer = 0.55;
            const kind = state.spawnQueue.shift();
            const at = spawnPoint();
            spawnEnemy(kind, at.x, at.y);
          }
        } else if (state.enemies.length === 0) {
          const bonus = 100 * state.wave;
          state.score += bonus;
          floater(VIEW.width / 2, VIEW.height / 2 - 60, `WAVE BONUS +${bonus}`, '#ffffff');
          state.phase = 'intermission';
          state.intermission = 2.4;
          showBanner(`WAVE ${state.wave} CLEARED`, `BONUS +${bonus}`, 1.8);
          events |= EVENT_WAVE_CLEAR;
          if (state.score >= GOAL_SCORE && p.alive) {
            state.won = true;
            events |= EVENT_WIN;
            showBanner('CORE CHARGED', 'THE VOID RETREATS', 2.6);
          }
        } else {
          state.phase = 'fighting';
        }
      } else if (state.phase === 'intermission') {
        state.intermission -= dt;
        if (state.intermission <= 0) {
          beginWave(state.wave + 1);
          events |= EVENT_WAVE;
        }
      }
    }

    // --- portals ---
    for (let i = state.portals.length - 1; i >= 0; i -= 1) {
      state.portals[i].timer -= dt;
      if (state.portals[i].timer <= 0) state.portals.splice(i, 1);
    }

    // --- enemies ---
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const e = state.enemies[i];
      e.age += dt;
      e.flash = Math.max(0, e.flash - dt * 6);
      if (e.spawnIn > 0) {
        e.spawnIn -= dt;
        continue;
      }
      if (!attract && p && p.alive) steerEnemy(e, dt);
      else {
        // attract mode: lazy drift in a slow circle
        e.vx += Math.cos(e.age * 0.6 + i) * 12 * dt;
        e.vy += Math.sin(e.age * 0.5 + i * 1.7) * 12 * dt;
        e.vx *= Math.exp(-1.2 * dt);
        e.vy *= Math.exp(-1.2 * dt);
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.x = Math.min(VIEW.width - e.radius, Math.max(e.radius, e.x));
      e.y = Math.min(VIEW.height - e.radius, Math.max(e.radius, e.y));
      // separation so packs do not stack into one blob
      for (let j = i + 1; j < state.enemies.length; j += 1) {
        const o = state.enemies[j];
        const rr = (e.radius + o.radius) * 0.85;
        const d2 = dist2(e.x, e.y, o.x, o.y);
        if (d2 > 0.01 && d2 < rr * rr) {
          const d = Math.sqrt(d2);
          const push = ((rr - d) / d) * 26 * dt;
          const px = (e.x - o.x) * push;
          const py = (e.y - o.y) * push;
          e.x += px; e.y += py;
          o.x -= px; o.y -= py;
        }
      }
      // stinger fire
      if (!attract && e.kind === 'stinger' && p && p.alive && !state.won) {
        e.fireTimer -= dt;
        if (e.fireTimer <= 0) {
          e.fireTimer = random.range(1.9, 2.6);
          const a = Math.atan2(p.y - e.y, p.x - e.x);
          state.enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 305, vy: Math.sin(a) * 305, life: 3.2 });
          burst(e.x, e.y, PALETTE.enemyBullet, 3, 90, 2, 0.2);
        }
      }
      // ram the player
      if (!attract && p && p.alive && dist2(e.x, e.y, p.x, p.y) < (e.radius + p.radius) ** 2) {
        if (p.shieldTimer <= 0 && p.invuln <= 0) {
          events |= damagePlayer(RAM_DAMAGE[e.kind]);
          burst(e.x, e.y, PALETTE[e.kind], 14, 280, 3, 0.6);
          state.enemies.splice(i, 1);
          events |= EVENT_BOOM;
          continue;
        }
        if (p.shieldTimer > 0) {
          burst(e.x, e.y, PALETTE[e.kind], 14, 280, 3, 0.6);
          state.enemies.splice(i, 1);
          state.score += 10;
          events |= EVENT_BOOM;
          continue;
        }
      }
    }

    // --- bullets ---
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -20 || b.x > VIEW.width + 20 || b.y < -20 || b.y > VIEW.height + 20) {
        state.bullets.splice(i, 1);
      }
    }
    for (let i = state.enemyBullets.length - 1; i >= 0; i -= 1) {
      const b = state.enemyBullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -20 || b.x > VIEW.width + 20 || b.y < -20 || b.y > VIEW.height + 20) {
        state.enemyBullets.splice(i, 1);
        continue;
      }
      if (!attract && p && p.alive && dist2(b.x, b.y, p.x, p.y) < (p.radius + 5) ** 2) {
        state.enemyBullets.splice(i, 1);
        if (p.shieldTimer > 0) {
          burst(b.x, b.y, PALETTE.shield, 6, 160, 2.5, 0.3);
        } else {
          events |= damagePlayer(8);
        }
      }
    }

    // --- bullet vs enemy ---
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const e = state.enemies[i];
      if (!e) break; // a winning kill clears the field mid-pass
      if (e.spawnIn > 0) continue;
      for (let j = state.bullets.length - 1; j >= 0; j -= 1) {
        const b = state.bullets[j];
        if (dist2(b.x, b.y, e.x, e.y) < (e.radius + 5) ** 2) {
          state.bullets.splice(j, 1);
          e.hp -= 1;
          e.flash = 1;
          e.vx += b.vx * 0.012;
          e.vy += b.vy * 0.012;
          burst(b.x, b.y, PALETTE[e.kind], 3, 170, 2.2, 0.3);
          events |= EVENT_EHIT;
          if (e.hp <= 0) {
            events = killEnemy(e, i, events);
            break;
          }
        }
      }
    }

    // --- pickups ---
    for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
      const pk = state.pickups[i];
      pk.age += dt;
      pk.life -= dt;
      if (pk.life <= 0) {
        state.pickups.splice(i, 1);
        continue;
      }
      if (p && p.alive) {
        const d2 = dist2(pk.x, pk.y, p.x, p.y);
        if (d2 < 110 * 110) {
          const d = Math.sqrt(d2) || 1;
          pk.x += ((p.x - pk.x) / d) * 190 * dt;
          pk.y += ((p.y - pk.y) / d) * 190 * dt;
        }
        if (d2 < 30 * 30) {
          applyPickup(pk);
          state.pickups.splice(i, 1);
          events |= EVENT_PICKUP;
        }
      }
    }

    // --- particles, floaters, shockwaves ---
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const pt = state.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        state.particles.splice(i, 1);
        continue;
      }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= Math.exp(-2.4 * dt);
      pt.vy *= Math.exp(-2.4 * dt);
    }
    for (let i = state.floaters.length - 1; i >= 0; i -= 1) {
      const f = state.floaters[i];
      f.life -= dt;
      f.y -= 44 * dt;
      if (f.life <= 0) state.floaters.splice(i, 1);
    }
    for (let i = state.shockwaves.length - 1; i >= 0; i -= 1) {
      const s = state.shockwaves[i];
      s.life -= dt;
      s.r += (s.maxR - s.r) * Math.min(1, 9 * dt);
      if (s.life <= 0) state.shockwaves.splice(i, 1);
    }
    return events;
  }

  reset();
  return { state, reset, startRun, step };
}
