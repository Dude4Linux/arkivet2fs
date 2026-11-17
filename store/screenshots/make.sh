#!/bin/sh
# Makes the store screenshots (1280x800) from the tests' sanitized pages and made-up
# persons: sh store/screenshots/make.sh (from the repository, after npm install).
# Needs Node and Google Chrome (or CHROME=chromium).
set -eu
cd "$(dirname "$0")/../.."
dir=store/screenshots
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
chrome=${CHROME:-google-chrome}

# shot NAME PAGE SCROLL
shot() {
  node "$dir/render.js" "$2" "$tmp/$1.html" "$3"
  "$chrome" --headless=new --hide-scrollbars --allow-file-access-from-files \
    --window-size=1280,800 --screenshot="$tmp/$1.png" "file://$tmp/$1.html" 2>/dev/null
  mv "$tmp/$1.png" "$dir/$1.png"
  echo "$dir/$1.png"
}

shot 1-search search 0
shot 2-source linker 0
shot 3-people linker 645
shot 4-changes linker 1615

# The website (docs/index.html) shows two of them
cp "$dir/1-search.png" docs/images/search.png
cp "$dir/3-people.png" docs/images/people.png
