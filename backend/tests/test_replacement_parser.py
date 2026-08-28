# -*- coding: utf-8 -*-
"""Тесты парсера замен (реальный файл zamena1.htm + синтетические фрагменты)."""
from __future__ import annotations

from datetime import date

from app.parsers.replacement_parser import parse_pairs_cell, parse_replacements


# ---------- реальный файл ----------

def test_two_blocks_parsed(real_replacement_blocks):
    assert len(real_replacement_blocks) == 2
    dates = {b.date for b in real_replacement_blocks}
    assert dates == {date(2026, 6, 26), date(2026, 6, 29)}


def test_block_parity_from_header(real_replacement_blocks):
    by_date = {b.date: b for b in real_replacement_blocks}
    assert by_date[date(2026, 6, 26)].parity == "odd"
    assert by_date[date(2026, 6, 26)].day_word.startswith("нечет")
    assert by_date[date(2026, 6, 29)].parity == "even"


def test_whole_day_session(real_replacement_blocks):
    """А 25-1, 26.06.26: пустые пары + «сессия» => весь день."""
    block = next(b for b in real_replacement_blocks if b.date == date(2026, 6, 26))
    rows = [r for r in block.replacements if r.group == "А 25-1"]
    assert len(rows) == 1
    assert rows[0].lesson_numbers == []
    assert rows[0].subject == "сессия"
    assert not rows[0].is_cancel


def test_cancel_multiple_pairs(real_replacement_blocks):
    """А 23-1, 26.06.26: «1,2» + «нет пары» => отмена двух пар."""
    block = next(b for b in real_replacement_blocks if b.date == date(2026, 6, 26))
    rows = [r for r in block.replacements if r.group == "А 23-1"]
    cancels = [r for r in rows if r.is_cancel]
    assert cancels and cancels[0].lesson_numbers == [1, 2]
    assert cancels[0].subject == ""  # «нет пары» не считается предметом


def test_pair_replacement_with_teacher_room(real_replacement_blocks):
    """А 23-1, 26.06.26: «3 | огп | Булычева | 304»."""
    block = next(b for b in real_replacement_blocks if b.date == date(2026, 6, 26))
    row = next(r for r in block.replacements
               if r.group == "А 23-1" and r.lesson_numbers == [3])
    assert row.subject == "огп"
    assert row.teacher == "Булычева"
    assert row.classroom == "304"


def test_from_pair_range(real_replacement_blocks):
    """Д 23-2, 26.06.26: «с 4 пары» => пары 4,5,6."""
    block = next(b for b in real_replacement_blocks if b.date == date(2026, 6, 26))
    row = next(r for r in block.replacements if r.group == "Д 23-2")
    assert row.lesson_numbers == [4, 5, 6]
    assert row.subject == "УП 01.01"


def test_cabinet_noise_section_skipped(real_replacement_blocks):
    """Секция «Кабинеты» между блоками не должна попасть в замены."""
    for b in real_replacement_blocks:
        for r in b.replacements:
            assert r.group, "пустое название группы в замене"


def test_multi_pairs_variants(real_replacement_blocks):
    block = next(b for b in real_replacement_blocks if b.date == date(2026, 6, 26))
    row = next(r for r in block.replacements
               if r.group == "ТЭСМО 23-1" and r.lesson_numbers == [5, 6])
    assert row.is_cancel


# ---------- синтетический фрагмент ----------

SYNTHETIC = """
<html><body><table>
<tr><td colspan=6>Изменения в расписании на 05.09.26 (четный суббота)</td></tr>
<tr><td>№ группы</td><td>Название группы</td><td>Пары</td><td>Предмет</td>
<td>Фамилия преподав.</td><td>кабинет</td></tr>
<tr><td>1</td><td>ИС 25-1</td><td>2</td><td>мат.</td><td>Сырова</td><td>до</td></tr>
<tr><td></td><td></td><td>1,2</td><td>нет пары</td><td></td><td></td></tr>
<tr><td>99</td><td>НЕСУЩЕСТВУЮЩАЯ ГРУППА</td><td>1</td><td>физ.</td><td>Кто-то</td><td>101</td></tr>
</table></body></html>
""".encode()


def test_synthetic_fragment():
    blocks = parse_replacements(SYNTHETIC)
    assert len(blocks) == 1
    b = blocks[0]
    assert b.date == date(2026, 9, 5)
    assert b.parity == "even"
    assert len(b.replacements) == 2          # строка без группы пропущена
    remote = b.replacements[0]
    assert remote.classroom == "до"
    assert remote.lesson_numbers == [2]


def test_pairs_cell_parsing():
    assert parse_pairs_cell("1,2") == ([1, 2], False)
    assert parse_pairs_cell("3") == ([3], False)
    assert parse_pairs_cell("с 4 пары") == ([4, 5, 6], False)
    assert parse_pairs_cell("") == ([], True)
    assert parse_pairs_cell(" ") == ([], True)
    assert parse_pairs_cell("7") == ([], False)   # вне 1..6 отбрасывается


def test_empty_file_gives_no_blocks():
    assert parse_replacements(b"<html><body></body></html>") == []
