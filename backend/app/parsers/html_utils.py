"""Утилиты для чтения Excel-выгрузок в HTML (kasict.ru).

Особенности источника:
  * charset windows-1251;
  * таблицы с colspan/rowspan — парсим через развертку в виртуальную сетку.
"""
from __future__ import annotations

import re

from bs4 import BeautifulSoup


def decode_bytes(data: bytes) -> str:
    for enc in ("windows-1251", "utf-8"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("windows-1251", errors="replace")


def clean_cell(text: str) -> str:
    """'кл.час  "Разг.' -> нормализованная строка; &nbsp; -> пробел."""
    t = (text or "").replace("\xa0", " ").replace("&quot;", '"')
    return re.sub(r"\s+", " ", t).strip()


def expand_table_to_grid(table) -> list[list[str]]:
    """Разворачивает HTML-таблицу в dense-сетку текстов с учётом colspan/rowspan.

    grid[row][col] — текст ячейки; для ячеек, «продолженных» colspan'ом,
    текст попадает только в первый столбец, остальные — пустые строки.
    """
    rows: list[list[str]] = []
    # (row, col) -> текст, занесённый rowspan'ом с предыдущих строк
    occupied: dict[tuple[int, int], str] = {}

    for r, tr in enumerate(table.find_all("tr")):
        row: dict[int, str] = {}
        for (pr, pc), text in list(occupied.items()):
            if pr == r:
                row[pc] = text
                del occupied[(pr, pc)]
        col = 0
        for cell in tr.find_all(["td", "th"]):
            while col in row:
                col += 1
            text = clean_cell(cell.get_text())
            colspan = max(1, int(cell.get("colspan", 1) or 1))
            rowspan = max(1, int(cell.get("rowspan", 1) or 1))
            for dc in range(colspan):
                row[col + dc] = text if dc == 0 else ""
                if rowspan > 1 and dc == 0:
                    for dr in range(1, rowspan):
                        occupied[(r + dr, col)] = text
            col += colspan
        rows.append([] if not row else [row.get(i, "") for i in range(max(row) + 1)])
    return rows


def cell(grid: list[list[str]], r: int, c: int) -> str:
    if 0 <= r < len(grid):
        row = grid[r]
        if 0 <= c < len(row):
            return row[c]
    return ""


def first_tables(soup: BeautifulSoup) -> list:
    return soup.find_all("table")
