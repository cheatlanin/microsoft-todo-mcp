# Security

## Защита токена при переходе между страницами

Адрес из `cursor` или `@odata.nextLink` проверяется до получения токена: разрешён
только HTTPS с тем же origin (протокол, хост и порт), что у `MS_TODO_GRAPH_BASE`.
URL с логином, паролем или фрагментом отклоняется. Автоматические HTTP-перенаправления
отключены для всех запросов Graph.

`MS_TODO_GRAPH_BASE` — доверенная настройка запуска, а не пользовательский ввод.
По умолчанию используется `https://graph.microsoft.com/v1.0`; меняйте её только
на доверенный адрес Microsoft Graph соответствующего облака.

## Хранение токенов на Windows

Кеш шифруется системным DPAPI в режиме `CurrentUser`. Данные передаются Windows
PowerShell через stdin/stdout; токен не попадает в аргументы запуска или временный
открытый файл. При ошибке шифрования запись отклоняется без перехода к открытому JSON.
Запись зашифрованного кеша выполняется через временный файл с атомарным переименованием.
По умолчанию используется `token-cache.dpapi`: старый `token-cache.json` не читается
автоматически. Приложения, работающие под тем же пользователем Windows, остаются
внутри границы доверия DPAPI.

Для ограничения доступа к папке выполните `scripts/protect-cache.ps1 -CacheDirectory
<папка>`: доступ остаётся у текущего пользователя и SYSTEM. На других ОС сохраняется
кеш JSON с правами `0600`; DPAPI не заявляется как межплатформенная защита.
Для первой проверки используйте `--readonly --scope-readonly` с отдельным кешем.

## Reporting a vulnerability

Please **don't** open a public issue for security problems. Instead, open a private security advisory:
**GitHub → repository → Security → Report a vulnerability** (`/security/advisories/new`). I'll acknowledge within a few days.

## What this tool touches

- Authenticates to Microsoft Graph as **you** via delegated auth (device-code flow), with the **`Tasks.ReadWrite`** scope only — your To Do lists, tasks, and checklist items. Nothing else (no mail, files, calendar). Running with `--scope-readonly` narrows that to `Tasks.Read`.
- On Windows, encrypts the MSAL cache using current-user DPAPI (`token-cache.dpapi`). On POSIX, uses `token-cache.json` with `0600` permissions. `microsoft-todo-mcp logout` deletes the local cache; stop running server processes before signing out.
- Uses a **public client** — there is no client secret anywhere in this project or its config. By default the client id is Microsoft's well-known *Microsoft Graph CLI* public client (so the consent screen reads "Microsoft Graph Command Line Tools"); set `MS_TODO_CLIENT_ID` to use your own Entra app. A public-client id is not sensitive.
- Sends **no telemetry** and makes no network calls other than to Microsoft Graph and (during `login`) the Microsoft identity platform. Logs are written to stderr on your machine and nowhere else; token-like values are redacted from logs and error output.

## Hardening options

- `--readonly` — expose only read tools (runtime guard).
- `--no-destructive` — expose writes but not deletes.
- `--scope-readonly` — request a `Tasks.Read`-only token (a real capability boundary, not just a runtime guard; requires re-login).

## Dependencies

Runtime dependencies are kept to a minimum: `@modelcontextprotocol/sdk`, `@azure/msal-node`, `zod`. HTTP uses the Node built-in `fetch`; logging is hand-rolled. Fewer dependencies, smaller attack surface.
