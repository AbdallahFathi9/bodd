#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "$(uname -s)" != "Darwin" ]] || ! command -v xcodebuild >/dev/null 2>&1; then
  echo "A Mac with Xcode 26 or later is required. On Windows, use the included GitHub Actions workflow."
  exit 1
fi

node --version
xcodebuild -version
npm run build:web
if [[ ! -f ios/App/App.xcodeproj/project.pbxproj ]]; then
  npx cap add ios --packagemanager SPM
fi
npx cap sync ios
python3 scripts/prepare_ios.py

xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -derivedDataPath build \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO \
  build

python3 scripts/package_ipa.py
