"""Uniform JSON error envelope. Internals (tracebacks, upstream URLs) never reach clients."""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from gale.api.schemas import ErrorBody, ErrorResponse
from gale.elexon.client import ElexonError

logger = logging.getLogger(__name__)

NO_STORE = {"Cache-Control": "no-store"}


class InvalidRequestError(ValueError):
    """A syntactically valid request that falls outside what Gale can answer."""


def _error(
    status: int, code: str, message: str, details: list[dict[str, str]] | None = None
) -> JSONResponse:
    body = ErrorResponse(error=ErrorBody(code=code, message=message, details=details))
    return JSONResponse(body.model_dump(exclude_none=True), status_code=status, headers=NO_STORE)


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            {"field": ".".join(str(part) for part in err["loc"][1:]), "message": str(err["msg"])}
            for err in exc.errors()
        ]
        return _error(422, "invalid_request", "Check the query parameters.", details)

    @app.exception_handler(InvalidRequestError)
    async def _invalid(_: Request, exc: InvalidRequestError) -> JSONResponse:
        return _error(422, "invalid_request", str(exc))

    @app.exception_handler(ElexonError)
    async def _upstream(request: Request, exc: ElexonError) -> JSONResponse:
        logger.warning("upstream failure", extra={"path": request.url.path, "reason": str(exc)})
        return _error(
            502, "upstream_unavailable", "Elexon BMRS is not responding. Try again shortly."
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = "not_found" if exc.status_code == 404 else "http_error"
        return _error(exc.status_code, code, str(exc.detail))

    @app.exception_handler(Exception)
    async def _unexpected(request: Request, exc: Exception) -> JSONResponse:
        logger.error("unhandled error", extra={"path": request.url.path}, exc_info=exc)
        return _error(500, "internal_error", "Something went wrong on our side.")
