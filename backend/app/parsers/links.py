"""Поиск актуальных ссылок на файлы расписания на странице-указателе.

Имена файлов (Raspisanie_2025-2026.htm, zamena1.htm, ...) меняются,
поэтому ссылки каждый раз ищутся на https://kasict.ru/students/schedule/.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup

log = logging.getLogger("parser.links")

SCHEDULE_PAGE_URL = "https://kasict.ru/students/schedule/"
FALLBACK_RASPISANIE = SCHEDULE_PAGE_URL + "files/Raspisanie_2025-2026.htm"
FALLBACK_ZAMENA = SCHEDULE_PAGE_URL + "files/zamena1.htm"


@dataclass
class ScheduleLinks:
    page_url: str
    raspisanie: str
    zamena: str
    zamena_zaoch: str | None = None


async def discover_links(client: httpx.AsyncClient, page_url: str = SCHEDULE_PAGE_URL) -> ScheduleLinks:
    resp = await client.get(page_url)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "lxml")

    rasp = zam = zaoch = None
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if not re.search(r"\.html?(\?|#|$)", href, re.I):
            continue
        url = urljoin(str(resp.url), href)
        low = href.lower()
        if rasp is None and "raspisan" in low and "zaoch" not in low:
            rasp = url
        elif zaoch is None and "zaoch" in low:
            zaoch = url
        elif zam is None and "zamena" in low:
            zam = url

    links = ScheduleLinks(
        page_url=page_url,
        raspisanie=rasp or FALLBACK_RASPISANIE,
        zamena=zam or FALLBACK_ZAMENA,
        zamena_zaoch=zaoch,
    )
    if rasp is None or zam is None:
        log.warning("Ссылки найдены не полностью (rasp=%s, zam=%s), часть — fallback",
                    rasp is not None, zam is not None)
    return links
