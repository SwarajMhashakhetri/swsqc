from gale.domain.cleaning import dedupe_actuals, dedupe_forecasts
from gale.domain.models import ActualRow, ForecastRow
from tests.helpers import at


def test_duplicate_forecast_rows_collapse_and_last_fetched_wins() -> None:
    first = ForecastRow(at("2026-01-14 07:30"), at("2026-01-15 10:00"), 100.0)
    revised = ForecastRow(at("2026-01-14 07:30"), at("2026-01-15 10:00"), 110.0)
    other = ForecastRow(at("2026-01-14 07:30"), at("2026-01-15 09:00"), 90.0)
    result = dedupe_forecasts([first, other, revised])
    assert result == [other, revised]


def test_actual_revision_with_later_publish_time_wins_regardless_of_order() -> None:
    original = ActualRow(at("2026-01-15 10:00"), at("2026-01-15 10:30"), 5000.0)
    revision = ActualRow(at("2026-01-15 10:00"), at("2026-01-15 12:00"), 5100.0)
    assert dedupe_actuals([original, revision]) == [revision]
    assert dedupe_actuals([revision, original]) == [revision]


def test_actuals_come_back_sorted_by_start_time() -> None:
    late = ActualRow(at("2026-01-15 10:30"), at("2026-01-15 11:00"), 1.0)
    early = ActualRow(at("2026-01-15 10:00"), at("2026-01-15 10:30"), 2.0)
    assert dedupe_actuals([late, early]) == [early, late]
