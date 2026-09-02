/**
 * human -- realistic mouse / typing / scroll for Playwright AND Puppeteer pages.
 *
 * Anti-bot systems increasingly score *behavior*: instant teleport-clicks, zero-jitter typing
 * and single-delta scrolls are bot tells. These helpers move the cursor along a bezier path
 * with variable speed, type with per-key jitter, and scroll in eased increments. Pure driver
 * input (page.mouse / page.keyboard) -- no CDP tricks, so it stays consistent with the stealth
 * binary. The Playwright and Puppeteer input APIs align on everything used here except
 * mouse.wheel, which is bridged below.
 *
 * Presets tune the timing:
 *     "default" -> natural human pace
 *     "careful" -> slower, more deliberate (harder to flag, but slower runs)
 */
'use strict';

const PRESETS = {
  default: { moveSteps: [18, 34], stepMs: [6, 16], keyMs: [45, 130],
    clickPauseMs: [40, 140], scrollStep: [90, 220], scrollMs: [30, 90] },
  careful: { moveSteps: [30, 55], stepMs: [12, 28], keyMs: [80, 220],
    clickPauseMs: [120, 320], scrollStep: [50, 130], scrollMs: [60, 150] },
};

const cfg = (preset) => PRESETS[preset] || PRESETS.default;
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const randMs = ([lo, hi]) => rand(lo, hi);
const randInt = (lo, hi) => Math.round(rand(lo, hi));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pos(page) {
  return page._capiumMouse || [randInt(2, 60), randInt(2, 60)];
}

function bezier(x0, y0, x1, y1, steps) {
  // two random control points -> a curved, non-linear path
  const cx1 = x0 + (x1 - x0) * rand(0.2, 0.45) + rand(-40, 40);
  const cy1 = y0 + (y1 - y0) * rand(0.2, 0.45) + rand(-40, 40);
  const cx2 = x0 + (x1 - x0) * rand(0.55, 0.8) + rand(-40, 40);
  const cy2 = y0 + (y1 - y0) * rand(0.55, 0.8) + rand(-40, 40);
  const pts = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    pts.push([
      mt ** 3 * x0 + 3 * mt ** 2 * t * cx1 + 3 * mt * t ** 2 * cx2 + t ** 3 * x1,
      mt ** 3 * y0 + 3 * mt ** 2 * t * cy1 + 3 * mt * t ** 2 * cy2 + t ** 3 * y1,
    ]);
  }
  return pts;
}

async function wheel(page, dx, dy) {
  // Playwright: mouse.wheel(dx, dy). Puppeteer: mouse.wheel({deltaX, deltaY}).
  if (page.mouse.wheel.length >= 2) return page.mouse.wheel(dx, dy);
  return page.mouse.wheel({ deltaX: dx, deltaY: dy });
}

/** Move the cursor to (x, y) along a human-like curved path. */
async function move(page, x, y, preset = 'default') {
  const c = cfg(preset);
  const [x0, y0] = pos(page);
  const steps = randInt(...c.moveSteps);
  for (const [px, py] of bezier(x0, y0, x, y, steps)) {
    await page.mouse.move(px, py);
    await sleep(randMs(c.stepMs));
  }
  page._capiumMouse = [x, y];
}

/** Move to a random point inside `selector` and click with a natural pause. */
async function click(page, selector, preset = 'default') {
  const c = cfg(preset);
  const el = await page.waitForSelector(selector, { state: 'visible', visible: true });
  const box = await el.boundingBox();
  const tx = box.x + box.width * rand(0.3, 0.7);
  const ty = box.y + box.height * rand(0.3, 0.7);
  await move(page, tx, ty, preset);
  await sleep(randMs(c.clickPauseMs));
  await page.mouse.down();
  await sleep(rand(30, 90));
  await page.mouse.up();
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
 * Attach page.humanMove / humanClick / humanType / humanScroll / humanDwell.
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

module.exports = { humanize, move, click, typeText, scroll, dwell, PRESETS };
