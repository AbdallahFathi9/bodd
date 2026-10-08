# Boddflix for iPhone

Boddflix 1.9.2 is now built for iPhone. **[Download the compiled IPA](https://github.com/AbdallahFathi9/bodd/releases/download/ios-v1.9.2/Boddflix-unsigned.ipa).** It requires iOS 15 or later. The IPA is unsigned; use AltStore Classic on Windows to sign and install it with your own Apple Account.

This repository contains the source and macOS build workflow. Code changes pushed to `master` trigger a new IPA build; the workflow can also be started manually.

The Release build succeeded with Xcode 26.6, and all 8 JavaScript adapter tests passed. The IPA was checked for its SHA-256 checksum, arm64 iPhone executable, bundle identity, and included web/native bridge assets. **Playback, Keychain account storage, fullscreen and PiP still require testing on a physical iPhone.**

Successful build: https://github.com/AbdallahFathi9/bodd/actions/runs/37747613481

Release and checksum: https://github.com/AbdallahFathi9/bodd/releases/tag/ios-v1.9.2

## Generate the IPA from Windows

1. Extract `Boddflix-iOS-Project.zip`.
2. Create an empty **private GitHub repository**. Keep account details and signing files out of the repository.
3. Upload the **contents of the `Boddflix-iOS` folder** to the repository root. At the root, you must see `package.json`, `www`, `native`, `scripts`, and `.github/workflows/build-ios.yml`. Do not upload the ZIP itself or put the project inside another folder.
4. Open the repository's **Actions** tab. Select **Build iPhone IPA**, then **Run workflow**. It uses a macOS runner; you do not need a Mac at home.
5. Wait for the run to finish successfully. Open the completed run and download the artifact **Boddflix-iPhone-unsigned**.
6. Extract the artifact ZIP. The actual app file is **`Boddflix-unsigned.ipa`**. Its `.sha256` file is a checksum, not the app.

If Actions does not list the workflow, check that `.github/workflows/build-ios.yml` is at the repository root. Windows GitHub Desktop can publish the extracted project folder if browser upload omits the `.github` folder. Private repositories use your GitHub plan's included Actions minutes; check the Actions billing page before enabling paid usage.

If a build fails, the failed step's log is the information needed to fix it. Never rename another ZIP, the project ZIP, or an APK to `.ipa`.

## Install the IPA on iPhone using Windows

Use **AltStore Classic** and its official Windows guide:

- Download: https://altstore.io/
- Windows setup: https://faq.altstore.io/altstore-classic/how-to-install-altstore-windows
- App installation and refresh: https://faq.altstore.io/altstore-classic/your-altstore

1. Follow the official guide to install AltServer, iTunes, and iCloud on Windows. Follow its current download instructions; some Microsoft Store versions need different setup.
2. Connect the iPhone by USB, unlock it, choose **Trust This Computer**, and enable Wi-Fi sync as instructed.
3. In AltServer, choose **Install AltStore** and select your iPhone. Enter your Apple Account **locally in AltServer**, never in a chat, this project, or the repository.
4. On the iPhone, trust the developer profile under **Settings → General → VPN & Device Management**. Enable **Settings → Privacy & Security → Developer Mode** if required, then restart and confirm on the phone.
5. Transfer `Boddflix-unsigned.ipa` to the iPhone's Files app. Keep the Windows computer running AltServer and the phone connected to the same network.
6. Open **AltStore → My Apps → +**, select the IPA, and let AltStore sign and install it.
7. Open **Boddflix** and enter your own IPTV provider account. Successful remembered logins are stored in the iPhone Keychain.

With a free Apple Account, sideloaded apps normally need refreshing every **7 days**. Keep AltServer available and use AltStore's refresh function. A paid Apple Developer account and a properly configured signed distribution workflow are another route, but are not required by this unsigned build.

## Included app behavior

- Live TV, movies, series, artwork from your provider, favorites, categories, search, themes and Arabic/English UI.
- Multiple remembered accounts, account choice on startup, auto-login, and account editing through **Accounts → Edit**.
- Per-account watch history and stable history identifiers when editing credentials.
- Movie/episode timelines, resume, Finished episode markers, previous/next episode, and automatic next episode.
- Browse mini-player, touch controls that can be revealed again, fit modes, double-tap seek, touch lock and sleep timer.
- Native iPhone fullscreen and device-dependent picture-in-picture. PiP is shown only when WebKit exposes support for the current video.
- Native HLS/MP4 playback, native provider JSON requests, Keychain storage, and keeping the screen awake during playback.

Native iOS playback needs a stream format and codecs supported by iOS. Some provider MKV/AVI/TS streams will not play; request a compatible MP4/HLS stream from the provider. Manual HLS quality selection and multiview are unavailable in this initial iPhone version. iOS selects HLS quality automatically. Credentials stay on the device and are sent to the provider; HTTPS is recommended when your provider supports it. HTTPS certificate checks are not disabled.

To update without losing data, keep the same app bundle identifier and Apple signing identity, and install over the existing app. Uninstalling may remove local history, favorites and settings. Keychain items use device-only storage; do not rely on them as an account backup.

## Build on a Mac

The supplied Capacitor 8 build needs Node.js 22 or later and Xcode 26 or later.

```sh
npm install --no-audit --no-fund
npm test
bash scripts/build_ipa.sh
```

The script generates the native Xcode project, attaches Boddflix's native plugin, runs a Release build for a physical iPhone, checks the executable's arm64 architecture, and packages the built app. Output is `dist/Boddflix-unsigned.ipa`. Signing is deliberately performed separately by your installation tool.

For Xcode signing, open `ios/App/App.xcodeproj`, select the **App** target, select your Apple team under **Signing & Capabilities**, choose a unique bundle identifier if required, and build to your connected iPhone. Registered-device distribution requires a valid certificate and provisioning profile.

## Technical references

- Capacitor environment: https://capacitorjs.com/docs/getting-started/environment-setup
- Capacitor native plugins: https://capacitorjs.com/docs/ios/custom-code
- Capacitor view controller: https://capacitorjs.com/docs/ios/viewcontroller
- GitHub macOS runners: https://docs.github.com/en/actions/reference/runners/github-hosted-runners
- Apple device distribution: https://developer.apple.com/documentation/xcode/distributing-your-app-to-registered-devices

The workflow installs pinned direct dependencies on the runner. After the first successful build, retain the generated `package-lock.json` and switch the install step to `npm ci` if you want the full dependency tree locked as well.
