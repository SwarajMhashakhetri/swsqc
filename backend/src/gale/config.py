"""Runtime configuration, read from ``GALE_*`` environment variables."""

from datetime import date
from functools import lru_cache
from pathlib import Path

from pydantic import Field, HttpUrl, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="GALE_", frozen=True)

    elexon_base_url: HttpUrl = HttpUrl("https://data.elexon.co.uk/bmrs/api/v1")
    http_timeout_s: float = Field(default=20.0, gt=0)
    http_retries: int = Field(default=3, ge=0, le=10)
    http_backoff_s: float = Field(default=0.5, ge=0)
    fetch_chunk_days: int = Field(default=7, ge=1, le=31)

    first_decision_date: date = date(2026, 1, 1)
    last_decision_date: date = date(2026, 1, 31)

    cache_max_age_s: int = Field(default=300, ge=0)
    cache_s_maxage_s: int = Field(default=86_400, ge=0)

    static_dir: Path | None = None
    log_level: str = "INFO"

    @model_validator(mode="after")
    def _check_scope(self) -> "Settings":
        if self.last_decision_date < self.first_decision_date:
            raise ValueError("last_decision_date must not precede first_decision_date")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
