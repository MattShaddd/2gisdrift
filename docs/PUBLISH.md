# Публикация GitHub

На 2026-10-13 установлен GitHub CLI, выполнен вход под MattShaddd и создан публичный репозиторий https://github.com/MattShaddd/2gisdrift. Origin настроен на этот адрес. Теги запускают выпуск ZIP и SHA-256 через GitHub Actions; это не публикует расширение в магазинах.

Для установки GitHub CLI на новой машине:

```powershell
winget install --id GitHub.cli --exact
```

Первые команды создания репозитория уже выполнены; ниже сохранена инструкция для новой установки под другим именем (не повторять для существующего репозитория):

```powershell
gh auth login
gh repo create MattShaddd/2gisdrift --public --source=. --remote=origin --push
git tag v0.1.0
git push origin v0.1.0
```

Команда создаст публичный репозиторий и отправит main. Если нужен закрытый, замените `--public` на `--private`. GitHub Actions по тегу создаст release с установочным ZIP и SHA-256. Это ещё не публикация расширения в магазинах.

Если репозиторий уже создан в браузере, вместо `gh repo create` используйте:

```powershell
git remote add origin https://github.com/MattShaddd/2gisdrift.git
git push -u origin main
```

Если origin уже существует, сначала проверьте его `git remote -v`; не заменяйте чужой адрес и не применяйте force push.
