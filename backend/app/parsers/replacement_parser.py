"""Парсер файла замен (zamena*.htm).

Структура описана в docs/PARSER_ANALYSIS.md §3:
блоки «Изменения в расписании на ДАТА (нечетный понедельник)»,
колонки: № группы | Название группы | Пары | Предмет | Преподаватель | кабинет.

Устойчивость (v3.3.0, «улучшение работы парсинга»):
  * кодировка: utf-8/windows-1251 автоматически (+ повтор парсинга другой
    кодировкой, если блоки не найдены — kasict.ru может сменить кодировку);
  * заголовки блоков: «Изменени… в расписании на ДД.ММ.ГГГГ», год опционален,
    плюс фолбэки — «Замен… на ДАТА» и голая строка «13.10.26 (нечетный вторник)»;
  * чётность: нечет/чет + «ё»;
  * ячейка «Пары»: '1,2', '1-2', '1; 2', 'с 4 пары', '' (весь день);
  * секция «Кабинеты»: строки «пары | преподаватель | кабинет», устойчиво
    к пустым номерам пар и названиям «Кабинет/Кабинеты/Кабинеты замен»;
  * «График дежурств» (v3.6.0) не просто отбрасывается, а парсится: правые
    колонки «Дата | Группа | Время проведения работ» находятся АДАПТИВНО —
    по шапке, а не по фиксированным позициям; из них собираются DutyEntry
    (см. parse_replacements_with_duties);
  * отчёт парсинга (report) для meta.json и диагностики «почему замены нет».
"""
from __future__ import annotations

import logging
import re
from datetime import date

from bs4 import BeautifulSoup

from ..models.domain import DutyEntry, Replacement, ReplacementBlock, TeacherRoom
from .html_utils import clean_cell, decode_bytes, expand_table_to_grid

log = logging.getLogger("parser.replacement")

HEADER_RE = re.compile(
    r"изменени\w*\s+в\s+расписании\s+на\s+(\d{1,2}\.\d{1,2}(?:\.\d{2,4})?)(?:\s*\(([^)]*)\))?",
    re.IGNORECASE,
)
# фолбэк, если колледж сменит формулировку заголовка («Замены на 13.10.2026»)
HEADER_FALLBACK_RE = re.compile(
    r"(?:изменени\w*|замен\w*)[^0-9]{0,80}?(\d{1,2}\.\d{1,2}(?:\.\d{2,4})?)(?:\s*\(([^)]*)\))?",
    re.IGNORECASE,
)
# голая строка-заголовок («13.10.26 (нечетный вторник)») — дата и чётность
# в отдельных ячейках/строках от слов «Изменения…»; строки меню дат и таблицы
# дежурств не содержат скобок с чётностью и сюда не попадают
BARE_DATE_RE = re.compile(r"^\s*(\d{1,2}\.\d{1,2}(?:\.\d{2,4})?)\s*\(([^)]*)\)\s*$")
_CANCEL_RE = re.compile(r"нет\s+пары|нет\s+занятий|отмен[оая]", re.IGNORECASE)
_FROM_PAIR_RE = re.compile(r"с\s+(\d)\s*пары", re.IGNORECASE)
_CAB_SECTION_RE = re.compile(r"кабинеты?(?:\s+замен\w*)?", re.IGNORECASE)
_DUTY_SECTION_RE = re.compile(r"график\s+дежурств", re.IGNORECASE)
# дежурства, пробравшиеся в таблицу замен (дежурство в 7:50 до первой пары)
_DUTY_SUBJECT_RE = re.compile(r"поднятие\s+флага|дежурств\w*", re.IGNORECASE)
# шапка правых колонок той же таблицы («Дата | Группа | Время проведения работ»)
_DUTY_HEADER_TIME_RE = re.compile(r"время\s+проведения", re.IGNORECASE)
# ячейки «Графика дежурств» (v3.6.0): дата DD.MM.YYYY (или YY), группа
# с буквами и цифрами, время «15:25-16:45» (тире любого вида)
_DUTY_DATE_CELL_RE = re.compile(r"^\d{1,2}\.\d{1,2}\.\d{2,4}$")
_DUTY_TIME_CELL_RE = re.compile(r"^\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}$")
_DUTY_GROUP_CELL_RE = re.compile(
    r"^(?=.*\d)(?=.*[а-яёa-z])[а-яёa-z0-9 .\-]{2,30}$", re.IGNORECASE,
)
_NAME_RE = re.compile(r"[а-яa-zё]", re.IGNORECASE)
_PAIRS_CELL_RE = re.compile(r"[\d\s,;\-–—]+")
_PAIR_RANGE_RE = re.compile(r"^(\d)\s*[-–—]\s*(\d)$")


def _parse_date(s: str) -> date | None:
    parts = s.strip().split(".")
    if len(parts) == 2:
        # год не указан — считаем текущим учебным годом
        parts.append(str(date.today().year))
    if len(parts) != 3:
        return None
    try:
        d, m, y = parts
        y = int(y)
        if y < 100:
            y += 2000
        return date(y, int(m), int(d))
    except (ValueError, TypeError):
        return None


def _parity_from_paren(paren: str) -> str | None:
    p = clean_cell(paren or "").replace("ё", "е").lower()
    if "нечет" in p:
        return "odd"
    if "чет" in p:
        return "even"
    return None


def parse_pairs_cell(raw: str) -> tuple[list[int], bool]:
    """Ячейка «Пары» -> (номера пар, весь_день).

    '1,2' -> ([1,2], False); '1-2' -> ([1,2], False);
    'с 4 пары' -> ([4,5,6], False); '' -> ([], True); '3' -> ([3], False).
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
        part = part.strip()
        if not part:
            continue
        rm = _PAIR_RANGE_RE.match(part)
        if rm:
            a, b = int(rm.group(1)), int(rm.group(2))
            if a <= b:
                nums.extend(p for p in range(a, b + 1) if 1 <= p <= 6)
                continue
        m2 = re.search(r"\d+", part)
        if m2:
            nums.append(int(m2.group()))
    return sorted({n for n in nums if 1 <= n <= 6}), False


def _handle_header(joined: str, blocks: list[ReplacementBlock], current: ReplacementBlock | None, report: dict):
    """Строка-заголовок блока замен -> (актуальный current, True) | (None, True) при ошибке даты.
    False — строка вообще не заголовок."""
    m = HEADER_RE.search(joined) or HEADER_FALLBACK_RE.search(joined)
    if not m:
        m2 = BARE_DATE_RE.match(joined)
        if not m2:
            return current, False
        d, paren = m2.group(1), m2.group(2)
    else:
        d, paren = m.group(1), m.group(2)

    parsed = _parse_date(d)
    if parsed is None:
        log.warning("Не распознана дата в заголовке блока замен: %r", joined[:80])
        report.setdefault("unrecognized_headers", []).append(joined[:80])
        return None, True

    parity = _parity_from_paren(paren)
    if parity is None:
        log.warning("В заголовке замен %s нет чётности недели: %r", parsed, joined[:80])
        report.setdefault("headers_without_parity", []).append(str(parsed))

    # заголовок стоит на объединённой ячейке с rowspan: его текст
    # продлевается на следующую строку сетки — не создаём дубль блока
    if (current is not None and current.date == parsed
            and current.parity == parity and not current.replacements):
        return current, True

    block = ReplacementBlock(date=parsed, parity=parity, day_word=clean_cell(paren or "").lower())
    blocks.append(block)
    report["blocks_found"] = report.get("blocks_found", 0) + 1
    return block, True


def _find_duty_columns(grid: list[list[str]]) -> tuple[set[int], dict[int, str]]:
    """Шапка дежурств -> (колонки для бланкирования, {колонка: роль}).

    Ищем строку с «Время проведения работ»; в ней же по тексту шапки
    определяем колонки «Дата» и «Группа». Адаптивно: если колледж
    передвинет/переименует колонки — роли определяются по заголовкам,
    а не по фиксированным позициям. Если шапка неполная — колонки
    бланкируем (защита замен), но не парсим.
    """
    for row in grid:
        if not any(_DUTY_HEADER_TIME_RE.search(c) for c in row):
            continue
        duty_cols: set[int] = set()
        roles: dict[int, str] = {}
        for j, cc in enumerate(row):
            if j < 6 or not cc:
                continue
            low = cc.lower()
            if _DUTY_HEADER_TIME_RE.search(cc):
                duty_cols.add(j)
                roles.setdefault(j, "time")
            elif low.startswith("дат"):
                duty_cols.add(j)
                roles.setdefault(j, "date")
            elif low.startswith("групп"):
                duty_cols.add(j)
                roles.setdefault(j, "group")
        if {"date", "group", "time"} <= set(roles.values()):
            return duty_cols, roles
        return duty_cols, {}
    return set(), {}


def _parse_text(text: str, report: dict) -> tuple[list[ReplacementBlock], list[DutyEntry]]:
    soup = BeautifulSoup(text, "lxml")
    blocks: list[ReplacementBlock] = []
    duties_raw: list[DutyEntry] = []
    current: ReplacementBlock | None = None
    section = "groups"  # groups | cabinets — секция внутри текущего блока

    for table in soup.find_all("table"):
        grid = expand_table_to_grid(table)

        # Правые колонки таблицы дежурств («Дата | Группа | Время проведения
        # работ») лежат в ТОЙ ЖЕ таблице, что и замены: находим их шапку и
        # бланкируем эти колонки, иначе дежурства просачиваются в замены.
        # С v3.6.0 те же колонки парсятся в DutyEntry (см. ниже).
        duty_cols, duty_map = _find_duty_columns(grid)

        idx_date = next((j for j, r in duty_map.items() if r == "date"), -1)
        idx_group = next((j for j, r in duty_map.items() if r == "group"), -1)
        idx_time = next((j for j, r in duty_map.items() if r == "time"), -1)

        for row in grid:
            # экстракция дежурств — из НЕбланкнутой строки (дежурство может
            # идти и в строке без замен, поэтому до всех проверок на замены)
            if duty_map and len(row) > max(idx_date, idx_group, idx_time):
                d_raw = clean_cell(row[idx_date])
                g_raw = clean_cell(row[idx_group])
                t_raw = clean_cell(row[idx_time])
                if (_DUTY_DATE_CELL_RE.fullmatch(d_raw)
                        and _DUTY_GROUP_CELL_RE.fullmatch(g_raw)
                        and _DUTY_TIME_CELL_RE.fullmatch(t_raw)):
                    duty_date = _parse_date(d_raw)
                    if duty_date is not None:
                        duties_raw.append(DutyEntry(
                            date=duty_date,
                            group=g_raw,
                            time=re.sub(r"\s*[-–—]\s*", "-", t_raw),
                        ))

            if duty_cols:
                row = [c if j not in duty_cols else "" for j, c in enumerate(row)]
            cells = [clean_cell(c) for c in row]
            joined = " ".join(c for c in cells if c)
            if not joined:
                continue

            if HEADER_RE.search(joined) or HEADER_FALLBACK_RE.search(joined) or BARE_DATE_RE.match(joined):
                current, _ = _handle_header(joined, blocks, current, report)
                section = "groups"
                continue

            if current is None:
                continue

            first = cells[0] if cells else ""

            # секция «Кабинеты»: пары | преподаватель | кабинет (может быть «ДО»)
            if _CAB_SECTION_RE.fullmatch(first):
                section = "cabinets"
                continue

            # «График дежурств» начинает служебную таблицу — кабинеты кончились
            if _DUTY_SECTION_RE.fullmatch(first):
                section = "groups"
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
                    report["cabinets_entries"] = report.get("cabinets_entries", 0) + 1
                continue

            # строка данных: первая ячейка — № (число), вторая — название группы
            name = clean_cell(cells[1]) if len(cells) > 1 else ""
            if not re.fullmatch(r"\d{1,3}", first):
                continue
            if not name:
                report["skipped_rows"] = report.get("skipped_rows", 0) + 1
                continue

            pairs_raw = clean_cell(row[2]) if len(row) > 2 else ""

            # предмет | преподаватель | кабинет — строго по позициям сетки:
            # «хвост непустых ячеек» опасен — правые колонки таблицы дежурств
            # могут быть прицеплены к той же строке сетки
            subject = clean_cell(row[3]) if len(row) > 3 else ""
            teacher = clean_cell(row[4]) if len(row) > 4 else ""
            classroom = clean_cell(row[5]) if len(row) > 5 else ""

            if _DUTY_SUBJECT_RE.fullmatch(subject) and (":" in pairs_raw or not pairs_raw.strip()):
                # «поднятие флага» в 7:50 — дежурство до первой пары, а не замена;
                # легитимная замена «1 | поднятие флага» (с номером пары) сохраняется
                report["duty_rows_skipped"] = report.get("duty_rows_skipped", 0) + 1
                continue

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
            report["rows_total"] = report.get("rows_total", 0) + 1

    # Дежурства повторяются в каждой секционной таблице — дедуплицируем
    unique: dict[tuple[date, str, str], DutyEntry] = {}
    for entry in duties_raw:
        unique.setdefault((entry.date, entry.group, entry.time), entry)
    duties = sorted(unique.values(), key=lambda e: (e.date, e.group, e.time))
    if duties_raw:
        report["duty_rows_raw"] = len(duties_raw)
    report["duty_rows"] = len(duties)
    if duties:
        report["duty_dates"] = sorted({e.date.isoformat() for e in duties})
        report["duty_groups"] = sorted({e.group for e in duties})

    return blocks, duties


def _alternative_decode(data: bytes) -> str | None:
    """Декод файла другой кодировкой (для повторной попытки парсинга)."""
    for enc in ("utf-8-sig", "windows-1251"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return None


def parse_replacements_with_duties(
    data: bytes, report: dict | None = None,
) -> tuple[list[ReplacementBlock], list[DutyEntry]]:
    """Файл замен -> (блоки замен, график дежурств).

    report наполняется метриками парсинга (в т.ч. duty_rows/duty_dates).
    """
    rep = report if report is not None else {}

    text = decode_bytes(data)
    blocks, duties = _parse_text(text, rep)

    if not blocks:
        # kasict.ru может сменить кодировку — пробуем альтернативную
        alt = _alternative_decode(data)
        if alt is not None and alt != text:
            log.warning("Блоки замен не найдены — повторный парсинг в другой кодировке")
            blocks, duties = _parse_text(alt, rep)
            if blocks:
                rep["encoding_retried"] = True

    rep["blocks"] = len(blocks)
    rep["rows_by_date"] = {
        b.date.isoformat(): len(b.replacements) for b in blocks
    }

    total = sum(len(b.replacements) for b in blocks)
    log.info("Parsed %d replacement blocks, %d rows, %d duty entries",
             len(blocks), total, len(duties))
    if not blocks:
        log.warning("Файл замен не содержит ни одного распознанного блока")
    return blocks, duties


def parse_replacements(data: bytes, report: dict | None = None) -> list[ReplacementBlock]:
    """Файл замен -> блоки (без дежурств; для них — parse_replacements_with_duties)."""
    blocks, _duties = parse_replacements_with_duties(data, report)
    return blocks
