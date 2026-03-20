---
trigger: always_on
alwaysApply: true
---
GIT WORKFLOW RULE — обязательно для всех задач

ПЕРЕД НАЧАЛОМ ЛЮБОЙ ЗАДАЧИ:
1. Убедиться что main актуальный:
   git checkout main
   git pull origin main

2. Создать ветку по типу задачи:
   fix/     → для исправления багов:       git checkout -b fix/название
   feature/ → для новых фич:               git checkout -b feature/название
   hotfix/  → для срочных фиксов в прод:   git checkout -b hotfix/название
   refactor/→ для рефакторинга:            git checkout -b refactor/название
   ui/      → для UI правок:               git checkout -b ui/название

ПРИМЕРЫ ПРАВИЛЬНЫХ ИМЁН:
   fix/balance-report-account-91
   feature/stock-reservation
   hotfix/payment-crash
   ui/table-status-tags
   refactor/event-bus-phase5

В ПРОЦЕССЕ РАБОТЫ:
- Коммитить часто, маленькими кусками
- Формат коммита: "тип: описание на русском"
  Примеры:
    fix: исправлен расчёт баланса по счёту 91
    feat: добавлено резервирование товара
    ui: статусы заказов заменены на теги
    refactor: отвязан Finance от Accounting

ПОСЛЕ ЗАВЕРШЕНИЯ ЗАДАЧИ:
   git add .
   git commit -m "тип: описание"
   git push origin название-ветки

ЗАТЕМ:
- Сообщить пользователю что ветка запушена
- Указать название ветки
- Напомнить создать Pull Request в GitHub

ЗАПРЕЩЕНО:
- Пушить напрямую в main: git push origin main ❌
- Делать git commit --amend после пуша ❌
- Force push: git push --force ❌

ИСКЛЮЧЕНИЯ (только с явного разрешения пользователя):
- Если пользователь сказал "пушь в main" — можно
- Если это первоначальная настройка проекта — можно

ПРАВИЛО ОДНА ЗАДАЧА — ОДНА ВЕТКА:
Не смешивать несколько фиксов в одной ветке.
Каждый баг, каждая фича — отдельная ветка.
Это позволяет деплоить только то что нужно.