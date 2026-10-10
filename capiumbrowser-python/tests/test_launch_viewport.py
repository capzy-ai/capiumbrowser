"""Plain launch defaults match persistent/convenience launch without overriding callers."""
import asyncio
import inspect
from types import SimpleNamespace

import pytest

from capiumbrowser.browser import _apply_viewport_defaults


@pytest.mark.parametrize('asynchronous', [False, True])
@pytest.mark.parametrize('explicit', [{}, {'viewport': {'width': 800, 'height': 600}},
                                    {'no_viewport': False}, {'no_viewport': True}, {'viewport': None}])
def test_window_default_and_explicit_overrides(asynchronous, explicit):
    calls = []
    before = dict(explicit)

    def sync_method(**kwargs):
        calls.append(kwargs)
        return kwargs

    async def async_method(**kwargs):
        calls.append(kwargs)
        return kwargs

    method = async_method if asynchronous else sync_method
    browser = SimpleNamespace(new_context=method, new_page=method)
    assert _apply_viewport_defaults(browser, asynchronous=asynchronous) is browser
    expected = explicit if explicit else {'no_viewport': True}
    for name in ('new_context', 'new_page'):
        wrapped = getattr(browser, name)
        assert inspect.iscoroutinefunction(wrapped) == asynchronous
        result = asyncio.run(wrapped(**explicit)) if asynchronous else wrapped(**explicit)
        assert result == expected
    assert calls == [expected, expected]
    assert explicit == before
