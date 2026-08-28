"""Replacement Engine: применение замен к основному расписанию.

Единственная точка бизнес-логики. На вход — нормализованные данные
(базовый день группы + замены на дату), на выходе — итоговые пары со статусами.
HTML здесь не парсится и не анализируется.
"""
from __future__ import annotations

import logging
from datetime import date

from ..models.domain import (DAY_NOTE_MAX_LEN, BaseSchedule, DaySchedule,
                             Lesson, LessonStatus, LessonView, Replacement,
                             PAIR_NUMBERS, PAIR_TIMES)
from .parity import ParityResolver

log = logging.getLogger("engine")

_CUT = 40


def _short(text: str, limit: int = _CUT) -> str:
    text = (text or "").strip()
    return text if len(text) <= limit else text[:limit - 1] + "…"


def classify(base: Lesson | None, new: Lesson) -> LessonStatus:
    """Классификация изменения сравнением с базовой парой."""
    if base is None or base.is_empty():
        return LessonStatus.ADDED
    changed = [f for f in ("subject", "teacher", "classroom")
               if getattr(base, f) != getattr(new, f)]
    if "subject" in changed:
        return LessonStatus.REPLACED
    if "teacher" in changed and "classroom" in changed:
        return LessonStatus.TEACHER_CHANGED  # кабинет тоже сменился — главное учитель
    if "teacher" in changed:
        return LessonStatus.TEACHER_CHANGED
    if "classroom" in changed:
        return LessonStatus.ROOM_CHANGED
    return LessonStatus.NORMAL


def _to_view(number: int, lesson: Lesson | None) -> LessonView:
    start, end = PAIR_TIMES[number]
    if lesson is None or lesson.is_empty():
        return LessonView(number=number, time_start=start, time_end=end,
                          subject="", teacher="", classroom="")
    return LessonView(number=number, time_start=start, time_end=end,
                      subject=lesson.subject, teacher=lesson.teacher,
                      classroom=lesson.classroom)


def apply_day(
    base_schedule: BaseSchedule,
    group: str,
    d: date,
    parity: str,
    replacements: list[Replacement],
) -> DaySchedule:
    """Собирает итоговый день: базовые пары по чётности + замены."""
    base_day = base_schedule.day(group, d.weekday(), parity)
    views: dict[int, LessonView] = {
        p: _to_view(p, base_day.get(p)) for p in PAIR_NUMBERS
    }
    originals: dict[int, Lesson | None] = {p: base_day.get(p) for p in PAIR_NUMBERS}
    statuses: dict[int, LessonStatus] = {p: LessonStatus.NORMAL for p in PAIR_NUMBERS}

    result = DaySchedule(group=group, date=d, parity=parity)
    known_groups = {g.name for g in base_schedule.groups.values()}

    for rep in replacements:
        if rep.group not in known_groups:
            msg = f"Замена для неизвестной группы «{_short(rep.group)}» не применена"
            result.warnings.append(msg)
            log.warning("Could not resolve replacement: unknown group %r (%s)",
                        rep.group, rep.source_line)
            continue
        if rep.group != group:
            continue  # строка блока относится к другой группе — не наша

        targets = rep.lesson_numbers or list(PAIR_NUMBERS)  # [] => весь день
        for p in targets:
            if p not in views:
                msg = (f"Некорректный номер пары {p} в замене "
                       f"для «{_short(rep.group)}» — пропущен")
                result.warnings.append(msg)
                log.warning("Invalid lesson number %s in replacement: %s",
                            p, rep.source_line)
                continue

            base = originals[p]
            if rep.is_cancel:
                statuses[p] = LessonStatus.CANCELLED
                views[p] = LessonView(
                    number=p, time_start=views[p].time_start,
                    time_end=views[p].time_end, subject="", teacher="",
                    classroom="", status=LessonStatus.CANCELLED, original=base)
                continue

            new_lesson = Lesson(subject=rep.subject, teacher=rep.teacher,
                                classroom=rep.classroom)
            statuses[p] = classify(base, new_lesson)
            views[p] = LessonView(
                number=p, time_start=views[p].time_start,
                time_end=views[p].time_end, subject=rep.subject,
                teacher=rep.teacher, classroom=rep.classroom,
                status=statuses[p], original=base)

            if not rep.lesson_numbers and rep.subject:
                result.day_note = _short(rep.subject, DAY_NOTE_MAX_LEN)

    result.lessons = [views[p] for p in PAIR_NUMBERS]
    result.has_replacements = any(
        s not in (LessonStatus.NORMAL,) for s in statuses.values()
    ) or bool(result.day_note)
    return result
