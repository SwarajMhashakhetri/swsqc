"""Repository loading against a mock Elexon: single-flight and failure behaviour."""

import asyncio
from datetime import date

import httpx
import pytest

from gale.config import Settings
from gale.elexon.client import ElexonError
from gale.repository import ElexonRepository
from tests.helpers import fuelhh_json, windfor_json

pytestmark = pytest.mark.anyio


def settings() -> Settings:
    return Settings(
        first_decision_date=date(2026, 1, 14),
        last_decision_date=date(2026, 1, 14),
        fetch_chunk_days=31,
        http_retries=0,
    )


def fake_elexon(counter: dict[str, int], *, fail: bool = False) -> httpx.MockTransport:
    async def handler(request: httpx.Request) -> httpx.Response:
        dataset = request.url.path.split("/")[-2]
        counter[dataset] = counter.get(dataset, 0) + 1
        await asyncio.sleep(0.01)  # keep the load in flight while other callers arrive
        if fail:
            return httpx.Response(503)
        if request.url.path.endswith("WINDFOR/stream"):
            return httpx.Response(
                200, json=windfor_json("2026-01-14 07:30", "2026-01-13 21:00", [1000] * 73)
            )
        body = fuelhh_json("2026-01-14", "2026-01-14 00:00", [900] * 48)
        body += fuelhh_json("2026-01-15", "2026-01-15 00:00", [900] * 48)
        return httpx.Response(200, json=body)

    return httpx.MockTransport(handler)


async def test_concurrent_cold_requests_share_one_load() -> None:
    calls: dict[str, int] = {}
    repository = ElexonRepository(settings(), transport=fake_elexon(calls))
    results = await asyncio.gather(*(repository.dataset() for _ in range(10)))
    assert all(result is results[0] for result in results)
    assert calls == {"WINDFOR": 1, "FUELHH": 1}
    assert results[0].analytics.delivery_dates == [date(2026, 1, 15)]
    # Warm path: no further upstream calls.
    await repository.dataset()
    assert sum(calls.values()) == 2


async def test_failed_load_is_not_cached() -> None:
    calls: dict[str, int] = {}
    repository = ElexonRepository(settings(), transport=fake_elexon(calls, fail=True))
    with pytest.raises(ElexonError):
        await repository.dataset()
    with pytest.raises(ElexonError):
        await repository.dataset()
    assert calls["WINDFOR"] == 2


async def test_loaded_rows_are_deduplicated() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("WINDFOR/stream"):
            run = windfor_json("2026-01-14 07:30", "2026-01-14 23:00", [1000] * 24)
            return httpx.Response(200, json=run + run)
        body = fuelhh_json("2026-01-15", "2026-01-15 00:00", [900] * 46)
        return httpx.Response(200, json=body + body)

    repository = ElexonRepository(settings(), transport=httpx.MockTransport(handler))
    coverage = (await repository.dataset()).analytics.coverage()
    assert coverage.forecast_rows == 24
    assert coverage.actual_periods == 46
