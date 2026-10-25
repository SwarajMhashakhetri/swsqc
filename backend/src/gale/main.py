"""Application factory. ``gale.main:app`` is the ASGI entrypoint for uvicorn and Vercel."""

import logging
import time as clock
import uuid
from collections.abc import Awaitable, Callable
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles

from gale import __version__
from gale.api.errors import install_error_handlers
from gale.api.routes import router
from gale.config import Settings, get_settings
from gale.observability import configure_logging
from gale.repository import ElexonRepository, WindRepository

logger = logging.getLogger("gale.http")
HEALTH_PATH = "/api/health"

DESCRIPTION = """
Decision support for buying GB day-ahead power around wind.

* **Forecasts**: Elexon `WINDFOR`, hourly, published ~8 times a day.
* **Actuals**: Elexon `FUELHH` with `fuelType=WIND`, half-hourly.
* **Scope**: decisions taken 1-31 January 2026, i.e. delivery days 2 January - 1 February.
* **Errors** are `forecast - actual`: positive means wind under-delivered.
"""


def create_app(
    settings: Settings | None = None, repository: WindRepository | None = None
) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)
    app = FastAPI(
        title="Gale API",
        version=__version__,
        description=DESCRIPTION,
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
    )
    app.state.repository = repository or ElexonRepository(settings)
    install_error_handlers(app)
    app.include_router(router)
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.middleware("http")(_access_log)
    if settings.static_dir is not None:
        _mount_frontend(app, settings.static_dir)
    return app


async def _access_log(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
    started = clock.perf_counter()
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    if request.url.path == HEALTH_PATH:
        return response
    logger.info(
        "request",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "ms": round((clock.perf_counter() - started) * 1000, 1),
        },
    )
    return response


def _mount_frontend(app: FastAPI, directory: Path) -> None:
    """Serve the built single-page app from the same origin as the API (Docker deployments)."""
    if not (directory / "index.html").is_file():
        raise RuntimeError(f"static_dir {directory} has no index.html; build the frontend first")

    @app.middleware("http")
    async def _static_cache(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        response = await call_next(request)
        path = request.url.path
        if path.startswith("/assets/"):
            # Vite fingerprints asset filenames, so they can be cached forever.
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        elif not path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-cache")
        return response

    app.mount("/", StaticFiles(directory=directory, html=True), name="frontend")


app = create_app()
