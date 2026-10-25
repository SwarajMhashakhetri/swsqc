"""App wiring: static frontend serving, configuration and logging."""

import json
import logging
from datetime import date
from pathlib import Path

import httpx
import pytest
from pydantic import ValidationError

from gale.config import Settings
from gale.main import create_app
from gale.observability import JsonFormatter
from tests.test_api import FakeRepository

pytestmark = pytest.mark.anyio


@pytest.fixture
def static_dir(tmp_path: Path) -> Path:
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<!doctype html><title>Gale</title>")
    (tmp_path / "assets" / "app-1a2b3c.js").write_text("console.log('gale')")
    return tmp_path


async def test_frontend_is_served_next_to_the_api(static_dir: Path) -> None:
    app = create_app(Settings(static_dir=static_dir), repository=FakeRepository())
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://gale.test") as http:
        index = await http.get("/")
        asset = await http.get("/assets/app-1a2b3c.js")
        health = await http.get("/api/health")
    assert index.status_code == 200
    assert "<title>Gale</title>" in index.text
    assert index.headers["cache-control"] == "no-cache"
    assert asset.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert health.headers["cache-control"] == "no-store"


def test_missing_frontend_build_fails_fast(tmp_path: Path) -> None:
    with pytest.raises(RuntimeError, match=r"no index\.html"):
        create_app(Settings(static_dir=tmp_path), repository=FakeRepository())


def test_settings_reject_inverted_scope() -> None:
    with pytest.raises(ValidationError, match="must not precede"):
        Settings(first_decision_date=date(2026, 2, 1), last_decision_date=date(2026, 1, 1))


def test_settings_read_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GALE_HTTP_RETRIES", "5")
    monkeypatch.setenv("GALE_LAST_DECISION_DATE", "2026-01-10")
    settings = Settings()
    assert settings.http_retries == 5
    assert settings.last_decision_date == date(2026, 1, 10)


def test_logs_are_single_line_json_with_extra_fields() -> None:
    record = logging.LogRecord("gale.test", logging.INFO, __file__, 1, "hello %s", ("desk",), None)
    record.path = "/api/v1/meta"
    line = JsonFormatter().format(record)
    payload = json.loads(line)
    assert payload["msg"] == "hello desk"
    assert payload["path"] == "/api/v1/meta"
    assert payload["level"] == "info"
