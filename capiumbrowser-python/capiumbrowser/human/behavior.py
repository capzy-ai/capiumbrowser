"""
capium.human.behavior -- realistic mouse / typing / scroll for Playwright pages.

Anti-bot systems increasingly score *behavior*: instant teleport-clicks, zero-jitter typing
and single-delta scrolls are bot tells. These helpers move the cursor along a bezier path with
variable speed, type with per-key jitter, and scroll in eased increments. Pure Playwright input
(page.mouse / page.keyboard) -- no CDP tricks, so it stays consistent with the stealth binary.

Presets tune the timing:
    "default" -> natural human pace
    "careful" -> slower, more deliberate (harder to flag, but slower runs)
"""
import math
import random
import time

PRESETS = {
    "default": {"move_steps": (18, 34), "step_ms": (6, 16), "key_ms": (45, 130),
                "click_pause_ms": (40, 140), "scroll_step": (90, 220), "scroll_ms": (30, 90)},
    "careful": {"move_steps": (30, 55), "step_ms": (12, 28), "key_ms": (80, 220),
                "click_pause_ms": (120, 320), "scroll_step": (50, 130), "scroll_ms": (60, 150)},
}


def _cfg(preset):
    return PRESETS.get(preset, PRESETS["default"])


def _rand_ms(rng):
    return random.uniform(rng[0], rng[1]) / 1000.0


def _pos(page):
    return getattr(page, "_capium_mouse", (random.randint(2, 60), random.randint(2, 60)))


def _bezier(x0, y0, x1, y1, steps):
    # two random control points -> a curved, non-linear path
    cx1 = x0 + (x1 - x0) * random.uniform(0.2, 0.45) + random.uniform(-40, 40)
    cy1 = y0 + (y1 - y0) * random.uniform(0.2, 0.45) + random.uniform(-40, 40)
    cx2 = x0 + (x1 - x0) * random.uniform(0.55, 0.8) + random.uniform(-40, 40)
    cy2 = y0 + (y1 - y0) * random.uniform(0.55, 0.8) + random.uniform(-40, 40)
    pts = []
    for i in range(1, steps + 1):
        t = i / steps
        mt = 1 - t
        x = mt**3 * x0 + 3 * mt**2 * t * cx1 + 3 * mt * t**2 * cx2 + t**3 * x1
        y = mt**3 * y0 + 3 * mt**2 * t * cy1 + 3 * mt * t**2 * cy2 + t**3 * y1
        pts.append((x, y))
    return pts


def move(page, x, y, preset="default"):
    """Move the cursor to (x, y) along a human-like curved path."""
    c = _cfg(preset)
    x0, y0 = _pos(page)
    steps = random.randint(*c["move_steps"])
    for (px, py) in _bezier(x0, y0, x, y, steps):
        page.mouse.move(px, py)
        time.sleep(_rand_ms(c["step_ms"]))
    page._capium_mouse = (x, y)


def click(page, selector, preset="default"):
    """Move to a random point inside `selector` and click with a natural pause."""
    c = _cfg(preset)
    el = page.wait_for_selector(selector, state="visible")
    box = el.bounding_box()
    tx = box["x"] + box["width"] * random.uniform(0.3, 0.7)
    ty = box["y"] + box["height"] * random.uniform(0.3, 0.7)
    move(page, tx, ty, preset)
    time.sleep(_rand_ms(c["click_pause_ms"]))
    page.mouse.down()
    time.sleep(random.uniform(0.03, 0.09))
    page.mouse.up()


def type_text(page, selector, text, preset="default"):
    """Click the field, then type with per-key jitter (occasional longer pauses)."""
    c = _cfg(preset)
    click(page, selector, preset)
    for ch in text:
        page.keyboard.type(ch)
        d = _rand_ms(c["key_ms"])
        if random.random() < 0.06:            # occasional think-pause
            d += random.uniform(0.15, 0.5)
        time.sleep(d)


def scroll(page, dy, preset="default"):
    """Scroll `dy` pixels (positive = down) in eased increments, not one jump."""
    c = _cfg(preset)
    remaining = dy
    direction = 1 if dy >= 0 else -1
    while abs(remaining) > 1:
        step = min(abs(remaining), random.uniform(*c["scroll_step"])) * direction
        page.mouse.wheel(0, step)
        remaining -= step
        time.sleep(_rand_ms(c["scroll_ms"]))


def dwell(lo=0.4, hi=1.8):
    """Idle a human-plausible moment (reading/hesitating)."""
    time.sleep(random.uniform(lo, hi))
