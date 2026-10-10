import asyncio
from pathlib import Path
import threading

import pytest

from capiumbrowser.errors import CapiumExpiredError, CapiumServerDownError, read_launch_status
from capiumbrowser.licensing import readiness


def package(tmp_path):
    (tmp_path / 'CAPIUM_BUILD_INFO').write_text('license_status_protocol : 1\n')
    status = tmp_path / 'status'
    status.write_text('')
    return str(tmp_path / 'chrome'), str(status)


@pytest.mark.parametrize('asynchronous', [False, True])
@pytest.mark.parametrize('decision', ['0\nCAPIUM_LICENSE_READY', '4\nlicense rejected'])
def test_driver_connection_waits_for_delayed_native_license_decision(tmp_path, asynchronous, decision):
    binary, status = package(tmp_path)
    timer = threading.Timer(0.04, lambda: Path(status).write_text(decision))
    timer.start()
    try:
        def wait():
            if asynchronous:
                asyncio.run(readiness.wait_async(binary, status, 500))
            else:
                readiness.wait(binary, status, 500)
        if decision.startswith('4'):
            with pytest.raises(CapiumExpiredError):
                wait()
        else:
            wait()
            assert read_launch_status(status) is None
    finally:
        timer.join()


def test_packaged_browser_without_a_decision_fails_with_a_bound(tmp_path):
    binary, status = package(tmp_path)
    with pytest.raises(CapiumServerDownError):
        readiness.wait(binary, status, 30)


def test_legacy_binary_keeps_its_existing_launch_protocol(tmp_path):
    readiness.wait(str(tmp_path / 'chrome'), str(tmp_path / 'missing'), 1)
