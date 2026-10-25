"""Decision-day and accuracy analytics over one immutable dataset.

``Analytics`` is built once per dataset and is safe to share between requests:
it never mutates its inputs, and its lazily computed caches are deterministic.
"""

from bisect import bisect_left, bisect_right
from collections import Counter, defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from statistics import fmean, median

from gale.domain.alignment import hourly_actuals
from gale.domain.metrics import Bin, ErrorSummary, histogram, quantile, summarize
from gale.domain.models import ActualRow, ErrorSample, ForecastPoint, ForecastRow
from gale.domain.periods import (
    DELIVERY_DAY_OPENS,
    HALF_HOUR,
    Window,
    decision_instant,
    delivery_window,
    to_local,
)
from gale.domain.scope import VINTAGE_LOOKBACK
from gale.domain.selection import ForecastIndex

BAND_LOWER_Q = 0.1
BAND_UPPER_Q = 0.9
BAND_LEAD_HALF_WIDTH_H = 3.0
HISTOGRAM_BIN_MW = 500.0
BUFFER_CONFIDENCES = tuple(c / 100 for c in range(50, 100))
TIMING_STEP_MINUTES = 10
MWH_PER_GWH = 1000.0
LATEST_DECISION_MINUTE = DELIVERY_DAY_OPENS.hour * 60 + DELIVERY_DAY_OPENS.minute
# UK clock hours in delivery order: 23:00 first, 22:00 last.
DELIVERY_HOURS = tuple(sorted(range(24), key=lambda h: (h - DELIVERY_DAY_OPENS.hour) % 24))


@dataclass(frozen=True, slots=True)
class HourOutcome:
    """One delivery hour: what the desk saw (``forecast``) and what happened (``actual_mw``)."""

    start_time: datetime
    forecast: ForecastPoint | None
    actual_mw: float | None

    @property
    def sample(self) -> ErrorSample | None:
        """The scored pair, or ``None`` when either side is missing."""
        if self.forecast is None or self.actual_mw is None:
            return None
        return ErrorSample(
            self.start_time, self.forecast.publish_time, self.forecast.generation_mw, self.actual_mw
        )


@dataclass(frozen=True, slots=True)
class BandedHour:
    outcome: HourOutcome
    low_mw: float | None
    high_mw: float | None


@dataclass(frozen=True, slots=True)
class Vintage:
    publish_time: datetime
    points: list[ForecastPoint]


@dataclass(frozen=True, slots=True)
class EnergyOutlook:
    forecast_gwh: float
    low_gwh: float | None
    high_gwh: float | None


@dataclass(frozen=True, slots=True)
class DecisionDay:
    delivery_date: date
    decision_at: datetime
    window: Window
    hours: list[BandedHour]
    publishes_used: list[datetime]
    vintages: list[Vintage]
    energy: EnergyOutlook | None
    peak: ForecastPoint | None
    trough: ForecastPoint | None
    actual_gwh: float | None
    summary: ErrorSummary | None


@dataclass(frozen=True, slots=True)
class DayAccuracy:
    delivery_date: date
    publish_times: list[datetime]
    summary: ErrorSummary | None
    forecast_gwh: float
    actual_gwh: float


@dataclass(frozen=True, slots=True)
class HourOfDayAccuracy:
    hour: int
    summary: ErrorSummary | None


@dataclass(frozen=True, slots=True)
class BufferLevel:
    confidence: float
    buffer_mw: float
    breaches: int
    shortfall_mwh: float
    out_of_sample_breaches: int


@dataclass(frozen=True, slots=True)
class AccuracyReport:
    decision_time: time
    summary: ErrorSummary | None
    hours_expected: int
    by_day: list[DayAccuracy]
    by_hour: list[HourOfDayAccuracy]
    histogram: list[Bin]
    error_p10_mw: float | None
    error_p50_mw: float | None
    error_p90_mw: float | None
    buffer: list[BufferLevel]


@dataclass(frozen=True, slots=True)
class HorizonBucket:
    lead_hour: int
    n: int
    mae_mw: float
    bias_mw: float
    p10_error_mw: float
    p90_error_mw: float


@dataclass(frozen=True, slots=True)
class TimingPoint:
    decision_time: time
    summary: ErrorSummary | None
    median_forecast_age_minutes: float | None


@dataclass(frozen=True, slots=True)
class Coverage:
    forecast_rows: int
    hindcast_rows: int
    publishes: int
    publish_times_of_day: list[tuple[str, int]]
    actual_periods: int
    expected_periods: int
    missing_periods: list[datetime]
    hours_without_actual: int


class Analytics:
    def __init__(
        self,
        forecasts: Sequence[ForecastRow],
        actuals: Sequence[ActualRow],
        delivery_dates: Sequence[date],
    ) -> None:
        if not delivery_dates:
            raise ValueError("at least one delivery date is required")
        self.delivery_dates = sorted(delivery_dates)
        self._forecast_rows = list(forecasts)
        self._actual_rows = list(actuals)
        self._index = ForecastIndex(self._forecast_rows)
        self._hourly_actual = hourly_actuals(self._actual_rows)
        self._span = Window(
            delivery_window(self.delivery_dates[0]).start,
            delivery_window(self.delivery_dates[-1]).end,
        )
        self._horizon_samples: list[ErrorSample] | None = None
        self._band_cache: dict[int, tuple[float, float] | None] = {}
        self._timing: list[TimingPoint] | None = None

    # ---- selection -------------------------------------------------------

    def outcomes(self, delivery_day: date, decision_time: time) -> list[HourOutcome]:
        """Every hour of the delivery day with the forecast that was latest at decision time."""
        as_of = decision_instant(delivery_day, decision_time)
        return [
            HourOutcome(hour, self._index.latest(hour, as_of), self._hourly_actual.get(hour))
            for hour in delivery_window(delivery_day).hours()
        ]

    def samples(self, decision_time: time) -> dict[date, list[ErrorSample]]:
        """Scored hours per delivery day for one decision time."""
        return {day: _scored(self.outcomes(day, decision_time)) for day in self.delivery_dates}

    # ---- decision view ---------------------------------------------------

    def decision_day(self, delivery_day: date, decision_time: time) -> DecisionDay:
        as_of = decision_instant(delivery_day, decision_time)
        window = delivery_window(delivery_day)
        outcomes = self.outcomes(delivery_day, decision_time)
        points = [o.forecast for o in outcomes if o.forecast is not None]
        publishes_used = sorted({p.publish_time for p in points})
        actuals = [o.actual_mw for o in outcomes if o.actual_mw is not None]

        return DecisionDay(
            delivery_date=delivery_day,
            decision_at=as_of,
            window=window,
            hours=[self._with_band(outcome) for outcome in outcomes],
            publishes_used=publishes_used,
            vintages=self._vintages(window, as_of, publishes_used),
            energy=self._energy_outlook(points, decision_time, len(outcomes)),
            peak=max(points, key=lambda p: p.generation_mw, default=None),
            trough=min(points, key=lambda p: p.generation_mw, default=None),
            actual_gwh=sum(actuals) / MWH_PER_GWH if len(actuals) == len(outcomes) else None,
            summary=_summary(_scored(outcomes)),
        )

    def _vintages(
        self, window: Window, as_of: datetime, exclude: Sequence[datetime]
    ) -> list[Vintage]:
        """Earlier publishes from the 24 h before the decision, to show how the view moved."""
        vintages = []
        for publish in self._index.publishes_between(as_of - VINTAGE_LOOKBACK, as_of):
            if publish in exclude:
                continue
            points = [
                point
                for hour in window.hours()
                if (point := self._index.from_publish(hour, publish)) is not None
            ]
            if points:
                vintages.append(Vintage(publish, points))
        return vintages

    def _energy_outlook(
        self, points: Sequence[ForecastPoint], decision_time: time, hours_in_day: int
    ) -> EnergyOutlook | None:
        """Forecast energy for the day and its P10-P90 range from January's daily energy errors."""
        if not points:
            return None
        forecast_mwh = sum(p.generation_mw for p in points)
        daily_errors = sorted(self._daily_energy_errors(decision_time))
        if len(points) != hours_in_day or not daily_errors:
            return EnergyOutlook(forecast_mwh / MWH_PER_GWH, None, None)
        low = max(forecast_mwh - quantile(daily_errors, BAND_UPPER_Q), 0.0)
        high = forecast_mwh - quantile(daily_errors, BAND_LOWER_Q)
        return EnergyOutlook(forecast_mwh / MWH_PER_GWH, low / MWH_PER_GWH, high / MWH_PER_GWH)

    def _daily_energy_errors(self, decision_time: time) -> list[float]:
        """Whole-day energy error (MWh) for every fully observed delivery day."""
        errors = []
        for day in self.delivery_dates:
            outcomes = self.outcomes(day, decision_time)
            scored = _scored(outcomes)
            if len(scored) == len(outcomes):
                errors.append(sum(s.error_mw for s in scored))
        return errors

    def _with_band(self, outcome: HourOutcome) -> BandedHour:
        if outcome.forecast is None:
            return BandedHour(outcome, None, None)
        quantiles = self.error_quantiles_at_lead(outcome.forecast.lead)
        if quantiles is None:
            return BandedHour(outcome, None, None)
        q_low, q_high = quantiles
        value = outcome.forecast.generation_mw
        # error = forecast - actual, so a large positive error sits *below* the forecast.
        return BandedHour(outcome, max(value - q_high, 0.0), max(value - q_low, 0.0))

    def error_quantiles_at_lead(self, lead: timedelta) -> tuple[float, float] | None:
        """P10/P90 of January's errors for forecasts made within ±3 h of this lead time."""
        key = round(lead.total_seconds() / 60)
        if key not in self._band_cache:
            samples = self.horizon_samples()
            leads = [s.lead_hours for s in samples]
            centre = key / 60
            lo = bisect_left(leads, centre - BAND_LEAD_HALF_WIDTH_H)
            hi = bisect_right(leads, centre + BAND_LEAD_HALF_WIDTH_H)
            errors = sorted(s.error_mw for s in samples[lo:hi])
            self._band_cache[key] = (
                (quantile(errors, BAND_LOWER_Q), quantile(errors, BAND_UPPER_Q)) if errors else None
            )
        return self._band_cache[key]

    # ---- accuracy view ---------------------------------------------------

    def accuracy(self, decision_time: time) -> AccuracyReport:
        per_day = {day: self.outcomes(day, decision_time) for day in self.delivery_dates}
        scored = {day: _scored(rows) for day, rows in per_day.items()}
        everything = [s for rows in scored.values() for s in rows]
        errors = sorted(s.error_mw for s in everything)

        by_hour: defaultdict[int, list[ErrorSample]] = defaultdict(list)
        for sample in everything:
            by_hour[to_local(sample.start_time).hour].append(sample)

        return AccuracyReport(
            decision_time=decision_time,
            summary=_summary(everything),
            hours_expected=sum(len(rows) for rows in per_day.values()),
            by_day=[
                DayAccuracy(
                    delivery_date=day,
                    publish_times=sorted(
                        {o.forecast.publish_time for o in per_day[day] if o.forecast}
                    ),
                    summary=_summary(scored[day]),
                    forecast_gwh=sum(s.forecast_mw for s in scored[day]) / MWH_PER_GWH,
                    actual_gwh=sum(s.actual_mw for s in scored[day]) / MWH_PER_GWH,
                )
                for day in self.delivery_dates
            ],
            by_hour=[HourOfDayAccuracy(hour, _summary(by_hour[hour])) for hour in DELIVERY_HOURS],
            histogram=histogram(errors, HISTOGRAM_BIN_MW),
            error_p10_mw=quantile(errors, 0.1) if errors else None,
            error_p50_mw=quantile(errors, 0.5) if errors else None,
            error_p90_mw=quantile(errors, 0.9) if errors else None,
            buffer=buffer_table(scored),
        )

    # ---- horizon ---------------------------------------------------------

    def horizon_samples(self) -> list[ErrorSample]:
        """Every genuine forecast for a delivery hour in scope, sorted by lead time."""
        if self._horizon_samples is None:
            samples = [
                ErrorSample(row.start_time, row.publish_time, row.generation_mw, actual)
                for row in self._index.rows()
                if row.start_time in self._span
                and (actual := self._hourly_actual.get(row.start_time)) is not None
            ]
            samples.sort(key=lambda s: (s.lead_hours, s.start_time))
            self._horizon_samples = samples
        return self._horizon_samples

    def horizon(self) -> list[HorizonBucket]:
        """Error by whole hours of lead time, across every publish in scope."""
        buckets: defaultdict[int, list[float]] = defaultdict(list)
        for sample in self.horizon_samples():
            buckets[int(sample.lead_hours)].append(sample.error_mw)
        result = []
        for lead_hour in sorted(buckets):
            errors = sorted(buckets[lead_hour])
            result.append(
                HorizonBucket(
                    lead_hour=lead_hour,
                    n=len(errors),
                    mae_mw=fmean(abs(e) for e in errors),
                    bias_mw=fmean(errors),
                    p10_error_mw=quantile(errors, 0.1),
                    p90_error_mw=quantile(errors, 0.9),
                )
            )
        return result

    # ---- timing ----------------------------------------------------------

    def timing(self) -> list[TimingPoint]:
        """Accuracy if the decision were taken at each 10-minute step of D-1 before 23:00."""
        if self._timing is None:
            self._timing = [
                self._timing_point(time(minute // 60, minute % 60))
                for minute in range(0, LATEST_DECISION_MINUTE, TIMING_STEP_MINUTES)
            ]
        return self._timing

    def _timing_point(self, decision_time: time) -> TimingPoint:
        everything = [s for rows in self.samples(decision_time).values() for s in rows]
        ages = []
        for day in self.delivery_dates:
            as_of = decision_instant(day, decision_time)
            publish = self._index.latest_publish(as_of)
            if publish is not None:
                ages.append((as_of - publish).total_seconds() / 60)
        return TimingPoint(decision_time, _summary(everything), median(ages) if ages else None)

    # ---- coverage --------------------------------------------------------

    def coverage(self) -> Coverage:
        expected = []
        cursor = self._span.start
        while cursor < self._span.end:
            expected.append(cursor)
            cursor += HALF_HOUR
        present = {row.start_time for row in self._actual_rows}
        times_of_day = Counter(to_local(p).strftime("%H:%M") for p in self._index.publish_times)
        return Coverage(
            forecast_rows=len(self._forecast_rows),
            hindcast_rows=sum(1 for row in self._forecast_rows if not row.is_forecast),
            publishes=len(self._index.publish_times),
            publish_times_of_day=sorted(times_of_day.items()),
            actual_periods=sum(1 for t in expected if t in present),
            expected_periods=len(expected),
            missing_periods=[t for t in expected if t not in present],
            hours_without_actual=sum(
                1 for hour in self._span.hours() if hour not in self._hourly_actual
            ),
        )


def _scored(outcomes: Sequence[HourOutcome]) -> list[ErrorSample]:
    return [s for o in outcomes if (s := o.sample) is not None]


def _summary(samples: Sequence[ErrorSample]) -> ErrorSummary | None:
    return summarize([s.forecast_mw for s in samples], [s.actual_mw for s in samples])


def buffer_table(samples_by_day: dict[date, list[ErrorSample]]) -> list[BufferLevel]:
    """How far below the forecast to plan so that wind covers the plan ``c`` of the time.

    The buffer is the ``c`` quantile of the errors, so its in-sample breach rate
    is ``1 - c`` by construction. The out-of-sample count re-estimates the buffer
    without each delivery day in turn and counts that day's breaches: the honest
    estimate of how the rule would have performed on a day it had not seen.
    """
    per_day = {day: [s.error_mw for s in rows] for day, rows in samples_by_day.items() if rows}
    all_errors = sorted(e for errs in per_day.values() for e in errs)
    if not all_errors:
        return []
    held_out = {
        day: sorted(e for other, errs in per_day.items() if other != day for e in errs)
        for day in per_day
    }
    table = []
    for confidence in BUFFER_CONFIDENCES:
        buffer = quantile(all_errors, confidence)
        exceedances = [e - buffer for e in all_errors if e > buffer]
        out_of_sample = 0
        for day, errs in per_day.items():
            if held_out[day]:
                day_buffer = quantile(held_out[day], confidence)
                out_of_sample += sum(1 for e in errs if e > day_buffer)
        table.append(
            BufferLevel(
                confidence=confidence,
                buffer_mw=buffer,
                breaches=len(exceedances),
                shortfall_mwh=sum(exceedances),
                out_of_sample_breaches=out_of_sample,
            )
        )
    return table
