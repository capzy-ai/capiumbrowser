"""
capiumbrowser.human -- human-like input for Playwright pages.

Two ways to use it:

1) Helpers (explicit):
       from capiumbrowser.human import move, click, type_text, scroll, dwell
       click(page, "#login")
       type_text(page, "#user", "alice", preset="careful")
       scroll(page, 1200)

2) humanize(target) -- monkeypatch a page/context so page.human_* helpers are attached and
   (optionally) the normal click/type route through the human path:
       from capiumbrowser.human import humanize
       humanize(page, preset="default")
       page.human_click("#login"); page.human_type("#user", "alice")
"""
from . import behavior
from .behavior import move, click, type_text, scroll, dwell


def humanize(target, preset="default"):
    """Attach page.human_move / human_click / human_type / human_scroll / human_dwell.

    target may be a Page or a BrowserContext (all current + future pages are patched).
    Returns target (chainable). Does NOT override page.click/type so existing code is safe;
    call the human_* methods where you want human behavior.
    """
    def _attach(page):
        if getattr(page, "_capium_humanized", False):
            return
        page._capium_humanized = True
        page.human_move = lambda x, y, p=preset: move(page, x, y, p)
        page.human_click = lambda sel, p=preset: click(page, sel, p)
        page.human_type = lambda sel, text, p=preset: type_text(page, sel, text, p)
        page.human_scroll = lambda dy, p=preset: scroll(page, dy, p)
        page.human_dwell = dwell

    # context: patch existing + hook new pages
    if hasattr(target, "pages") and hasattr(target, "on"):
        for pg in target.pages:
            _attach(pg)
        target.on("page", _attach)
    else:
        _attach(target)
    return target


__all__ = ["humanize", "move", "click", "type_text", "scroll", "dwell", "behavior"]
