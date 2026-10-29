# LAN party — phone + host / TV testing

**Default bind remains loopback (`127.0.0.1`).** Phones on Wi-Fi cannot reach the host until you opt in.

## Explicit local-dev / party flag

```bash
# Terminal A — API + Socket.IO reachable on the LAN
export BEATLINK_PARTY_LAN=1
export BEATLINK_BIND_HOST=0.0.0.0   # or your Mac LAN IP, e.g. 192.168.1.20
export CORS_ORIGIN=*               # or https://<LAN_IP>:5173 when using TLS
export PORT=3001
pnpm --filter @beatlink/server dev

# Terminal B — Vite web (host TV / laptop browser)
export VITE_API_URL=http://<LAN_IP>:3001
export VITE_WS_URL=http://<LAN_IP>:3001
pnpm --filter @beatlink/web dev -- --host 0.0.0.0 --port 5173
```

Alternate flag name: `BEATLINK_ALLOW_LAN_BIND=1` (same effect).

## Secure origin for microphone (required for karaoke pitch)

Browser `getUserMedia` needs a [secure context](https://w3c.github.io/mediacapture-main/#dom-mediadevices-getusermedia). Plain `http://<LAN_IP>` is **not** secure (localhost is). For phone mic consent on Wi-Fi:

### Option A — local HTTPS with a self-signed / mkcert cert (preferred lab path)

```bash
# One-time: install mkcert and trust a local CA (human installs tools)
# mkcert -install
# mkcert <LAN_IP> localhost 127.0.0.1

export BEATLINK_PARTY_LAN=1
export BEATLINK_BIND_HOST=0.0.0.0
export BEATLINK_TLS_CERT=./certs/<LAN_IP>+2.pem
export BEATLINK_TLS_KEY=./certs/<LAN_IP>+2-key.pem
export CORS_ORIGIN=https://<LAN_IP>:5173
export PORT=3001
pnpm --filter @beatlink/server dev

# Vite HTTPS (same cert pair)
pnpm --filter @beatlink/web dev -- --host 0.0.0.0 --port 5173 \
  --https --cert "$BEATLINK_TLS_CERT" --key "$BEATLINK_TLS_KEY"

# Phones open: https://<LAN_IP>:5173  (accept cert warning if not mkcert-trusted)
# Set VITE_API_URL / VITE_WS_URL to https://<LAN_IP>:3001 and wss:// accordingly.
export VITE_API_URL=https://<LAN_IP>:3001
export VITE_WS_URL=https://<LAN_IP>:3001
```

Helper script (generates openssl self-signed if mkcert is absent):

```bash
bash scripts/lan_secure_origin.sh
```

### Option B — Capacitor / installed Android app WebView

When using the packaged Android shell, the app origin can be treated as a secure context for mic. Keep API/socket origins pointed at the LAN host. Document the exact package + build hash in the physical review packet.

### Option C — timing-only karaoke (always available)

If secure origin is unavailable, leave **MICROPHONE_PITCH_ANALYSIS=false** (default). Players use the a11y **tap fallback** during phrase windows. Never claim live pitch from synthetic tones.

## Security notes

- **Trusted private Wi-Fi only.** This is for living-room / lab parties, not production hosting.
- The server still **refuses public internet addresses** (e.g. `8.8.8.8`) even with the flag.
- No auth wall on MVP sockets — anyone on the same LAN who has the room code can join.
- Prefer a guest network when possible; turn the flag **off** after the session.
- Public deployment / TURN remain out of scope. Local HTTPS/WSS for mic is **in scope** for physical karaoke.

## Physical phone / TV checklist (2–6 phones)

1. Mac/TV host and phones on the **same Wi-Fi** (not cellular; not client-isolation guest SSIDs that block LAN).
2. Find Mac LAN IP: `ipconfig getifaddr en0` (or System Settings → Network).
3. Start server with `BEATLINK_PARTY_LAN=1` + secure origin (Option A) when testing mic.
4. Confirm health from the phone browser: `https://<LAN_IP>:3001/health` → `{"status":"ok",...,"partyLan":true}`.
5. Open host on TV/laptop → Create Party → note QR / room code.
6. Join on phones: QR or `https://<LAN_IP>:5173/join/<CODE>` (roles: beat_tapper / vocalist / hype_captain).
7. Select a **launch catalog** song (PD / original / CC / creator-owned), calibrate, countdown, play, results, rematch.
8. Exercise host loss/rejoin, audience seat, and karaoke mic allow / deny / revoke → a11y tap fallback.
9. Karaoke: leave **no-recording** unless you tap **Allow mic (pitch path)** — pitch is only claimed after consent **and** continuous live DSP is running.

## Review package (prepare now; fill only with real devices)

See `artifacts/physical_lan_review/PHYSICAL_LAN_REVIEW_PACKET.md`. Do **not** mark phone pass without real devices.

## What is still evidence-gated

- This doc is the runbook. A recorded multi-device capture on your LAN is separate physical evidence.
- Human commercial / V1 / BETA / RC / LAUNCH gates stay **false** until earned elsewhere.
- Scripted browser tabs are not a physical phone party.
