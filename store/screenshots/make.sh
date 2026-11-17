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

# shot NAME PAGE SCROLL LANG: the English set in screenshots/, the Bokmål set in nb/
shot() {
  out=$dir; [ "$4" = en ] || out=$dir/$4
  mkdir -p "$out"
  node "$dir/render.js" "$2" "$tmp/$1.html" "$3" "$4"
  "$chrome" --headless=new --hide-scrollbars --allow-file-access-from-files \
    --window-size=1280,800 --screenshot="$tmp/$1.png" "file://$tmp/$1.html" 2>/dev/null
  mv "$tmp/$1.png" "$out/$1.png"
  echo "$out/$1.png"
}

shot 1-search search 0 en
shot 2-source linker 0 en
shot 3-people linker 645 en
shot 4-changes linker 1615 en

shot 1-search search 0 nb
shot 2-source linker 0 nb
shot 3-people linker 645 nb
shot 4-changes linker 1615 nb

# The website (docs/index.html) shows two of them
cp "$dir/1-search.png" docs/images/search.png
cp "$dir/3-people.png" docs/images/people.png
