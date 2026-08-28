# --- coding: utf-8 -*-
"""Общие фикстуры тестов: реальные HTML-файлы с сайта kasict.ru."""
from __future__ import annotations

from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="session")
def real_raspisanie_html() -> bytes:
    return (FIXTURES / "raspisanie.htm").read_bytes()


@pytest.fixture(scope="session")
def real_zamena_html() -> bytes:
    return (FIXTURES / "zamena1.htm").read_bytes()


@pytest.fixture(scope="session")
def real_base_schedule(real_raspisanie_html):
    from app.parsers.schedule_parser import parse_schedule
    return parse_schedule(real_raspisanie_html)


@pytest.fixture(scope="session")
def real_replacement_blocks(real_zamena_html):
    from app.parsers.replacement_parser import parse_replacements
    return parse_replacements(real_zamena_html)
