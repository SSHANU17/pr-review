# Gemini PR Code Reviewer — Backend API Service

Express 4.x REST API & Webhook Service backed by **Google Gemini 3.7 Flash** (`@google/genai`) and an **Architectural Rule Engine**.

---

## 🏛️ Module Architecture

```text
/backend
├── package.json
├── README.md
└── src/
    ├── app.ts                         # Express server initialization & middleware
    ├── config/
    │   └── default-rules.ts           # Built-in SOLID & Security rule catalog
    ├── models/
    │   └── types.ts                   # TypeScript interfaces (Rule, Finding, Webhook)
    ├── routes/
    │   └── api.routes.ts              # API routes (/review, /rules, /webhook/github, /github/token-verify)
    └── services/
        ├── gemini.service.ts          # GenAI prompt compiler with exponential backoff
        ├── ast-analyzer.service.ts    # Fallback static analysis engine
        ├── rule-engine.service.ts     # In-memory rule CRUD & prompt directive builder
        ├── webhook.service.ts         # HMAC SHA-256 validator & delivery history logger
        └── octokit.service.ts         # GitHub REST API review submission & auth client
```

---

## 🔌 Core API Endpoints

- `POST /api/review` — Review git diff with Gemini 3.7 Flash + active rules
- `GET /api/rules` — Retrieve all default & custom architecture policies
- `POST /api/rules` — Add custom corporate rule (regex pattern, severity, template)
- `PUT /api/rules/:id` — Update existing rule or toggle active state
- `DELETE /api/rules/:id` — Delete custom rule
- `POST /api/rules/reset` — Reset to standard architecture baseline
- `POST /api/webhook/github` — GitHub Webhook endpoint with HMAC-SHA256 signature verification
- `GET /api/webhook/deliveries` — Real-time webhook event audit logs
- `POST /api/github/token-verify` — Validate GitHub personal access or OAuth token
- `POST /api/github/submit-review` — Push approved comments directly to PR on GitHub
