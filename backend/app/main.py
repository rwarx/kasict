"""Точка входа FastAPI: API + раздача собранного фронтенда (SPA)."""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .api import routes
from .config import get_settings
from .services.schedule_service import ScheduleService

logging.basicConfig(
    level=get_settings().log_level.upper(),
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
)
log = logging.getLogger("main")

service: ScheduleService | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global service
    settings = get_settings()
    service = ScheduleService(settings)
    routes.get_service = lambda: service  # DI
    # прогрев кэша без блокировки старта
    asyncio.get_running_loop().create_task(service.refresh_if_stale())
    yield


app = FastAPI(
    title="College Schedule API",
    description="Расписание колледжа kasict.ru с автоматическим учётом замен",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes.router)


# ---------- фронтенд (production) ----------

dist = (Path(__file__).resolve().parent.parent.parent /
        get_settings().frontend_dist).resolve()
if dist.exists():
    app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        # API-пути уже обработаны роутером выше; сюда попадают только запросы фронтенда
        if full_path.startswith("api/"):
            return JSONResponse({"detail": "Not found"}, status_code=404)
        candidates = [dist / full_path] if full_path else []
        candidates += [dist / "index.html"]
        for c in candidates:
            if c.is_file():
                return FileResponse(c)
        return JSONResponse({"detail": "Not found"}, status_code=404)
else:
    log.info("Каталог фронтенда %s не найден — работаем в режиме API-only", dist)
