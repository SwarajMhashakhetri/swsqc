"""``/api`` routes. Handlers stay thin: validate, fetch the dataset, call the domain, present."""

import re
from datetime import date, time
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response
from starlette.concurrency import run_in_threadpool

from gale import __version__
from gale.api import presenters
from gale.api import schemas as s
from gale.api.errors import InvalidRequestError
from gale.config import Settings, get_settings
from gale.domain.analysis import TIMING_STEP_MINUTES
from gale.domain.markets import DECISION_PRESETS
from gale.repository import Dataset, WindRepository

DECISION_TIME_PATTERN = r"^([01]\d|2[0-2]):[0-5]\d$"
DECISION_TIME_DOC = (
    "UK local time on the day before delivery, HH:MM. Must be before 23:00, when the"
    " delivery day opens. EPEX SPOT closes at 09:20, Nord Pool N2EX at 09:50."
)
ERRORS: dict[int | str, dict[str, object]] = {
    422: {"model": s.ErrorResponse, "description": "Invalid parameters"},
    502: {"model": s.ErrorResponse, "description": "Elexon BMRS unavailable"},
}

router = APIRouter(prefix="/api")


def get_repository(request: Request) -> WindRepository:
    repository: WindRepository = request.app.state.repository
    return repository


async def get_dataset(
    repository: Annotated[WindRepository, Depends(get_repository)],
) -> Dataset:
    return await repository.dataset()


def cacheable(response: Response, settings: Annotated[Settings, Depends(get_settings)]) -> None:
    """January 2026 is history: let browsers keep it briefly and the CDN keep it for a day."""
    response.headers["Cache-Control"] = (
        f"public, max-age={settings.cache_max_age_s}, s-maxage={settings.cache_s_maxage_s},"
        f" stale-while-revalidate={settings.cache_s_maxage_s}"
    )


DatasetDep = Annotated[Dataset, Depends(get_dataset)]
DecisionTime = Annotated[
    str, Query(pattern=DECISION_TIME_PATTERN, description=DECISION_TIME_DOC, examples=["09:20"])
]


def parse_decision_time(value: str) -> time:
    match = re.fullmatch(DECISION_TIME_PATTERN, value)
    if match is None:
        raise InvalidRequestError("decision_time must be HH:MM before 23:00")
    hours, minutes = value.split(":")
    return time(int(hours), int(minutes))


@router.get("/health", response_model=s.Health, summary="Liveness probe (no upstream calls)")
def health(response: Response) -> s.Health:
    response.headers["Cache-Control"] = "no-store"
    return s.Health(status="ok", version=__version__)


@router.get(
    "/v1/meta",
    response_model=s.Meta,
    responses=ERRORS,
    dependencies=[Depends(cacheable)],
    summary="Scope, market presets and data coverage",
)
async def meta(dataset: DatasetDep) -> s.Meta:
    return await run_in_threadpool(presenters.meta, dataset, DECISION_PRESETS)


@router.get(
    "/v1/decision",
    response_model=s.DecisionOut,
    responses=ERRORS,
    dependencies=[Depends(cacheable)],
    summary="The forecast on the desk at decision time for one delivery day",
)
async def decision(
    dataset: DatasetDep,
    delivery_date: Annotated[date, Query(description="Delivery day D", examples=["2026-01-15"])],
    decision_time: DecisionTime = "09:20",
) -> s.DecisionOut:
    when = parse_decision_time(decision_time)
    days = dataset.scope.delivery_dates
    if not days[0] <= delivery_date <= days[-1]:
        raise InvalidRequestError(
            f"delivery_date must be between {days[0].isoformat()} and {days[-1].isoformat()}"
        )
    day = await run_in_threadpool(dataset.analytics.decision_day, delivery_date, when)
    return presenters.decision(day, when)


@router.get(
    "/v1/series",
    response_model=s.SeriesOut,
    responses=ERRORS,
    dependencies=[Depends(cacheable)],
    summary="Hourly forecast at one decision time and outturn, for every delivery day",
)
async def series(dataset: DatasetDep, decision_time: DecisionTime = "09:20") -> s.SeriesOut:
    when = parse_decision_time(decision_time)
    analytics = dataset.analytics
    outcomes = await run_in_threadpool(
        lambda: {day: analytics.outcomes(day, when) for day in analytics.delivery_dates}
    )
    return presenters.series(outcomes, when)


@router.get(
    "/v1/accuracy",
    response_model=s.AccuracyOut,
    responses=ERRORS,
    dependencies=[Depends(cacheable)],
    summary="January accuracy of the forecast available at one decision time",
)
async def accuracy(dataset: DatasetDep, decision_time: DecisionTime = "09:20") -> s.AccuracyOut:
    when = parse_decision_time(decision_time)
    report = await run_in_threadpool(dataset.analytics.accuracy, when)
    return presenters.accuracy(report)


@router.get(
    "/v1/horizon",
    response_model=s.HorizonOut,
    responses=ERRORS,
    dependencies=[Depends(cacheable)],
    summary="Error against lead time, across every January publish",
)
async def horizon(dataset: DatasetDep) -> s.HorizonOut:
    return presenters.horizon(await run_in_threadpool(dataset.analytics.horizon))


@router.get(
    "/v1/timing",
    response_model=s.TimingOut,
    responses=ERRORS,
    dependencies=[Depends(cacheable)],
    summary="Accuracy as a function of decision time on D-1",
)
async def timing(dataset: DatasetDep) -> s.TimingOut:
    points = await run_in_threadpool(dataset.analytics.timing)
    return presenters.timing(points, TIMING_STEP_MINUTES)
