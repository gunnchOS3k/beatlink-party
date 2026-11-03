#!/usr/bin/env python3
"""Validate artifacts/rtm/BEATLINK_LINKS_RTM.json against GUNNCHOS3K_PVS schema."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RTM_PATH = ROOT / "artifacts" / "rtm" / "BEATLINK_LINKS_RTM.json"
SCHEMA_PATH = ROOT / "docs" / "quality" / "schemas" / "requirements_to_evidence_matrix.schema.json"
PIN_PATH = ROOT / "docs" / "quality" / "schemas" / "GUNNCHOS3K_PVS_PIN.json"


def main() -> int:
    try:
        from jsonschema import Draft202012Validator
    except ImportError:
        print("INSTALL_JSONSCHEMA: pip install 'jsonschema>=4.20'", file=sys.stderr)
        return 2

    rtm = json.loads(RTM_PATH.read_text())
    schema = json.loads(SCHEMA_PATH.read_text())
    pin = json.loads(PIN_PATH.read_text())

    Draft202012Validator(schema).validate(rtm)

    assert rtm["contract_id"] == "GUNNCHOS3K_PVS"
    assert rtm["schema_version"] == "1.0.0"
    assert rtm["contract_version"] == pin["contract_version"]
    assert rtm["product_id"] == "beatlink-party"
    assert rtm["honesty_flags"]["HUMAN"] is False
    assert rtm["honesty_flags"]["RC2"] is False
    assert rtm["honesty_flags"]["V1"] is False
    assert rtm["contract_source_sha"] == pin["contract_source_sha"]

    for row in rtm["rows"]:
        assert row["independent_review_status"] == "not_started", (
            f"{row['req_id']} independent_review_status must be not_started"
        )

    print("BEATLINK_LINKS_RTM_OK")
    print(f"contract=GUNNCHOS3K_PVS@{rtm['contract_version']}")
    print(f"pin_sha={rtm['contract_source_sha']}")
    print(f"rows={len(rtm['rows'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
