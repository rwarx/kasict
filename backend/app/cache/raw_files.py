"""Простой кэш сырых файлов расписания на диске.

Назначение:
  * не ходить на сайт колледжа при каждом запросе (TTL проверяет сервис);
  * переживать рестарты и недоступность сайта (отдаём последнее успешное).
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path

log = logging.getLogger("cache")


class RawFilesCache:
    def __init__(self, cache_dir: str | Path) -> None:
        self.dir = Path(cache_dir)
        self.dir.mkdir(parents=True, exist_ok=True)

    def _path(self, name: str) -> Path:
        return self.dir / f"{name}.htm"

    def read(self, name: str) -> bytes | None:
        p = self._path(name)
        try:
            return p.read_bytes()
        except OSError:
            return None

    def write(self, name: str, data: bytes) -> None:
        self._path(name).write_bytes(data)

    def meta(self) -> dict:
        try:
            return json.loads((self.dir / "meta.json").read_text("utf-8"))
        except (OSError, ValueError):
            return {}

    def save_meta(self, fetched_at: datetime, links: dict, source: str) -> None:
        (self.dir / "meta.json").write_text(
            json.dumps({
                "fetched_at": fetched_at.isoformat(),
                "links": links,
                "source": source,
            }, ensure_ascii=False, indent=1),
            "utf-8",
        )
