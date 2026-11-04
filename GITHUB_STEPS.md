# Публикация на GitHub (делаете вы)
1. Зарегистрируйтесь на github.com (почта + подтверждение, пароль вводите сами) и включите 2FA.
2. New repository -> имя `sol-tx-explainer`, Public, лицензия MIT, без README (он уже есть).
3. Распакуйте архив. В папке проекта в терминале:
   git init && git add . && git commit -m "Initial release v0.1"
   git branch -M main
   git remote add origin https://github.com/<ваш-логин>/sol-tx-explainer.git
   git push -u origin main
4. Releases -> Create a new release -> тег v0.1.0 -> опишите коротко возможности.
5. Через неделю, когда будут коммиты (например, новые декодеры), подавайте заявку на solana.org/grants и вставьте ссылку на репозиторий в GRANT_DRAFT.md.
