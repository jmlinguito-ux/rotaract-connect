#!/bin/bash
# Double-click this file in Finder to start the Expo dev server.

# Run from the project directory, wherever this file lives.
cd "$(dirname "$0")" || exit 1

echo "Starting Expo in $(pwd)"
echo

if [ ! -d node_modules ]; then
  echo "node_modules not found — installing dependencies first..."
  npm install || { echo "npm install failed."; read -r -p "Press Return to close..."; exit 1; }
  echo
fi

npx expo start "$@"

# Keep the Terminal window open so any error stays readable.
echo
read -r -p "Expo exited. Press Return to close..."
