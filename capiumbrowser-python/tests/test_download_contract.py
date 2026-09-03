"""Unit tests for the SDK download contract (capiumbrowser.licensing.download): host ->
distro tag, and the versioned artifact path. Guards the os/arch normalization and the
'filename is version-independent, folder carries the version' URL shape.
"""
import pytest

from capiumbrowser.licensing import download
from capiumbrowser.errors import CapiumError


def test_supported_tags():
    assert download.download_tag("Linux", "x86_64") == "linux-x64"
    assert download.download_tag("Linux", "aarch64") == "linux-arm64"
    assert download.download_tag("Windows", "AMD64") == "windows-x64"
    assert download.download_tag("Darwin", "arm64") == "macos-arm64"


def test_os_arch_normalization():
    assert download._norm_os("Darwin") == "macos"
    assert download._norm_os("Windows") == "windows"
    assert download._norm_os("Linux") == "linux"
    assert download._norm_arch("amd64") == "x64"
    assert download._norm_arch("x86_64") == "x64"
    assert download._norm_arch("aarch64") == "arm64"


def test_unsupported_platforms_raise():
    with pytest.raises(CapiumError):
        download.download_tag("Darwin", "x86_64")   # macOS Intel: not built
    with pytest.raises(CapiumError):
        download.download_tag("Windows", "arm64")   # Windows ARM: not built


def test_distro_path_shape():
    p = download.distro_path("152.0.7977.65", "windows-x64")
    assert p == "/download/distro/chromium-v152.0.7977.65/capiumbrowser-windows-x64.tar.gz"
    assert "capiumbrowser-windows-x64.tar.gz" in p
    assert "chromium-v152.0.7977.65/" in p
