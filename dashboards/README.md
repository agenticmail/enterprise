# AgenticMail Enterprise Dashboards

**Admin dashboards in every popular language.** Pick the one that matches your stack — or use the zero-code HTML version if you're not a developer.

All dashboards connect to the same AgenticMail Enterprise API. They're interchangeable. Each is modular with separate files for routes, views, components, and utilities.

---

## Quick Start

| Language | Entry | Dependencies | Run Command | Files |
|----------|-------|-------------|-------------|-------|
| **HTML/JS** | `html/` | esbuild | `cd html && npm i && npm run dev` | 24 |
| **PHP** | `php/index.php` | PHP 7.4+ | `php -S localhost:8080 index.php` | 16 |
| **Python/Flask** | `python/app.py` | Flask, requests | `pip install flask requests && python app.py` | 24 |
| **Ruby/Sinatra** | `ruby/app.rb` | Sinatra | `gem install sinatra && ruby app.rb` | 20 |
| **Express.js** | `express/app.js` | Express | `npm i express express-session && node app.js` | 17 |
| **Go** | `go/main.go` | None (stdlib) | `cd go && go run .` | 16 |
| **Java** | `java/AgenticMailDashboard.java` | JDK 11+ | `javac *.java **/*.java && java AgenticMailDashboard` | 14 |
| **C# / .NET** | `dotnet/Program.cs` | .NET 8+ | `cd dotnet && dotnet run` | 12 |
| **Django** | `django/app.py` | Django, requests | `pip install django requests && python app.py` | 24 |
| **Laravel** | `laravel/index.php` | PHP 8.0+ | `php -S localhost:8080 index.php` | 22 |
| **Rails/Sinatra** | `rails/app.rb` | Sinatra | `gem install sinatra && ruby app.rb` | 20 |
| **React** (built-in) | _Served at `/dashboard`_ | None | Comes with the enterprise server | — |

---

## Project Structure

Every dashboard follows an idiomatic modular structure for its language:

```
dashboards/<language>/
├── entry point          # App setup, routing, config
├── routes/              # One file per resource (agents, users, api-keys, etc.)
├── views/ or templates/ # Page templates + reusable components
├── utils/ or helpers/   # API client, HTML escaping, badges, time formatting
├── middleware/           # Auth guards (where applicable)
├── components/          # Reusable UI: modals, tables, stat cards, pagination
└── public/ or static/   # styles.css (shared design system)
```

### Shared Design System

All dashboards use `shared/styles.css` — a unified CSS design system with:
- CSS custom properties for light/dark themes
- Pink accent color (`#e84393`)
- Sidebar, cards, tables, badges, buttons, forms, modals, pagination, flash messages
- Dark mode toggle + `@media(prefers-color-scheme: dark)` support
- Responsive sidebar (collapses at 768px)

Copy `shared/styles.css` into your dashboard's `public/` or `static/` folder.

---

## Feature Parity

Every dashboard implements the full feature set:

| Feature | Description |
|---------|-------------|
| **Login/Logout** | Email + password auth, JWT session |
| **Dashboard** | 4 stat cards + recent audit events |
| **Agents** | List, create (name/model/description), archive with confirm |
| **Users** | List, create (name/email/role), role badges |
| **API Keys** | List, create (name/scopes), revoke, show-once key banner |
| **Audit Log** | Paginated (25/page), prev/next, total count |
| **Settings** | Read + update (org name, model, limits, webhook), instance info |
| **Dark Mode** | Toggle with localStorage persistence |
| **Flash Messages** | Success/danger feedback on all actions |
| **Responsive** | Mobile-friendly sidebar collapse |

---

## Configuration

All dashboards use one environment variable:

```bash
AGENTICMAIL_URL=https://your-company.agenticmail.io
```

---

## API Endpoints

Every dashboard talks to the **AgenticMail Enterprise REST API**:

```
Your Dashboard  ->  REST API  ->  AgenticMail Enterprise Server
(any language)     (JSON)        (your database)
```

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/login` | Get JWT token |
| `GET` | `/api/stats` | Dashboard statistics |
| `GET` | `/api/agents` | List agents |
| `POST` | `/api/agents` | Create agent |
| `PATCH` | `/api/agents/:id` | Update/archive agent |
| `GET` | `/api/users` | List users |
| `POST` | `/api/users` | Create user |
| `GET` | `/api/api-keys` | List API keys |
| `POST` | `/api/api-keys` | Create API key |
| `DELETE` | `/api/api-keys/:id` | Revoke API key |
| `GET` | `/api/audit` | Audit log (paginated) |
| `GET` | `/api/settings` | Organization settings |
| `PATCH` | `/api/settings` | Update settings |

---

## Build Your Own

```bash
# Login
curl -X POST https://your-server/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@agenticmail.io","password":"..."}'
# Returns: { "token": "eyJ...", "user": {...} }

# Use the token
curl https://your-server/api/stats \
  -H "Authorization: Bearer eyJ..."
# Returns: { "totalAgents": 5, "activeAgents": 3, ... }
```

---

## License

MIT — Use these dashboards however you want.
