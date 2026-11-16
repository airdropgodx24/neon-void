// Keyboard and pointer input for a twin-stick game: held keys give a move direction, the mouse
// gives an aim point in arena coordinates, and one-shot presses (confirm, pause) are queued as
// action flags for the screen state machine to consume once.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;

const MOVE_KEYS = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let mouseClient = { x: 0, y: 0 };
  let mouseDown = false;
  // Set by the boot code: converts client (CSS pixel) coordinates into arena coordinates.
  let toView = (x, y) => ({ x, y });
  const gestureListeners = [];

  function gesture() {
    for (const fn of gestureListeners) fn();
  }

  window.addEventListener('keydown', (event) => {
    gesture();
    if (MOVE_KEYS[event.code]) {
      held.add(MOVE_KEYS[event.code]);
      event.preventDefault();
    }
    if (event.code === 'Space') {
      held.add('fire');
      actions |= ACTION_CONFIRM;
      event.preventDefault();
    }
    if (event.code === 'Enter') actions |= ACTION_CONFIRM;
    if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    if (event.code === 'KeyM') actions |= ACTION_MUTE;
  });
  window.addEventListener('keyup', (event) => {
    if (MOVE_KEYS[event.code]) held.delete(MOVE_KEYS[event.code]);
    if (event.code === 'Space') held.delete('fire');
  });
  window.addEventListener('mousemove', (event) => {
    mouseClient = { x: event.clientX, y: event.clientY };
  });
  window.addEventListener('mousedown', (event) => {
    gesture();
    if (event.button === 0) {
      mouseDown = true;
      actions |= ACTION_CONFIRM;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouseDown = false;
  });
  window.addEventListener('blur', () => {
    held.clear();
    mouseDown = false;
  });
  canvas.addEventListener('touchstart', (event) => event.preventDefault(), { passive: false });

  return {
    /** Held-key movement as a unit vector; diagonals are normalised. */
    direction() {
      let x = 0;
      let y = 0;
      if (held.has('left')) x -= 1;
      if (held.has('right')) x += 1;
      if (held.has('up')) y -= 1;
      if (held.has('down')) y += 1;
      if (x !== 0 && y !== 0) {
        const inv = Math.SQRT1_2;
        x *= inv;
        y *= inv;
      }
      return { x, y };
    },
    /** The aim point in arena coordinates. */
    aim() {
      return toView(mouseClient.x, mouseClient.y);
    },
    /** True while the fire button (mouse, Space or J) is held. */
    firing() {
      return mouseDown || held.has('fire');
    },
    /** The one-shot action flags since the last call; reading clears them. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    setViewTransform(fn) {
      toView = fn;
    },
    /** Called on any key or mouse press: the moment audio may start. */
    onGesture(fn) {
      gestureListeners.push(fn);
    },
  };
}
