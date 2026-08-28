"""Конфигурация приложения (.env / переменные окружения)."""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env", "backend/.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # источник данных
    schedule_page_url: str = "https://kasict.ru/students/schedule/"

    # кэш
    cache_ttl_minutes: int = 10
    cache_dir: str = "data/cache"

    # прочее
    log_level: str = "INFO"
    timezone: str = "Asia/Krasnoyarsk"

    # сборка фронтенда для production (FastAPI раздаёт статику), от корня проекта
    frontend_dist: str = "frontend/dist"


@lru_cache
def get_settings() -> Settings:
    return Settings()
