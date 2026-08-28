"""Pydantic-схемы ответов API."""
from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel

from ..models.domain import LessonStatus


class GroupOut(BaseModel):
    name: str
    number: int


class GroupsOut(BaseModel):
    groups: list[GroupOut]
    updated_at: datetime | None = None


class OriginalLesson(BaseModel):
    subject: str = ""
    teacher: str = ""
    classroom: str = ""


class LessonOut(BaseModel):
    number: int
    time_start: str
    time_end: str
    subject: str = ""
    teacher: str = ""
    classroom: str = ""
    is_remote: bool = False           # кабинет «до» — дистанционно
    status: LessonStatus = LessonStatus.NORMAL
    original: OriginalLesson | None = None


class DayScheduleOut(BaseModel):
    group: str
    date: date
    weekday: str
    parity: str                        # odd | even
    parity_label: str                  # «Нечётная неделя» / «Чётная неделя»
    day_note: str | None = None
    has_replacements: bool = False
    lessons: list[LessonOut]
    warnings: list[str] = []
    updated_at: datetime | None = None


class LastUpdateOut(BaseModel):
    last_update: datetime | None
    stale: bool
    fetch_error: str | None = None
    groups_count: int
    replacement_dates: list[date]
    warnings: list[str] = []


class HealthOut(BaseModel):
    status: str                        # ok | degraded
    data_loaded: bool
    last_update: datetime | None
    fetch_error: str | None = None


class ErrorOut(BaseModel):
    detail: str
