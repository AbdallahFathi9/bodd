#!/usr/bin/env python3
"""Package a real Xcode device build; never create a placeholder IPA."""
from pathlib import Path
import hashlib
import plistlib
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def main():
    app = ROOT / "build/Build/Products/Release-iphoneos/App.app"
    info_path = app / "Info.plist"
    if not info_path.is_file():
        raise SystemExit("No device app was built. Build successfully with Xcode before packaging.")
    with info_path.open("rb") as f:
        info = plistlib.load(f)
    executable = app / info.get("CFBundleExecutable", "")
    if not executable.is_file() or executable.stat().st_size == 0:
        raise SystemExit("The compiled application executable is missing.")
    if info.get("CFBundleSupportedPlatforms") != ["iPhoneOS"]:
        raise SystemExit("A physical iPhone build is required; simulator builds cannot be installed.")
    arch = subprocess.check_output(["xcrun", "lipo", "-archs", str(executable)], text=True)
    if "arm64" not in arch.split():
        raise SystemExit("The application is missing the arm64 device architecture.")
    # ditto preserves frameworks, executable modes and bundle metadata.
    output = ROOT / "dist"
    output.mkdir(exist_ok=True)
    payload = output / "staging/Payload"
    if payload.exists():
        shutil.rmtree(payload)
    payload.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ditto", str(app), str(payload / "App.app")], check=True)
    ipa = output / "Boddflix-unsigned.ipa"
    ipa.unlink(missing_ok=True)
    subprocess.run(["ditto", "-c", "-k", "--sequesterRsrc", "--keepParent", str(payload), str(ipa)], check=True)
    digest = hashlib.sha256(ipa.read_bytes()).hexdigest()
    (output / "Boddflix-unsigned.ipa.sha256").write_text(f"{digest}  {ipa.name}\n")
    print(f"Created {ipa.name} from a compiled arm64 iPhone application. Sign it before installation.")


if __name__ == "__main__":
    main()
