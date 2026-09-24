"""Секция «Кабинеты» файла замен: строки «пары | преподаватель | кабинет».

Колледж помечает дистанционные занятия преподавателя строкой с кабинетом «ДО»
(иногда единственным упоминанием — в таблице групп такой строки может не быть
вовсе, см. случай Логиновой 23.09.2026, ИС 24-3, 3-я пара).

Правила синтеза (консервативные, чтобы не плодить ложные изменения):
- берём только строки с кабинетом «ДО»/«дистанционно»; обычные кабинеты —
  справочная информация, их не трогаем;
- если в блоке несколько разных преподавателей с одной фамилией — фамилия
  неоднозначна, пропуск (нельзя понять, кто именно дистанционно);
- ДО применяется только к парам, где ПОСЛЕ применения строк замен блока
  преподаёт именно этот преподаватель (база + замены, отмены уважаются);
- если пара уже отменена или кабинет уже «ДО» — ничего не добавляем.
"""
from __future__ import annotations

import logging
import re

from ..models.domain import (
    PAIR_NUMBERS, BaseSchedule, Lesson, Replacement, ReplacementBlock,
)
from .parity import ParityResolver

log = logging.getLogger("parser.remote_hints")

REMOTE_RE = re.compile(r"^(до|дистанционн\w*|дист\.?|do)\.?$", re.IGNORECASE)


def _norm(name: str) -> str:
    return re.sub(r"\s+", " ", name).strip().lower()


def _surname(full: str) -> str:
    parts = _norm(full).split(" ")
    return parts[0] if parts else ""


def _effective_lesson(
    schedule: BaseSchedule, block: ReplacementBlock, group: str, pair: int, parity: str,
) -> Lesson | None:
    """Пара (group, pair) на дату блока: база + строки замен по порядку."""
    base = schedule.day(group, block.date.weekday(), parity).get(pair)
    lesson = Lesson(subject=base.subject, teacher=base.teacher, classroom=base.classroom) if base else None
    for rep in block.replacements:
        if rep.group != group:
            continue
        if rep.lesson_numbers and pair not in rep.lesson_numbers:
            continue
        if rep.is_cancel:
            lesson = None
            continue
        lesson = Lesson(subject=rep.subject, teacher=rep.teacher, classroom=rep.classroom)
    return lesson


def apply_teacher_remote_hints(
    blocks: list[ReplacementBlock],
    schedule: BaseSchedule,
    resolver: ParityResolver,
) -> int:
    """Превращает строки «Кабинеты» с ДО в обычные замены кабинета. Возвращает число добавленных строк."""
    added = 0
    for block in blocks:
        hints = [tr for tr in block.teacher_rooms if REMOTE_RE.fullmatch(tr.classroom.strip())]
        if not hints:
            continue

        # защита от неоднозначных фамилий внутри блока («Кузнецова Т.Г.» и «Кузнецова О.С.»)
        by_surname: dict[str, set[str]] = {}
        for tr in block.teacher_rooms:
            by_surname.setdefault(_surname(tr.teacher), set()).add(_norm(tr.teacher))

        parity = block.parity or resolver.parity(block.date)
        weekday = block.date.weekday()

        for hint in hints:
            sn = _surname(hint.teacher)
            if not sn or len(by_surname.get(sn, ())) > 1:
                log.info("ДО-подсказка «%s» пропущена: неоднозначная фамилия", hint.teacher)
                continue

            targets = set(hint.pairs) if hint.pairs else set(PAIR_NUMBERS)

            # кандидаты: базовые пары преподавателя на этот день + введённые заменами
            candidates: set[tuple[str, int]] = set()
            for group, days in schedule.lessons.items():
                for pair, wl in days.get(weekday, {}).items():
                    lesson = wl.for_parity(parity)
                    if lesson and _surname(lesson.teacher) == sn:
                        candidates.add((group, pair))
            for rep in block.replacements:
                if not rep.is_cancel and _surname(rep.teacher) == sn:
                    for p in (rep.lesson_numbers or PAIR_NUMBERS):
                        candidates.add((rep.group, p))

            for group, pair in sorted(candidates):
                if pair not in targets:
                    continue
                eff = _effective_lesson(schedule, block, group, pair, parity)
                if eff is None or eff.is_empty():
                    continue  # пары нет / отменена
                if _surname(eff.teacher) != sn:
                    continue  # в этот день на этой паре преподаёт кто-то другой
                if REMOTE_RE.fullmatch(eff.classroom.strip()):
                    continue  # уже дистанционно
                block.replacements.append(Replacement(
                    date=block.date,
                    group=group,
                    lesson_numbers=[pair],
                    subject=eff.subject,
                    teacher=eff.teacher,
                    classroom=hint.classroom.strip(),
                    is_cancel=False,
                    raw_pairs="до",
                    source_line=f"синтез из «Кабинеты»: {hint.teacher} — ДО",
                ))
                added += 1

    if added:
        log.info("Синтезировано ДО-замен из секции «Кабинеты»: %d", added)
    return added
