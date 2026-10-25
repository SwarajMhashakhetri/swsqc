"""HTTP contract tests: the repository is swapped for an in-memory fake, so no network."""

from collections.abc import AsyncIterator
from datetime import UTC, date, datetime

import httpx
import pytest

from gale.config import Settings
from gale.domain.analysis import Analytics
from gale.domain.scope import Scope
from gale.elexon.client import ElexonError
from gale.main import create_app
from gale.repository import Dataset
from tests.test_analysis import actuals, forecasts

pytestmark = pytest.mark.anyio

SCOPE = Scope(date(2026, 1, 14), date(2026, 1, 15))


class FakeRepository:
    def __init__(self, error: Exception | None = None) -> None:
        self.error = error

    async def dataset(self) -> Dataset:
        if self.error is not None:
            raise self.error
        analytics = Analytics(forecasts(), actuals(), SCOPE.delivery_dates)
        return Dataset(analytics, SCOPE, datetime(2026, 10, 24, tzinfo=UTC))


def client_for(repository: FakeRepository) -> httpx.AsyncClient:
    app = create_app(Settings(), repository=repository)
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://gale.test",
    )


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    async with client_for(FakeRepository()) as http:
        yield http


async def test_health_is_not_cached(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "1.0.0"}
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-request-id"]


async def test_meta(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/meta")
    assert response.status_code == 200
    body = response.json()
    assert body["first_delivery_date"] == "2026-01-15"
    assert body["last_delivery_date"] == "2026-01-16"
    assert [p["decision_time"] for p in body["presets"]] == ["09:20", "09:50"]
    assert body["coverage"]["missing_periods"] == []
    assert "s-maxage=86400" in response.headers["cache-control"]


async def test_decision(client: httpx.AsyncClient) -> None:
    response = await client.get(
        "/api/v1/decision", params={"delivery_date": "2026-01-15", "decision_time": "09:20"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["decision_at"] == "2026-01-14T09:20:00Z"
    assert body["window_start"] == "2026-01-14T23:00:00Z"
    provenance = body["provenance"]
    assert provenance["publish_time"] == "2026-01-14T07:30:00Z"
    assert provenance["minutes_before_decision"] == 110
    assert provenance["lead_hours_min"] == 15.5
    assert provenance["lead_hours_max"] == 38.5
    assert provenance["hours_forecast"] == provenance["hours_total"] == 24
    assert body["kpis"]["forecast_gwh"] == 24.0
    assert body["kpis"]["energy_error_gwh"] == pytest.approx(2.4)
    first = body["points"][0]
    assert first["forecast_mw"] == 1000.0
    assert first["actual_mw"] == 900.0
    assert first["error_mw"] == 100.0
    assert "public" in response.headers["cache-control"]


async def test_decision_defaults_to_epex_gate_closure(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/decision", params={"delivery_date": "2026-01-15"})
    assert response.json()["decision_time"] == "09:20"


async def test_accuracy(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/accuracy", params={"decision_time": "09:20"})
    assert response.status_code == 200
    body = response.json()
    assert body["metrics"]["mae_mw"] == 200.0
    assert body["metrics"]["bias_mw"] == 0.0
    assert len(body["by_day"]) == 2
    assert len(body["by_hour"]) == 24
    assert len(body["buffer"]) == 50
    level = next(b for b in body["buffer"] if b["confidence"] == 0.5)
    assert level["buffer_mw"] == 100.0
    assert level["breach_share"] == 0.25
    assert level["out_of_sample_breach_share"] == 0.75
    assert body["distribution"]["bin_width_mw"] == 500.0


async def test_series(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/series", params={"decision_time": "09:20"})
    assert response.status_code == 200
    body = response.json()
    assert body["decision_time"] == "09:20"
    first, second = body["days"]
    assert first["delivery_date"] == "2026-01-15"
    assert first["start_time"] == "2026-01-14T23:00:00Z"
    assert len(first["forecast_mw"]) == len(first["actual_mw"]) == 24
    # 15 Jan is bought on the 14 Jan 07:30 run, 16 Jan on the 15 Jan 07:30 run.
    assert set(first["forecast_mw"]) == {1000.0}
    assert set(first["actual_mw"]) == {900.0}
    assert set(second["forecast_mw"]) == {2000.0}
    assert (second["actual_mw"][0], second["actual_mw"][-1]) == (1800.0, 2400.0)
    assert "s-maxage=86400" in response.headers["cache-control"]


async def test_series_follows_the_gate(client: httpx.AsyncClient) -> None:
    body = (await client.get("/api/v1/series", params={"decision_time": "09:50"})).json()
    assert [day["forecast_mw"][0] for day in body["days"]] == [1100.0, 2100.0]


async def test_series_agrees_with_the_decision_view(client: httpx.AsyncClient) -> None:
    series = (await client.get("/api/v1/series")).json()
    decision = (await client.get("/api/v1/decision", params={"delivery_date": "2026-01-16"})).json()
    day = series["days"][1]
    assert day["forecast_mw"] == [p["forecast_mw"] for p in decision["points"]]
    assert day["actual_mw"] == [p["actual_mw"] for p in decision["points"]]


async def test_horizon_and_timing(client: httpx.AsyncClient) -> None:
    horizon = (await client.get("/api/v1/horizon")).json()
    assert horizon["rows"][0]["lead_hour"] >= 0
    timing = (await client.get("/api/v1/timing")).json()
    assert timing["step_minutes"] == 10
    assert timing["rows"][0]["decision_time"] == "00:00"
    assert timing["rows"][-1]["decision_time"] == "22:50"


@pytest.mark.parametrize(
    ("path", "params"),
    [
        ("/api/v1/accuracy", {"decision_time": "23:00"}),
        ("/api/v1/accuracy", {"decision_time": "9:20"}),
        ("/api/v1/series", {"decision_time": "23:00"}),
        ("/api/v1/decision", {"delivery_date": "2026-01-15", "decision_time": "25:00"}),
        ("/api/v1/decision", {"delivery_date": "not-a-date"}),
        ("/api/v1/decision", {}),
    ],
)
async def test_bad_parameters_are_422(
    client: httpx.AsyncClient, path: str, params: dict[str, str]
) -> None:
    response = await client.get(path, params=params)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"
    assert response.headers["cache-control"] == "no-store"


async def test_delivery_date_outside_scope_is_422(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/decision", params={"delivery_date": "2026-03-01"})
    assert response.status_code == 422
    assert "between 2026-01-15 and 2026-01-16" in response.json()["error"]["message"]


async def test_upstream_failure_is_502_without_internals() -> None:
    async with client_for(FakeRepository(ElexonError("WINDFOR failed: secret detail"))) as http:
        response = await http.get("/api/v1/accuracy")
    assert response.status_code == 502
    body = response.json()
    assert body["error"]["code"] == "upstream_unavailable"
    assert "secret" not in response.text


async def test_unexpected_error_is_500_without_traceback() -> None:
    async with client_for(FakeRepository(RuntimeError("boom at line 42"))) as http:
        response = await http.get("/api/v1/meta")
    assert response.status_code == 500
    assert response.json() == {
        "error": {"code": "internal_error", "message": "Something went wrong on our side."}
    }


async def test_unknown_route_is_json_404(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/nothing")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


async def test_openapi_is_published(client: httpx.AsyncClient) -> None:
    spec = (await client.get("/api/openapi.json")).json()
    assert {
        "/api/v1/decision",
        "/api/v1/series",
        "/api/v1/accuracy",
        "/api/v1/horizon",
        "/api/v1/timing",
    } <= set(spec["paths"])
