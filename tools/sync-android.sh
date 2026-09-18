#!/usr/bin/env bash
# Copy the built website into the Android WebView asset bundle.
#
# The app normally loads the live site over https (set SAMAD_WEB_URL at build
# time). This bundled copy is the offline fallback, so it must never drift from
# web/. Run this after every `python3 tools/build.py`.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/web"
DST="$ROOT/android/app/src/main/assets/site"

[ -f "$SRC/index.html" ] || { echo "web/ is not built - run: python3 tools/build.py"; exit 1; }

rm -rf "$DST"
mkdir -p "$DST"
# Everything except the search-engine files, which mean nothing inside an app
# and would advertise the production domain from a file:// page.
( cd "$SRC" && tar -cf - --exclude=sitemap.xml --exclude=robots.txt . ) | ( cd "$DST" && tar -xf - )

echo "synced $(find "$DST" -name '*.html' | wc -l | tr -d ' ') pages, $(du -sh "$DST" | cut -f1) -> android/app/src/main/assets/site"
