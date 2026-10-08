const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function environment(native) {
  const context = { window: { BoddNative: native }, URL, Promise,
    document: { addEventListener() {} } };
  vm.createContext(context);
  for (const name of ['core.js', 'ios.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../www', name), 'utf8'), context);
  }
  return context.window;
}

test('saved profiles and stable history identifiers survive a Keychain bridge round trip', async () => {
  let saved = 'null';
  const api = environment({
    async loadAccount() { return { value: saved }; },
    async saveAccount({ value }) { saved = value; }
  }).desktopIPTV;
  assert.equal(await api.loadAccount(), null);
  const profiles = [
    { server: 'https://one.example.test', username: 'one', password: 'test-one', dataKey: 'stable-one', autoLogin: true },
    { server: 'http://two.example.test:8080', username: 'two', password: 'test-two', dataKey: 'stable-two', label: 'Second' }
  ];
  const account = { ...profiles[0], profiles };
  assert.equal((await api.saveAccount(account)).ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(await api.loadAccount())), account);
  assert.equal((await api.saveAccount(null)).ok, true);
  assert.equal(await api.loadAccount(), null);
});

test('native account storage failure is reported instead of saving plaintext', async () => {
  const api = environment({
    async saveAccount() { throw new Error('Keychain locked'); },
    async loadAccount() { throw new Error('Keychain locked'); }
  }).desktopIPTV;
  assert.equal((await api.saveAccount({ password: 'test-secret' })).ok, false);
  await assert.rejects(api.loadAccount(), /Keychain locked/);
});

test('provider calls preserve encoded credentials and episode parameters', async () => {
  let requested;
  const api = environment({ async getJSON({ url }) {
    requested = new URL(url);
    return { value: JSON.stringify({ episodes: { 1: [{ id: 7 }] } }) };
  } }).desktopIPTV;
  const account = { server: 'https://provider.example.test:8443/api', username: 'a & b', password: 'p?#&=' };
  const result = await api.fetchProvider(account, 'get_series_info', { series_id: 42 });
  assert.equal(result.ok, true);
  assert.equal(result.data.episodes[1][0].id, 7);
  assert.equal(requested.pathname, '/api/player_api.php');
  assert.equal(requested.searchParams.get('username'), account.username);
  assert.equal(requested.searchParams.get('password'), account.password);
  assert.equal(requested.searchParams.get('action'), 'get_series_info');
  assert.equal(requested.searchParams.get('series_id'), '42');
});

test('provider errors do not expose credentials or native diagnostic details', async () => {
  const api = environment({ async getJSON() { throw new Error('password=test-secret'); } }).desktopIPTV;
  const result = await api.fetchProvider({ server: 'https://provider.example.test', username: 'u', password: 'test-secret' });
  assert.equal(result.ok, false);
  assert.ok(!result.error.includes('test-secret'));
});

test('unsupported API schemes are rejected before calling the native network plugin', async () => {
  let calls = 0;
  const api = environment({ async getJSON() { calls++; } }).desktopIPTV;
  for (const server of ['file:///private', 'ftp://provider.example.test', 'https://user:password@provider.example.test']) {
    assert.equal((await api.fetchProvider({ server, username: 'u', password: 'p' })).ok, false);
  }
  assert.equal(calls, 0);
});

test('HLS is passed directly to native video, and unsafe stream addresses are rejected', () => {
  const { DesktopPlayback } = environment({});
  let loads = 0, errors = 0;
  const video = { src: '', load() { loads++; } };
  DesktopPlayback.start(video, 'https://provider.example.test/live/u/p/1.m3u8', true, () => errors++);
  assert.equal(video.src, 'https://provider.example.test/live/u/p/1.m3u8');
  assert.equal(loads, 1);
  assert.equal(DesktopPlayback.getHls(video), null);
  for (const url of ['javascript:alert(1)', 'file:///private/test', 'https://user:password@provider.example.test/video.mp4']) {
    DesktopPlayback.start(video, url, false, () => errors++);
  }
  assert.equal(errors, 3);
  assert.equal(loads, 1);
});

test('PiP availability follows the device API rather than assuming iPhone support', () => {
  const { BoddIOS } = environment({});
  assert.equal(BoddIOS.pipAvailable({}), false);
  assert.equal(BoddIOS.pipAvailable({ webkitSetPresentationMode() {}, webkitSupportsPresentationMode() { return false; } }), false);
  assert.equal(BoddIOS.pipAvailable({ webkitSetPresentationMode() {}, webkitSupportsPresentationMode(mode) { return mode === 'picture-in-picture'; } }), true);
});

test('iPhone fullscreen enters the video player and restores controls when it closes', () => {
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {
      id, hidden: false, attributes: {}, events: {},
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(name, handler) { this.events[name] = handler; },
      prepend() {}, click() { this.clicks = (this.clicks || 0) + 1; }
    });
    return nodes.get(id);
  }
  const classes = new Set();
  let ready;
  const document = {
    addEventListener(event, handler) { if (event === 'DOMContentLoaded') ready = handler; },
    getElementById: node,
    createElement() { return node('created-' + nodes.size); },
    querySelector(selector) { return node(selector); },
    querySelectorAll() { return [node('loginFullscreen'), node('windowFullscreen'), node('playerFullscreen')]; },
    body: { classList: {
      toggle(name) { if (classes.has(name)) { classes.delete(name); return false; } classes.add(name); return true; },
      remove(name) { classes.delete(name); }, contains(name) { return classes.has(name); }
    } }
  };
  const video = node('video');
  video.readyState = 1;
  video.webkitEnterFullscreen = () => { video.webkitDisplayingFullscreen = true; };
  video.webkitExitFullscreen = () => { video.webkitDisplayingFullscreen = false; };
  const context = { window: { BoddNative: { async keepAwake() {} } }, URL, Promise, document };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../www/ios.js'), 'utf8'), context);
  ready();
  assert.equal(node('loginFullscreen').hidden, true);
  assert.equal(node('windowFullscreen').hidden, true);
  assert.equal(node('playerFullscreen').hidden, false);
  node('playerFullscreen').onclick();
  assert.equal(video.webkitDisplayingFullscreen, true);
  node('playerFullscreen').onclick();
  assert.equal(video.webkitDisplayingFullscreen, false);
  video.events.webkitendfullscreen();
  assert.equal(node('revealControls').clicks, 1);
  assert.equal(node('playerFullscreen').attributes['aria-pressed'], 'false');
  video.readyState = 0;
  node('playerFullscreen').onclick();
  assert.ok(node('playStatus').textContent.includes('Start playback'));
  assert.equal(node('revealControls').clicks, 2);
});
