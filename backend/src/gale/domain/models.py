"""Core value types. All datetimes are timezone-aware UTC."""

from dataclasses import dataclass
from datetime import datetime, timedelta


@dataclass(frozen=True, slots=True)
class ForecastRow:
    """One hourly point of one WINDFOR publish."""

    publish_time: datetime
    start_time: datetime
    generation_mw: float

    @property
    def lead(self) -> timedelta:
        return self.start_time - self.publish_time

    @property
    def is_forecast(self) -> bool:
        """False for hindcast rows: an hour that had already begun when the publish went out."""
        return self.start_time >= self.publish_time


@dataclass(frozen=True, slots=True)
class ActualRow:
    """One half-hourly FUELHH wind outturn value (average MW over the settlement period)."""

    start_time: datetime
    publish_time: datetime
    generation_mw: float


@dataclass(frozen=True, slots=True)
class ForecastPoint:
    """The forecast value selected for one delivery hour, with its provenance."""

    start_time: datetime
    publish_time: datetime
    generation_mw: float

    @property
    def lead(self) -> timedelta:
        return self.start_time - self.publish_time


@dataclass(frozen=True, slots=True)
class ErrorSample:
    """A forecast compared with its outturn for one hour. ``error = forecast - actual``."""

    start_time: datetime
    publish_time: datetime
    forecast_mw: float
    actual_mw: float

    @property
    def error_mw(self) -> float:
        return self.forecast_mw - self.actual_mw

    @property
    def lead_hours(self) -> float:
        return (self.start_time - self.publish_time).total_seconds() / 3600
