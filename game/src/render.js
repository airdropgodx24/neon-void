// The renderer: paints the world onto the canvas with a neon look — pre-rendered glow sprites
// for the ships and hostiles (fast, and they bloom without per-frame shadowBlur), additive
// particles, a parallax starfield over nebula washes, and a HUD that always shows score, core
// charge, wave and hull. It also draws the four screens: title, play, paused, and the two ends.

import { ENEMY_RADIUS, GOAL_SCORE, PALETTE, PLAYER, VIEW } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const TAU = Math.PI * 2;

/** A shape painter for a sprite canvas: draws one enemy kind's silhouette centred at 0,0. */
function paintShape(kind, ctx, r) {
  ctx.beginPath();
  if (kind === 'drifter') {
    ctx.moveTo(0, -r); ctx.lineTo(r * 0.78, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.78, 0); ctx.closePath();
  } else if (kind === 'speeder') {
    ctx.moveTo(r * 1.25, 0); ctx.lineTo(-r * 0.9, -r * 0.72); ctx.lineTo(-r * 0.45, 0); ctx.lineTo(-r * 0.9, r * 0.72); ctx.closePath();
  } else if (kind === 'weaver') {
    ctx.arc(0, 0, r * 0.82, 0, TAU);
  } else if (kind === 'brute') {
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * TAU + Math.PI / 6;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else if (kind === 'stinger') {
    ctx.moveTo(r, 0); ctx.lineTo(-r * 0.85, -r * 0.85); ctx.lineTo(-r * 0.4, 0); ctx.lineTo(-r * 0.85, r * 0.85); ctx.closePath();
  }
}

/** Pre-render one glowing sprite per enemy kind: silhouette, bright core, and a soft halo. */
function makeSprite(kind) {
  const r = ENEMY_RADIUS[kind];
  const pad = r * 1.9;
  const size = Math.ceil((r + pad) * 2);
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  ctx.translate(size / 2, size / 2);
  const color = PALETTE[kind];
  ctx.shadowColor = color;
  ctx.shadowBlur = r * 0.9;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.28;
  paintShape(kind, ctx, r);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = r * 0.5;
  ctx.fillStyle = '#0b0e1a';
  paintShape(kind, ctx, r);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = color;
  paintShape(kind, ctx, r);
  ctx.stroke();
  if (kind === 'weaver') {
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.4, 0, TAU);
    ctx.stroke();
  }
  if (kind === 'brute') {
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * TAU + Math.PI / 6;
      const px = Math.cos(a) * r * 0.55;
      const py = Math.sin(a) * r * 0.55;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  }
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(2.5, r * 0.16), 0, TAU);
  ctx.fill();
  return { canvas: c, half: size / 2 };
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const sprites = {};
  for (const kind of Object.keys(ENEMY_RADIUS)) sprites[kind] = makeSprite(kind);

  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
    offsetX = (canvas.width - VIEW.width * scale) / 2;
    offsetY = (canvas.height - VIEW.height * scale) / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  /** Convert client coordinates into arena coordinates (the input module's transform). */
  function toView(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    return {
      x: ((clientX - rect.left) * dpr - offsetX) / scale,
      y: ((clientY - rect.top) * dpr - offsetY) / scale,
    };
  }

  function text(str, x, y, font, color, align = 'left', alpha = 1) {
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.globalAlpha = 1;
  }

  function glowText(str, x, y, font, color, align = 'center', blur = 26) {
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(str, x, y);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.shadowBlur = 0;
  }

  function bar(x, y, w, h, frac, color, backAlpha = 0.25) {
    ctx.fillStyle = `rgba(120,140,180,${backAlpha})`;
    ctx.fillRect(x, y, w, h);
    if (frac > 0) {
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.fillRect(x, y, w * Math.min(1, frac), h);
      ctx.shadowBlur = 0;
    }
  }

  function drawBackdrop(state) {
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    grad.addColorStop(0, '#04050d');
    grad.addColorStop(0.55, '#070a1c');
    grad.addColorStop(1, '#03040a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    // nebula washes
    ctx.globalCompositeOperation = 'lighter';
    for (const n of state.nebulas) {
      const rg = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
      rg.addColorStop(0, n.color);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = rg;
      ctx.fillRect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // faint grid
    ctx.strokeStyle = 'rgba(84,240,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= VIEW.width; x += 64) { ctx.moveTo(x, 0); ctx.lineTo(x, VIEW.height); }
    for (let y = 0; y <= VIEW.height; y += 64) { ctx.moveTo(0, y); ctx.lineTo(VIEW.width, y); }
    ctx.stroke();
    // stars, twinkling by layer
    for (const s of state.stars) {
      const tw = 0.55 + 0.45 * Math.sin(state.time * (1 + s.z * 0.7) + s.phase);
      ctx.globalAlpha = (0.25 + s.z * 0.3) * tw;
      ctx.fillStyle = '#cfe9ff';
      const size = s.z === 2 ? 2.2 : 1.4;
      ctx.fillRect(s.x, s.y, size, size);
    }
    ctx.globalAlpha = 1;
    // arena frame
    ctx.strokeStyle = 'rgba(84,240,255,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, VIEW.width - 2, VIEW.height - 2);
  }

  function drawPortals(state) {
    for (const portal of state.portals) {
      const t = 1 - portal.timer / portal.maxTimer;
      ctx.strokeStyle = PALETTE[portal.kind];
      ctx.globalAlpha = 0.35 + 0.55 * t;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(portal.x, portal.y, 6 + t * 22, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(portal.x, portal.y, Math.max(1, 26 - t * 20), 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawPickups(state) {
    for (const pk of state.pickups) {
      const color = PALETTE[pk.kind];
      const bob = Math.sin(state.time * 4 + pk.x) * 3;
      const blink = pk.life < 2.5 ? (Math.sin(state.time * 14) > 0 ? 1 : 0.25) : 1;
      ctx.globalAlpha = blink;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pk.x, pk.y + bob, 13 + Math.sin(state.time * 5) * 1.6, 0, TAU);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = color;
      if (pk.kind === 'repair') {
        ctx.fillRect(pk.x - 2.5, pk.y + bob - 8, 5, 16);
        ctx.fillRect(pk.x - 8, pk.y + bob - 2.5, 16, 5);
      } else if (pk.kind === 'weapon') {
        ctx.beginPath();
        ctx.moveTo(pk.x - 7, pk.y + bob + 5); ctx.lineTo(pk.x, pk.y + bob - 7); ctx.lineTo(pk.x + 7, pk.y + bob + 5);
        ctx.moveTo(pk.x - 7, pk.y + bob + 10); ctx.lineTo(pk.x, pk.y + bob - 2); ctx.lineTo(pk.x + 7, pk.y + bob + 10);
        ctx.stroke();
      } else {
        ctx.beginPath();
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * TAU - Math.PI / 2;
          const px = pk.x + Math.cos(a) * 7;
          const py = pk.y + bob + Math.sin(a) * 7;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawEnemies(state) {
    for (const e of state.enemies) {
      const sprite = sprites[e.kind];
      const scaleIn = e.spawnIn > 0 ? 1 - e.spawnIn / 0.55 : 1;
      ctx.save();
      ctx.translate(e.x, e.y);
      let rot = e.age * 1.4;
      if (e.kind === 'speeder' || e.kind === 'stinger') rot = Math.atan2(e.vy, e.vx);
      if (e.kind === 'brute') rot = e.age * 0.5;
      ctx.rotate(rot);
      ctx.globalAlpha = 0.35 + 0.65 * scaleIn;
      const s = (0.4 + 0.6 * scaleIn);
      ctx.scale(s, s);
      ctx.drawImage(sprite.canvas, -sprite.half, -sprite.half);
      ctx.restore();
      if (e.flash > 0) {
        ctx.globalAlpha = e.flash * 0.7;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius * 0.8, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (e.maxHp >= 5 && e.hp < e.maxHp) {
        bar(e.x - e.radius, e.y - e.radius - 10, e.radius * 2, 3.5, e.hp / e.maxHp, PALETTE[e.kind], 0.3);
      }
      if (e.kind === 'stinger' && e.fireTimer < 0.35) {
        ctx.strokeStyle = PALETTE.enemyBullet;
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(state.time * 30);
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius + 5, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawPlayer(state) {
    const p = state.player;
    if (!p || !p.alive) return;
    if (p.invuln > 0 && Math.sin(state.time * 34) > 0.2) return; // mercy blink
    const a = p.angle;
    // engine flame
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(a);
    const flame = 10 + p.thrust * 16 + Math.sin(state.time * 41) * 3;
    const fg = ctx.createLinearGradient(-14, 0, -14 - flame, 0);
    fg.addColorStop(0, 'rgba(160,250,255,0.9)');
    fg.addColorStop(1, 'rgba(84,240,255,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-13, -5);
    ctx.lineTo(-14 - flame, 0);
    ctx.lineTo(-13, 5);
    ctx.closePath();
    ctx.fill();
    // hull: a sleek arrow ship
    ctx.shadowColor = PALETTE.player;
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#0a1626';
    ctx.strokeStyle = PALETTE.player;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(-8, -7);
    ctx.lineTo(-15, -13);
    ctx.lineTo(-11, 0);
    ctx.lineTo(-15, 13);
    ctx.lineTo(-8, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(3, 0, 3.4, 0, TAU);
    ctx.fill();
    ctx.restore();
    if (p.shieldTimer > 0) {
      ctx.strokeStyle = PALETTE.shield;
      ctx.globalAlpha = 0.55 + 0.3 * Math.sin(state.time * 6);
      ctx.lineWidth = 2;
      ctx.shadowColor = PALETTE.shield;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 11, 0, TAU);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
  }

  function drawShots(state) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const b of state.bullets) {
      ctx.strokeStyle = PALETTE.bullet;
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (const b of state.enemyBullets) {
      ctx.fillStyle = PALETTE.enemyBullet;
      ctx.shadowColor = PALETTE.enemyBullet;
      ctx.shadowBlur = 9;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4.6, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    for (const s of state.shockwaves) {
      ctx.globalAlpha = Math.max(0, s.life / s.maxLife) * 0.8;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawFloaters(state) {
    for (const f of state.floaters) {
      text(f.text, f.x, f.y, '700 15px "Courier New", monospace', f.color, 'center', Math.max(0, f.life / f.maxLife));
    }
  }

  function drawHud(state, best) {
    const p = state.player;
    text('SCORE', 26, 30, '600 12px system-ui, sans-serif', '#7d8db0');
    text(String(state.score).padStart(6, '0'), 26, 54, '800 30px system-ui, sans-serif', '#ffffff');
    if (state.multiplier > 1) {
      text(`COMBO x${state.multiplier}`, 26, 80, '800 16px system-ui, sans-serif', '#ffd23d');
      bar(26, 90, 110, 4, state.comboTimer / 2.5, '#ffd23d');
    }
    text('CORE CHARGE', 26, 112, '600 12px system-ui, sans-serif', '#7d8db0');
    bar(26, 124, 230, 9, state.score / GOAL_SCORE, PALETTE.player);
    text(`${Math.min(100, Math.floor((state.score / GOAL_SCORE) * 100))}% OF ${GOAL_SCORE}`, 264, 128, '600 12px system-ui, sans-serif', '#7d8db0');
    const hostiles = state.enemies.length + state.spawnQueue.length;
    text(state.wave > 0 ? `WAVE ${state.wave}` : 'STANDBY', VIEW.width / 2, 34, '800 22px system-ui, sans-serif', '#ffffff', 'center');
    text(state.phase === 'intermission' ? 'SECTOR CLEAR' : `HOSTILES ${hostiles}`, VIEW.width / 2, 60, '600 13px system-ui, sans-serif', '#7d8db0', 'center');
    text('BEST', VIEW.width - 26, 30, '600 12px system-ui, sans-serif', '#7d8db0', 'right');
    text(String(Math.max(best, state.score)).padStart(6, '0'), VIEW.width - 26, 54, '800 24px system-ui, sans-serif', '#ffffff', 'right');
    // hull, bottom-left
    text('HULL', 26, VIEW.height - 52, '600 12px system-ui, sans-serif', '#7d8db0');
    const hpFrac = p ? p.hp / PLAYER.maxHp : 0;
    bar(26, VIEW.height - 42, 230, 13, hpFrac, hpFrac > 0.3 ? PALETTE.repair : '#ff4655');
    text(`${Math.ceil(p ? p.hp : 0)}`, 264, VIEW.height - 35, '700 14px system-ui, sans-serif', '#ffffff');
    // weapon state, bottom-right
    if (p && (p.weapon > 1 || p.shieldTimer > 0)) {
      let y = VIEW.height - 58;
      if (p.weapon > 1) {
        text(p.weapon >= 3 ? 'TRIPLE CANNON' : 'TWIN CANNON', VIEW.width - 26, y, '700 13px system-ui, sans-serif', PALETTE.weapon, 'right');
        bar(VIEW.width - 156, y + 10, 130, 4, p.weaponTimer / 14, PALETTE.weapon);
        y -= 26;
      }
      if (p.shieldTimer > 0) {
        text('AEGIS SHIELD', VIEW.width - 26, y, '700 13px system-ui, sans-serif', PALETTE.shield, 'right');
        bar(VIEW.width - 156, y + 10, 130, 4, p.shieldTimer / 6, PALETTE.shield);
      }
    }
    if (state.banner) {
      const b = state.banner;
      const alpha = Math.min(1, b.timer / 0.4, (1.8 - b.timer) * 3 + 0.4);
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      glowText(b.title, VIEW.width / 2, VIEW.height / 2 - 120, '800 44px system-ui, sans-serif', '#ffffff', 'center', 18);
      text(b.sub, VIEW.width / 2, VIEW.height / 2 - 84, '600 16px system-ui, sans-serif', '#9fd8ff', 'center');
      ctx.globalAlpha = 1;
    }
    if (state.hitFlash > 0) {
      ctx.fillStyle = `rgba(255,40,60,${state.hitFlash * 0.35})`;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }
    if (p && p.alive && p.hp <= 30 && p.hp > 0) {
      const pulse = 0.1 + 0.08 * Math.sin(state.time * 5);
      ctx.strokeStyle = `rgba(255,70,85,${pulse + 0.12})`;
      ctx.lineWidth = 10;
      ctx.strokeRect(0, 0, VIEW.width, VIEW.height);
    }
  }

  function overlay(alpha) {
    ctx.fillStyle = `rgba(2,3,10,${alpha})`;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  function drawTitle(state, best) {
    overlay(0.45);
    const cx = VIEW.width / 2;
    glowText('NEON VOID', cx, 168, '900 96px system-ui, sans-serif', PALETTE.player, 'center', 42);
    text('TWIN-STICK ARENA SURVIVAL', cx, 232, '700 19px system-ui, sans-serif', '#ffd23d', 'center');
    text('The void is spawning. Hold the arena and charge the core to 6,000 to drive it back.', cx, 292, '400 17px system-ui, sans-serif', '#c7d5f2', 'center');
    const lines = [
      ['WASD / ARROWS', 'move'],
      ['MOUSE', 'aim'],
      ['HOLD CLICK / SPACE', 'fire'],
      ['P', 'pause'],
      ['M', 'mute'],
    ];
    lines.forEach(([key, what], i) => {
      const y = 348 + i * 27;
      text(key, cx - 24, y, '700 15px system-ui, sans-serif', '#ffffff', 'right');
      text(what, cx - 12, y, '400 15px system-ui, sans-serif', '#8fa3c8', 'left');
    });
    // enemy legend with live sprites
    const kinds = ['drifter', 'speeder', 'weaver', 'stinger', 'brute'];
    const labels = ['DRIFTER', 'SPEEDER', 'WEAVER', 'STINGER', 'BRUTE'];
    kinds.forEach((kind, i) => {
      const x = cx - 264 + i * 132;
      const sprite = sprites[kind];
      ctx.save();
      ctx.translate(x, 522);
      ctx.rotate(state.time * 0.9 + i);
      ctx.drawImage(sprite.canvas, -sprite.half, -sprite.half);
      ctx.restore();
      text(labels[i], x, 560, '700 12px system-ui, sans-serif', PALETTE[kind], 'center');
    });
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 3.4);
    ctx.globalAlpha = pulse;
    text('CLICK OR PRESS ENTER TO PLAY', cx, 622, '800 21px system-ui, sans-serif', '#ffffff', 'center');
    ctx.globalAlpha = 1;
    if (best > 0) text(`BEST ${best}`, cx, 664, '600 14px system-ui, sans-serif', '#7d8db0', 'center');
  }

  function drawEnd(state, best, wonGame) {
    overlay(0.55);
    const cx = VIEW.width / 2;
    if (wonGame) {
      glowText('CORE CHARGED', cx, 218, '900 72px system-ui, sans-serif', PALETTE.repair, 'center', 36);
      text('THE VOID RETREATS. THE ARENA IS YOURS.', cx, 276, '700 17px system-ui, sans-serif', '#c7d5f2', 'center');
    } else {
      glowText('GAME OVER', cx, 218, '900 76px system-ui, sans-serif', PALETTE.brute, 'center', 36);
      text('THE VOID CLAIMED YOUR SHIP.', cx, 276, '700 17px system-ui, sans-serif', '#c7d5f2', 'center');
    }
    const rows = [
      ['FINAL SCORE', String(state.score).padStart(6, '0')],
      ['WAVES SURVIVED', String(Math.max(0, state.wave - (wonGame ? 0 : 1)))],
      ['KILLS', String(state.kills)],
      ['BEST', String(Math.max(best, state.score)).padStart(6, '0')],
    ];
    rows.forEach(([label, value], i) => {
      const y = 348 + i * 40;
      text(label, cx - 30, y, '600 15px system-ui, sans-serif', '#8fa3c8', 'right');
      text(value, cx + 30, y, '800 22px system-ui, sans-serif', '#ffffff', 'left');
    });
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 3.4);
    ctx.globalAlpha = pulse;
    text('PRESS ENTER TO PLAY AGAIN', cx, 560, '800 20px system-ui, sans-serif', '#ffffff', 'center');
    ctx.globalAlpha = 1;
  }

  function draw(state, screen, best) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    if (state.shake > 0.1) {
      const dx = (Math.random() - 0.5) * state.shake;
      const dy = (Math.random() - 0.5) * state.shake;
      ctx.translate(dx, dy);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, VIEW.width, VIEW.height);
    ctx.clip();
    drawBackdrop(state);
    drawPortals(state);
    drawPickups(state);
    drawEnemies(state);
    drawShots(state);
    if (screen !== SCREEN_TITLE) drawPlayer(state); // no parked ship sitting on the title text
    drawFloaters(state);
    ctx.restore();
    if (screen !== SCREEN_TITLE) drawHud(state, best);
    if (screen === SCREEN_TITLE) drawTitle(state, best);
    else if (screen === SCREEN_PAUSED) {
      overlay(0.5);
      glowText('PAUSED', VIEW.width / 2, VIEW.height / 2 - 16, '900 54px system-ui, sans-serif', '#ffffff', 'center', 22);
      text('PRESS P TO RESUME', VIEW.width / 2, VIEW.height / 2 + 34, '600 16px system-ui, sans-serif', '#9fd8ff', 'center');
    } else if (screen === SCREEN_OVER) drawEnd(state, best, false);
    else if (screen === SCREEN_WIN) drawEnd(state, best, true);
  }

  return { draw, toView, resize };
}
