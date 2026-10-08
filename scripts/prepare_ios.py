#!/usr/bin/env python3
"""Attach Boddflix's local plugin to the Capacitor-generated Xcode project."""
from pathlib import Path
import hashlib
import json
import plistlib
import re
import shutil
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]


def section(text, name):
    pattern = rf"(/\* Begin {name} section \*/)(.*?)(/\* End {name} section \*/)"
    match = re.search(pattern, text, re.S)
    if not match:
        raise RuntimeError(f"Generated project is missing the {name} section.")
    return match


def insert_section(text, name, lines):
    match = section(text, name)
    return text[:match.end(2)] + lines + text[match.end(2):]


def identifier(name, kind):
    return hashlib.sha256(f"Boddflix:{kind}:{name}".encode()).hexdigest()[:24].upper()


def add_sources(text, names):
    refs = section(text, "PBXFileReference").group(2)
    delegate = re.search(r"([A-Fa-f0-9]{24}) /\* AppDelegate\.swift \*/ =", refs)
    if not delegate:
        raise RuntimeError("Cannot find AppDelegate.swift in the generated Xcode project.")
    delegate_id = delegate.group(1)
    build_section = section(text, "PBXBuildFile").group(2)
    delegate_build = re.search(
        rf"([A-Fa-f0-9]{{24}}) /\*[^\n]*\*/ = \{{[^\n]*fileRef = {delegate_id}\b", build_section)
    if not delegate_build:
        raise RuntimeError("Cannot find the AppDelegate.swift build reference.")

    ref_lines, build_lines, children, sources = [], [], [], []
    for name in names:
        file_id = identifier(name, "file")
        build_id = identifier(name, "build")
        if re.search(rf"\b{file_id}\b", refs):
            continue
        if file_id in text or build_id in text:
            raise RuntimeError("Unexpected Xcode identifier collision.")
        ref_lines.append(f'\t\t{file_id} /* {name} */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = {name}; sourceTree = "<group>"; }};\n')
        build_lines.append(f'\t\t{build_id} /* {name} in Sources */ = {{isa = PBXBuildFile; fileRef = {file_id} /* {name} */; }};\n')
        children.append(f"\t\t\t\t{file_id} /* {name} */,\n")
        sources.append(f"\t\t\t\t{build_id} /* {name} in Sources */,\n")
    if not ref_lines:
        return text
    text = insert_section(text, "PBXFileReference", "".join(ref_lines))
    text = insert_section(text, "PBXBuildFile", "".join(build_lines))

    groups = section(text, "PBXGroup")
    group_blocks = list(re.finditer(r"\t\t[A-Fa-f0-9]{24}[^\n]* = \{\n.*?\n\t\t\};", groups.group(2), re.S))
    app_groups = [m for m in group_blocks if re.search(rf"\b{delegate_id}\b", m.group())]
    if len(app_groups) != 1:
        raise RuntimeError("Cannot identify the unique application source group.")
    group = app_groups[0]
    new_group = group.group().replace("children = (\n", "children = (\n" + "".join(children), 1)
    start, end = groups.start(2) + group.start(), groups.start(2) + group.end()
    text = text[:start] + new_group + text[end:]

    phases = section(text, "PBXSourcesBuildPhase")
    phase_blocks = list(re.finditer(r"\t\t[A-Fa-f0-9]{24}[^\n]* = \{\n.*?\n\t\t\};", phases.group(2), re.S))
    app_phases = [m for m in phase_blocks if delegate_build.group(1) in m.group()]
    if len(app_phases) != 1:
        raise RuntimeError("Cannot identify the unique application Sources phase.")
    phase = app_phases[0]
    new_phase = phase.group().replace("files = (\n", "files = (\n" + "".join(sources), 1)
    start, end = phases.start(2) + phase.start(), phases.start(2) + phase.end()
    return text[:start] + new_phase + text[end:]


def main():
    app = ROOT / "ios/App/App"
    project = ROOT / "ios/App/App.xcodeproj/project.pbxproj"
    if not project.is_file():
        raise SystemExit("Run npm run build:web and npx cap add ios --packagemanager SPM first.")
    names = ["BoddIOSPlugin.swift", "BoddBridgeViewController.swift"]
    patched = add_sources(project.read_text(), names)
    storyboard = app / "Base.lproj/Main.storyboard"
    tree = ET.parse(storyboard)
    controllers = [e for e in tree.iter("viewController") if e.get("customClass") in
                   {"CAPBridgeViewController", "BoddBridgeViewController"}]
    if len(controllers) != 1:
        raise RuntimeError("Cannot locate the Capacitor bridge view controller in Main.storyboard.")
    controllers[0].set("customClass", "BoddBridgeViewController")
    controllers[0].set("customModule", "App")
    controllers[0].set("customModuleProvider", "target")

    info_path = app / "Info.plist"
    with info_path.open("rb") as f:
        info = plistlib.load(f)
    info["CFBundleDisplayName"] = "Boddflix"
    info["CFBundleShortVersionString"] = json.loads((ROOT / "package.json").read_text())["version"]
    info["CFBundleVersion"] = "1"
    # User-entered IPTV providers may use HTTP. Default HTTPS certificate validation stays enabled.
    info["NSAppTransportSecurity"] = {"NSAllowsArbitraryLoads": True}
    info["UIBackgroundModes"] = ["audio"]
    info["UISupportedInterfaceOrientations"] = ["UIInterfaceOrientationPortrait",
        "UIInterfaceOrientationLandscapeLeft", "UIInterfaceOrientationLandscapeRight"]
    info["UISupportedInterfaceOrientations~ipad"] = ["UIInterfaceOrientationPortrait",
        "UIInterfaceOrientationPortraitUpsideDown", "UIInterfaceOrientationLandscapeLeft",
        "UIInterfaceOrientationLandscapeRight"]

    for name in names:
        shutil.copy2(ROOT / "native" / name, app / name)
    project.write_text(patched)
    tree.write(storyboard, encoding="utf-8", xml_declaration=True)
    with info_path.open("wb") as f:
        plistlib.dump(info, f)
    icons = app / "Assets.xcassets/AppIcon.appiconset"
    icons.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / "native/AppIcon-1024.png", icons / "AppIcon-1024.png")
    (icons / "Contents.json").write_text(json.dumps({
        "images": [{"filename": "AppIcon-1024.png", "idiom": "universal", "platform": "ios", "size": "1024x1024"}],
        "info": {"author": "xcode", "version": 1}
    }, indent=2) + "\n")
    print("Prepared Boddflix native plugin, icon, playback audio session and Info.plist.")


if __name__ == "__main__":
    main()
