# Wave007 Product State Machine (HOME..ERROR)

```mermaid
stateDiagram-v2
  [*] --> HOME
  HOME --> LOBBY: Create Room
  LOBBY --> SONG_SELECT: select song / paste link
  SONG_SELECT --> CALIBRATING: start calibration
  CALIBRATING --> COUNTDOWN: submit DeviceTimingProfile
  COUNTDOWN --> PLAYING: authoritative clock start
  PLAYING --> PAUSED: host pause
  PAUSED --> PLAYING: host resume
  PLAYING --> RESULTS: end round / duration
  RESULTS --> REMATCH: rematch
  REMATCH --> SONG_SELECT: next song
  RESULTS --> LOBBY: return
  LOBBY --> HOME: close
  HOME --> ERROR: transport/auth failure
  LOBBY --> ERROR: invalid join
  PLAYING --> ERROR: integrity failure
  ERROR --> HOME: recover
  ERROR --> LOBBY: recover to lobby
```

RoomPhase mapping: lobby↔LOBBY/REMATCH, song_select↔SONG_SELECT, calibrating↔CALIBRATING,
countdown↔COUNTDOWN, playing↔PLAYING, paused↔PAUSED, results↔RESULTS, closed↔HOME.
