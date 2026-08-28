"""Генерация статических JSON-файлов для PWA.

Скачивает HTML с kasict.ru, парсит расписание и замены,
записывает JSON в frontend/public/data/.
"""
from __future__ import annotations

import json
import logging
import re
import sys
from datetime import date, datetime
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)-7s %(message)s")
log = logging.getLogger("generate")

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from app.parsers.replacement_parser import parse_replacements
from app.parsers.schedule_parser import parse_schedule
from app.services.parity import ParityResolver
from app.models.domain import (
    PAIR_NUMBERS, PAIR_TIMES, BaseSchedule, ReplacementBlock,
)

OUTPUT_DIR = ROOT / "frontend" / "public" / "data"


def fetch_url(url: str) -> bytes:
    """Download a URL and return raw bytes."""
    import httpx
    log.info("Fetching %s", url)
    resp = httpx.get(url, timeout=30, follow_redirects=True)
    resp.raise_for_status()
    return resp.content


def build_schedule_json(schedule: BaseSchedule, parity_resolver: ParityResolver) -> dict:
    """Convert BaseSchedule to a JSON-serializable dict."""
    groups = {}
    for name, info in schedule.groups.items():
        groups[name] = {"name": info.name, "number": info.number}

    lessons = {}
    teachers: dict[str, list[dict]] = {}
    for group, days in schedule.lessons.items():
        lessons[group] = {}
        for weekday, pairs in days.items():
            lessons[group][str(weekday)] = {}
            for pair_num, wl in pairs.items():
                entry = {}
                if wl.odd and not wl.odd.is_empty():
                    entry["odd"] = {
                        "subject": wl.odd.subject,
                        "teacher": wl.odd.teacher,
                        "classroom": wl.odd.classroom,
                    }
                    if wl.odd.teacher:
                        teachers.setdefault(wl.odd.teacher, []).append({
                            "group": group, "weekday": weekday,
                            "pair": pair_num, "subject": wl.odd.subject,
                            "classroom": wl.odd.classroom, "parity": "odd",
                        })
                if wl.even and not wl.even.is_empty():
                    entry["even"] = {
                        "subject": wl.even.subject,
                        "teacher": wl.even.teacher,
                        "classroom": wl.even.classroom,
                    }
                    if wl.even.teacher:
                        teachers.setdefault(wl.even.teacher, []).append({
                            "group": group, "weekday": weekday,
                            "pair": pair_num, "subject": wl.even.subject,
                            "classroom": wl.even.classroom, "parity": "even",
                        })
                lessons[group][str(weekday)][str(pair_num)] = entry

    return {
        "groups": groups,
        "lessons": lessons,
        "teachers": dict(sorted(teachers.items())),
        "pair_times": {str(k): list(v) for k, v in PAIR_TIMES.items()},
        "pair_numbers": list(PAIR_NUMBERS),
    }


def build_replacements_json(blocks: list[ReplacementBlock]) -> list:
    """Convert ReplacementBlocks to a JSON-serializable list."""
    result = []
    for block in blocks:
        entries = []
        for rep in block.replacements:
            entries.append({
                "group": rep.group,
                "lesson_numbers": rep.lesson_numbers,
                "subject": rep.subject,
                "teacher": rep.teacher,
                "classroom": rep.classroom,
                "is_cancel": rep.is_cancel,
                "raw_pairs": rep.raw_pairs,
            })
        result.append({
            "date": block.date.isoformat(),
            "parity": block.parity,
            "day_word": block.day_word,
            "replacements": entries,
        })
    return result


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Discover links from schedule page
    import httpx
    SCHEDULE_PAGE = "https://kasict.ru/students/schedule/"
    FALLBACK_RASP = SCHEDULE_PAGE + "files/Raspisanie_2025-2026.htm"
    FALLBACK_ZAM = SCHEDULE_PAGE + "files/zamena1.htm"

    raspisanie_url = FALLBACK_RASP
    zamena_url = FALLBACK_ZAM

    try:
        page_html = httpx.get(SCHEDULE_PAGE, timeout=30, follow_redirects=True).content
        from bs4 import BeautifulSoup
        from urllib.parse import urljoin
        soup = BeautifulSoup(decode_bytes(page_html), "lxml")
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if not re.search(r"\.html?(\?|#|$)", href, re.I):
                continue
            url = urljoin(SCHEDULE_PAGE, href)
            low = href.lower()
            if "raspisan" in low and "zaoch" not in low:
                raspisanie_url = url
            elif "zamena" in low and "zaoch" not in low:
                zamena_url = url
        log.info("Discovered: raspisanie=%s zamena=%s", raspisanie_url, zamena_url)
    except Exception as e:
        log.warning("Failed to discover links, using fallbacks: %s", e)

    # 2. Fetch & parse schedule
    schedule_bytes = fetch_url(raspisanie_url)
    schedule = parse_schedule(schedule_bytes)
    log.info("Parsed %d groups, schedule days=%d",
             len(schedule.groups),
             sum(len(d) for d in schedule.lessons.values()))

    # 3. Fetch & parse replacements
    zamena_bytes = fetch_url(zamena_url)
    blocks = parse_replacements(zamena_bytes)
    log.info("Parsed %d replacement blocks", len(blocks))

    # 4. Parity resolver
    resolver = ParityResolver()
    for block in blocks:
        resolver.calibrate(block.date, block.parity)

    # 5. Generate JSON
    schedule_json = build_schedule_json(schedule, resolver)
    replacements_json = build_replacements_json(blocks)

    # 6. Write files
    (OUTPUT_DIR / "schedule.json").write_text(
        json.dumps(schedule_json, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (OUTPUT_DIR / "replacements.json").write_text(
        json.dumps(replacements_json, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    meta = {
        "updated_at": datetime.now().isoformat(),
        "groups_count": len(schedule.groups),
        "replacement_dates": [b.date.isoformat() for b in blocks],
        "raspisanie_url": raspisanie_url,
        "zamena_url": zamena_url,
    }
    (OUTPUT_DIR / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    log.info("Written: %s", OUTPUT_DIR)
    log.info("Done!")


if __name__ == "__main__":
    main()
