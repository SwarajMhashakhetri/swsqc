"""Builders for compact, readable test data. All times are UTC."""

from datetime import UTC, datetime, timedelta

from gale.domain.models import ActualRow, ForecastRow


def at(text: str) -> datetime:
    """``at("2026-01-14 07:30")`` -> aware UTC datetime."""
    return datetime.fromisoformat(text).replace(tzinfo=UTC)


def forecast_run(publish: str, first_start: str, values: list[float]) -> list[ForecastRow]:
    """One WINDFOR publish: consecutive hourly values starting at ``first_start``."""
    start = at(first_start)
    return [
        ForecastRow(at(publish), start + timedelta(hours=i), value)
        for i, value in enumerate(values)
    ]


def half_hours(
    first_start: str, values: list[float], published_lag_min: int = 30
) -> list[ActualRow]:
    start = at(first_start)
    rows = []
    for i, value in enumerate(values):
        slot = start + timedelta(minutes=30 * i)
        rows.append(ActualRow(slot, slot + timedelta(minutes=published_lag_min), value))
    return rows


def windfor_json(publish: str, first_start: str, values: list[float]) -> list[dict[str, object]]:
    start = at(first_start)
    return [
        {
            "dataset": "WINDFOR",
            "publishTime": at(publish).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "startTime": (start + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "generation": value,
        }
        for i, value in enumerate(values)
    ]


def fuelhh_json(
    settlement_date: str, first_start: str, values: list[float]
) -> list[dict[str, object]]:
    start = at(first_start)
    rows: list[dict[str, object]] = []
    for i, value in enumerate(values):
        slot = start + timedelta(minutes=30 * i)
        rows.append(
            {
                "dataset": "FUELHH",
                "publishTime": (slot + timedelta(minutes=30)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "startTime": slot.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "settlementDate": settlement_date,
                "settlementPeriod": i + 1,
                "fuelType": "WIND",
                "generation": value,
            }
        )
    return rows
