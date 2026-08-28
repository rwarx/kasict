"""Чётность недели (числитель/знаменатель).

Правило (проверено на реальных заголовках замен, см. docs/PARSER_ANALYSIS.md §2.4):
неделя, в которую попадает 1 сентября учебного года, — нечётная (числитель).
Дополнительно сервис калибруется по заголовку файла замен: если заголовок
говорит «четный», а правило даёт «нечетная» — вводится постоянный сдвиг.
"""
from __future__ import annotations

from datetime import date, timedelta

ODD = "odd"
EVEN = "even"


def base_parity(d: date) -> str:
    """Чётность по якорю «неделя 1 сентября = нечётная»."""
    sep1_year = d.year if d.month >= 8 else d.year - 1
    sep1 = date(sep1_year, 9, 1)
    anchor_monday = sep1 - timedelta(days=sep1.weekday())
    weeks = (d - anchor_monday).days // 7
    return ODD if weeks % 2 == 0 else EVEN


class ParityResolver:
    """Чётность с автокалибровкой по заголовкам файла замен."""

    def __init__(self) -> None:
        self._flip = False
        self._calibrated_on: date | None = None
        self.warnings: list[str] = []

    def calibrate(self, declared_date: date, declared_parity: str | None) -> None:
        if declared_parity not in (ODD, EVEN):
            return
        actual = base_parity(declared_date)
        flip = actual != declared_parity
        if self._calibrated_on is not None and flip != self._flip:
            msg = (f"Конфликт чётности недели: {declared_date} объявлена "
                   f"«{declared_parity}», предыдущая калибровка противоречит")
            self.warnings.append(msg)
        self._flip = flip
        self._calibrated_on = declared_date

    def parity(self, d: date) -> str:
        p = base_parity(d)
        return (EVEN if p == ODD else ODD) if self._flip else p
