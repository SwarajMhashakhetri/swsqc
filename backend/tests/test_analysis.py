"""Analytics on a small synthetic market whose answers can be worked out by hand.

Delivery days 15 and 16 Jan 2026 (GMT), each 23:00 -> 23:00 UTC.
Publishes:  A 14 Jan 07:30 = 1000 MW flat   B 14 Jan 09:30 = 1100 MW flat
            C 15 Jan 07:30 = 2000 MW flat   D 15 Jan 09:30 = 2100 MW flat
Actuals:    day 15 = 900 MW; day 16 = 1800 MW for 12 h then 2400 MW for 12 h.
"""

import math
from datetime import date, time, timedelta

import pytest

from gale.domain.analysis import Analytics, buffer_table
from gale.domain.models import ActualRow, ErrorSample, ForecastRow
from tests.helpers import at, forecast_run, half_hours

DAY_15 = date(2026, 1, 15)
DAY_16 = date(2026, 1, 16)
EPEX = time(9, 20)
N2EX = time(9, 50)


def forecasts() -> list[ForecastRow]:
    return (
        forecast_run("2026-01-14 07:30", "2026-01-13 21:00", [1000.0] * 73)
        + forecast_run("2026-01-14 09:30", "2026-01-13 21:00", [1100.0] * 73)
        + forecast_run("2026-01-15 07:30", "2026-01-14 21:00", [2000.0] * 73)
        + forecast_run("2026-01-15 09:30", "2026-01-14 21:00", [2100.0] * 73)
    )


def actuals() -> list[ActualRow]:
    return half_hours("2026-01-14 23:00", [900.0] * 48 + [1800.0] * 24 + [2400.0] * 24)


def analytics(actual_rows: list[ActualRow] | None = None) -> Analytics:
    return Analytics(
        forecasts(), actuals() if actual_rows is None else actual_rows, [DAY_15, DAY_16]
    )


def test_decision_day_uses_latest_publish_before_gate_closure() -> None:
    day = analytics().decision_day(DAY_15, EPEX)
    assert day.decision_at == at("2026-01-14 09:20")
    assert day.window.start == at("2026-01-14 23:00")
    assert day.publishes_used == [at("2026-01-14 07:30")]
    assert len(day.hours) == 24
    first = day.hours[0].outcome
    assert first.forecast is not None
    assert first.forecast.generation_mw == 1000.0
    assert first.forecast.lead == timedelta(hours=15, minutes=30)
    assert first.actual_mw == 900.0


def test_n2ex_gate_closure_sees_the_0930_publish() -> None:
    day = analytics().decision_day(DAY_15, N2EX)
    assert day.publishes_used == [at("2026-01-14 09:30")]


def test_decision_day_kpis() -> None:
    day = analytics().decision_day(DAY_15, EPEX)
    assert day.energy is not None
    assert day.energy.forecast_gwh == pytest.approx(24.0)
    # Daily energy errors at 09:20: day 15 = +2400 MWh, day 16 = 12*200 - 12*400 = -2400 MWh.
    # P90 = -2400 + 0.9*4800 = 1920 ; P10 = -1920 -> range 24000 -/+ 1920 MWh.
    assert day.energy.low_gwh == pytest.approx(22.08)
    assert day.energy.high_gwh == pytest.approx(25.92)
    assert day.actual_gwh == pytest.approx(21.6)
    assert day.summary is not None
    assert day.summary.mae_mw == pytest.approx(100.0)
    assert day.peak is not None
    assert day.peak.generation_mw == 1000.0


def test_band_is_forecast_minus_error_quantiles_at_that_lead() -> None:
    model = analytics()
    day = model.decision_day(DAY_16, EPEX)
    for hour in day.hours:
        forecast = hour.outcome.forecast
        assert forecast is not None
        quantiles = model.error_quantiles_at_lead(forecast.lead)
        assert quantiles is not None
        q10, q90 = quantiles
        assert hour.low_mw == pytest.approx(max(forecast.generation_mw - q90, 0.0))
        assert hour.high_mw == pytest.approx(max(forecast.generation_mw - q10, 0.0))


def test_band_only_pools_errors_within_three_hours_of_lead() -> None:
    rows = [
        ForecastRow(at("2026-01-15 00:00"), at("2026-01-15 01:00"), 1100.0),  # lead 1 h, error +100
        ForecastRow(
            at("2026-01-15 00:00"), at("2026-01-15 10:00"), 2000.0
        ),  # lead 10 h, error +1000
    ]
    hours = half_hours("2026-01-15 01:00", [1000.0, 1000.0]) + half_hours(
        "2026-01-15 10:00", [1000.0, 1000.0]
    )
    model = Analytics(rows, hours, [DAY_15])
    assert model.error_quantiles_at_lead(timedelta(hours=1)) == (100.0, 100.0)
    assert model.error_quantiles_at_lead(timedelta(hours=10)) == (1000.0, 1000.0)
    assert model.error_quantiles_at_lead(timedelta(hours=5, minutes=30)) is None


def test_vintages_are_earlier_publishes_from_the_previous_24_hours() -> None:
    day = analytics().decision_day(DAY_16, N2EX)
    assert day.publishes_used == [at("2026-01-15 09:30")]
    assert [v.publish_time for v in day.vintages] == [at("2026-01-15 07:30")]
    assert len(day.vintages[0].points) == 24


def test_no_forecast_published_yet_gives_gaps_not_zeros() -> None:
    day = analytics().decision_day(DAY_15, time(0, 30))
    assert all(h.outcome.forecast is None for h in day.hours)
    assert day.energy is None
    assert day.peak is None
    assert day.summary is None


def test_accuracy_metrics_by_hand() -> None:
    report = analytics().accuracy(EPEX)
    summary = report.summary
    assert summary is not None
    # errors: 24 x +100 (day 15), 12 x +200 and 12 x -400 (day 16)
    assert summary.n == 48
    assert summary.mae_mw == pytest.approx(200.0)
    assert summary.bias_mw == pytest.approx(0.0)
    assert summary.rmse_mw == pytest.approx(math.sqrt(55_000))
    assert summary.mean_actual_mw == pytest.approx(1500.0)
    assert summary.nmae_pct == pytest.approx(200 / 1500 * 100)
    assert report.hours_expected == 48
    assert [d.summary.mae_mw if d.summary else None for d in report.by_day] == [100.0, 300.0]
    assert report.by_day[1].forecast_gwh == pytest.approx(48.0)
    assert report.by_day[1].actual_gwh == pytest.approx(50.4)
    assert [h.hour for h in report.by_hour][:2] == [23, 0]
    assert report.error_p50_mw == pytest.approx(100.0)
    assert sum(b.count for b in report.histogram) == 48


def test_later_gate_closure_uses_fresher_forecast() -> None:
    report = analytics().accuracy(N2EX)
    assert report.summary is not None
    # errors: 24 x +200, 12 x +300, 12 x -300
    assert report.summary.mae_mw == pytest.approx(250.0)
    assert report.by_day[0].publish_times == [at("2026-01-14 09:30")]


def test_buffer_table_in_and_out_of_sample() -> None:
    levels = {round(level.confidence * 100): level for level in analytics().accuracy(EPEX).buffer}
    # Sorted errors: 12 x -400, 24 x +100, 12 x +200.
    assert levels[50].buffer_mw == pytest.approx(100.0)
    assert levels[50].breaches == 12
    assert levels[50].shortfall_mwh == pytest.approx(1200.0)
    # Leave day 15 out: buffer = median of day 16 = -100, so all 24 of day 15 breach.
    # Leave day 16 out: buffer = 100, so day 16's twelve +200 hours breach.
    assert levels[50].out_of_sample_breaches == 36
    assert levels[90].buffer_mw == pytest.approx(200.0)
    assert levels[90].breaches == 0
    assert min(levels) == 50
    assert max(levels) == 99


def test_buffer_table_handles_empty_input() -> None:
    assert buffer_table({}) == []
    sample = ErrorSample(at("2026-01-15 00:00"), at("2026-01-14 07:30"), 10.0, 5.0)
    single = buffer_table({DAY_15: [sample]})
    assert single[0].buffer_mw == 5.0
    assert single[0].out_of_sample_breaches == 0


def test_timing_sweep_matches_accuracy_and_reports_freshness() -> None:
    model = analytics()
    points = {p.decision_time: p for p in model.timing()}
    assert len(points) == 23 * 6
    assert max(points) == time(22, 50)
    epex = points[EPEX]
    assert epex.summary == model.accuracy(EPEX).summary
    assert epex.median_forecast_age_minutes == pytest.approx(110.0)


def test_missing_settlement_period_is_reported_and_excluded() -> None:
    rows = actuals()
    missing = rows.pop(10)
    model = analytics(rows)
    coverage = model.coverage()
    assert coverage.missing_periods == [missing.start_time]
    assert coverage.hours_without_actual == 1
    assert coverage.expected_periods == 96
    report = model.accuracy(EPEX)
    assert report.summary is not None
    assert report.summary.n == 47
    assert model.decision_day(DAY_15, EPEX).actual_gwh is None


def test_coverage_counts_hindcasts_and_publish_slots() -> None:
    coverage = analytics().coverage()
    assert coverage.publishes == 4
    assert dict(coverage.publish_times_of_day) == {"07:30": 2, "09:30": 2}
    # Rows for hours that began before their publish: A and B 11 each (21:00-07:00), C and D 11.
    assert coverage.hindcast_rows == 11 + 13 + 11 + 13


def test_requires_delivery_dates() -> None:
    with pytest.raises(ValueError, match="delivery date"):
        Analytics([], [], [])
