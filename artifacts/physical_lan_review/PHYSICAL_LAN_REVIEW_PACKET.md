# BeatLink Party — physical LAN review packet

**Status: PREPARED — not executed.** Fill only with real host + phones. Do not mark pass from CI, Playwright, or synthetic mic probes.

## Build identity (fill at session start)

| Field | Value |
|---|---|
| Source SHA | `19512d3e64815bd9d99c047876a550cc1c920d21` (base tip; replace with tested build hash after FF) |
| Tested package / web build hash | _pending_ |
| Server bind | LAN + TLS? _pending_ (require secure origin for mic grant) |
| Host device / OS | _pending_ |
| Phone count (2–6) | _pending_ |
| Phone models / OS | _pending_ |
| Wi-Fi SSID class (private / guest) | _pending_ |
| Reviewer | _pending_ |
| Date (local) | _pending_ |

## Topology (required)

```
[Host laptop/desktop] --HTTPS/TLS--> local Wi-Fi AP
        |-- phone 1 (player)
        |-- phone 2 (player)
        |-- … up to phone 6
        |-- optional TV/browser audience seat
```

- Party size under test: **host + 2–6 phones** (independent humans; scripted tabs do not count).
- Use `docs/LAN_PARTY_PHONE_TV.md` + `scripts/lan_secure_origin.sh` for TLS bind.
- Loopback-only binds are **not** a physical phone pass.

## Journey checklist (all five modes)

For each mode: BeatTap · CallAndResponse · KaraokePerformance · BandRoles · PredictionTrivia

- [ ] Host create → QR/code visible on host + readable on phones
- [ ] Each phone joins with distinct display name
- [ ] Roles assigned (beat_tapper / vocalist / hype_captain) + ready
- [ ] Launch catalog song selected (rights-cleared; commercialEligible=false)
- [ ] Calibration completes; audible sync acceptable on phones
- [ ] Countdown → play → results → rematch or end
- [ ] Audience seat observed (if used)
- [ ] Host disconnect / rejoin recovered seat
- [ ] Karaoke: mic **denied** → a11y tap fallback still scores timing
- [ ] Karaoke: mic **granted** on **secure origin** → pitch claim only while live DSP runs
- [ ] Karaoke: mic **revoked** mid-phrase → pitch claim drops; a11y fallback remains
- [ ] Silence / noise does not score as perfect pitch match
- [ ] No raw PCM uploaded; no-recording default preserved
- [ ] Sample rate noted (44.1 / 48 kHz typical on phones)

## Capacity evidence template

| Slot | Device | OS | Joined? | Mode loop OK? | Mic path | Notes |
|---|---|---|---|---|---|---|
| Host |  |  | n/a |  | n/a |  |
| Phone 1 |  |  |  |  | deny/grant/revoke |  |
| Phone 2 |  |  |  |  |  |  |
| Phone 3 |  |  |  |  |  |  |
| Phone 4 |  |  |  |  |  |  |
| Phone 5 |  |  |  |  |  |  |
| Phone 6 |  |  |  |  |  |  |

- Advertised party size exercised: _pending_ (target host + 2–6 phones)
- Independent human participants (bots/scripted tabs do not count): _pending_

## Honesty flags (must remain)

- `MICROPHONE_PITCH_ANALYSIS` default false until consented live DSP
- BETA / RC / LAUNCH / HUMAN commercial: **false**
- Physical phone pass: **false until this packet is completed with devices**
- Creator ingest: drafts only; **no auto-publish**; commercialEligible false

## Evidence to attach (PII-scrubbed)

- Room code (ok) · no participant phone numbers
- Short screen recordings or notes per mode
- Measured Wi-Fi RTT / desync notes if available
- Mic permission allow/deny/revoke observations
- Screenshot of secure-origin padlock / TLS cert trust on phones

## Pass criteria (do not check until devices run)

- [ ] Host + ≥2 phones completed full five-mode loop
- [ ] Secure HTTPS origin used for any mic-grant path
- [ ] No false physical pass claimed from CI alone
