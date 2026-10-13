# Оставшийся шаг GitHub

На 2026-10-13 локальный репозиторий подготовлен; CLI `gh` на машине отсутствует. Подключённый GitHub сообщил логин `MattShaddd`, запрос репозитория `MattShaddd/2gisdrift` вернул 404. Коннектор не предоставляет создание репозитория, поэтому публикация не выполнена.

Установите GitHub CLI:

```powershell
winget install --id GitHub.cli --exact
```

Откройте новый PowerShell, войдите в нужный GitHub-аккаунт и выполните из папки этого репозитория:

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
