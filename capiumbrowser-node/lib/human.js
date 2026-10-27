/**
 * human -- realistic mouse / typing / scroll / press-and-hold for Playwright AND Puppeteer pages.
 *
 * Anti-bot systems increasingly score *behavior*, and the modern ones (PX/HUMAN press-and-hold,
 * DataDome slider) score pointer BIOMETRICS, not just "did a cursor arrive": velocity profile
 * (humans accelerate then decelerate into the target -- Fitts's law -- never constant speed),
 * orthogonal micro-jitter along the path, overshoot-and-correct on long moves, and physiological
 * tremor during a sustained press (a hand cannot hold a mouse perfectly still; a rock-still
 * multi-second hold is a machine signature). These helpers produce all of that with pure driver
 * input (page.mouse / page.keyboard) -- no CDP tricks, so the event stream stays consistent with
 * the stealth binary (isTrusted=true, normal coalescing). The Playwright and Puppeteer input
 * APIs align on everything used here except mouse.wheel, which is bridged below.
 *
 * Presets tune the timing:
 *     "default" -> natural human pace
 *     "careful" -> slower, more deliberate (harder to flag, but slower runs)
 */
'use strict';

const PRESETS = {
  default: { moveSteps: [18, 34], stepMs: [6, 16], keyMs: [45, 130],
    clickPauseMs: [40, 140], scrollStep: [90, 220], scrollMs: [30, 90],
    tremorPx: 1.1, tremorMs: [35, 110] },
  careful: { moveSteps: [30, 55], stepMs: [12, 28], keyMs: [80, 220],
    clickPauseMs: [120, 320], scrollStep: [50, 130], scrollMs: [60, 150],
    tremorPx: 0.9, tremorMs: [50, 140] },
};

const cfg = (preset) => PRESETS[preset] || PRESETS.default;
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const randMs = ([lo, hi]) => rand(lo, hi);
const randInt = (lo, hi) => Math.round(rand(lo, hi));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const gauss = (mu, sigma) => {
  // Box-Muller
  const u = Math.random() || 1e-9;
  const v = Math.random() || 1e-9;
  return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

function pos(page) {
  return page._capiumMouse || [randInt(2, 60), randInt(2, 60)];
}

// Smoothstep time-warp: sampling the curve at these t values yields a bell-shaped velocity
// profile -- slow start, fast middle, decelerating arrival (Fitts-like) -- instead of the
// constant speed that uniform sampling produces.
const velocityWarp = (t) => t * t * (3 - 2 * t);

function bezier(x0, y0, x1, y1, steps) {
  // Two random control points -> a curved, non-linear path; velocity-warped sampling +
  // orthogonal micro-jitter (largest mid-path, vanishing at the endpoints).
  const cx1 = x0 + (x1 - x0) * rand(0.2, 0.45) + rand(-40, 40);
  const cy1 = y0 + (y1 - y0) * rand(0.2, 0.45) + rand(-40, 40);
  const cx2 = x0 + (x1 - x0) * rand(0.55, 0.8) + rand(-40, 40);
  const cy2 = y0 + (y1 - y0) * rand(0.55, 0.8) + rand(-40, 40);
  const dx = x1 - x0, dy = y1 - y0;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = -dy / dist, ny = dx / dist;      // unit normal to the gross direction
  const jmax = Math.min(1.6, dist / 120);     // short hops barely wobble
  const pts = [];
  for (let i = 1; i <= steps; i++) {
    const lt = i / steps;
    const t = velocityWarp(lt);
    const mt = 1 - t;
    const x = mt ** 3 * x0 + 3 * mt ** 2 * t * cx1 + 3 * mt * t ** 2 * cx2 + t ** 3 * x1;
    const y = mt ** 3 * y0 + 3 * mt ** 2 * t * cy1 + 3 * mt * t ** 2 * cy2 + t ** 3 * y1;
    const j = Math.sin(Math.PI * lt) * rand(-jmax, jmax);
    pts.push([x + nx * j, y + ny * j]);
  }
  return pts;
}

async function runPath(page, pts, c) {
  for (const [px, py] of pts) {
    await page.mouse.move(px, py);
    let d = randMs(c.stepMs);
    if (Math.random() < 0.02) d += rand(30, 80); // occasional motor hitch
    await sleep(d);
  }
}

async function wheel(page, dx, dy) {
  // Playwright: mouse.wheel(dx, dy). Puppeteer: mouse.wheel({deltaX, deltaY}).
  if (page.mouse.wheel.length >= 2) return page.mouse.wheel(dx, dy);
  return page.mouse.wheel({ deltaX: dx, deltaY: dy });
}

/**
 * Move the cursor to (x, y) along a human-like curved path.
 *
 * Long moves overshoot the target by a few pixels and correct -- the characteristic human
 * "land past it, pull back" arrival that biometric scorers look for (its absence over many
 * moves is a tell).
 */
async function move(page, x, y, preset = 'default') {
  const c = cfg(preset);
  const [x0, y0] = pos(page);
  const dist = Math.hypot(x - x0, y - y0);
  const steps = randInt(...c.moveSteps);
  if (dist > 180 && Math.random() < 0.6) {
    const ux = (x - x0) / dist, uy = (y - y0) / dist;
    const over = rand(3, 14);
    const ox = x + ux * over, oy = y + uy * over;
    await runPath(page, bezier(x0, y0, ox, oy, steps), c);
    await runPath(page, bezier(ox, oy, x, y, randInt(4, 8)), c);
  } else {
    await runPath(page, bezier(x0, y0, x, y, steps), c);
  }
  page._capiumMouse = [x, y];
}

/** Target: a selector string, or an [x, y] pair. */
async function resolvePoint(page, target) {
  if (Array.isArray(target) && target.length === 2) return [Number(target[0]), Number(target[1])];
  const el = await page.waitForSelector(target, { state: 'visible', visible: true });
  const box = await el.boundingBox();
  return [box.x + box.width * rand(0.3, 0.7), box.y + box.height * rand(0.3, 0.7)];
}

/** Move to a random point inside `selector` and click with a natural pause. */
async function click(page, selector, preset = 'default') {
  const c = cfg(preset);
  const [tx, ty] = await resolvePoint(page, selector);
  await move(page, tx, ty, preset);
  await sleep(randMs(c.clickPauseMs));
  await page.mouse.down();
  await sleep(rand(30, 90));
  await page.mouse.up();
}

/**
 * Press-and-hold on `target` (selector or [x, y]) for ~`seconds`, with tremor.
 *
 * Built for press-and-hold challenges (PX/HUMAN and similar), which measure the pointer
 * DURING the press: a real hand drifts and trembles ~1px around the anchor the whole time,
 * and releases slightly late. A hold with zero pointer events between mousedown and mouseup
 * reads as synthetic no matter how good the approach path was. `seconds` should be the
 * challenge's required duration; a natural human release lag is added on top.
 */
async function hold(page, target, seconds, preset = 'default') {
  const c = cfg(preset);
  const [tx, ty] = await resolvePoint(page, target);
  await move(page, tx, ty, preset);
  await sleep(randMs(c.clickPauseMs));
  await page.mouse.down();
  const amp = c.tremorPx;
  let ax = tx, ay = ty;                        // slow random-walk drift anchor
  const end = Date.now() + Number(seconds) * 1000 + rand(150, 450);
  while (Date.now() < end) {
    await sleep(randMs(c.tremorMs));
    if (Math.random() < 0.7) {                 // tremor tick: micro-move near the anchor
      ax = Math.min(tx + 3, Math.max(tx - 3, ax + rand(-0.35, 0.35)));
      ay = Math.min(ty + 3, Math.max(ty - 3, ay + rand(-0.35, 0.35)));
      await page.mouse.move(ax + gauss(0, amp * 0.5), ay + gauss(0, amp * 0.5));
    }
  }
  await page.mouse.up();
  page._capiumMouse = [ax, ay];
}

/** Click the field, then type with per-key jitter (occasional longer pauses). */
async function typeText(page, selector, text, preset = 'default') {
  const c = cfg(preset);
  await click(page, selector, preset);
  for (const ch of text) {
    await page.keyboard.type(ch);
    let d = randMs(c.keyMs);
    if (Math.random() < 0.06) d += rand(150, 500); // occasional think-pause
    await sleep(d);
  }
}

/** Scroll `dy` pixels (positive = down) in eased increments, not one jump. */
async function scroll(page, dy, preset = 'default') {
  const c = cfg(preset);
  let remaining = dy;
  const direction = dy >= 0 ? 1 : -1;
  while (Math.abs(remaining) > 1) {
    const step = Math.min(Math.abs(remaining), rand(...c.scrollStep)) * direction;
    await wheel(page, 0, step);
    remaining -= step;
    await sleep(randMs(c.scrollMs));
  }
}

/** Idle a human-plausible moment (reading/hesitating). */
async function dwell(loSec = 0.4, hiSec = 1.8) {
  await sleep(rand(loSec * 1000, hiSec * 1000));
}

/**
 * Attach page.humanMove / humanClick / humanType / humanScroll / humanHold / humanDwell.
 *
 * target may be a Page or a BrowserContext (all current + future pages are patched).
 * Returns target (chainable). Does NOT override page.click/type so existing code is safe;
 * call the human* methods where you want human behavior.
 */
function humanize(target, preset = 'default') {
  const attach = (page) => {
    if (page._capiumHumanized) return;
    page._capiumHumanized = true;
    page.humanMove = (x, y, p = preset) => move(page, x, y, p);
    page.humanClick = (sel, p = preset) => click(page, sel, p);
    page.humanType = (sel, text, p = preset) => typeText(page, sel, text, p);
    page.humanScroll = (dy, p = preset) => scroll(page, dy, p);
    page.humanHold = (sel, seconds, p = preset) => hold(page, sel, seconds, p);
    page.humanDwell = dwell;
  };

  // context: patch existing + hook new pages
  if (typeof target.pages === 'function' && typeof target.on === 'function') {
    for (const pg of target.pages()) attach(pg);
    target.on('page', attach);
  } else {
    attach(target);
  }
  return target;
}

module.exports = { humanize, move, click, typeText, scroll, dwell, hold, PRESETS };
