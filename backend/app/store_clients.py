from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "data"
DATA.mkdir(parents=True, exist_ok=True)

CLIENTS_FILE = DATA / "clients.json"
if not CLIENTS_FILE.exists():
    CLIENTS_FILE.write_text("[]", encoding="utf-8")


def load_clients() -> List[Dict[str, Any]]:
    return json.loads(CLIENTS_FILE.read_text(encoding="utf-8"))


def save_clients(items: List[Dict[str, Any]]) -> None:
    CLIENTS_FILE.write_text(json.dumps(items, indent=2), encoding="utf-8")
