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
    # Packaging revision is always a dotted suffix; default revision 1 -> <version>.1
    p = download.distro_path("152.0.7977.65", "windows-x64")
    assert p == "/download/distro/chromium-v152.0.7977.65.1/capiumbrowser-windows-x64.tar.gz"
    assert "capiumbrowser-windows-x64.tar.gz" in p
    assert "chromium-v152.0.7977.65.1/" in p
    # a re-spin lands in its own .N folder
    assert download.distro_path("152.0.7977.65", "windows-x64", 2) == \
        "/download/distro/chromium-v152.0.7977.65.2/capiumbrowser-windows-x64.tar.gz"


def test_extract_locked_upgrade_never_nests(tmp_path, monkeypatch):
    """Regression: an engine-build upgrade where the old chrome.exe/*.dll can't be deleted
    (the Windows loaded-image lock) must rename the stale dir ASIDE and land the new payload
    FLAT -- never nested under a leftover, which left a half-stale top level (old chrome.exe,
    no ICU/paks) that aborted at ICU init."""
    import os
    import shutil
    import tarfile

    root = tmp_path / "root"
    root.mkdir()
    dst = root / "capium-158-windows-x64"
    dst.mkdir()
    (dst / "chrome.exe").write_text("STALE-OLD")        # stale binary at the resolved path
    (dst / "stale-only.txt").write_text("remove me")    # stale file with no replacement

    stage = tmp_path / "stage" / "capiumbrowser-windows-x64"
    stage.mkdir(parents=True)
    (stage / "chrome.exe").write_text("NEW-BUILD")
    (stage / "icudtl.dat").write_text("icu")
    (stage / "locales").mkdir()
    (stage / "locales" / "en-US.pak").write_text("pak")
    archive = tmp_path / "a.tar.gz"
    with tarfile.open(archive, "w:gz") as t:
        t.add(str(stage), arcname="capiumbrowser-windows-x64")

    # Simulate the old install dir being un-deletable (locked): rmtree leaves exactly it.
    real_rmtree = shutil.rmtree

    def fake_rmtree(p, *a, **k):
        if os.path.basename(str(p)) == "capium-158-windows-x64":
            return
        return real_rmtree(p, *a, **k)

    monkeypatch.setattr(shutil, "rmtree", fake_rmtree)
    download._extract(str(archive), str(root), "capium-158-windows-x64")

    assert (dst / "chrome.exe").read_text() == "NEW-BUILD"      # stale binary replaced
    assert (dst / "icudtl.dat").is_file()                       # ICU present at the top level
    assert not (dst / "capiumbrowser-windows-x64").exists()     # new payload is NOT nested
    assert not (dst / "stale-only.txt").exists()                # stale-only file is gone
