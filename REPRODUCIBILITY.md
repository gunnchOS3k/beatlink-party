# Reproducibility — BeatLink Party

This is a **product/game** repository (rhythm/karaoke party). Playback uses the approved demo catalog only. Do not rip platform audio. Not a wireless experiment.

Human playtest remains `HUMAN_QA_PENDING`.

Copy `.env.example` to `.env` locally. Do not commit secrets.

## Canonical commands

```bash
cp .env.example .env
pnpm install
pnpm test
pnpm build
```

Capacitor Android wrapper (optional; PWA is the primary host/player path):

```bash
pnpm --filter @beatlink/web build
cd apps/web && npx cap sync android
cd android && ./gradlew assembleDebug
```

Package id: `com.gunnchos.beatlinkparty`. See `docs/PIXEL_6A_ACCEPTANCE.md`.
