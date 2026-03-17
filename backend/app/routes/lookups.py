"""
Stallion Lookups & CBTT Rate Proxy routes.
"""
from __future__ import annotations

from datetime import date
from typing import Any, Dict

import httpx
from fastapi import APIRouter, HTTPException, Query

from ..store import LOOKUPS

router = APIRouter(tags=["lookups"])

# ─── CBTT rate proxy ──────────────────────────────────────────────────────────
_cbtt_cache: dict[str, dict] = {}
CBTT_ENDPOINT = "https://www.central-bank.org.tt/our-work/statistics/exchange-rates/json"
CBTT_FALLBACK_RATE = 6.7732


@router.get("/lookups/{kind}")
async def lookups(kind: str, date: str | None = Query(default=None)):
    if kind == "cbtt-rate":
        return await cbtt_rate(date)

    if kind == "permits":
        from .extract import PERMIT_LOOKUP
        return {"kind": "permits", "items": PERMIT_LOOKUP}

    if kind not in LOOKUPS:
        raise HTTPException(status_code=404, detail=f"Lookup kind '{kind}' not found")
    return {"kind": kind, "items": LOOKUPS[kind]}


@router.get("/lookups/cbtt-rate")
async def cbtt_rate(date_str: str = Query(default=None, alias="date")):
    """
    Returns the USD/TTD weighted average selling rate for a given date.
    """
    target_date = date_str or date.today().isoformat()

    if target_date in _cbtt_cache:
        return {**_cbtt_cache[target_date], "source": "cache"}

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(CBTT_ENDPOINT, params={"date": target_date})
            resp.raise_for_status()
            payload = resp.json()

        rate = None
        if isinstance(payload, list):
            for row in payload:
                currency = (row.get("currency") or row.get("Currency") or "").upper()
                if "USD" in currency or "US DOLLAR" in currency:
                    rate = float(
                        row.get("selling") or row.get("Selling") or
                        row.get("weighted_avg") or row.get("WeightedAvg") or 0
                    )
                    break

        if rate and rate > 0:
            entry = {"rate": rate, "date": target_date, "source": "central_bank"}
            _cbtt_cache[target_date] = entry
            return entry

    except Exception:
        pass

    return {"rate": CBTT_FALLBACK_RATE, "date": target_date, "source": "fallback"}
