import asyncio
from types import SimpleNamespace

import pytest

from capiumbrowser.browser import _apply_viewport_defaults, _build_args
from capiumbrowser.mobile import context_options, mobile_profile, validate_launch


@pytest.mark.parametrize('seed', [0, 2, 0xFFFFFFFF])
def test_iphone_profile_is_explicit_and_separate_from_android(seed):
    p = mobile_profile(seed, platform='ios')
    assert (p['id'], p['width'], p['height'], p['dpr']) == ('iphone-16', 393, 852, 3)
    assert p['release_year'] >= 2022 and 'CriOS/' in p['user_agent']
    args = _build_args(seed, 'ios', True, None, None, None, None, headless=True)
    assert '--fingerprint-platform=ios' in args
    assert '--user-agent=' + p['user_agent'] in args
    assert '--capium-preserve-user-agent' in args
    assert [a for a in args if a.startswith('--window-size=')] == ['--window-size=393,852']
    assert not any(a.startswith('--fingerprint-storage-quota=') for a in args)


@pytest.mark.parametrize('asynchronous', [False, True])
def test_iphone_layout_reaches_plain_context_and_page_creation(asynchronous):
    def sync_method(**options): return options
    async def async_method(**options): return options
    method = async_method if asynchronous else sync_method
    browser = _apply_viewport_defaults(SimpleNamespace(new_context=method, new_page=method),
        asynchronous=asynchronous, mobile_seed=3, mobile_device='iphone-16', mobile_platform='ios')
    for name in ('new_context', 'new_page'):
        result = getattr(browser, name)()
        if asynchronous: result = asyncio.run(result)
        assert result == context_options(3, platform='ios')
        assert result['is_mobile'] and result['has_touch']


def test_mobile_selectors_cannot_cross_platforms():
    validate_launch('ios', None, mobile_device='iphone-16')
    with pytest.raises(ValueError, match='catalog ID'):
        validate_launch('ios', None, mobile_device='pixel-7')
    with pytest.raises(ValueError, match='catalog ID'):
        validate_launch('android', None, mobile_device='iphone-16')
    with pytest.raises(ValueError, match='requires platform'):
        validate_launch('macos', None, mobile_device='iphone-16')
    with pytest.raises(ValueError, match='identity overrides'):
        validate_launch('ios', None, ['--user-agent=desktop'])
    with pytest.raises(ValueError, match='catalog UA'):
        context_options(3, {'user_agent':'desktop', 'no_viewport':True}, platform='ios')
