# Gemini PR Code Reviewer — Frontend UI

High-performance Angular 21 application built with Zoneless change detection, modern Signals, and Tailwind CSS.

---

## 🏛️ Directory Structure

```text
/frontend
├── package.json
├── README.md
└── src/app/
    ├── components/
    │   └── diff-viewer.ts            # Side-by-side & Unified syntax highlighted diff viewer
    ├── services/
    │   └── review.ts                 # Reactive review orchestrator and HTTP gateway
    ├── models/
    │   └── review.model.ts           # Unified data models, rule structures, and findings
    ├── utils/
    │   ├── diff-parser.ts            # AST diff tokenizer & line mapper
    │   └── syntax-highlighter.ts     # Multi-language tokenizer with prism themes
    ├── data/
    │   └── source-code-files.ts      # Interactive source code catalog
    ├── app.ts                        # Root component with state signals & computed metrics
    ├── app.html                      # Modular tabbed UI (Review, Rules, Webhook, VS Code, Matrix, Code)
    └── app.css                       # Modern dark-mode theme & animations
```

---

## 🌟 Key Capabilities

1. **Interactive Diff Reviewer**: Side-by-side split & unified view modes with expand/collapse, line hover, and inline comment anchors.
2. **Rule Engine Policy Center**: Filter, search, create, test, and toggle architectural policies live.
3. **GitHub Webhook Inspector**: Test real-time CI/CD deliveries, verify HMAC signatures, and inspect event payloads.
4. **VS Code Plugin Emulator**: Live preview of the VS Code extension interface and configuration sync.
5. **Architectural Evaluation Matrix**: Real-time scores across SOLID, Security, Performance, and Clean Code dimensions.
