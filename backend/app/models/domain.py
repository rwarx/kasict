"""Доменные модели (нормализованные данные между слоями).

Парсеры наполняют эти структуры, Replacement Engine их преобразует,
API отдаёт их наружу. Здесь нет никакой логики парсинга HTML.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from enum import Enum


class LessonStatus(str, Enum):
    NORMAL = "normal"
    REPLACED = "replaced"            # замена дисциплины (возможно, с учителем/кабинетом)
    TEACHER_CHANGED = "teacher_changed"
    ROOM_CHANGED = "room_changed"
    CANCELLED = "cancelled"
    ADDED = "added"


@dataclass
class Lesson:
    subject: str = ""
    teacher: str = ""
    classroom: str = ""

    def is_empty(self) -> bool:
        return not (self.subject or self.teacher or self.classroom)


@dataclass
class WeekLesson:
    """Пара основного расписания: числитель (нечётная) / знаменатель (чётная)."""
    odd: Lesson | None = None
    even: Lesson | None = None

    def for_parity(self, parity: str) -> Lesson | None:
        return self.odd if parity == "odd" else self.even


@dataclass
class GroupInfo:
    name: str          # каноническое имя из файла, напр. "СЗС 24-4"
    number: int        # № группы из шапки


@dataclass
class BaseSchedule:
    """Основное расписание: [группа][день недели 0=Пн][№ пары] -> WeekLesson."""
    groups: dict[str, GroupInfo] = field(default_factory=dict)
    lessons: dict[str, dict[int, dict[int, WeekLesson]]] = field(default_factory=dict)

    def day(self, group: str, weekday: int, parity: str) -> dict[int, Lesson | None]:
        """Пары дня группы для конкретной чётности недели."""
        out: dict[int, Lesson | None] = {p: None for p in PAIR_NUMBERS}
        for pair, wl in self.lessons.get(group, {}).get(weekday, {}).items():
            lesson = wl.for_parity(parity)
            if lesson and not lesson.is_empty():
                out[pair] = lesson
        return out


PAIR_NUMBERS = (1, 2, 3, 4, 5, 6)

DAY_NOTE_MAX_LEN = 60

PAIR_TIMES: dict[int, tuple[str, str]] = {
    # сетка звонков с https://kasict.ru/students/schedule/ (пара = 2 урока)
    1: ("08:00", "09:35"),
    2: ("09:45", "11:20"),
    3: ("11:45", "13:20"),
    4: ("13:45", "15:20"),
    5: ("15:30", "17:05"),
    6: ("17:15", "18:50"),
}


@dataclass
class Replacement:
    """Одна строка файла замен."""
    date: date
    group: str                    # название группы как в файле
    lesson_numbers: list[int]     # [] => весь день
    subject: str = ""
    teacher: str = ""
    classroom: str = ""
    is_cancel: bool = False       # "нет пары"
    raw_pairs: str = ""           # исходная ячейка «Пары» (для логов)
    source_line: str = ""         # исходная строка (для логов/варнингов)


@dataclass
class ReplacementBlock:
    """Блок замен на одну дату (по заголовку файла)."""
    date: date
    parity: str | None            # "odd" | "even" | None
    day_word: str = ""            # напр. "нечетная пятница"
    replacements: list[Replacement] = field(default_factory=list)


@dataclass
class LessonView:
    """Итоговая пара дня для API/UI."""
    number: int
    time_start: str
    time_end: str
    subject: str
    teacher: str
    classroom: str
    status: LessonStatus = LessonStatus.NORMAL
    original: Lesson | None = None   # было (до замены/отмены)


@dataclass
class DaySchedule:
    group: str
    date: date
    parity: str                    # "odd" | "even"
    lessons: list[LessonView] = field(default_factory=list)
    day_note: str | None = None    # "сессия", "УП 01.01" — событие на весь день
    has_replacements: bool = False
    warnings: list[str] = field(default_factory=list)
