#!/bin/sh
# Checks a downloaded arkivet2fs package against its signature, made with the
# maintainer's Ed25519 key. Needs OpenSSL 3 (macOS's own openssl is LibreSSL, which
# can't; install OpenSSL 3, e.g. with Homebrew, and put it first in PATH).
#
#   sh verify.sh arkivet2fs-X.Y.Z-chromium.zip [release.pub]
#
# The package's .sig must be next to it. With SHA256SUMS and SHA256SUMS.sig there too,
# those are checked as well. The public key defaults to keys/release.pub of the
# repository this script is in; its SHA-256 fingerprint is in the README.
set -eu

die() { echo "verify: $*" >&2; exit 1; }

[ $# -ge 1 ] || die "usage: sh verify.sh PACKAGE [PUBLIC_KEY]"
file=$1
key=${2:-$(dirname "$0")/../keys/release.pub}
[ -f "$file" ] || die "no file $file"
[ -f "$file.sig" ] || die "no signature $file.sig next to it"
[ -f "$key" ] || die "no public key $key (give its path as the second argument)"
command -v openssl >/dev/null || die "openssl isn't installed"
case $(openssl version) in
  "OpenSSL 3"*|"OpenSSL 4"*) ;;
  *) die "needs OpenSSL 3 or later, not $(openssl version)" ;;
esac

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM

check() { # data signature
  openssl base64 -d -A -in "$2" -out "$tmp/sig" 2>/dev/null || die "$2 isn't a signature"
  openssl pkeyutl -verify -pubin -inkey "$key" -rawin -in "$1" -sigfile "$tmp/sig" >/dev/null 2>&1
}

echo "Key: SHA-256 $(openssl pkey -pubin -in "$key" -outform DER | openssl dgst -sha256 -r | cut -d' ' -f1)"
if check "$file" "$file.sig"; then
  echo "OK: $file is signed by this key"
else
  die "BAD: $file does not match its signature. Don't install it."
fi

dir=$(dirname "$file")
if [ -f "$dir/SHA256SUMS" ] && [ -f "$dir/SHA256SUMS.sig" ]; then
  check "$dir/SHA256SUMS" "$dir/SHA256SUMS.sig" || die "BAD: SHA256SUMS does not match its signature"
  name=$(basename "$file")
  want=$(awk -v n="$name" '$2 == n { print $1 }' "$dir/SHA256SUMS")
  [ -n "$want" ] || die "SHA256SUMS doesn't list $name"
  have=$(openssl dgst -sha256 -r "$file" | cut -d' ' -f1)
  [ "$want" = "$have" ] || die "BAD: $name's SHA-256 isn't the one in SHA256SUMS"
  echo "OK: SHA256SUMS is signed and lists $name with this checksum"
fi
