# -*- coding: utf-8 -*-
"""Тесты Replacement Engine: все типы замен + валидация + интеграция на реальных данных."""
from __future__ import annotations

from datetime import date

from app.models.domain import (BaseSchedule, GroupInfo, Lesson, LessonStatus,
                               Replacement, WeekLesson)
from app.services.replacement_engine import apply_day, classify

D = date(2026, 6, 26)  # пятница


def make_base(with_pairs: dict[int, Lesson], group: str = "ИС 24-1") -> BaseSchedule:
    base = BaseSchedule(groups={group: GroupInfo(name=group, number=1)})
    wl_container = base.lessons.setdefault(group, {}).setdefault(4, {})  # пятница
    for pair, lesson in with_pairs.items():
        wl_container[pair] = WeekLesson(odd=lesson, even=lesson)
    return base


def rep(group="ИС 24-1", pairs=(2,), subject="инф.", teacher="Титова",
        room="218", cancel=False) -> Replacement:
    return Replacement(date=D, group=group, lesson_numbers=list(pairs),
                       subject=subject, teacher=teacher, classroom=room,
                       is_cancel=cancel, raw_pairs=",".join(map(str, pairs)))


# ---------- классификация ----------

def test_classify_types():
    base = Lesson(subject="мат.", teacher="Сырова", classroom="218")
    assert classify(base, Lesson("инф.", "Титова", "218")) is LessonStatus.REPLACED
    assert classify(base, Lesson("мат.", "Титова", "218")) is LessonStatus.TEACHER_CHANGED
    assert classify(base, Lesson("мат.", "Сырова", "404")) is LessonStatus.ROOM_CHANGED
    assert classify(None, Lesson("инф.", "Титова", "218")) is LessonStatus.ADDED
    assert classify(base, base) is LessonStatus.NORMAL


# ---------- обычный день без замен ----------

def test_normal_day():
    base = make_base({1: Lesson("мат.", "Сырова", "218")})
    day = apply_day(base, "ИС 24-1", D, "odd", [])
    assert [l.number for l in day.lessons] == [1, 2, 3, 4, 5, 6]
    assert day.lessons[0].status is LessonStatus.NORMAL
    assert day.lessons[0].subject == "мат."
    assert day.lessons[1].subject == ""          # пустая пара
    assert not day.has_replacements
    assert day.day_note is None
    assert day.warnings == []


# ---------- замена дисциплины ----------

def test_subject_replacement():
    base = make_base({2: Lesson("мат.", "Сырова", "218")})
    day = apply_day(base, "ИС 24-1", D, "odd", [rep(subject="инф.", teacher="Титова", room="218")])
    l2 = day.lessons[1]
    assert l2.status is LessonStatus.REPLACED
    assert l2.subject == "инф."
    assert l2.original.subject == "мат."
    assert day.has_replacements


# ---------- отмена ----------

def test_cancel():
    base = make_base({1: Lesson("мат.", "Сырова", "218"),
                      2: Lesson("лит.", "Захарова", "201")})
    day = apply_day(base, "ИС 24-1", D, "odd", [rep(pairs=(1, 2), cancel=True)])
    for l in day.lessons[:2]:
        assert l.status is LessonStatus.CANCELLED
        assert l.subject == ""
        assert l.original.subject in ("мат.", "лит.")
    assert day.has_replacements


# ---------- добавление ----------

def test_added_lesson():
    base = make_base({1: Lesson("мат.", "Сырова", "218")})  # 3-й пары нет
    day = apply_day(base, "ИС 24-1", D, "odd", [rep(pairs=(3,))])
    l3 = day.lessons[2]
    assert l3.status is LessonStatus.ADDED
    assert l3.subject == "инф."
    assert l3.original is None


# ---------- замена преподавателя / кабинета ----------

def test_teacher_replacement():
    base = make_base({2: Lesson("мат.", "Сырова", "218")})
    day = apply_day(base, "ИС 24-1", D, "odd",
                    [rep(subject="мат.", teacher="Владимирова", room="218")])
    assert day.lessons[1].status is LessonStatus.TEACHER_CHANGED
    assert day.lessons[1].teacher == "Владимирова"


def test_room_replacement():
    base = make_base({2: Lesson("мат.", "Сырова", "218")})
    day = apply_day(base, "ИС 24-1", D, "odd",
                    [rep(subject="мат.", teacher="Сырова", room="404")])
    assert day.lessons[1].status is LessonStatus.ROOM_CHANGED
    assert day.lessons[1].classroom == "404"


# ---------- несколько пар сразу ----------

def test_multi_pair_replacement():
    base = make_base({1: Lesson("мат.", "Сырова", "218"),
                      2: Lesson("лит.", "Захарова", "201"),
                      3: Lesson("ист.", "Ушаков", "212")})
    day = apply_day(base, "ИС 24-1", D, "odd", [rep(pairs=(1, 2, 3))])
    for l in day.lessons[:3]:
        assert l.subject == "инф."
        assert l.status in (LessonStatus.REPLACED,)


# ---------- несколько замен на день ----------

def test_multiple_replacements_same_day():
    base = make_base({1: Lesson("мат.", "Сырова", "218"),
                      2: Lesson("лит.", "Захарова", "201")})
    day = apply_day(base, "ИС 24-1", D, "odd", [
        rep(pairs=(1,), subject="инф.", teacher="Титова", room="218"),
        rep(pairs=(2,), cancel=True),
    ])
    assert day.lessons[0].status is LessonStatus.REPLACED
    assert day.lessons[1].status is LessonStatus.CANCELLED


def test_last_replacement_wins():
    base = make_base({1: Lesson("мат.", "Сырова", "218")})
    day = apply_day(base, "ИС 24-1", D, "odd", [
        rep(pairs=(1,), subject="инф.", teacher="Титова", room="218"),
        rep(pairs=(1,), subject="физ.", teacher="Зинченко", room="119"),
    ])
    assert day.lessons[0].subject == "физ."


# ---------- весь день ----------

def test_whole_day_event():
    base = make_base({1: Lesson("мат.", "Сырова", "218"),
                      2: Lesson("лит.", "Захарова", "201")})
    day = apply_day(base, "ИС 24-1", D, "odd",
                    [rep(pairs=(), subject="сессия", teacher="", room="")])
    assert day.day_note == "сессия"
    assert all(l.subject == "сессия" for l in day.lessons)
    assert day.has_replacements


# ---------- невалидные данные ----------

def test_unknown_group_warning():
    base = make_base({1: Lesson("мат.", "Сырова", "218")})
    day = apply_day(base, "ИС 24-1", D, "odd", [rep(group="НЕТ ТАКОЙ")])
    assert day.lessons[0].status is LessonStatus.NORMAL
    assert any("неизвестной группы" in w for w in day.warnings)


def test_invalid_pair_number_warning():
    base = make_base({1: Lesson("мат.", "Сырова", "218")})
    bad = Replacement(date=D, group="ИС 24-1", lesson_numbers=[7],
                      subject="физ.", teacher="X", classroom="1")
    day = apply_day(base, "ИС 24-1", D, "odd", [bad])
    assert all("пропущен" not in w or "пары 7" in w for w in day.warnings)
    assert day.lessons[0].subject == "мат."


# ---------- чётность (используется нужная неделя) ----------

def test_parity_selection():
    base = BaseSchedule(groups={"ИС 24-1": GroupInfo(name="ИС 24-1", number=1)})
    base.lessons.setdefault("ИС 24-1", {})[4] = {
        1: WeekLesson(odd=Lesson("мат.", "Сырова", "218"),
                      even=Lesson("инф.", "Титова", "218")),
    }
    odd_day = apply_day(base, "ИС 24-1", D, "odd", [])
    even_day = apply_day(base, "ИС 24-1", D, "even", [])
    assert odd_day.lessons[0].subject == "мат."
    assert even_day.lessons[0].subject == "инф."


# ---------- интеграция на реальных данных ----------

def test_real_integration_session_day(real_base_schedule, real_replacement_blocks):
    """26.06.26: у А 25-1 весь день «сессия» (реальный файл замен)."""
    d = date(2026, 6, 26)
    block = next(b for b in real_replacement_blocks if b.date == d)
    day = apply_day(real_base_schedule, "А 25-1", d, "odd", block.replacements)
    assert day.day_note == "сессия"
    assert all(l.subject == "сессия" for l in day.lessons)


def test_real_integration_cancels(real_base_schedule, real_replacement_blocks):
    """26.06.26: А 23-1 — пары 1,2 отменены, 3-я огп (Булычева, 304), 5,6 нет пары."""
    d = date(2026, 6, 26)
    block = next(b for b in real_replacement_blocks if b.date == d)
    day = apply_day(real_base_schedule, "А 23-1", d, "odd", block.replacements)
    by_num = {l.number: l for l in day.lessons}
    assert by_num[1].status is LessonStatus.CANCELLED
    assert by_num[2].status is LessonStatus.CANCELLED
    assert by_num[3].subject == "огп"
    assert by_num[3].teacher == "Булычева"
    assert by_num[3].classroom == "304"
    assert by_num[5].subject == "нап"      # 5,6 — замена на «нап»
    assert by_num[5].status in (LessonStatus.REPLACED, LessonStatus.ADDED)
    assert by_num[6].subject == "нап"
    assert by_num[4].status is LessonStatus.NORMAL   # 4-я не тронута


def test_real_integration_no_warnings_for_real_data(real_base_schedule,
                                                    real_replacement_blocks):
    """Все группы реального файла замен известны основному расписанию."""
    for block in real_replacement_blocks:
        day = apply_day(real_base_schedule, block.replacements[0].group,
                        block.date, "odd", block.replacements)
        assert day.warnings == []
