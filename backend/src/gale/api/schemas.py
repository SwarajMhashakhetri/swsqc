"""Public response models for ``/api/v1``. Times are ISO 8601 UTC; MW and GWh are floats.

Error convention everywhere: ``error = forecast - actual``. Positive means the
forecast was too high (wind under-delivered), which leaves the desk short.
"""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class Schema(BaseModel):
    model_config = ConfigDict(frozen=True)


class ErrorBody(Schema):
    code: str
    message: str
    details: list[dict[str, str]] | None = None


class ErrorResponse(Schema):
    error: ErrorBody


class Health(Schema):
    status: str
    version: str


class Metrics(Schema):
    n: int = Field(description="Scored hours")
    mae_mw: float = Field(description="Mean absolute error")
    rmse_mw: float = Field(description="Root mean squared error")
    bias_mw: float = Field(description="Mean error (forecast - actual); positive = over-forecast")
    nmae_pct: float = Field(description="MAE as a percentage of mean actual generation")
    mean_actual_mw: float
    mean_forecast_mw: float
    p50_abs_error_mw: float
    p90_abs_error_mw: float


class DecisionPresetOut(Schema):
    id: str
    exchange: str
    auction: str
    decision_time: str = Field(description="UK local time on D-1, HH:MM")
    source_url: str


class PublishSlot(Schema):
    time: str = Field(description="UK local time of day, HH:MM")
    count: int


class CoverageOut(Schema):
    forecast_rows: int
    hindcast_rows_excluded: int
    publishes: int
    publish_times_of_day: list[PublishSlot]
    actual_periods: int
    expected_periods: int
    missing_periods: list[datetime]
    hours_without_actual: int


class Meta(Schema):
    source: str
    first_decision_date: date
    last_decision_date: date
    first_delivery_date: date
    last_delivery_date: date
    delivery_day: str
    publish_window_start: datetime
    publish_window_end: datetime
    loaded_at: datetime
    presets: list[DecisionPresetOut]
    coverage: CoverageOut


class HourPoint(Schema):
    start_time: datetime
    forecast_mw: float | None
    publish_time: datetime | None
    lead_hours: float | None
    band_low_mw: float | None = Field(description="Forecast minus January's P90 error at this lead")
    band_high_mw: float | None = Field(
        description="Forecast minus January's P10 error at this lead"
    )
    actual_mw: float | None = Field(description="Mean of the hour's two settlement periods")
    error_mw: float | None


class VintagePoint(Schema):
    start_time: datetime
    forecast_mw: float


class VintageOut(Schema):
    publish_time: datetime
    points: list[VintagePoint]


class PeakOut(Schema):
    start_time: datetime
    mw: float


class DecisionKpis(Schema):
    forecast_gwh: float | None
    forecast_p10_gwh: float | None = Field(description="Low end of the 80% daily energy range")
    forecast_p90_gwh: float | None = Field(description="High end of the 80% daily energy range")
    peak: PeakOut | None
    trough: PeakOut | None
    actual_gwh: float | None
    energy_error_gwh: float | None


class Provenance(Schema):
    publish_time: datetime | None = Field(description="Most recent publish used")
    publishes_used: list[datetime]
    minutes_before_decision: float | None
    lead_hours_min: float | None
    lead_hours_max: float | None
    hours_forecast: int
    hours_total: int


class DecisionOut(Schema):
    delivery_date: date
    decision_time: str
    decision_at: datetime
    window_start: datetime
    window_end: datetime
    provenance: Provenance
    kpis: DecisionKpis
    metrics: Metrics | None
    points: list[HourPoint]
    vintages: list[VintageOut]


class SeriesDay(Schema):
    delivery_date: date
    start_time: datetime = Field(
        description="First delivery hour (23:00 UK on D-1); value i covers the hour i hours later"
    )
    forecast_mw: list[float | None] = Field(
        description="Forecast on the desk at decision time, one value per delivery hour"
    )
    actual_mw: list[float | None] = Field(
        description="Outturn: mean of the hour's two settlement periods"
    )


class SeriesOut(Schema):
    decision_time: str
    days: list[SeriesDay]


class DayRow(Schema):
    delivery_date: date
    publish_times: list[datetime]
    forecast_gwh: float
    actual_gwh: float
    metrics: Metrics | None


class HourRow(Schema):
    hour: int = Field(description="UK clock hour the delivery hour starts at, in delivery order")
    metrics: Metrics | None


class HistogramBin(Schema):
    lower_mw: float
    upper_mw: float
    count: int


class ErrorDistribution(Schema):
    bin_width_mw: float
    bins: list[HistogramBin]
    p10_mw: float | None
    p50_mw: float | None
    p90_mw: float | None


class BufferRow(Schema):
    confidence: float = Field(description="Share of hours the buffer is meant to cover")
    buffer_mw: float = Field(description="Plan this far below the forecast")
    breaches: int = Field(description="January hours where actual fell below forecast - buffer")
    breach_share: float
    shortfall_mwh: float = Field(description="Energy short beyond the buffer, summed over breaches")
    out_of_sample_breaches: int = Field(
        description="Breaches when each day's buffer is estimated without that day"
    )
    out_of_sample_breach_share: float


class AccuracyOut(Schema):
    decision_time: str
    hours_expected: int
    metrics: Metrics | None
    by_day: list[DayRow]
    by_hour: list[HourRow]
    distribution: ErrorDistribution
    buffer: list[BufferRow]


class HorizonRow(Schema):
    lead_hour: int = Field(description="Whole hours between publish and the start of the hour")
    n: int
    mae_mw: float
    bias_mw: float
    p10_error_mw: float
    p90_error_mw: float


class HorizonOut(Schema):
    rows: list[HorizonRow]


class TimingRow(Schema):
    decision_time: str
    median_forecast_age_minutes: float | None
    metrics: Metrics | None


class TimingOut(Schema):
    step_minutes: int
    rows: list[TimingRow]
