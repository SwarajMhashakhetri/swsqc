"""Elexon client against ``httpx.MockTransport``: no test touches the network."""

from collections.abc import Callable
from datetime import date

import httpx
import pytest

from gale.elexon.client import ElexonClient, ElexonError
from tests.helpers import at, fuelhh_json, windfor_json

pytestmark = pytest.mark.anyio

Handler = Callable[[httpx.Request], httpx.Response]


async def no_sleep(_: float) -> None:
    return None


def make_client(handler: Handler, *, retries: int = 2, chunk_days: int = 7) -> ElexonClient:
    http = httpx.AsyncClient(base_url="https://elexon.test", transport=httpx.MockTransport(handler))
    return ElexonClient(
        http, retries=retries, backoff_s=0.01, chunk_days=chunk_days, sleep=no_sleep
    )


async def test_forecast_window_is_chunked_with_real_parameter_names() -> None:
    seen: list[dict[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/datasets/WINDFOR/stream"
        seen.append(dict(request.url.params))
        return httpx.Response(200, json=[])

    client = make_client(handler, chunk_days=7)
    await client.wind_forecasts(at("2026-01-01 00:00"), at("2026-01-15 00:00"))
    assert sorted(p["publishDateTimeFrom"] for p in seen) == [
        "2026-01-01T00:00:00Z",
        "2026-01-08T00:00:00Z",
    ]
    assert sorted(p["publishDateTimeTo"] for p in seen) == [
        "2026-01-08T00:00:00Z",
        "2026-01-15T00:00:00Z",
    ]


async def test_forecast_rows_are_parsed_to_utc() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, json=windfor_json("2026-01-14 07:30", "2026-01-15 00:00", [10, 20])
        )

    rows = await make_client(handler).wind_forecasts(at("2026-01-14 00:00"), at("2026-01-15 00:00"))
    assert [(r.start_time, r.generation_mw) for r in rows] == [
        (at("2026-01-15 00:00"), 10.0),
        (at("2026-01-15 01:00"), 20.0),
    ]
    assert rows[0].publish_time == at("2026-01-14 07:30")


async def test_silently_ignored_filter_is_detected() -> None:
    # Elexon ignores unknown parameters and returns the latest data instead.
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=windfor_json("2026-10-24 07:30", "2026-10-24 00:00", [1]))

    with pytest.raises(ElexonError, match="outside the requested publish window"):
        await make_client(handler).wind_forecasts(at("2026-01-14 00:00"), at("2026-01-15 00:00"))


async def test_transient_failures_are_retried_with_backoff() -> None:
    calls = 0

    def handler(_: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise httpx.ConnectTimeout("slow")
        if calls == 2:
            return httpx.Response(503)
        return httpx.Response(200, json=[])

    delays: list[float] = []

    async def record(delay: float) -> None:
        delays.append(delay)

    http = httpx.AsyncClient(base_url="https://elexon.test", transport=httpx.MockTransport(handler))
    client = ElexonClient(http, retries=3, backoff_s=0.5, chunk_days=31, sleep=record)
    assert await client.wind_forecasts(at("2026-01-14 00:00"), at("2026-01-15 00:00")) == []
    assert calls == 3
    assert delays == [0.5, 1.0]


async def test_retry_after_header_is_respected() -> None:
    calls = 0
    delays: list[float] = []

    def handler(_: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(429, headers={"Retry-After": "2"})
        return httpx.Response(200, json=[])

    async def record(delay: float) -> None:
        delays.append(delay)

    http = httpx.AsyncClient(base_url="https://elexon.test", transport=httpx.MockTransport(handler))
    client = ElexonClient(http, retries=1, chunk_days=31, sleep=record)
    await client.wind_forecasts(at("2026-01-14 00:00"), at("2026-01-15 00:00"))
    assert delays == [2.0]


async def test_gives_up_after_retries() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(502)

    with pytest.raises(ElexonError, match="failed after 3 attempts"):
        await make_client(handler, retries=2).wind_forecasts(
            at("2026-01-14 00:00"), at("2026-01-15 00:00")
        )


async def test_client_errors_are_not_retried() -> None:
    calls = 0

    def handler(_: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(400, json={"title": "bad"})

    with pytest.raises(ElexonError, match="HTTP 400"):
        await make_client(handler).wind_forecasts(at("2026-01-14 00:00"), at("2026-01-15 00:00"))
    assert calls == 1


@pytest.mark.parametrize(
    "body",
    [
        [
            {
                "publishTime": "2026-01-14T07:30:00",
                "startTime": "2026-01-15T00:00:00Z",
                "generation": 1,
            }
        ],
        [{"publishTime": "2026-01-14T07:30:00Z", "generation": 1}],
        {"data": []},
    ],
    ids=["naive-timestamp", "missing-field", "not-a-list"],
)
async def test_malformed_payloads_are_rejected(body: object) -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=body)

    with pytest.raises(ElexonError, match="invalid"):
        await make_client(handler).wind_forecasts(at("2026-01-14 00:00"), at("2026-01-15 00:00"))


async def test_non_json_body_is_an_upstream_error() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="<html>maintenance</html>")

    with pytest.raises(ElexonError, match="non-JSON"):
        await make_client(handler).wind_forecasts(at("2026-01-14 00:00"), at("2026-01-15 00:00"))


async def test_actuals_are_chunked_by_settlement_date_and_filtered_to_wind() -> None:
    seen: list[tuple[str, str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        params = request.url.params
        seen.append((params["settlementDateFrom"], params["settlementDateTo"], params["fuelType"]))
        if params["settlementDateFrom"] != "2026-01-01":
            return httpx.Response(200, json=[])
        rows = fuelhh_json("2026-01-01", "2026-01-01 00:00", [500, 600])
        rows.append({**rows[0], "fuelType": "CCGT", "generation": 9999})
        return httpx.Response(200, json=rows)

    client = make_client(handler, chunk_days=3)
    rows = await client.wind_actuals(date(2026, 1, 1), date(2026, 1, 5))
    assert sorted(seen) == [
        ("2026-01-01", "2026-01-03", "WIND"),
        ("2026-01-04", "2026-01-05", "WIND"),
    ]
    assert [r.generation_mw for r in rows] == [500.0, 600.0]


async def test_actuals_outside_requested_dates_are_rejected() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=fuelhh_json("2026-10-24", "2026-10-23 23:00", [1]))

    with pytest.raises(ElexonError, match="outside the requested settlement dates"):
        await make_client(handler).wind_actuals(date(2026, 1, 1), date(2026, 1, 2))


async def test_window_end_before_start_is_a_programming_error() -> None:
    with pytest.raises(ValueError, match="precedes"):
        await make_client(lambda _: httpx.Response(200, json=[])).wind_forecasts(
            at("2026-01-15 00:00"), at("2026-01-14 00:00")
        )
