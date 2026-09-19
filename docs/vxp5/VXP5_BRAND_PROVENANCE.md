# VXP-5 Brand Provenance — Stage Energy

## Product naming
| Layer | Name |
| --- | --- |
| Player-facing | BeatLink Party |
| Internal design system | Stage Energy |

## Palette
| Token | Hex | Role |
| --- | --- | --- |
| `--se-stage-dark` | `#0a0614` | Stage foundation |
| `--se-spotlight` | `#f5f0ff` | Spotlight white |
| `--se-pulse-violet` | `#8b5cf6` | Pulse violet |
| `--se-hot-magenta` | `#ff2d92` | Hot magenta |
| `--se-electric-cyan` | `#22d3ee` | Electric cyan |
| `--se-success-lime` | `#a3e635` | Success |
| `--se-warning-amber` | `#fbbf24` | Warning |
| `--se-error-coral` | `#fb7185` | Error |

## Typography
| Family | License | Source |
| --- | --- | --- |
| Space Grotesk | SIL Open Font License 1.1 | Google Fonts CDN (`index.html` + CSS `@import`) |
| Outfit | SIL Open Font License 1.1 | Google Fonts CDN |

Optional offline vendor script: `node scripts/vendor_stage_energy_fonts.mjs` (Space Grotesk + IBM Plex Sans woff2 into `apps/web/public/fonts/`).

## Iconography / glyphs
Original SVG geometry in `apps/web/src/brand/glyphs.tsx` — Beat, Vocal, Hype, Cheer, Lights, Boost, Combo, Party, Join, Copy, Network, Link.
No emoji in production controls. No Spotify / Apple Music / Discord / Jackbox trade dress.

## Assets path
- Styles: `apps/web/src/styles/stage-energy.css`
- Brand modules: `apps/web/src/brand/`
- Components: `apps/web/src/components/NetworkStatus.tsx`, `StageChrome.tsx`
- Fonts readme: `apps/web/public/fonts/README.md`

## Music compliance boundary
Visual polish does **not** expand media rights. Platform link paste remains metadata-only unless an authorized path is configured. Approved demo / open catalog songs remain the playable scoring path.
