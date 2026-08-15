#!/usr/bin/env python3
"""Validate GAME-RC release contracts without claiming polish."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RELEASE = ROOT / "release"
GAME = "beatlink-party"


def load(name: str) -> dict:
    path = RELEASE / name
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def require(obj: dict, keys: list[str], label: str, errors: list[str]) -> None:
    for key in keys:
        if key not in obj:
            errors.append(f"{label} missing {key}")


def main() -> int:
    errors: list[str] = []
    for name in (
        "PLAYTHROUGH_CONTRACT.json",
        "CONTENT_MANIFEST.json",
        "ACHIEVEMENTS.json",
        "RC_GATE.json",
        "PLATFORM_MATRIX.json",
        "VISUAL_PACK_HARNESS.json",
    ):
        if not (RELEASE / name).is_file():
            errors.append(f"missing {name}")
    if errors:
        print("\n".join(errors))
        return 1

    play = load("PLAYTHROUGH_CONTRACT.json")
    content = load("CONTENT_MANIFEST.json")
    ach = load("ACHIEVEMENTS.json")
    gate = load("RC_GATE.json")
    platform = load("PLATFORM_MATRIX.json")
    visual = load("VISUAL_PACK_HARNESS.json")

    require(play, ["schema", "game", "steps", "pause_resume", "ending", "open_placeholders"], "playthrough", errors)
    require(content, ["schema", "game", "counts", "modes", "items", "open_placeholders"], "content", errors)
    require(ach, ["schema", "game", "catalog_version", "offline", "duplicate_prevention", "achievements"], "achievements", errors)
    require(gate, ["schema", "game", "claims", "critic_class", "defects", "visual"], "rc_gate", errors)
    require(platform, ["schema", "game", "targets", "PLATFORM_PUBLISHED"], "platform", errors)
    require(visual, ["schema", "game", "status", "VISUAL_MODEL_REVIEW", "deferred_heavy_work"], "visual_harness", errors)

    if play.get("game") != GAME or ach.get("game") != GAME:
        errors.append("game id mismatch")
    if play.get("schema") != "gunnchos.game_rc.playthrough_contract/v1":
        errors.append("playthrough schema")
    if not play.get("digitally_executable"):
        errors.append("playthrough must be digitally_executable for this packet")
    if play.get("human_playtest_validated") is not False:
        errors.append("HUMAN_PLAYTEST_VALIDATED must be false")
    if play.get("pause_resume", {}).get("status") != "CLOSED":
        errors.append("pause_resume must be CLOSED")
    open_steps = [s["id"] for s in play.get("steps", []) if s.get("required") and s.get("status") != "CLOSED"]
    if open_steps:
        errors.append(f"required playthrough steps still OPEN: {open_steps}")

    for item in ach.get("achievements", []):
        unlock = item.get("unlock", {})
        if unlock.get("type") in {"test", "debug", "cheat", "always"}:
            errors.append(f"test-only unlock on {item.get('id')}")
        if not item.get("id") or not item.get("title") or "hidden" not in item:
            errors.append(f"achievement incomplete {item}")
    if len(ach.get("achievements", [])) < 8:
        errors.append("achievement catalog too small")
    if ach.get("offline") is not True or ach.get("duplicate_prevention") is not True:
        errors.append("offline/duplicate_prevention required")

    claims = gate.get("claims", {})
    if claims.get("POLISHED_RELEASE_CANDIDATE") or claims.get("FEATURE_COMPLETE_RC"):
        errors.append("must not claim POLISHED_RELEASE_CANDIDATE or FEATURE_COMPLETE_RC")
    if claims.get("HUMAN_PLAYTEST_VALIDATED"):
        errors.append("HUMAN_PLAYTEST_VALIDATED must be false")
    if gate.get("critic_class") in {"RC", "DIGITAL_RC"} and gate.get("defects", {}).get("S2_open", 1) > 0:
        errors.append("critic_class overclaim vs S2")
    if int(gate.get("defects", {}).get("S0_open", 1)) != 0 or int(gate.get("defects", {}).get("S1_open", 1)) != 0:
        errors.append("S0/S1 must be 0 for this packet")
    if gate.get("visual", {}).get("VISUAL_MODEL_REVIEW") not in {"UNAVAILABLE", "PASS", "FAIL", "HISTORICAL_CAPTURES_ONLY"}:
        errors.append("visual review missing")
    if int(gate.get("achievements", {}).get("count", 0)) != len(ach.get("achievements", [])):
        errors.append("RC_GATE achievement count mismatch")
    if gate.get("packet") != "GAME-RC-004":
        errors.append("RC_GATE packet must be GAME-RC-004")
    if platform.get("PLATFORM_PUBLISHED") is not False:
        errors.append("PLATFORM_PUBLISHED must be false")
    if visual.get("VISUAL_MODEL_REVIEW") not in {"HISTORICAL_CAPTURES_ONLY", "UNAVAILABLE"}:
        errors.append("visual harness review invalid")

    open_modes = [m["id"] for m in content.get("modes", []) if m.get("status") == "OPEN"]
    print(f"GAME_RC_CONTRACTS_OK game={ach.get('game')} achievements={len(ach.get('achievements', []))} open_modes={open_modes}")
    if errors:
        print("FAIL")
        for err in errors:
            print(" -", err)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
