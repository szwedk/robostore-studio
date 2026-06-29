#!/bin/bash
# Double-click this to open RoboStore Studio the first time.
# It clears the macOS "damaged"/quarantine flag (because the app isn't
# code-signed yet) and then launches the app. One click — that's it.

APP="/Applications/RoboStore Studio.app"
# Fall back to the app sitting next to this file (e.g. still inside the DMG).
[ -d "$APP" ] || APP="$(cd "$(dirname "$0")" && pwd)/RoboStore Studio.app"

if [ ! -d "$APP" ]; then
  echo "Couldn't find RoboStore Studio. Drag it into your Applications folder first, then run this again."
  read -r -p "Press Return to close…" _
  exit 1
fi

echo "Preparing \"$APP\"…"
xattr -cr "$APP" 2>/dev/null
open "$APP" && echo "Opening RoboStore Studio. You can close this window."
sleep 1
