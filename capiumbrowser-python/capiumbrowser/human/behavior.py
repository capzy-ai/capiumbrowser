"""
capium.human.behavior -- realistic mouse / typing / scroll / press-and-hold for Playwright pages.

Anti-bot systems increasingly score *behavior*, and the modern ones (PX/HUMAN press-and-hold,
DataDome slider) score pointer BIOMETRICS, not just "did a cursor arrive": velocity profile
(humans accelerate then decelerate into the target -- Fitts's law -- never constant speed),
orthogonal micro-jitter along the path, overshoot-and-correct on long moves, and physiological
tremor during a sustained press (a hand cannot hold a mouse perfectly still; a rock-still
multi-second hold is a machine signature). These helpers produce all of that with pure
Playwright input (page.mouse / page.keyboard) -- no CDP tricks, so the event stream stays
consistent with the stealth binary (isTrusted=true, normal coalescing).

Presets tune the timing:
    "default" -> natural human pace
    "careful" -> slower, more deliberate (harder to flag, but slower runs)
"""
import math
import random
import time

PRESETS = {
    "default": {"move_steps": (18, 34), "step_ms": (6, 16), "key_ms": (45, 130),
                "click_pause_ms": (40, 140), "scroll_step": (90, 220), "scroll_ms": (30, 90),
                "tremor_px": 1.1, "tremor_ms": (35, 110)},
    "careful": {"move_steps": (30, 55), "step_ms": (12, 28), "key_ms": (80, 220),
                "click_pause_ms": (120, 320), "scroll_step": (50, 130), "scroll_ms": (60, 150),
                "tremor_px": 0.9, "tremor_ms": (50, 140)},
}


def _cfg(preset):
    return PRESETS.get(preset, PRESETS["default"])


def _rand_ms(rng):
    return random.uniform(rng[0], rng[1]) / 1000.0


def _pos(page):
    return getattr(page, "_capium_mouse", (random.randint(2, 60), random.randint(2, 60)))


def _velocity_warp(t):
    # Smoothstep time-warp: sampling the curve at these t values yields a bell-shaped
    # velocity profile -- slow start, fast middle, decelerating arrival (Fitts-like) --
    # instead of the constant speed that uniform sampling produces.
    return t * t * (3.0 - 2.0 * t)


def _bezier(x0, y0, x1, y1, steps):
    # Two random control points -> a curved, non-linear path; velocity-warped sampling +
    # orthogonal micro-jitter (largest mid-path, vanishing at the endpoints).
    cx1 = x0 + (x1 - x0) * random.uniform(0.2, 0.45) + random.uniform(-40, 40)
    cy1 = y0 + (y1 - y0) * random.uniform(0.2, 0.45) + random.uniform(-40, 40)
    cx2 = x0 + (x1 - x0) * random.uniform(0.55, 0.8) + random.uniform(-40, 40)
    cy2 = y0 + (y1 - y0) * random.uniform(0.55, 0.8) + random.uniform(-40, 40)
    dx, dy = x1 - x0, y1 - y0
    dist = math.hypot(dx, dy) or 1.0
    nx, ny = -dy / dist, dx / dist          # unit normal to the gross direction
    jmax = min(1.6, dist / 120.0)           # short hops barely wobble
    pts = []
    for i in range(1, steps + 1):
        lt = i / steps
        t = _velocity_warp(lt)
        mt = 1 - t
        x = mt**3 * x0 + 3 * mt**2 * t * cx1 + 3 * mt * t**2 * cx2 + t**3 * x1
        y = mt**3 * y0 + 3 * mt**2 * t * cy1 + 3 * mt * t**2 * cy2 + t**3 * y1
        j = math.sin(math.pi * lt) * random.uniform(-jmax, jmax)
        pts.append((x + nx * j, y + ny * j))
    return pts


def _run_path(page, pts, c):
    for (px, py) in pts:
        page.mouse.move(px, py)
        d = _rand_ms(c["step_ms"])
        if random.random() < 0.02:            # occasional motor hitch
            d += random.uniform(0.03, 0.08)
        time.sleep(d)


def move(page, x, y, preset="default"):
    """Move the cursor to (x, y) along a human-like curved path.

    Long moves overshoot the target by a few pixels and correct -- the
    characteristic human "land past it, pull back" arrival that biometric
    scorers look for (its absence over many moves is a tell)."""
    c = _cfg(preset)
    x0, y0 = _pos(page)
    dist = math.hypot(x - x0, y - y0)
    steps = random.randint(*c["move_steps"])
    if dist > 180 and random.random() < 0.6:
        ux, uy = (x - x0) / dist, (y - y0) / dist
        over = random.uniform(3, 14)
        ox, oy = x + ux * over, y + uy * over
        _run_path(page, _bezier(x0, y0, ox, oy, steps), c)
        _run_path(page, _bezier(ox, oy, x, y, random.randint(4, 8)), c)
    else:
        _run_path(page, _bezier(x0, y0, x, y, steps), c)
    page._capium_mouse = (x, y)


def _resolve_point(page, target):
    """Target: a selector string, or an (x, y) tuple/list."""
    if isinstance(target, (tuple, list)) and len(target) == 2:
        return float(target[0]), float(target[1])
    el = page.wait_for_selector(target, state="visible")
    box = el.bounding_box()
    return (box["x"] + box["width"] * random.uniform(0.3, 0.7),
            box["y"] + box["height"] * random.uniform(0.3, 0.7))


def click(page, selector, preset="default"):
    """Move to a random point inside `selector` and click with a natural pause."""
    c = _cfg(preset)
    tx, ty = _resolve_point(page, selector)
    move(page, tx, ty, preset)
    time.sleep(_rand_ms(c["click_pause_ms"]))
    page.mouse.down()
    time.sleep(random.uniform(0.03, 0.09))
    page.mouse.up()


def hold(page, target, seconds, preset="default"):
    """Press-and-hold on `target` (selector or (x, y)) for ~`seconds`, with tremor.

    Built for press-and-hold challenges (PX/HUMAN and similar), which measure the
    pointer DURING the press: a real hand drifts and trembles ~1px around the
    anchor the whole time, and releases slightly late. A hold with zero pointer
    events between mousedown and mouseup reads as synthetic no matter how good
    the approach path was. `seconds` should be the challenge's required duration;
    a natural human release lag is added on top."""
    c = _cfg(preset)
    tx, ty = _resolve_point(page, target)
    move(page, tx, ty, preset)
    time.sleep(_rand_ms(c["click_pause_ms"]))
    page.mouse.down()
    amp = c["tremor_px"]
    ax, ay = tx, ty                            # slow random-walk drift anchor
    end = time.monotonic() + float(seconds) + random.uniform(0.15, 0.45)
    while time.monotonic() < end:
        time.sleep(_rand_ms(c["tremor_ms"]))
        if random.random() < 0.7:              # tremor tick: micro-move near the anchor
            ax += random.uniform(-0.35, 0.35)  # the anchor itself drifts a little
            ay += random.uniform(-0.35, 0.35)
            ax = min(tx + 3, max(tx - 3, ax))
            ay = min(ty + 3, max(ty - 3, ay))
            page.mouse.move(ax + random.gauss(0, amp * 0.5),
                            ay + random.gauss(0, amp * 0.5))
    page.mouse.up()
    page._capium_mouse = (ax, ay)


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
