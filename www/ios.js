(function () {
  'use strict';
  var native = window.BoddNative;
  var $ = function (id) { return document.getElementById(id); };
  function bridge() {
    if (!native) throw new Error('The iPhone bridge is unavailable. Build the iOS project before installing.');
    return native;
  }
  function safeURL(value) {
    var url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) {
      throw new Error('Unsupported provider address.');
    }
    return url.href;
  }
  function keepAwake(active) {
    try { bridge().keepAwake({ active: !!active }).catch(function () {}); } catch (_) {}
  }
  function pipAvailable(video) {
    try {
      return !!(video.webkitSetPresentationMode && video.webkitSupportsPresentationMode &&
        video.webkitSupportsPresentationMode('picture-in-picture'));
    } catch (_) { return false; }
  }
  window.BoddIOS = {
    pipAvailable: pipAvailable,
    closePip: function () {
      var video = $('video');
      if (video && video.webkitPresentationMode === 'picture-in-picture') {
        try { video.webkitSetPresentationMode('inline'); } catch (_) {}
      }
    }
  };
  window.desktopIPTV = {
    loadAccount: async function () {
      var result = await bridge().loadAccount();
      return JSON.parse(result.value);
    },
    saveAccount: async function (value) {
      try {
        await bridge().saveAccount({ value: JSON.stringify(value) });
        return { ok: true };
      } catch (_) { return { ok: false }; }
    },
    fetchProvider: async function (account, action, params) {
      try {
        var url = safeURL(window.PlayerCore.apiURL(account, action, params));
        var response = await bridge().getJSON({ url: url });
        return { ok: true, data: JSON.parse(response.value) };
      } catch (_) {
        return { ok: false, error: 'Cannot reach the provider. Check your account, server address, internet connection and TLS certificate.' };
      }
    }
  };
  // iOS plays supported HLS/MP4 streams directly in WebKit's native video player.
  window.DesktopPlayback = {
    getHls: function () { return null; },
    stop: function () { keepAwake(false); },
    start: function (video, url, _isLive, onError) {
      try { video.src = safeURL(url); video.load(); } catch (_) { if (onError) onError(); }
    }
  };
  document.addEventListener('DOMContentLoaded', function () {
    var video = $('video');
    video.addEventListener('playing', function () { keepAwake(true); });
    ['pause', 'ended', 'emptied'].forEach(function (event) {
      video.addEventListener(event, function () { keepAwake(false); });
    });
    document.querySelectorAll('[data-window-fullscreen]').forEach(function (button) {
      if (button.id !== 'playerFullscreen') button.hidden = true;
    });
    $('playerFullscreen').onclick = function () {
      try {
        if (video.webkitDisplayingFullscreen) video.webkitExitFullscreen();
        else if (video.readyState >= 1 && video.webkitEnterFullscreen) video.webkitEnterFullscreen();
        else throw new Error('Start playback first.');
      } catch (_) {
        $('playStatus').textContent = 'Start playback, then select Full screen.';
        $('revealControls').click();
      }
    };
    ['webkitbeginfullscreen', 'webkitendfullscreen'].forEach(function (event) {
      video.addEventListener(event, function () {
        $('playerFullscreen').setAttribute('aria-pressed', String(!!video.webkitDisplayingFullscreen));
        if (event === 'webkitendfullscreen') $('revealControls').click();
      });
    });
    var toggle = document.createElement('button');
    toggle.id = 'categoryToggle';
    toggle.textContent = 'Categories · التصنيفات';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.onclick = function () {
      toggle.setAttribute('aria-expanded', String(document.body.classList.toggle('categoriesOpen')));
    };
    document.querySelector('.heading').prepend(toggle);
    var close = document.createElement('button');
    close.id = 'closeCategories';
    close.textContent = 'Close · إغلاق ×';
    close.onclick = function () {
      document.body.classList.remove('categoriesOpen');
      toggle.setAttribute('aria-expanded', 'false');
    };
    document.querySelector('aside').prepend(close);
    $('groups').addEventListener('click', function (event) {
      var button = event.target.closest('button');
      if (button && button.textContent !== 'All groups…') close.click();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && document.body.classList.contains('categoriesOpen')) {
        event.preventDefault(); event.stopImmediatePropagation(); close.click();
      }
    }, true);
  });
})();
