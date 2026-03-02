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

Проект поддерживает деплой на VPS через SSH (архивный метод):

```bash
# Создать архив
tar --exclude='node_modules' --exclude='.next' --exclude='.git' \
    --exclude='*.db' --exclude='.env' -czf deploy.tar.gz .

# Загрузить на сервер
scp -i ~/.ssh/key deploy.tar.gz root@your-server:/tmp/

# Развернуть на сервере
ssh -i ~/.ssh/key root@your-server \
  "cd /var/www/app && tar -xzf /tmp/deploy.tar.gz && \
   npm install && npm run build && pm2 restart app"
```

Подробная инструкция: [Wiki - Deployment](https://github.com/nzey11/erp-new/wiki/Deployment)

## 🧪 Тестирование

```bash
# Unit и integration тесты
npm test

# E2E тесты
npm run test:e2e

# Покрытие кода
npm run test:coverage
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
