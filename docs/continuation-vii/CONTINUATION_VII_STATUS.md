# Continuance VII — Beat Link digital axes + gunnchOS packaging

## Token axes (honest)

| Axis | Tokens | Meaning |
|------|--------|---------|
| **Digital product depth** | `BEATLINK_BETA_CONTENT_COMPLETE_DIGITAL`, `BEATLINK_DIGITAL_RC_READY`, Redis/mic/provider/load passes | Digitally executable event platform + packaging |
| **Commercial product BETA/RC** | `BETA`, `RC`, `LAUNCH`, `FULL_PRODUCT_*` | Stay **false** until live pilot / store / HSM / physical |

Digital RC ≠ commercial BETA/RC. Cont VI re-earned digital tokens after Redis CI; Cont VII re-proves main CI green and packaging for gunnchOS integration.

## gunnchOS real integration packaging

Coordinate with `gunnchos-device-os` first-party game slot `beatlink-party-web`:

| Artifact | Path |
|----------|------|
| Digital RC package | `docs/digital-rc/package-manifest.json` |
| Ready token | `docs/digital-rc/ready.json` |
| SBOM / update / rollback | `docs/digital-rc/sbom-lite.json`, `update-manifest.json`, `rollback-manifest.json` |
| Cont VII packaging bridge | `docs/continuation-vii/GUNNCHOS_PACKAGING.json` |

### Integration contract (digital)

1. Ship offline-capable web package digest from `docs/digital-rc/ready.json`.
2. Device-OS overlay may reference `games/beatlink-party-web` without production signing keys.
3. Redis durable rooms remain server-side; guest image may point at host-forwarded party services (DEV realm).
4. Do **not** flip commercial `BETA`/`RC` when only digital packaging is ready.

## Verify

```bash
pnpm test
pnpm --filter @beatlink/game-engine test
# token ledger
node -e "console.log(require('./docs/BETA_RC_TOKENS.json').tokens)"
```
