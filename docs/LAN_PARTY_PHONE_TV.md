# LAN party — phone + host / TV testing

**Default bind remains loopback (`127.0.0.1`).** Phones on Wi-Fi cannot reach the host until you opt in.

## Explicit local-dev / party flag

```bash
# Terminal A — API + Socket.IO reachable on the LAN
export BEATLINK_PARTY_LAN=1
export BEATLINK_BIND_HOST=0.0.0.0   # or your Mac LAN IP, e.g. 192.168.1.20
export CORS_ORIGIN=*               # or http://<LAN_IP>:5173
export PORT=3001
pnpm --filter @beatlink/server dev

# Terminal B — Vite web (host TV / laptop browser)
export VITE_API_URL=http://<LAN_IP>:3001
export VITE_WS_URL=http://<LAN_IP>:3001
pnpm --filter @beatlink/web dev -- --host 0.0.0.0 --port 5173
```

Alternate flag name: `BEATLINK_ALLOW_LAN_BIND=1` (same effect).

## Security notes

- **Trusted private Wi-Fi only.** This is for living-room / lab parties, not production hosting.
- The server still **refuses public internet addresses** (e.g. `8.8.8.8`) even with the flag.
- No auth wall on MVP sockets — anyone on the same LAN who has the room code can join.
- Prefer a guest network when possible; turn the flag **off** after the session.
- HTTPS/WSS and TURN are out of scope for this local-dev path.

## Physical phone / TV checklist

1. Mac and phone on the **same Wi-Fi** (not cellular; not client-isolation guest SSIDs that block LAN).
2. Find Mac LAN IP: `ipconfig getifaddr en0` (or System Settings → Network).
3. Start server with `BEATLINK_PARTY_LAN=1` + `BEATLINK_BIND_HOST=0.0.0.0`.
4. Confirm health from the phone browser: `http://<LAN_IP>:3001/health` → `{"status":"ok",...,"partyLan":true}`.
5. Open host on TV/laptop: `http://<LAN_IP>:5173` → Create Party.
6. Join on phone: QR or `http://<LAN_IP>:5173/join/<CODE>`.
7. Select a **launch catalog** song (PD / original / CC / creator-owned / demo), calibrate, play.
8. Karaoke: leave **no-recording** unless you tap **Allow mic (pitch path)** — pitch is only claimed after consent.

## What is still evidence-gated

- This doc is the runbook. A recorded multi-device capture on your LAN is separate physical evidence.
- Human commercial / V1 gates stay **false** until earned elsewhere.
