# Анализ CORS: kasict.ru

## Результат

**CORS НЕ разрешён.** Прямой клиентский `fetch()` из браузера на другом домене невозможен.

## Доказательства

### Тест 1: GET-запрос с Origin

```
GET /students/schedule/files/Raspisanie_2025-2026.htm
Origin: https://example.github.io
```

**Ответ (заголовки):**
```
Content-Type: text/html
Content-Length: 615182
Server: Microsoft-IIS/8.5
X-Powered-By: ASP.NET
```

**Нет заголовков:**
- `Access-Control-Allow-Origin`
- `Access-Control-Allow-Methods`
- `Access-Control-Allow-Headers`

### Тест 2: OPTIONS preflight

```
OPTIONS /students/schedule/files/Raspisanie_2025-2026.htm
Origin: https://example.github.io
Access-Control-Request-Method: GET
```

**Ответ:**
```
Allow: OPTIONS, TRACE, GET, HEAD, POST
```

**Нет CORS-заголовков.**

## Вывод

Сервер kasict.ru (IIS 8.5) не настроен для CORS. Браузер заблокирует любой cross-origin `fetch()` к этим файлам.

## Решение: GitHub Actions + статический JSON

Архитектура:

```
GitHub Actions (cron / manual)
    ↓
Python-скрипт скачивает HTML с kasict.ru (без CORS, серверный запрос)
    ↓
Парсит расписание + замены
    ↓
Генерирует JSON-файлы
    ↓
Коммитит в репозиторий
    ↓
GitHub Pages раздаёт JSON
    ↓
PWA читает JSON с того же origin (один домен → CORS не нужен)
```

Таким образом:
- Нет собственного backend/сервера
- Нет CORS-проблем
- Данные обновляются автоматически
- PWA работает полностью на клиенте
