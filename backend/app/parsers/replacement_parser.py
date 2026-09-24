"""Парсер файла замен (zamena*.htm).

Структура описана в docs/PARSER_ANALYSIS.md §3:
блоки «Изменения в расписании на ДАТА (нечетный понедельник)»,
колонки: № группы | Название группы | Пары | Предмет | Преподаватель | кабинет.
"""
from __future__ import annotations

import logging
import re
from datetime import date

from bs4 import BeautifulSoup

from ..models.domain import Replacement, ReplacementBlock, TeacherRoom
from .html_utils import clean_cell, decode_bytes, expand_table_to_grid

log = logging.getLogger("parser.replacement")

HEADER_RE = re.compile(
    r"изменения\s+в\s+расписании\s+на\s+(\d{1,2}\.\d{1,2}\.\d{2,4})(?:\s*\(([^)]*)\))?",
    re.IGNORECASE,
)
_CANCEL_RE = re.compile(r"нет\s+пары|нет\s+занятий", re.IGNORECASE)
_FROM_PAIR_RE = re.compile(r"с\s+(\d)\s*пары", re.IGNORECASE)
_CAB_SECTION_RE = re.compile(r"кабинеты?", re.IGNORECASE)
_NAME_RE = re.compile(r"[а-яa-zё]", re.IGNORECASE)
_PAIRS_CELL_RE = re.compile(r"[\d\s,;]+")


def _parse_date(s: str) -> date | None:
    try:
        d, m, y = s.strip().split(".")
        y = int(y)
        if y < 100:
            y += 2000
        return date(y, int(m), int(d))
    except (ValueError, TypeError):
        return None


def parse_pairs_cell(raw: str) -> tuple[list[int], bool]:
    """Ячейка «Пары» -> (номера пар, весь_день).

    '1,2' -> ([1,2], False); 'с 4 пары' -> ([4,5,6], False);
    '' -> ([], True); '3' -> ([3], False).
    """
    v = clean_cell(raw)
    if not v or v == "-":
        return [], True
    m = _FROM_PAIR_RE.search(v)
    if m:
        start = int(m.group(1))
        return [p for p in range(start, 7) if 1 <= p <= 6], False
    nums: list[int] = []
    for part in re.split(r"[,\s;]+", v):
        m = re.search(r"\d+", part)
        if m:
            nums.append(int(m.group()))
    return [n for n in nums if 1 <= n <= 6], False


def parse_replacements(data: bytes) -> list[ReplacementBlock]:
    soup = BeautifulSoup(decode_bytes(data), "lxml")
    blocks: list[ReplacementBlock] = []
    current: ReplacementBlock | None = None
    section = "groups"  # groups | cabinets — секция внутри текущего блока
    skipped_rows = 0

    for table in soup.find_all("table"):
        grid = expand_table_to_grid(table)
        for row in grid:
            cells = [clean_cell(c) for c in row]
            joined = " ".join(c for c in cells if c)
            m = HEADER_RE.search(joined)
            if m:
                d = _parse_date(m.group(1))
                if d is None:
                    log.warning("Не распознана дата в заголовке блока замен: %r", joined[:80])
                    current = None
                    section = "groups"
                    continue
                paren = clean_cell(m.group(2) or "").lower()
                if "нечет" in paren:
                    parity = "odd"
                elif "чет" in paren:
                    parity = "even"
                else:
                    parity = None
                    log.warning("В заголовке замен %s нет чётности недели: %r", d, joined[:80])
                # заголовок стоит на объединённой ячейке с rowspan: его текст
                # продлевается на следующую строку сетки — не создаём дубль блока
                if (current is not None and current.date == d
                        and current.parity == parity and not current.replacements):
                    continue
                current = ReplacementBlock(date=d, parity=parity, day_word=paren)
                blocks.append(current)
                section = "groups"
                continue

            if current is None:
                continue

            # секция «Кабинеты»: пары | преподаватель | кабинет (может быть «ДО»)
            first = cells[0] if cells else ""
            if _CAB_SECTION_RE.fullmatch(first):
                section = "cabinets"
                continue

            if section == "cabinets":
                nn = [c for c in cells if c]
                if len(nn) >= 2 and _NAME_RE.search(nn[-2]):
                    room = nn[-1]
                    teacher = nn[-2]
                    pairs_raw = next((c for c in nn[:-2] if _PAIRS_CELL_RE.fullmatch(c)), "")
                    pairs, _whole = parse_pairs_cell(pairs_raw)
                    current.teacher_rooms.append(TeacherRoom(
                        teacher=teacher, pairs=pairs, classroom=room,
                    ))
                continue

            # строка данных: первая ячейка — № (число), вторая — название группы
            name = clean_cell(cells[1]) if len(cells) > 1 else ""
            if not re.fullmatch(r"\d{1,3}", first):
                continue
            if not name:
                skipped_rows += 1
                continue

            pairs_raw = clean_cell(row[2]) if len(row) > 2 else ""
            subject = clean_cell(row[3]) if len(row) > 3 else ""
            teacher = clean_cell(row[4]) if len(row) > 4 else ""
            classroom = clean_cell(row[5]) if len(row) > 5 else ""

            lesson_numbers, _whole_day = parse_pairs_cell(pairs_raw)
            is_cancel = bool(_CANCEL_RE.search(subject))
            current.replacements.append(Replacement(
                date=current.date,
                group=name,
                lesson_numbers=lesson_numbers,
                subject="" if is_cancel else subject,
                teacher=teacher,
                classroom=classroom,
                is_cancel=is_cancel,
                raw_pairs=pairs_raw,
                source_line=joined[:120],
            ))

    if skipped_rows:
        log.info("Пропущено служебных строк замен без названия группы: %d", skipped_rows)

    total = sum(len(b.replacements) for b in blocks)
    log.info("Parsed %d replacement blocks, %d rows", len(blocks), total)
    if not blocks:
        log.warning("Файл замен не содержит ни одного распознанного блока")
    return blocks
