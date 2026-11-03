#!/usr/bin/env bash
# Prepare a local TLS cert pair for LAN phone mic (secure context).
# Does not deploy publicly. Does not claim a physical phone pass.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="${BEATLINK_CERT_DIR:-$ROOT/certs}"
mkdir -p "$CERT_DIR"
LAN_IP="${BEATLINK_LAN_IP:-$(ipconfig getifaddr en0 2>/dev/null || true)}"
LAN_IP="${LAN_IP:-127.0.0.1}"
OUT_CERT="$CERT_DIR/beatlink-lan.pem"
OUT_KEY="$CERT_DIR/beatlink-lan-key.pem"

if command -v mkcert >/dev/null 2>&1; then
  echo "Using mkcert for $LAN_IP localhost 127.0.0.1"
  (cd "$CERT_DIR" && mkcert -cert-file beatlink-lan.pem -key-file beatlink-lan-key.pem "$LAN_IP" localhost 127.0.0.1)
else
  echo "mkcert not found — generating openssl self-signed cert for $LAN_IP"
  openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes \
    -keyout "$OUT_KEY" -out "$OUT_CERT" \
    -subj "/CN=BeatLink LAN/$LAN_IP" \
    -addext "subjectAltName=IP:$LAN_IP,DNS:localhost,IP:127.0.0.1"
fi

cat > "$CERT_DIR/LAN_TLS_ENV.example" <<EOF
# Source after generating certs (trusted Wi-Fi only):
export BEATLINK_PARTY_LAN=1
export BEATLINK_BIND_HOST=0.0.0.0
export BEATLINK_TLS_CERT=$OUT_CERT
export BEATLINK_TLS_KEY=$OUT_KEY
export CORS_ORIGIN=https://$LAN_IP:5173
export VITE_API_URL=https://$LAN_IP:3001
export VITE_WS_URL=https://$LAN_IP:3001
export PORT=3001
EOF

echo "Wrote $OUT_CERT / $OUT_KEY"
echo "Env example: $CERT_DIR/LAN_TLS_ENV.example"
echo "Next: follow docs/LAN_PARTY_PHONE_TV.md — do not claim phone pass without devices."
