# Расписание колледжа — PWA

Веб-приложение расписания колледжа kasict.ru с автоматическим учётом замен. Работает как PWA на iPhone, Android, Windows/macOS/Linux.

**Полностью статическое** — не требует собственного backend/сервера. Данные обновляются автоматически через GitHub Actions.

## Как это работает

```
GitHub Actions (каждые 6 часов)
    ↓
Python-скрипт скачивает HTML с kasict.ru
    ↓
Парсит расписание + замены
    ↓
Генерирует JSON-файлы
    ↓
Коммитит в репозиторий
    ↓
GitHub Pages раздаёт JSON
    ↓
PWA читает JSON с того же origin
```

## Возможности

- Расписание на сегодня / завтра / любую дату
- Автоматический учёт замен (отмены, добавления, замена преподавателей/кабинетов)
- Выбор группы с поиском (запоминается)
- Навигация по датам (стрелки + календарь)
- Визуальное выделение замен (цветовые бейджи)
- Офлайн-режим (Service Worker + localStorage кэш)
- Установка как PWA («На экран Домой» / «Добавить на главный экран»)
- Тёмная тема

## Установка и запуск

### 1. Клонирование

```bash
git clone <repo-url>
cd college-schedule-pwa
```

### 2. Генерация данных (опционально)

Для локальной разработки или первого запуска:

```bash
pip install httpx beautifulsoup4 lxml pydantic pydantic-settings
python scripts/generate_data.py
```

JSON-файлы появятся в `frontend/public/data/`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Dev-сервер: `http://localhost:5173`.

### 4. Production сборка

```bash
cd frontend
npm run build
```

Собранные файлы в `frontend/dist/` — полностью статические, можно хостить где угодно.

## GitHub Pages + Actions

### Настройка

1. Fork/клонируйте репозиторий
2. В Settings → Pages → Source: "GitHub Actions"
3. GitHub Actions автоматически:
   - генерирует JSON-данные каждые 6 часов
   - деплоит фронтенд на GitHub Pages

### Ручной запуск

В Actions → "Update Schedule Data" → "Run workflow".

## Тесты (backend)

Python-тесты для парсеров и replacement engine:

```bash
cd backend
pip install -r requirements.txt
pytest
```

## Структура проекта

```
college-schedule-pwa/
├── frontend/
│   ├── src/
│   │   ├── App.tsx                    # React-компоненты (UI)
│   │   ├── main.tsx                   # Точка входа + SW
│   │   ├── index.css                  # Тёмная тема
│   │   ├── parser/types.ts            # Типы JSON-данных
│   │   ├── services/
│   │   │   ├── scheduleService.ts     # Загрузка + кэш JSON
│   │   │   ├── replacementEngine.ts   # Применение замен
│   │   │   └── parity.ts             # Чётность недели
│   │   └── storage/
│   │       └── localStorage.ts        # Кэш в браузере
│   ├── public/
│   │   ├── data/                      # Статические JSON (генерируются)
│   │   ├── sw.js                      # Service Worker
│   │   ├── manifest.webmanifest       # PWA-манифест
│   │   └── icons/
│   ├── package.json
│   └── vite.config.ts
├── scripts/
│   └── generate_data.py               # Парсер HTML → JSON
├── backend/                           # Python-парсеры + тесты
│   ├── app/parsers/                   # Парсеры HTML
│   ├── app/services/                  # Replacement engine (Python)
│   └── tests/                         # Тесты на реальных данных
├── docs/
│   ├── PARSER_ANALYSIS.md             # Анализ HTML-структуры
│   └── CORS_ANALYSIS.md               # Анализ CORS
├── .github/workflows/
│   └── update-schedule.yml            # GitHub Actions
├── .gitignore
├── .env.example
└── README.md
```

## Переменные окружения

Не требуются для production. Используются только при локальной генерации данных:

| Переменная | По умолчанию | Описание |
|---|---|---|
| `SCHEDULE_PAGE_URL` | `https://kasict.ru/students/schedule/` | URL страницы расписания |
| `CACHE_TTL_MINUTES` | `10` | Время жизни кэша |
| `LOG_LEVEL` | `INFO` | Уровень логирования |

## Лицензия

MIT
