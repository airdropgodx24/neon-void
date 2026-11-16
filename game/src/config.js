// Neon Void tuning: one place for the numbers every other module reads, so the game's feel
// (speeds, damage, wave pressure, the score goal) can be balanced without hunting through code.

/** The arena is a fixed 1280x720 field; the renderer scales it to whatever window it gets. */
export const VIEW = { width: 1280, height: 720 };

/** The simulation advances in fixed steps of this size, so play and screenshots are repeatable. */
export const STEP = 1 / 60;

/** Score that charges the core and wins the run. Kills, wave bonuses and combos all feed it. */
export const GOAL_SCORE = 6000;

export const PLAYER = {
  radius: 14,
  maxHp: 100,
  accel: 2600,
  maxSpeed: 345,
  /** Seconds of mercy invulnerability after any hit lands. */
  invulnSeconds: 0.9,
  fireInterval: 0.13,
  bulletSpeed: 800,
  bulletLife: 0.9,
};

/** Hull damage each enemy kind deals by ramming the player. */
export const RAM_DAMAGE = { drifter: 12, speeder: 10, weaver: 14, brute: 24, stinger: 12 };

/** Score for a kill before the combo multiplier is applied. */
export const KILL_SCORE = { drifter: 50, speeder: 75, weaver: 100, brute: 200, stinger: 150 };

/** Hull points an enemy has, in player-bullet hits. */
export const ENEMY_HP = { drifter: 3, speeder: 2, weaver: 4, brute: 16, stinger: 5 };

export const ENEMY_RADIUS = { drifter: 16, speeder: 13, weaver: 17, brute: 32, stinger: 16 };

/** The neon palette: one hot colour per enemy kind so a glance reads the whole field. */
export const PALETTE = {
  player: '#54f0ff',
  bullet: '#aef7ff',
  enemyBullet: '#ff7a59',
  drifter: '#ff4fd8',
  speeder: '#ffb02e',
  weaver: '#9d6bff',
  brute: '#ff4655',
  stinger: '#c6ff4d',
  repair: '#3dff8e',
  weapon: '#ffd23d',
  shield: '#57b6ff',
};

/** localStorage key for the best score. */
export const BEST_KEY = 'neon-void-best';
