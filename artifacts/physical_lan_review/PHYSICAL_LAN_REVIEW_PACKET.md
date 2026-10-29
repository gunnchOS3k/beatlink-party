# BeatLink Party — physical LAN review packet

**Status: PREPARED — not executed.** Fill only with real host + phones. Do not mark pass from CI, Playwright, or synthetic mic probes.

## Build identity (fill at session start)

| Field | Value |
|---|---|
| Source SHA | _pending_ |
| Tested package / web build hash | _pending_ |
| Server bind | LAN + TLS? _pending_ |
| Host device / OS | _pending_ |
| Phone count (2–6) | _pending_ |
| Phone models / OS | _pending_ |
| Wi-Fi SSID class (private / guest) | _pending_ |
| Reviewer | _pending_ |
| Date (local) | _pending_ |

## Journey checklist (all five modes)

For each mode: BeatTap · CallAndResponse · KaraokePerformance · BandRoles · PredictionTrivia

- [ ] Host create → QR/code visible
- [ ] Each phone joins with distinct display name
- [ ] Roles assigned (beat_tapper / vocalist / hype_captain) + ready
- [ ] Launch catalog song selected (rights-cleared)
- [ ] Calibration completes; audible sync acceptable on phones
- [ ] Countdown → play → results → rematch or end
- [ ] Audience seat observed (if used)
- [ ] Host disconnect / rejoin recovered seat
- [ ] Karaoke: mic denied → a11y tap fallback still scores timing
- [ ] Karaoke: mic allowed on **secure origin** → pitch claim only while live DSP runs; revoke drops claim
- [ ] No raw PCM uploaded; no-recording default preserved

## Capacity

- Advertised party size exercised: _pending_ (target host + 2–6 phones)
- Independent human participants (bots/scripted tabs do not count): _pending_

## Honesty flags (must remain)

- `MICROPHONE_PITCH_ANALYSIS` default false until consented live DSP
- BETA / RC / LAUNCH / HUMAN commercial: false
- Physical phone pass: **false until this packet is completed with devices**

## Evidence to attach (PII-scrubbed)

- Room code (ok) · no participant phone numbers
- Short screen recordings or notes per mode
- Measured Wi-Fi RTT / desync notes if available
- Mic permission allow/deny/revoke observations
