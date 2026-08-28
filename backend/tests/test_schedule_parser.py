# -*- coding: utf-8 -*-
"""Тесты парсера основного расписания (реальный файл kasict.ru)."""
from __future__ import annotations

from datetime import date

from app.models.domain import Lesson
from app.parsers.schedule_parser import parse_schedule, split_week_value


def test_parses_all_groups(real_base_schedule):
    assert len(real_base_schedule.groups) == 48
    names = {g.name for g in real_base_schedule.groups.values()}
    assert "СЗС 24-4" in names
    assert "А 25-1" in names
    assert "ТЭСМО 25-1П" in names


def test_group_numbers(real_base_schedule):
    by_name = {g.name: g.number for g in real_base_schedule.groups.values()}
    assert by_name["СЗС 24-4"] == 27
    assert by_name["А 25-1"] == 1


def test_days_present_for_group(real_base_schedule):
    days = real_base_schedule.lessons["СЗС 24-4"]
    # в файле 2025-2026 у этой группы есть занятия Пн–Пт
    assert set(days.keys()) >= {0, 1, 2, 3, 4}


def test_specific_lesson_wednesday(real_base_schedule):
    """Реальные данные: среда, СЗС 24-4, нечётная неделя (проверено вручную)."""
    day = real_base_schedule.day("СЗС 24-4", 2, "odd")
    assert day[2] is not None
    assert day[2].subject == "отпс"
    assert day[2].classroom == "315"
    assert day[2].teacher == "Кандиранда"
    assert day[3].subject == "штукатур"
    assert day[3].classroom == "315"


def test_parity_split_subject(real_base_schedule):
    """А 25-2, четверг, 4-я пара: 'физ./ин.яз.' — по неделям разные предметы."""
    day_odd = real_base_schedule.day("А 25-2", 3, "odd")
    day_even = real_base_schedule.day("А 25-2", 3, "even")
    assert day_odd[4].subject == "физ."
    assert day_even[4].subject == "ин.яз."


def test_empty_slots_are_none(real_base_schedule):
    day = real_base_schedule.day("А 25-1", 0, "even")
    # у А 25-1 в понедельник чётной недели не все 6 пар заняты
    assert any(v is None for v in day.values())


def test_split_week_value():
    assert split_week_value("общ./-") == ("общ.", "-")
    assert split_week_value("-/физ.") == ("-/физ.".split("/")[0], "физ.")
    assert split_week_value("мат.") == ("мат.", "мат.")
    assert split_week_value("") == ("", "")


def test_weekday_of_known_date(real_base_schedule):
    """Проверка соответствия дней: 24.06.2026 — среда."""
    assert date(2026, 6, 24).weekday() == 2
    day = real_base_schedule.day("СЗС 24-4", date(2026, 6, 24).weekday(), "odd")
    assert day[3] and day[3].subject == "штукатур"


def test_broken_input_raises():
    import pytest
    with pytest.raises(ValueError):
        parse_schedule(b"<html><body><p>no table</p></body></html>")
    with pytest.raises(ValueError):
        parse_schedule("нет таблицы".encode("cp1251"))
