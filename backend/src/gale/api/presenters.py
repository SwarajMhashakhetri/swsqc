"""Domain objects to response models. Rounding happens here and only here."""

from datetime import date, time

from gale.api import schemas as s
from gale.domain.analysis import (
    AccuracyReport,
    Coverage,
    DecisionDay,
    HorizonBucket,
    HourOutcome,
    TimingPoint,
)
from gale.domain.markets import DecisionPreset
from gale.domain.metrics import ErrorSummary
from gale.domain.models import ForecastPoint
from gale.repository import Dataset


def _mw(value: float) -> float:
    return round(value, 1)


def _gwh(value: float) -> float:
    return round(value, 3)


def _opt_mw(value: float | None) -> float | None:
    return None if value is None else _mw(value)


def _opt_gwh(value: float | None) -> float | None:
    return None if value is None else _gwh(value)


def hhmm(value: time) -> str:
    return value.strftime("%H:%M")


def metrics(summary: ErrorSummary | None) -> s.Metrics | None:
    if summary is None:
        return None
    return s.Metrics(
        n=summary.n,
        mae_mw=_mw(summary.mae_mw),
        rmse_mw=_mw(summary.rmse_mw),
        bias_mw=_mw(summary.bias_mw),
        nmae_pct=round(summary.nmae_pct, 2),
        mean_actual_mw=_mw(summary.mean_actual_mw),
        mean_forecast_mw=_mw(summary.mean_forecast_mw),
        p50_abs_error_mw=_mw(summary.p50_abs_error_mw),
        p90_abs_error_mw=_mw(summary.p90_abs_error_mw),
    )


def coverage(value: Coverage) -> s.CoverageOut:
    return s.CoverageOut(
        forecast_rows=value.forecast_rows,
        hindcast_rows_excluded=value.hindcast_rows,
        publishes=value.publishes,
        publish_times_of_day=[
            s.PublishSlot(time=t, count=c) for t, c in value.publish_times_of_day
        ],
        actual_periods=value.actual_periods,
        expected_periods=value.expected_periods,
        missing_periods=value.missing_periods,
        hours_without_actual=value.hours_without_actual,
    )


def meta(dataset: Dataset, presets: tuple[DecisionPreset, ...]) -> s.Meta:
    scope = dataset.scope
    start, end = scope.publish_window
    return s.Meta(
        source="Elexon BMRS: WINDFOR (forecast) and FUELHH fuelType=WIND (outturn)",
        first_decision_date=scope.first_decision_date,
        last_decision_date=scope.last_decision_date,
        first_delivery_date=scope.delivery_dates[0],
        last_delivery_date=scope.delivery_dates[-1],
        delivery_day="23:00 UK on D-1 to 23:00 UK on D (EPEX SPOT and N2EX GB day-ahead)",
        publish_window_start=start,
        publish_window_end=end,
        loaded_at=dataset.loaded_at,
        presets=[
            s.DecisionPresetOut(
                id=p.id,
                exchange=p.exchange,
                auction=p.auction,
                decision_time=hhmm(p.local_time),
                source_url=p.source_url,
            )
            for p in presets
        ],
        coverage=coverage(dataset.analytics.coverage()),
    )


def _peak(point: ForecastPoint | None) -> s.PeakOut | None:
    return (
        None
        if point is None
        else s.PeakOut(start_time=point.start_time, mw=_mw(point.generation_mw))
    )


def decision(day: DecisionDay, decision_time: time) -> s.DecisionOut:
    points = [h.outcome.forecast for h in day.hours if h.outcome.forecast is not None]
    latest = max((p.publish_time for p in points), default=None)
    leads = [p.lead.total_seconds() / 3600 for p in points]
    energy = day.energy
    return s.DecisionOut(
        delivery_date=day.delivery_date,
        decision_time=hhmm(decision_time),
        decision_at=day.decision_at,
        window_start=day.window.start,
        window_end=day.window.end,
        provenance=s.Provenance(
            publish_time=latest,
            publishes_used=day.publishes_used,
            minutes_before_decision=(
                None if latest is None else (day.decision_at - latest).total_seconds() / 60
            ),
            lead_hours_min=round(min(leads), 2) if leads else None,
            lead_hours_max=round(max(leads), 2) if leads else None,
            hours_forecast=len(points),
            hours_total=len(day.hours),
        ),
        kpis=s.DecisionKpis(
            forecast_gwh=_opt_gwh(energy.forecast_gwh if energy else None),
            forecast_p10_gwh=_opt_gwh(energy.low_gwh if energy else None),
            forecast_p90_gwh=_opt_gwh(energy.high_gwh if energy else None),
            peak=_peak(day.peak),
            trough=_peak(day.trough),
            actual_gwh=_opt_gwh(day.actual_gwh),
            energy_error_gwh=(
                _gwh(energy.forecast_gwh - day.actual_gwh)
                if energy is not None
                and day.actual_gwh is not None
                and len(points) == len(day.hours)
                else None
            ),
        ),
        metrics=metrics(day.summary),
        points=[
            s.HourPoint(
                start_time=h.outcome.start_time,
                forecast_mw=_opt_mw(
                    h.outcome.forecast.generation_mw if h.outcome.forecast else None
                ),
                publish_time=h.outcome.forecast.publish_time if h.outcome.forecast else None,
                lead_hours=(
                    round(h.outcome.forecast.lead.total_seconds() / 3600, 2)
                    if h.outcome.forecast
                    else None
                ),
                band_low_mw=_opt_mw(h.low_mw),
                band_high_mw=_opt_mw(h.high_mw),
                actual_mw=_opt_mw(h.outcome.actual_mw),
                error_mw=_opt_mw(h.outcome.sample.error_mw if h.outcome.sample else None),
            )
            for h in day.hours
        ],
        vintages=[
            s.VintageOut(
                publish_time=v.publish_time,
                points=[
                    s.VintagePoint(start_time=p.start_time, forecast_mw=_mw(p.generation_mw))
                    for p in v.points
                ],
            )
            for v in day.vintages
        ],
    )


def series(outcomes: dict[date, list[HourOutcome]], decision_time: time) -> s.SeriesOut:
    return s.SeriesOut(
        decision_time=hhmm(decision_time),
        days=[
            s.SeriesDay(
                delivery_date=day,
                start_time=hours[0].start_time,
                forecast_mw=[
                    _opt_mw(h.forecast.generation_mw if h.forecast else None) for h in hours
                ],
                actual_mw=[_opt_mw(h.actual_mw) for h in hours],
            )
            for day, hours in outcomes.items()
        ],
    )


def accuracy(report: AccuracyReport) -> s.AccuracyOut:
    scored = report.summary.n if report.summary else 0
    return s.AccuracyOut(
        decision_time=hhmm(report.decision_time),
        hours_expected=report.hours_expected,
        metrics=metrics(report.summary),
        by_day=[
            s.DayRow(
                delivery_date=d.delivery_date,
                publish_times=d.publish_times,
                forecast_gwh=_gwh(d.forecast_gwh),
                actual_gwh=_gwh(d.actual_gwh),
                metrics=metrics(d.summary),
            )
            for d in report.by_day
        ],
        by_hour=[s.HourRow(hour=h.hour, metrics=metrics(h.summary)) for h in report.by_hour],
        distribution=s.ErrorDistribution(
            bin_width_mw=report.histogram[0].upper - report.histogram[0].lower
            if report.histogram
            else 0.0,
            bins=[
                s.HistogramBin(lower_mw=b.lower, upper_mw=b.upper, count=b.count)
                for b in report.histogram
            ],
            p10_mw=_opt_mw(report.error_p10_mw),
            p50_mw=_opt_mw(report.error_p50_mw),
            p90_mw=_opt_mw(report.error_p90_mw),
        ),
        buffer=[
            s.BufferRow(
                confidence=b.confidence,
                buffer_mw=_mw(b.buffer_mw),
                breaches=b.breaches,
                breach_share=round(b.breaches / scored, 4) if scored else 0.0,
                shortfall_mwh=_mw(b.shortfall_mwh),
                out_of_sample_breaches=b.out_of_sample_breaches,
                out_of_sample_breach_share=(
                    round(b.out_of_sample_breaches / scored, 4) if scored else 0.0
                ),
            )
            for b in report.buffer
        ],
    )


def horizon(buckets: list[HorizonBucket]) -> s.HorizonOut:
    return s.HorizonOut(
        rows=[
            s.HorizonRow(
                lead_hour=b.lead_hour,
                n=b.n,
                mae_mw=_mw(b.mae_mw),
                bias_mw=_mw(b.bias_mw),
                p10_error_mw=_mw(b.p10_error_mw),
                p90_error_mw=_mw(b.p90_error_mw),
            )
            for b in buckets
        ]
    )


def timing(points: list[TimingPoint], step_minutes: int) -> s.TimingOut:
    return s.TimingOut(
        step_minutes=step_minutes,
        rows=[
            s.TimingRow(
                decision_time=hhmm(p.decision_time),
                median_forecast_age_minutes=p.median_forecast_age_minutes,
                metrics=metrics(p.summary),
            )
            for p in points
        ],
    )
