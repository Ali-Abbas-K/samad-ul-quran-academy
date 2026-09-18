#!/usr/bin/env bash
# Produce a copy of the site for the hosted preview.
#
# The preview is served as static files from a different origin to the API, so
# the bundle needs the API origin baked in. __PORT_8080__ is rewritten by the
# hosting step into a proxy URL pointing at the local server. This script only
# ever writes to preview/ and never touches web/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
rm -rf "$ROOT/preview"
cp -r "$ROOT/web" "$ROOT/preview"
cat > "$ROOT/preview/js/config.js" <<'JS'
/* Preview build only. The real site ships web/js/config.js, which resolves the
   API origin at runtime; here the origin is fixed at bundle time because the
   preview host serves static files from a different origin to the API. */
window.SAMAD_API_BASE = '__PORT_8080__/api';
JS
echo "preview build ready ($(find "$ROOT/preview" -name '*.html' | wc -l | tr -d ' ') pages)"
