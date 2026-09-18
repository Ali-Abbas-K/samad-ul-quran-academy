/* Runtime API base resolution.
 *
 * Must load BEFORE core.js. It exists for one reason: the same static bundle is
 * shipped in more than one way, and each way needs a different API origin.
 *
 *   1. Served by the Node server (or a reverse proxy in front of it)
 *      -> site and API share an origin, so core.js's own "/api" default is
 *         already correct and this file does nothing at all.
 *
 *   2. Opened straight off disk during development (file://)
 *      -> core.js falls back to http://127.0.0.1:8080/api, which is right for a
 *         developer machine running start-server.bat.
 *
 *   3. Packaged inside the Android app
 *      -> the pages are served by WebViewAssetLoader from
 *         https://appassets.androidplatform.net/site/..., a private origin with
 *         no backend behind it. MainActivity therefore appends
 *         ?api=<origin>/api to the first page it opens, and we persist that
 *         value so every later in-app navigation keeps the same backend.
 *
 * Nothing here invents an endpoint. With no origin supplied the value stays
 * unset and core.js's existing behaviour applies unchanged.
 */
(function () {
  'use strict';

  var KEY = 'suq.apiBase';

  function isHttp(value) {
    return typeof value === 'string' && /^https?:\/\/[^\s/]+/i.test(value);
  }

  /* The stored record is scoped to the origin that captured it. Without that
     scoping a value saved while testing the packaged bundle could later be
     replayed on the real website and point the browser at the wrong backend.
     Storing the origin alongside the value keeps each deployment independent. */
  function remember(api) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ api: api, origin: window.location.origin }));
    } catch (err) {
      /* Private mode, or a WebView with storage disabled. The value still
         applies to this page load via window.SAMAD_API_BASE below. */
    }
  }

  function recall() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return '';
      var saved = JSON.parse(raw);
      if (!saved || saved.origin !== window.location.origin) return '';
      return isHttp(saved.api) ? saved.api : '';
    } catch (err) {
      return '';
    }
  }

  var fromQuery = '';
  try {
    fromQuery = new URLSearchParams(window.location.search).get('api') || '';
  } catch (err) {
    fromQuery = '';
  }

  if (isHttp(fromQuery)) {
    var clean = fromQuery.replace(/\/+$/, '');
    window.SAMAD_API_BASE = clean;
    remember(clean);
    return;
  }

  var stored = recall();
  if (stored) window.SAMAD_API_BASE = stored;
})();
