# Beatmap Schema — BeatLink Party

Beatmaps are JSON documents validated by Zod schema in `@beatlink/shared`.

## Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique beatmap ID |
| `songId` | string | yes | Catalog song reference |
| `version` | string | yes | Semver version |
| `bpm` | number | yes | Beats per minute |
| `offsetMs` | number | yes | Audio sync offset |
| `durationMs` | number | yes | Total duration |
| `difficulty` | enum | yes | beginner \| casual \| pro \| nightmare |
| `licenseStatus` | string | yes | License tag |
| `sections` | Section[] | yes | Song structure |
| `notes` | Note[] | yes | Rhythm notes |
| `vocalPrompts` | VocalPrompt[] | yes | Safe phrase prompts |
| `hypeEvents` | HypeEvent[] | yes | Hype timing windows |

## Section

```json
{
  "id": "chorus",
  "label": "Chorus",
  "startMs": 20000,
  "endMs": 35000
}
```

## Note

```json
{
  "id": "note-42",
  "timeMs": 12500,
  "type": "tap",
  "role": "beat_tapper",
  "durationMs": 500
}
```

Types: `tap`, `hold`, `swipe`  
Roles: `beat_tapper`, `vocalist`, `hype_captain`

## Vocal Prompt (safe placeholders only)

```json
{
  "id": "vocal-0",
  "timeMs": 8000,
  "text": "Sing the hook!",
  "durationMs": 3000
}
```

## Hype Event

```json
{
  "id": "hype-0",
  "timeMs": 10000,
  "type": "cheer"
}
```

Types: `cheer`, `lights`, `boost`, `combo_save`

## Validation

```typescript
import { validateBeatmap } from '@beatlink/shared';

const result = validateBeatmap(json);
if (!result.success) console.error(result.errors);
```

## Example Files

- `content/beatmaps/demo-track-1.json`
- `content/beatmaps/demo-track-2.json`
- `content/beatmaps/demo-track-3.json`

## Future Extensions

- Role-specific lanes per difficulty
- Team events and power-up triggers
- Stem references for multi-track scoring
- Editor versioning and creator attribution
