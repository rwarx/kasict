"""HTTP API расписания."""
from __future__ import annotations

import logging
from datetime import date

from fastapi import APIRouter, HTTPException, Query

from ..schemas.api import (DayScheduleOut, GroupsOut, HealthOut, LastUpdateOut,
                           LessonOut, OriginalLesson)
from ..services.schedule_service import ScheduleService

log = logging.getLogger("api")

router = APIRouter(prefix="/api")

WEEKDAYS_RU = ("понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье")


def get_service() -> ScheduleService:  # подменяется в main.py при старте
    raise RuntimeError("Service not initialized")


@router.get("/groups", response_model=GroupsOut)
async def groups() -> GroupsOut:
    svc = get_service()
    await svc.refresh_if_stale()
    return GroupsOut(groups=svc.groups(), updated_at=svc.info()["last_update"])


@router.get("/schedule/{group}", response_model=DayScheduleOut)
async def schedule_day(
    group: str,
    day: date | None = Query(default=None, alias="date",
                             description="YYYY-MM-DD; по умолчанию сегодня"),
) -> DayScheduleOut:
    svc = get_service()
    await svc.refresh_if_stale()
    d = day or date.today()
    day = svc.day(group, d)
    if day is None:
        if not svc.ready:
            raise HTTPException(503, "Данные расписания ещё не загружены, попробуйте позже")
        raise HTTPException(404, f"Группа «{group}» не найдена")
    return DayScheduleOut(
        group=day.group,
        date=day.date,
        weekday=WEEKDAYS_RU[day.date.weekday()],
        parity=day.parity,
        parity_label="Нечётная неделя" if day.parity == "odd" else "Чётная неделя",
        day_note=day.day_note,
        has_replacements=day.has_replacements,
        lessons=[
            LessonOut(
                number=l.number,
                time_start=l.time_start,
                time_end=l.time_end,
                subject=l.subject,
                teacher=l.teacher,
                classroom=l.classroom,
                is_remote=l.classroom.strip().lower() in ("до", "до."),
                status=l.status,
                original=OriginalLesson(subject=l.original.subject,
                                        teacher=l.original.teacher,
                                        classroom=l.original.classroom)
                if l.original and not l.original.is_empty() else None,
            ) for l in day.lessons
        ],
        warnings=day.warnings,
        updated_at=svc.info()["last_update"],
    )


@router.get("/last-update", response_model=LastUpdateOut)
async def last_update() -> LastUpdateOut:
    svc = get_service()
    await svc.refresh_if_stale()
    info = svc.info()
    return LastUpdateOut(**info)


@router.get("/health", response_model=HealthOut)
async def health() -> HealthOut:
    svc = get_service()
    await svc.refresh_if_stale()
    info = svc.info()
    ok = svc.ready and not info["fetch_error"]
    return HealthOut(
        status="ok" if ok else "degraded",
        data_loaded=svc.ready,
        last_update=info["last_update"],
        fetch_error=info["fetch_error"],
    )
