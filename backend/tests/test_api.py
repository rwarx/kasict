# -*- coding: utf-8 -*-
"""Интеграционные тесты API (TestClient, данные из локальных фикстур — без сети)."""
from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import routes
from app.config import Settings
from app.services.schedule_service import ScheduleService

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture()
def client(tmp_path):
    async def local_fetcher(url: str) -> bytes:
        filename = "raspisanie.htm" if "aspisan" in url.lower() else "zamena1.htm"
        return (FIXTURES / filename).read_bytes()

    settings = Settings(cache_dir=str(tmp_path), cache_ttl_minutes=60)
    service = ScheduleService(settings, fetcher=local_fetcher)
    routes.get_service = lambda: service
    app = FastAPI()
    app.include_router(routes.router)
    with TestClient(app) as tc:
        yield tc


def test_groups(client):
    resp = client.get("/api/groups")
    assert resp.status_code == 200
    body = resp.json()
    names = [g["name"] for g in body["groups"]]
    assert len(names) == 48
    assert "СЗС 24-4" in names
    assert body["updated_at"] is not None


def test_schedule_today_without_replacements(client):
    resp = client.get("/api/schedule/СЗС 24-4", params={"date": "2026-06-24"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["group"] == "СЗС 24-4"
    assert body["weekday"] == "среда"
    assert body["parity"] == "odd"
    assert len(body["lessons"]) == 6
    assert not body["has_replacements"]
    pair2 = body["lessons"][1]
    assert pair2["subject"] == "отпс"
    assert pair2["classroom"] == "315"


def test_schedule_with_replacements(client):
    """26.06.26: сессия у первокурсников — событие на весь день."""
    resp = client.get("/api/schedule/А 25-1", params={"date": "2026-06-26"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["day_note"] == "сессия"
    assert body["has_replacements"]
    assert all(l["subject"] == "сессия" for l in body["lessons"])


def test_schedule_cancellations_and_replacements(client):
    """26.06.26, А 23-1: пары 1,2 отменены; 3 — огп."""
    resp = client.get("/api/schedule/А 23-1", params={"date": "2026-06-26"})
    body = resp.json()
    lessons = {l["number"]: l for l in body["lessons"]}
    assert lessons[1]["status"] == "cancelled"
    assert lessons[2]["status"] == "cancelled"
    assert lessons[3]["subject"] == "огп"
    assert lessons[3]["status"] in ("replaced", "added", "teacher_changed", "room_changed")


def test_remote_lesson_flag(client):
    """Кабинет «до» помечается is_remote (синтетика не нужна: проверяем логику ответа)."""
    resp = client.get("/api/schedule/А 23-1", params={"date": "2026-06-26"})
    assert resp.status_code == 200
    for lesson in resp.json()["lessons"]:
        if lesson["classroom"].lower().startswith("до") and lesson["classroom"].lower() in ("до", "до."):
            assert lesson["is_remote"] is True


def test_unknown_group_404(client):
    resp = client.get("/api/schedule/НЕСУЩЕСТВУЮЩАЯ-99")
    assert resp.status_code == 404


def test_group_lookup_fuzzy(client):
    """Группа в любом написании: 'сзс 24-4' -> каноническое имя."""
    resp = client.get("/api/schedule/сзс24-4", params={"date": "2026-06-24"})
    assert resp.status_code == 200
    assert resp.json()["group"] == "СЗС 24-4"


def test_last_update(client):
    resp = client.get("/api/last-update")
    assert resp.status_code == 200
    body = resp.json()
    assert body["groups_count"] == 48
    assert body["last_update"] is not None
    assert "2026-06-26" in body["replacement_dates"]


def test_health(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["data_loaded"] is True


def test_bad_date_422(client):
    resp = client.get("/api/schedule/А 25-1", params={"date": "не-дата"})
    assert resp.status_code == 422
