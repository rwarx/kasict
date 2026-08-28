"""Schedule Service: скачивание, кэш (TTL + stale-fallback), сборка дня.

Слои: fetcher (http) -> parsers -> здесь кэш/чётность/движок замен.
Telegram-бот или другой клиент могут использовать этот сервис напрямую,
не парся сайт самостоятельно.
"""
from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import httpx

from ..cache.raw_files import RawFilesCache
from ..config import Settings
from ..models.domain import BaseSchedule, DaySchedule, ReplacementBlock
from ..parsers.links import ScheduleLinks, discover_links
from ..parsers.replacement_parser import parse_replacements
from ..parsers.schedule_parser import normalized_group_names, parse_schedule
from .parity import ParityResolver
from .replacement_engine import apply_day

log = logging.getLogger("service")

Fetcher = Callable[[str], Awaitable[bytes]]


class ScheduleService:
    def __init__(self, settings: Settings, fetcher: Fetcher | None = None) -> None:
        self.settings = settings
        self.cache = RawFilesCache(Path(settings.cache_dir))
        self._fetcher = fetcher or self._default_fetcher
        self._links: ScheduleLinks | None = None
        self._schedule: BaseSchedule | None = None
        self._blocks: list[ReplacementBlock] = []
        self._parity = ParityResolver()
        self._fetched_at: datetime | None = None
        self._fetch_error: str | None = None
        self._warnings: list[str] = []
        self._lock = asyncio.Lock()
        self._load_from_cache()

    # ---------- загрузка ----------

    @staticmethod
    async def _default_fetcher(url: str) -> bytes:
        async with httpx.AsyncClient(
            timeout=30, follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (compatible; college-schedule-app)"},
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.content

    def _load_from_cache(self) -> None:
        meta = self.cache.meta()
        raw_rasp = self.cache.read("raspisanie")
        raw_zam = self.cache.read("zamena")
        if raw_rasp is None:
            return
        try:
            self._apply_raw(raw_rasp, raw_zam)
            fetched = meta.get("fetched_at")
            if fetched:
                self._fetched_at = datetime.fromisoformat(fetched)
            if meta.get("links"):
                links = meta["links"]
                self._links = ScheduleLinks(
                    page_url=self.settings.schedule_page_url,
                    raspisanie=links.get("raspisanie", ""),
                    zamena=links.get("zamena", ""),
                    zamena_zaoch=links.get("zamena_zaoch"),
                )
            log.info("Кэш загружен с диска: groups=%d blocks=%d fetched_at=%s",
                     len(self._schedule.groups) if self._schedule else 0,
                     len(self._blocks), self._fetched_at)
        except Exception:
            log.exception("Не удалось загрузить кэш с диска — игнорирую его")

    def _apply_raw(self, raw_rasp: bytes, raw_zam: bytes | None) -> None:
        schedule = parse_schedule(raw_rasp)
        blocks = parse_replacements(raw_zam) if raw_zam else []
        parity = ParityResolver()
        for b in blocks:
            if b.parity:
                parity.calibrate(b.date, b.parity)
        self._schedule = schedule
        self._blocks = blocks
        self._parity = parity
        self._warnings = list(parity.warnings)

    # ---------- обновление ----------

    def _is_stale(self) -> bool:
        if self._fetched_at is None:
            return True
        ttl = timedelta(minutes=self.settings.cache_ttl_minutes)
        return datetime.now(timezone.utc) - self._fetched_at.replace(
            tzinfo=timezone.utc) >= ttl

    async def refresh_if_stale(self) -> None:
        """Обновляет данные, если кэш протух. Один параллельный проход."""
        if not self._is_stale():
            return
        async with self._lock:
            if not self._is_stale():  # пока ждали лок — другой корутины обновила
                return
            await self._fetch_and_apply()

    async def _fetch_and_apply(self) -> None:
        now = datetime.now(timezone.utc)
        try:
            if self._links is None:
                page = self.settings.schedule_page_url
                try:
                    async with httpx.AsyncClient(
                        timeout=30, follow_redirects=True,
                        headers={"User-Agent": "Mozilla/5.0"},
                    ) as client:
                        self._links = await discover_links(client, page)
                except Exception as e:
                    log.warning("Страница-указатель недоступна (%s); "
                                "использую ссылки из кэша/fallback", e)
                    self._links = ScheduleLinks(
                        page_url=self.settings.schedule_page_url, raspisanie="",
                        zamena="",
                    )
                    meta = self.cache.meta().get("links", {})
                    self._links.raspisanie = meta.get(
                        "raspisanie") or "https://kasict.ru/students/schedule/files/Raspisanie_2025-2026.htm"
                    self._links.zamena = meta.get(
                        "zamena") or "https://kasict.ru/students/schedule/files/zamena1.htm"

            urls = {
                "raspisanie": self._links.raspisanie,
                "zamena": self._links.zamena,
            }
            raw: dict[str, bytes] = {}
            for name, url in urls.items():
                try:
                    raw[name] = await self._fetcher(url)
                except Exception as e:
                    log.error("Failed to download %s (%s): %s", name, url, e)

            if "raspisanie" not in raw:
                # основное расписание обязательно; отдаём stale, если есть
                self._fetch_error = "основное расписание недоступно"
                if self._schedule is not None:
                    log.warning("Отдаю устаревшие данные: %s", self._fetch_error)
                    return
                raise RuntimeError("Нет ни свежих данных, ни кэша основного расписания")

            self._apply_raw(raw["raspisanie"], raw.get("zamena"))
            for name, data in raw.items():
                self.cache.write(name, data)
            self._fetched_at = now
            self._fetch_error = None
            self.cache.save_meta(now, {
                "raspisanie": self._links.raspisanie,
                "zamena": self._links.zamena,
                "zamena_zaoch": self._links.zamena_zaoch,
            }, "kasict.ru")
            log.info("Данные обновлены %s", now.isoformat(timespec="seconds"))
        except Exception:
            self._fetch_error = "ошибка обновления данных"
            log.exception("Failed to refresh schedule data")

    # ---------- запросы ----------

    @property
    def ready(self) -> bool:
        return self._schedule is not None

    def groups(self) -> list[dict]:
        if self._schedule is None:
            return []
        return sorted(
            ({"name": g.name, "number": g.number} for g in self._schedule.groups.values()),
            key=lambda g: g["name"],
        )

    def resolve_group(self, query: str) -> str | None:
        """Каноническое имя группы по любому написанию ('сзс24-4' -> 'СЗС 24-4')."""
        if self._schedule is None:
            return None
        names = normalized_group_names(self._schedule)
        import re
        q = re.sub(r"[\s\-–—.]+", "", query).upper()
        if q in names:
            return names[q]
        for norm, canon in names.items():
            if q in norm:
                return canon
        return None

    def day(self, group_query: str, d: date) -> DaySchedule | None:
        """Итоговое расписание группы на дату (с заменами)."""
        if self._schedule is None:
            return None
        group = self.resolve_group(group_query)
        if group is None:
            return None
        parity = self._parity.parity(d)
        replacements = [r for b in self._blocks if b.date == d for r in b.replacements]
        day = apply_day(self._schedule, group, d, parity, replacements)
        day.warnings.extend(self._warnings)
        return day

    def replacement_dates(self) -> list[date]:
        return sorted({b.date for b in self._blocks})

    def info(self) -> dict:
        return {
            "last_update": self._fetched_at,
            "stale": self._is_stale(),
            "fetch_error": self._fetch_error,
            "groups_count": len(self._schedule.groups) if self._schedule else 0,
            "replacement_dates": [b.isoformat() for b in self.replacement_dates()],
            "warnings": self._warnings,
        }
