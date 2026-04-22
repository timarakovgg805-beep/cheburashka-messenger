# Настройка MongoDB Atlas для Cheburashka Messenger

## Шаг 1: Создать бесплатный аккаунт MongoDB Atlas

1. Перейди на https://www.mongodb.com/cloud/atlas/register
2. Зарегистрируйся (можно через Google)
3. Выбери FREE tier (M0 Sandbox - бесплатно навсегда)
4. Выбери регион (например, AWS / Frankfurt или ближайший к тебе)
5. Назови кластер: cheburashka-cluster

## Шаг 2: Настроить доступ

1. В разделе "Database Access" создай пользователя:
   - Username: cheburashka
   - Password: (сгенерируй сложный пароль и сохрани его)
   - Database User Privileges: Read and write to any database

2. В разделе "Network Access" добавь IP адрес:
   - Нажми "Add IP Address"
   - Выбери "Allow Access from Anywhere" (0.0.0.0/0)
   - Это нужно для Render

## Шаг 3: Получить строку подключения

1. Нажми "Connect" на своем кластере
2. Выбери "Connect your application"
3. Скопируй строку подключения (Connection String)
4. Она будет выглядеть так:
   mongodb+srv://cheburashka:<password>@cheburashka-cluster.xxxxx.mongodb.net/?retryWrites=true&w=majority

5. Замени <password> на свой пароль пользователя

## Шаг 4: Добавить в Render

1. Зайди на Render.com в свой сервис cheburashka-messenger
2. Перейди в "Environment"
3. Добавь переменную окружения:
   - Key: MONGODB_URI
   - Value: (вставь строку подключения из шага 3)

4. Сохрани и подожди, пока Render перезапустит сервис

## Готово!

Теперь все данные (пользователи, сообщения, доска позора) будут храниться в MongoDB и не пропадут при перезапуске Render.

Для локального тестирования можешь использовать ту же строку подключения или оставить как есть (будет использоваться локальный JSON).
