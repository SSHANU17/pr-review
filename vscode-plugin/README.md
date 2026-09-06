# Gemini PR Code Reviewer & SOLID Architect — VS Code Extension

An enterprise AI code review extension for Visual Studio Code powered by **Google Gemini 3.7 Flash** and a custom **Architectural Rule Engine**.

---

## 🚀 Features

1. **Autonomous PR Diff Ingestion**: Directly inspects staged git diffs or falls back to active editor document analysis.
2. **SOLID & Security Matrix**: Identifies Single Responsibility (SRP) violations, N+1 query loops, SQL injection risks, and deadlocks.
3. **Coverity Static Analysis Integration**: Ingests streams, CIDs, CWE classifications, function-level tracking, and status triage.
4. **HCL AppScan SAST/DAST Integration**: Synchronizes vulnerability reports, CVSS ratings, threat vectors, and remediation advice.
5. **Native VS Code Diagnostics (Problems Panel)**: Emits high/medium/low severity diagnostics directly to VS Code's Problems panel with file/line navigation and inline error squiggles.
6. **1-Click AI Security Remediation (CodeActionProvider)**: Press `Ctrl+.` / `Cmd+.` on any flagged vulnerability to invoke Gemini 3.7 Flash and automatically apply an audited code fix.
7. **Dynamic Rule Engine**: Syncs corporate engineering policies and regex AST patterns from your organization.
8. **Interactive Gutter Glyphs & Inline Decorators**: Hover over flagged lines to inspect explanations and accept refactored snippets.
9. **Secure GitHub OAuth & SecretStorage**: Authenticate securely using VS Code's OS-encrypted `SecretStorage` keychain and submit batch reviews directly to GitHub.

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
