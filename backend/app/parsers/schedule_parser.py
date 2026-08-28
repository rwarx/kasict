"""Парсер основного расписания (Raspisanie_*.htm).

Структура файла описана в docs/PARSER_ANALYSIS.md §2:
шапка «ДНИ» + группы блоками по 3 колонки, дни вертикальными буквами,
на каждую пару 2 строки (предмет+кабинет / учитель), «X/Y» — числитель/знаменатель.
"""
from __future__ import annotations

import logging
import re

from bs4 import BeautifulSoup

from ..models.domain import BaseSchedule, GroupInfo, Lesson, WeekLesson
from .html_utils import cell, clean_cell, decode_bytes, expand_table_to_grid

log = logging.getLogger("parser.schedule")

DAY_NAMES = ("ПОНЕДЕЛЬНИК", "ВТОРНИК", "СРЕДА", "ЧЕТВЕРГ", "ПЯТНИЦА", "СУББОТА")

_HEADER_CELL = "ДНИ"
_GROUP_RE = re.compile(r"^[А-Яа-яA-Za-z][А-Яа-яA-Za-z ]*\d{2}-\d+[А-Яа-яA-Za-z]*$")


def _norm_group(name: str) -> str:
    return re.sub(r"[\s\-–—.]+", "", (name or "")).upper()


def split_week_value(value: str) -> tuple[str, str]:
    """'общ./-' -> ('общ.', '-'); 'мат.' -> ('мат.', 'мат.'), '' -> ('', '')."""
    v = (value or "").strip()
    if "/" in v:
        a, b = v.split("/", 1)
        return a.strip(), b.strip()
    return v, v


def _lesson_from_parts(subject: str, teacher: str, classroom: str, parity: str) -> Lesson | None:
    s = split_week_value(subject)[0 if parity == "odd" else 1]
    t = split_week_value(teacher)[0 if parity == "odd" else 1]
    r = split_week_value(classroom)[0 if parity == "odd" else 1]
    s, t, r = ("" if x == "-" else x for x in (s, t, r))
    lesson = Lesson(subject=s, teacher=t, classroom=r)
    return None if lesson.is_empty() else lesson


def _find_header_row(grid: list[list[str]]) -> int:
    for r, row in enumerate(grid):
        if row and row[0] == _HEADER_CELL:
            return r
    return -1


def _parse_groups(grid: list[list[str]], header_row: int) -> dict[str, GroupInfo]:
    """Группы идут блоками по 3 колонки: [имя][№][пусто]."""
    groups: dict[str, GroupInfo] = {}
    row = grid[header_row]
    c = 1
    while c < len(row):
        name = row[c]
        if _GROUP_RE.match(clean_cell(name)):
            number_raw = cell(grid, header_row, c + 1)
            try:
                number = int(number_raw)
            except ValueError:
                number = 0
            groups[clean_cell(name)] = GroupInfo(name=clean_cell(name), number=number)
            c += 3
        else:
            c += 1
    return groups


def _day_blocks(grid: list[list[str]], header_row: int) -> list[tuple[int, list[int], str]]:
    """Возвращает [(weekday, [строки пар], слово_из_букв)] для каждого дня."""
    pair_rows: list[int] = []
    letters: dict[int, str] = {}

    for r in range(header_row + 1, len(grid)):
        c0 = cell(grid, r, 0)
        c1 = cell(grid, r, 1)
        if c0 and len(c0) <= 2 and re.search(r"[А-Яа-я]", c0):
            letters[r] = c0.upper()
        if re.fullmatch(r"[1-6]", c1):
            pair_rows.append(r)

    blocks: list[list[int]] = []
    cur: list[int] = []
    for pr in pair_rows:
        if cell(grid, pr, 1) == "1" and cur:
            blocks.append(cur)
            cur = []
        cur.append(pr)
    if cur:
        blocks.append(cur)

    result = []
    for bi, block in enumerate(blocks):
        start, end = block[0], (blocks[bi + 1][0] - 1 if bi + 1 < len(blocks) else len(grid) - 1)
        word = "".join(letters[r] for r in sorted(letters) if start <= r <= end)
        weekday = _match_weekday(word, bi)
        if weekday is None:
            log.warning("Не удалось определить день недели блока #%s (буквы: %r)", bi, word)
            continue
        result.append((weekday, block, word))
    return result


def _match_weekday(word: str, position: int) -> int | None:
    if word:
        for i, name in enumerate(DAY_NAMES):
            if word.startswith(name[:3]):
                return i
        log.warning("Слово дня %r не распознано, блок #%s", word, position)
    return position if position < 5 else None


def parse_schedule(data: bytes) -> BaseSchedule:
    soup = BeautifulSoup(decode_bytes(data), "lxml")
    table = soup.find("table")
    if table is None:
        raise ValueError("В файле основного расписания нет таблицы")

    grid = expand_table_to_grid(table)
    header_row = _find_header_row(grid)
    if header_row == -1:
        raise ValueError("Не найдена строка-шапка «ДНИ» в основном расписании")

    groups = _parse_groups(grid, header_row)
    if not groups:
        raise ValueError("Не найдено ни одной группы в основном расписании")

    # колонки групп по имени
    columns: dict[str, int] = {}
    row = grid[header_row]
    for c in range(1, len(row)):
        name = clean_cell(row[c])
        if name in groups:
            columns[name] = c

    schedule = BaseSchedule(groups=groups)
    lessons_total = 0

    for weekday, block, _word in _day_blocks(grid, header_row):
        for pair_row in block:
            try:
                pair = int(cell(grid, pair_row, 1))
            except ValueError:
                continue
            teacher_row = pair_row + 1
            for name, gcol in columns.items():
                subject = cell(grid, pair_row, gcol)
                classroom = cell(grid, pair_row, gcol + 1) or cell(grid, pair_row, gcol + 2)
                teacher = cell(grid, teacher_row, gcol)
                if not (subject or teacher or classroom):
                    continue
                wl = (schedule.lessons
                      .setdefault(name, {})
                      .setdefault(weekday, {})
                      .get(pair))
                if wl is None:
                    wl = WeekLesson()
                    schedule.lessons[name][weekday][pair] = wl
                for parity in ("odd", "even"):
                    lesson = _lesson_from_parts(subject, teacher, classroom, parity)
                    if lesson is None:
                        continue
                    lessons_total += 1
                    setattr(wl, parity, lesson)

    log.info("Parsed %d groups, %d lessons (both parities)", len(groups), lessons_total)
    return schedule


def normalized_group_names(schedule: BaseSchedule) -> dict[str, str]:
    """нормализованное имя -> каноническое имя."""
    return {_norm_group(g.name): g.name for g in schedule.groups.values()}
