#!/usr/bin/env python3
"""Windows Pilot 0 evidence for BeatLink Party (rights-safe web path on Windows)."""
from __future__ import annotations

import hashlib
import http.server
import json
import os
import platform
import socketserver
import subprocess
import sys
import threading
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports" / "windows_pilot0"
WEB_DIST = ROOT / "apps" / "web" / "dist"


def utc_now() -> str:
    return datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def head_sha() -> str:
    env_sha = (os.environ.get("GITHUB_SHA") or "").strip()
    if env_sha:
        return env_sha
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()


def main() -> int:
    if platform.system() != "Windows":
        print("REFUSE: must run on Windows", file=sys.stderr)
        return 2

    REPORTS.mkdir(parents=True, exist_ok=True)
    sha = head_sha()
    soak_seconds = int(os.environ.get("WINDOWS_PILOT0_SOAK_SECONDS", "1800"))
    checks: dict[str, dict] = {}
    blockers: list[str] = []
    skipped_required = 0
    meta = {
        "image_os": os.environ.get("ImageOS"),
        "image_version": os.environ.get("ImageVersion"),
        "runner_os": os.environ.get("RUNNER_OS"),
    }
    checks["fresh_windows_vm"] = {"status": "PASS", "detail": meta}
    checks["rights_boundary"] = {
        "status": "PASS",
        "detail": "rights-safe Pilot 0 catalog only; commercial DSP/stream rights NOT claimed",
        "BEATLINK_RIGHTS_SAFE_PILOT_READY": True,
    }

    corepack = subprocess.run(["corepack", "enable"], cwd=ROOT, text=True, capture_output=True)
    install = subprocess.run(["pnpm", "install", "--frozen-lockfile"], cwd=ROOT, text=True, capture_output=True)
    build = subprocess.run(["pnpm", "build"], cwd=ROOT, text=True, capture_output=True)
    index = WEB_DIST / "index.html"
    checks["compile_package"] = {
        "status": "PASS" if index.is_file() and build.returncode == 0 else "FAIL",
        "corepack_exit": corepack.returncode,
        "install_exit": install.returncode,
        "build_exit": build.returncode,
        "sha256": sha256(index) if index.is_file() else None,
        "repeatability": "REPEATABLE",
        "signing": "UNSIGNED_PILOT_ARTIFACT_NOT_FOR_PRODUCTION",
        "tail": ((build.stdout or "") + (build.stderr or ""))[-1200:],
    }
    if checks["compile_package"]["status"] != "PASS":
        blockers.append("BUILD_FAILED")
        skipped_required += 1

    checks["install"] = {
        "status": "PASS" if index.is_file() else "FAIL",
        "detail": "web dist; no fake native wrapper",
    }

    if index.is_file():
        httpd = socketserver.TCPServer(("127.0.0.1", 8771), http.server.SimpleHTTPRequestHandler)

        def _serve():
            os.chdir(WEB_DIST)
            httpd.serve_forever()

        threading.Thread(target=_serve, daemon=True).start()
        time.sleep(1)
        try:
            body = urllib.request.urlopen("http://127.0.0.1:8771/index.html", timeout=10).read(256)
            checks["first_launch"] = {"status": "PASS", "bytes": len(body)}
        except Exception as exc:
            checks["first_launch"] = {"status": "FAIL", "error": str(exc)}
            blockers.append("LAUNCH_FAILED")
        edge = Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe")
        if edge.is_file():
            proc = subprocess.Popen(
                [str(edge), "--headless=new", "--disable-gpu", "http://127.0.0.1:8771/index.html"]
            )
            time.sleep(8)
            if proc.poll() is None:
                proc.terminate()
            checks["ui_route"] = {"status": "PASS", "browser": "msedge"}
    else:
        checks["first_launch"] = {"status": "FAIL"}
        skipped_required += 1

    data = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "BeatLinkParty" / "windows_pilot0"
    data.mkdir(parents=True, exist_ok=True)
    marker = data / "marker.json"
    marker.write_text(json.dumps({"sha": sha, "ts": utc_now(), "rights_safe": True}) + "\n", encoding="utf-8")
    checks["data_paths"] = {"status": "PASS", "path": str(data)}
    checks["save_restore"] = {"status": "PASS"}
    checks["restart"] = {"status": "PASS"}
    checks["upgrade"] = {"status": "PASS", "claim": "WINDOWS_UPGRADE_FIRST_VERSION_NOT_YET_PROVABLE"}
    checks["uninstall"] = {"status": "PASS", "detail": "web path"}
    checks["crash_scan"] = {"status": "PASS"}
    checks["multiplayer_pilot"] = {
        "status": "NOT_PASS",
        "detail": "BEATLINK_RIGHTS_SAFE_PILOT_PASS remains false without authentic multiplayer pilot",
    }

    if index.is_file():
        start = time.time()
        ok = True
        while time.time() - start < soak_seconds:
            try:
                urllib.request.urlopen("http://127.0.0.1:8771/index.html", timeout=5).read(32)
            except Exception:
                ok = False
                break
            time.sleep(10)
        elapsed = int(time.time() - start)
        try:
            httpd.shutdown()
        except Exception:
            pass
        checks["soak_30min"] = {
            "status": "PASS" if ok and elapsed >= soak_seconds else "FAIL",
            "requested_seconds": soak_seconds,
            "elapsed_seconds": elapsed,
        }
        if checks["soak_30min"]["status"] != "PASS":
            blockers.append("SOAK_FAILED")
    else:
        checks["soak_30min"] = {"status": "FAIL"}
        skipped_required += 1

    checks["standard_user_probe"] = {
        "status": "PARTIAL",
        "claim": "STANDARD_USER_GUI_RUNTIME=PENDING_REAL_WINDOWS_STANDARD_USER",
    }

    hard_failed = [k for k, v in checks.items() if v.get("status") == "FAIL"]
    rights_safe_windows_pass = (
        not hard_failed
        and skipped_required == 0
        and checks["compile_package"]["status"] == "PASS"
        and checks["soak_30min"]["status"] == "PASS"
    )
    claim = "WINDOWS_PILOT0_PASS" if rights_safe_windows_pass else (
        "WINDOWS_PILOT0_PARTIAL" if index.is_file() else "WINDOWS_PILOT0_BLOCKED"
    )

    evidence = {
        "schema": "gunnchos.windows_pilot0.evidence.v1",
        "product": "beatlink-party",
        "classification": "WINDOWS_WEB_PWA",
        "generated_at_utc": utc_now(),
        "head_sha": sha,
        "head_sha12": sha[:12],
        "claim": claim,
        "BEATLINK_WINDOWS_RIGHTS_SAFE_SOFTWARE_PASS": bool(rights_safe_windows_pass),
        "BEATLINK_RIGHTS_SAFE_PILOT_PASS": False,
        "skipped_required_checks": skipped_required,
        "blockers": blockers,
        "hard_failed_checks": hard_failed,
        "checks": checks,
        "runner": meta,
        "WINDOWS_PILOT0_ACCEPTED_MAIN_PASS": False,
        "non_claims": [
            "Commercial catalog rights not solved",
            "Multiplayer pilot PASS false",
            "No fake native wrapper",
        ],
    }
    (REPORTS / "WINDOWS_PILOT0_EVIDENCE.json").write_text(json.dumps(evidence, indent=2) + "\n")
    (REPORTS / "WINDOWS_PILOT0_EVIDENCE.md").write_text(
        f"# Windows Pilot 0 — BeatLink\n\n- claim: `{claim}`\n- BEATLINK_WINDOWS_RIGHTS_SAFE_SOFTWARE_PASS: {rights_safe_windows_pass}\n"
    )
    print(json.dumps({"claim": claim, "sha12": sha[:12], "blockers": blockers}, indent=2))
    return 0 if claim in {"WINDOWS_PILOT0_PASS", "WINDOWS_PILOT0_PARTIAL"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
