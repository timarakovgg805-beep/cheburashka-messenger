# Чебурашка Messenger - Play Store

## Как собрать APK

### Требования
- Android Studio (или Gradle + JDK)
- Android SDK

### Сборка в Android Studio
1. Открой Android Studio
2. File → Open → выбери папку `play-store`
3. Жди синхронизацию Gradle
4. Build → Build Bundle(s) / APK(s) → Build APK

### Сборка через командную строку
```bash
cd play-store
./gradlew assembleDebug
```

APK появится в `app/build/outputs/apk/debug/app-debug.apk`

## Как загрузить в Play Market

1. Создай аккаунт разработчика (платно ~$25)
2. Создай приложение в Google Play Console
3. Заполни информацию:
   - Название: Чебурашка Мессенджер
   - Описание: Мессенджер для общения
   - Скриншоты: добавь из приложения
4. Загрузи APK
5. Отправь на проверку

## Структура проекта
```
play-store/
├── app/
│   ├── src/main/
│   │   ├── java/com/cheburashka/messenger/
│   │   │   └── MainActivity.java
│   │   └── AndroidManifest.xml
│   └── build.gradle
├── build.gradle
├── settings.gradle
└── package.json
```

## URL приложения
Замени в `MainActivity.java`:
```java
webView.loadUrl("https://cheburashka-messenger.onrender.com");
```
на свой URL.