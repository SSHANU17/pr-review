# Gemini PR Code Reviewer & SOLID Architect — VS Code Extension

An enterprise AI code review extension for Visual Studio Code powered by **Google Gemini 3.7 Flash** and a custom **Architectural Rule Engine**.

---

## 🚀 Features

1. **Autonomous PR Diff Ingestion**: Directly inspects staged git diffs or remote GitHub PR branches.
2. **SOLID & Security Matrix**: Identifies Single Responsibility (SRP) violations, N+1 query loops, SQL injection risks, and deadlocks.
3. **Dynamic Rule Engine**: Syncs corporate engineering policies and regex AST patterns from your organization.
4. **Interactive Gutter Glyphs & Inline Decorators**: Hover over flagged lines to inspect explanations and accept 1-click refactored snippets.
5. **Secure GitHub OAuth & SecretStorage**: Authenticate securely using VS Code's OS-encrypted `SecretStorage` keychain and submit batch reviews directly to GitHub.

---

## 📦 Extension Structure

```text
/vscode-plugin
├── package.json               # Extension manifests, contributions, settings
├── tsconfig.json              # TypeScript compilation config
├── src/
│   ├── extension.ts           # Entry point: registers commands, status bar, views
│   ├── auth/
│   │   └── authProvider.ts    # GitHub OAuth 2.0 UriHandler & SecretStorage
│   ├── decorations/
│   │   └── diffDecorations.ts # Gutter glyphs, line highlighting, hover widgets
│   ├── views/
│   │   └── reviewPanel.ts     # Webview panel for reviewing findings
│   ├── rules/
│   │   └── ruleManager.ts     # .architect-rules.json parser and backend sync
│   ├── services/
│   │   └── apiClient.ts       # HTTP client connecting to Gemini review engine
│   └── models/
│       └── types.ts           # TypeScript interfaces
```

---

## 🛠️ Setup & Development

1. Open this folder in VS Code:
   ```bash
   cd vscode-plugin
   npm install
   npm run compile
   ```
2. Press `F5` in VS Code to launch the Extension Development Host.
3. Open a Git repository and run `Gemini: Review Current Git Diff & PR` from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
