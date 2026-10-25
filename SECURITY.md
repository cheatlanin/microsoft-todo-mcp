# Security

## Защита токена при переходе между страницами

Адрес из `cursor` или `@odata.nextLink` проверяется до получения токена: разрешён
только HTTPS с тем же origin (протокол, хост и порт), что у `MS_TODO_GRAPH_BASE`.
URL с логином, паролем или фрагментом отклоняется. Автоматические HTTP-перенаправления
отключены для всех запросов Graph.

`MS_TODO_GRAPH_BASE` — доверенная настройка запуска, а не пользовательский ввод.
По умолчанию используется `https://graph.microsoft.com/v1.0`; меняйте её только
на доверенный адрес Microsoft Graph соответствующего облака.

Это исправление не меняет хранение токенов: кеш по-прежнему является незашифрованным
файлом. На Windows права `0600` не заменяют настройку ACL. До подключения личного
аккаунта необходимо отдельно защитить хранилище токенов. Для проверки только чтения
используйте оба флага `--readonly --scope-readonly` с отдельным кешем и новым входом.

## Reporting a vulnerability

Please **don't** open a public issue for security problems. Instead, open a private security advisory:
**GitHub → repository → Security → Report a vulnerability** (`/security/advisories/new`). I'll acknowledge within a few days.

## What this tool touches

- Authenticates to Microsoft Graph as **you** via delegated auth (device-code flow), with the **`Tasks.ReadWrite`** scope only — your To Do lists, tasks, and checklist items. Nothing else (no mail, files, calendar). Running with `--scope-readonly` narrows that to `Tasks.Read`.
- Caches the MSAL token (which contains a **refresh token**) at `~/.config/microsoft-todo-mcp/token-cache.json` with `0600` permissions. Treat that file like an SSH private key. `microsoft-todo-mcp logout` deletes it.
- Uses a **public client** — there is no client secret anywhere in this project or its config. By default the client id is Microsoft's well-known *Microsoft Graph CLI* public client (so the consent screen reads "Microsoft Graph Command Line Tools"); set `MS_TODO_CLIENT_ID` to use your own Entra app. A public-client id is not sensitive.
- Sends **no telemetry** and makes no network calls other than to Microsoft Graph and (during `login`) the Microsoft identity platform. Logs are written to stderr on your machine and nowhere else; token-like values are redacted from logs and error output.

## Hardening options

- `--readonly` — expose only read tools (runtime guard).
- `--no-destructive` — expose writes but not deletes.
- `--scope-readonly` — request a `Tasks.Read`-only token (a real capability boundary, not just a runtime guard; requires re-login).

## Dependencies

Runtime dependencies are kept to a minimum: `@modelcontextprotocol/sdk`, `@azure/msal-node`, `zod`. HTTP uses the Node built-in `fetch`; logging is hand-rolled. Fewer dependencies, smaller attack surface.
