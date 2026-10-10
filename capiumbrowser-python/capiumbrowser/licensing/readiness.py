"""Wait for the packaged browser's own license decision, without a server call."""
import asyncio
import os
import re
import time

from ..errors import CapiumServerDownError, read_launch_status


def required(binary):
    directory = os.path.dirname(os.path.abspath(binary))
    for _ in range(8):
        info = os.path.join(directory, 'CAPIUM_BUILD_INFO')
        try:
            with open(info, encoding='utf-8') as stream:
                return bool(re.search(r'^license_status_protocol\s*:\s*1\s*$', stream.read(), re.M))
        except FileNotFoundError:
            parent = os.path.dirname(directory)
            if parent == directory:
                break
            directory = parent
    return False


def _decision(path):
    error = read_launch_status(path)
    if error:
        raise error
    try:
        with open(path, encoding='utf-8') as stream:
            return stream.read().strip() == '0\nCAPIUM_LICENSE_READY'
    except OSError:
        return False


def wait(binary, path, timeout_ms=30000):
    if not required(binary):
        return
    deadline = time.monotonic() + (timeout_ms or 30000) / 1000
    while not _decision(path):
        if time.monotonic() >= deadline:
            raise CapiumServerDownError('Timed out waiting for the browser license startup decision')
        time.sleep(0.02)


async def wait_async(binary, path, timeout_ms=30000):
    if not required(binary):
        return
    deadline = time.monotonic() + (timeout_ms or 30000) / 1000
    while not _decision(path):
        if time.monotonic() >= deadline:
            raise CapiumServerDownError('Timed out waiting for the browser license startup decision')
        await asyncio.sleep(0.02)
