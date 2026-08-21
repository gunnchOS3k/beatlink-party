#!/usr/bin/env bash
# Wave007 mandatory browser E2E — starts server+web, runs Playwright, always tears down.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

ART_DIR="$ROOT/artifacts/engineering_wave007"
mkdir -p "$ART_DIR"

SERVER_PID=""
WEB_PID=""
cleanup() {
  if [[ -n "${WEB_PID}" ]] && kill -0 "$WEB_PID" 2>/dev/null; then
    kill "$WEB_PID" 2>/dev/null || true
    wait "$WEB_PID" 2>/dev/null || true
  fi
  if [[ -n "${SERVER_PID}" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

export BEATLINK_WAVE007_E2E=1
export BEATLINK_E2E=1
export PORT=3001
export CORS_ORIGIN="*"
export PUBLIC_ORIGIN="http://127.0.0.1:5173"

echo "[wave007-e2e] starting server on :3001"
pnpm --filter @beatlink/server exec tsx src/index.ts >"$ART_DIR/server.log" 2>&1 &
SERVER_PID=$!

echo "[wave007-e2e] starting web on :5173"
pnpm --filter @beatlink/web exec vite --host 127.0.0.1 --port 5173 >"$ART_DIR/web.log" 2>&1 &
WEB_PID=$!

echo "[wave007-e2e] waiting for health endpoints"
for i in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:3001/health" >/dev/null && curl -sf "http://127.0.0.1:5173/" >/dev/null; then
    break
  fi
  sleep 1
  if [[ "$i" -eq 60 ]]; then
    echo "[wave007-e2e] services failed to become ready" >&2
    python3 - <<'PY'
import json, pathlib
p = pathlib.Path("artifacts/engineering_wave007/BROWSER_E2E_RESULT.json")
p.write_text(json.dumps({
  "playwright_ran": False,
  "playwright_skipped": False,
  "ok": False,
  "error": "services_not_ready",
}, indent=2) + "\n")
PY
    exit 1
  fi
done

echo "[wave007-e2e] ensuring Playwright chromium"
pnpm exec playwright install chromium >/dev/null

echo "[wave007-e2e] running mandatory party-loop Playwright"
set +e
pnpm exec playwright test tests/e2e/wave007_party_loop.playwright.spec.ts --project=chromium
PW_EXIT=$?
set -e

if [[ ! -f "$ART_DIR/BROWSER_E2E_RESULT.json" ]]; then
  python3 - <<'PY'
import json, pathlib
p = pathlib.Path("artifacts/engineering_wave007/BROWSER_E2E_RESULT.json")
p.write_text(json.dumps({
  "playwright_ran": False,
  "playwright_skipped": True,
  "ok": False,
  "error": "missing_browser_result_artifact",
}, indent=2) + "\n")
PY
  exit 1
fi

python3 - <<'PY'
import json, pathlib, sys
p = pathlib.Path("artifacts/engineering_wave007/BROWSER_E2E_RESULT.json")
data = json.loads(p.read_text())
if data.get("playwright_skipped") is True:
    print("PLAYWRIGHT_SKIPPED=true — failing wave007", file=sys.stderr)
    sys.exit(1)
if data.get("playwright_ran") is not True:
    print("playwright_ran!=true — failing wave007", file=sys.stderr)
    sys.exit(1)
print("browser e2e artifact ok")
PY

exit "$PW_EXIT"
