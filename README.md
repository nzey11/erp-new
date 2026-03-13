# ListOpt ERP

Полнофункциональная ERP-система для управления товарами, складом, документами и электронной коммерцией.

## 🚀 Возможности

- **Управление каталогом** - Товары, варианты, категории, прайс-листы
- **Складской учёт** - Остатки, резервы, себестоимость
- **Документооборот** - Закупки, продажи, перемещения, инвентаризация
- **Финансы** - Платежи, отчёты (P&L, Cash Flow, балансы)
- **E-commerce** - Интернет-магазин с корзиной, заказами, отзывами
- **Интеграции** - Telegram боты, webhooks

## 📋 Технологии

- **Frontend:** Next.js 16 (App Router), React 19, TailwindCSS, shadcn/ui
- **Backend:** Next.js API Routes
- **База данных:** PostgreSQL 16 + Prisma ORM
- **Деплой:** PM2 + Nginx
- **Тесты:** Vitest (unit/integration), Playwright (e2e)

## 🔧 Быстрый старт

### Установка

```bash
# Клонировать репозиторий
git clone https://github.com/nzey11/erp-new.git
cd erp-new

# Установить зависимости
npm install

# Настроить базу данных
cp .env.example .env
# Отредактируйте .env и укажите DATABASE_URL

# Применить миграции
npm run db:push

# Заполнить тестовыми данными (опционально)
npm run db:seed

# Запустить dev-сервер
npm run dev
```

Приложение будет доступно по адресу: http://localhost:3000

### Первый вход

**Логин:** admin  
**Пароль:** admin123

## 📚 Документация

- [Архитектура](./ARCHITECTURE.md) - Структура проекта и модули
- [Wiki](https://github.com/nzey11/erp-new/wiki) - Полная документация

## 🚢 Деплой

Проект использует release-based CI/CD через GitHub Actions. Сборка выполняется только в CI — на production сервере `next build` не запускается.

```
git push origin main
  → pre-push: lint + typecheck + unit tests
  → GitHub Actions: verify (lint / tests / build) → deploy (artifact → VPS)
  → current symlink switch → pm2 reload → smoke check
```

Подробная инструкция: [`docs/deploy.md`](./docs/deploy.md)

## 🧪 Тестирование

### Слои тестов

| Команда | Что тестирует | Нужна БД |
|---------|--------------|----------|
| `npm run test:unit` | Чистые unit-тесты (документы, auth, rate-limit) — без БД, быстро | Нет |
| `npm run test:service` | Сервисные тесты бизнес-логики (`stock-movements`, `StockRecord`, идемпотентность) | Да |
| `npm run test:integration` | Интеграционные тесты — API routes, репозитории, транзакции | Да |
| `npm run test:e2e` | Playwright e2e smoke-тесты UI | Да |
| `npm run test:all` | Все тесты (`vitest.config.ts`) | Да |
| `npm run test:cov` | Тесты + отчёт о покрытии | Да |

### Быстрый запуск

```bash
# 1. Только unit — не нужна БД:
npm run test:unit

# 2. Сервисные тесты (нужен listopt_erp_test в .env.test):
npm run test:service

# 3. Интеграционные тесты:
npm run test:integration

# 4. E2E (Playwright — нужен запущенный сервер):
npm run test:e2e

# 5. Все тесты разом:
npm run test:all
```

### Структура тестов

```
tests/
  helpers/
    factories.ts            # Фабрики для всех сущностей БД
    test-db.ts              # cleanDatabase, disconnectTestDb
    stock-assertions.ts     # Хелперы: assertStockRecord, assertStockMatchesMovements,
                            #          assertMovementCount, assertIdempotentOperation ...
  unit/lib/
    documents.test.ts       # Чистые unit — маппинг типов документов
    auth.test.ts            # Чистые unit — HMAC auth helpers
    rate-limit.test.ts      # Чистые unit — rate limiter
    stock-movements.test.ts # Сервисные тесты — confirm/cancel/idempotency:
                            #   incoming_shipment, write_off, stock_transfer
  integration/
    documents/
      stock.test.ts                            # recalculateStock, averageCost
      balance.test.ts                          # counterparty balance
      stock-movements.integration.test.ts      # DB persistence, invariants,
                                               #   idempotency, transfer conservation
    api/                                       # Next.js API route handlers
    catalog/                                   # Каталог и варианты
```

### Ключевые инварианты (проверяются в тестах)

- `StockRecord.quantity` всегда равен сумме всех `StockMovement.quantity` для той же пары `(warehouseId, productId)`
- Подтверждение документа идемпотентно — повторный вызов не создаёт дубли движений
- Отмена документа создаёт реверсирующие движения, исходные не удаляются (audit log)
- Повторная отмена идемпотентна
- Транзакция на пакет движений либо полностью применяется, либо откатывается

### Настройка тестовой БД

Файл `.env.test` уже настроен. Тестовая БД запускается через Docker:

```bash
# Поднять тестовую БД (порт 5434)
docker compose -f docker-compose.dev.yml up -d

# Применить миграции к тестовой БД
DATABASE_URL="postgresql://test:test@localhost:5434/listopt_erp_test" npx prisma migrate deploy
```

## 📦 Структура проекта

```
listopt-erp/
├── app/                    # Next.js App Router
│   ├── (accounting)/       # Модуль учёта (страницы)
│   ├── api/               # API endpoints
│   └── store/             # E-commerce фронт
├── components/            # React компоненты
│   ├── accounting/        # Компоненты учёта
│   ├── ecommerce/         # Компоненты магазина
│   └── ui/               # UI библиотека (shadcn/ui)
├── lib/                   # Бизнес-логика
│   ├── modules/           # Модули (accounting, ecommerce, integrations)
│   └── shared/            # Общие утилиты
├── prisma/                # Prisma schema + миграции
└── tests/                 # Тесты
```

## 🤝 Участие в разработке

1. Fork репозитория
2. Создайте feature branch (`git checkout -b feature/amazing-feature`)
3. Commit изменения (`git commit -m 'Add amazing feature'`)
4. Push в branch (`git push origin feature/amazing-feature`)
5. Откройте Pull Request

## 📄 Лицензия

MIT

## 🔗 Ссылки

- [GitHub](https://github.com/nzey11/erp-new)
- [Wiki](https://github.com/nzey11/erp-new/wiki)
- [Issues](https://github.com/nzey11/erp-new/issues)
