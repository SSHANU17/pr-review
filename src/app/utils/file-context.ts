import { DiffLine, ParsedDiffFile, tokenizeCode, DiffFindingRef } from './diff-parser';
import { ALL_SOURCE_FILES } from '../data/source-code-files';

/**
 * FileContextEngine supplies realistic or actual source code lines for files
 * being reviewed, enabling hunk expansion (unfolding lines above and below).
 */
export class FileContextEngine {
  private static readonly fileCache = new Map<string, string[]>();

  static {
    // Initialize cache with known project files
    for (const doc of ALL_SOURCE_FILES) {
      this.registerFileContent(doc.path, doc.code);
      const filename = doc.path.split('/').pop() || '';
      if (filename) {
        this.registerFileContent(filename, doc.code);
      }
    }
  }

  /**
   * Register known file content in cache
   */
  public static registerFileContent(path: string, content: string): void {
    if (!path || !content) return;
    const clean = path.replace(/^[./]+/, '').toLowerCase();
    const lines = content.split(/\r?\n/);
    this.fileCache.set(clean, lines);
    const fname = clean.split('/').pop() || '';
    if (fname) {
      this.fileCache.set(fname, lines);
    }
  }

  /**
   * Retrieve source lines for a given file path
   */
  public static getFileLines(filePath: string, minLinesNeeded = 100): string[] {
    if (!filePath) return this.generateSyntheticLines('README.md', minLinesNeeded);

    const clean = filePath.replace(/^[./]+/, '').toLowerCase();
    const fname = clean.split('/').pop() || '';

    if (this.fileCache.has(clean)) {
      return this.fileCache.get(clean)!;
    }
    if (this.fileCache.has(fname)) {
      return this.fileCache.get(fname)!;
    }

    // Generate language-specific realistic lines
    const synthetic = this.generateSyntheticLines(filePath, minLinesNeeded);
    this.fileCache.set(clean, synthetic);
    return synthetic;
  }

  /**
   * Synthesize realistic context code based on file extension and path
   */
  public static generateSyntheticLines(filePath: string, totalLines = 120): string[] {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const name = filePath.split('/').pop() || 'file';

    if (ext === 'md' || name.toLowerCase().startsWith('readme')) {
      return [
        `# ${name.replace(/\.md$/i, '')}`,
        '',
        '> Architect-level Pull Request Code Reviewer & Automated AST Quality Pipeline.',
        '',
        '## Table of Contents',
        '- [Overview](#overview)',
        '- [Architecture & Principles](#architecture--principles)',
        '- [Getting Started](#getting-started)',
        '- [Installation](#installation)',
        '- [Configuration](#configuration)',
        '- [API Reference](#api-reference)',
        '- [Security & Compliance](#security--compliance)',
        '- [Contributing](#contributing)',
        '- [License](#license)',
        '',
        '## Overview',
        'This repository provides an automated review engine powered by Google Gemini 3.7 Flash.',
        'It inspects incoming Git unified diffs for SOLID principles, race conditions, memory leaks,',
        'and security vulnerabilities, delivering real-time actionable inline comments directly to GitHub PRs.',
        '',
        '## Architecture & Principles',
        'The codebase enforces strict separation of concerns across 3 primary layers:',
        '1. **Backend Service Layer**: Handles Express routing, HMAC signature verification, and GenAI SDK integration.',
        '2. **Frontend Review Studio**: Angular 21 zoneless architecture with real-time diff syntax highlighting.',
        '3. **VS Code Extension**: Direct developer integration with OAuth 2.0 authentication and secret storage.',
        '',
        '## Getting Started',
        'Clone this repository and verify your Node.js environment (v20+ recommended):',
        '```bash',
        'git clone https://github.com/google-gemini/architect-ai.git',
        'cd architect-ai',
        'npm install',
        'npm run dev',
        '```',
        '',
        '## Configuration',
        'Set your environment variables in `.env`:',
        '```env',
        'PORT=3000',
        'GEMINI_API_KEY=your_gemini_api_key_here',
        'GITHUB_WEBHOOK_SECRET=your_webhook_hmac_secret',
        '```',
        '',
        '## API Reference',
        '- `POST /api/review`: Submit a unified git diff for multi-criteria AST review.',
        '- `GET /api/rules`: Retrieve active architecture rules.',
        '- `POST /api/github/fetch-pr`: Ingest live GitHub Pull Request data and changed files.',
        '- `POST /api/github/submit-review`: Post batch approved review comments to GitHub PR.',
        '',
        '## Security & Compliance',
        'All incoming Webhooks are validated via HMAC SHA-256 signatures before AST parsing.',
        'No sensitive customer keys or tokens are stored in unencrypted memory.',
        '',
        '## Contributing',
        'Please submit pull requests targeting the `main` branch with comprehensive tests.',
        '',
        '## License',
        'Apache 2.0 License. Copyright (c) 2026 Google LLC.',
      ];
    }

    if (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx') {
      const className = name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9]/g, '');
      const PascalName = className.charAt(0).toUpperCase() + className.slice(1);

      return [
        `import { Injectable, inject } from '@angular/core';`,
        `import { HttpClient } from '@angular/common/http';`,
        `import { Observable, BehaviorSubject, of } from 'rxjs';`,
        `import { map, catchError, filter, switchMap } from 'rxjs/operators';`,
        ``,
        `export interface ${PascalName}Config {`,
        `  readonly id: string;`,
        `  readonly enabled: boolean;`,
        `  readonly timeoutMs: number;`,
        `  readonly retryLimit: number;`,
        `  readonly metadata?: Record<string, unknown>;`,
        `}`,
        ``,
        `export interface ${PascalName}State {`,
        `  status: 'idle' | 'loading' | 'ready' | 'error';`,
        `  lastUpdated: number;`,
        `  itemsCount: number;`,
        `  data: unknown[];`,
        `}`,
        ``,
        `/**`,
        ` * ${PascalName} manages business logic, event dispatching, and state caching.`,
        ` */`,
        `@Injectable({`,
        `  providedIn: 'root',`,
        `})`,
        `export class ${PascalName} {`,
        `  private readonly http = inject(HttpClient);`,
        `  private readonly state$ = new BehaviorSubject<${PascalName}State>({`,
        `    status: 'idle',`,
        `    lastUpdated: Date.now(),`,
        `    itemsCount: 0,`,
        `    data: [],`,
        `  });`,
        ``,
        `  constructor() {`,
        `    this.initializeService();`,
        `  }`,
        ``,
        `  private initializeService(): void {`,
        `    console.log('[${PascalName}] Service initialized with high-availability config');`,
        `  }`,
        ``,
        `  public getState(): Observable<${PascalName}State> {`,
        `    return this.state$.asObservable();`,
        `  }`,
        ``,
        `  public async executePipeline(contextId: string, options: Partial<${PascalName}Config> = {}): Promise<boolean> {`,
        `    try {`,
        `      this.state$.next({ ...this.state$.value, status: 'loading' });`,
        `      await this.validateContext(contextId);`,
        `      return true;`,
        `    } catch (err: unknown) {`,
        `      this.state$.next({ ...this.state$.value, status: 'error' });`,
        `      return false;`,
        `    }`,
        `  }`,
        ``,
        `  private async validateContext(id: string): Promise<void> {`,
        `    if (!id || id.trim().length === 0) {`,
        `      throw new Error('Invalid context identifier provided to ${PascalName}');`,
        `    }`,
        `  }`,
        ``,
        `  public dispose(): void {`,
        `    this.state$.complete();`,
        `  }`,
        `}`,
      ];
    }

    if (ext === 'json') {
      return [
        `{`,
        `  "name": "${name.replace(/\.json$/i, '')}",`,
        `  "version": "1.0.0",`,
        `  "private": true,`,
        `  "description": "Enterprise application configuration and build manifest",`,
        `  "scripts": {`,
        `    "start": "node dist/server.js",`,
        `    "build": "tsc -b",`,
        `    "test": "jest --coverage",`,
        `    "lint": "eslint src --ext .ts"`,
        `  },`,
        `  "dependencies": {`,
        `    "@google/genai": "^0.1.2",`,
        `    "express": "^4.21.2",`,
        `    "cors": "^2.8.5"`,
        `  },`,
        `  "devDependencies": {`,
        `    "@types/node": "^20.17.19",`,
        `    "typescript": "^5.6.0"`,
        `  }`,
        `}`,
      ];
    }

    // Default generic code
    const lines: string[] = [];
    for (let i = 1; i <= Math.max(totalLines, 80); i++) {
      lines.push(`// Line ${i}: ${filePath} context definition and execution logic`);
    }
    return lines;
  }
}

/**
 * Expand lines above a target hunk in a parsed diff file
 */
export function expandHunkUp(
  file: ParsedDiffFile,
  hunkIndex: number,
  lineCount = 20,
  findings: DiffFindingRef[] = []
): boolean {
  if (!file || !file.hunks || !file.hunks[hunkIndex]) return false;

  const hunk = file.hunks[hunkIndex];
  // Determine current starting line in the hunk (excluding the header line)
  const firstCodeLine = hunk.lines.find((l) => l.type !== 'hunk-header');
  const currentStart = firstCodeLine
    ? (firstCodeLine.newLineNumber ?? firstCodeLine.oldLineNumber ?? hunk.newStart)
    : hunk.newStart;

  if (currentStart <= 1) {
    // Already at the top of the file
    return false;
  }

  const prevHunk = hunkIndex > 0 ? file.hunks[hunkIndex - 1] : null;
  const prevEndLine = prevHunk
    ? Math.max(
        ...prevHunk.lines
          .filter((l) => l.type !== 'hunk-header')
          .map((l) => l.newLineNumber ?? l.oldLineNumber ?? 0)
      )
    : 0;

  const targetStart = Math.max(1, prevEndLine + 1, currentStart - lineCount);
  if (targetStart >= currentStart) return false;

  const sourceLines = FileContextEngine.getFileLines(file.newPath || file.oldPath, currentStart + 50);

  const newLines: DiffLine[] = [];
  for (let ln = targetStart; ln < currentStart; ln++) {
    const rawContent = sourceLines[ln - 1] !== undefined ? sourceLines[ln - 1] : `// Context line ${ln}`;
    const matchingFindings = findings.filter(
      (f) => (f.path.includes(file.fileName) || file.newPath.includes(f.path)) && f.line === ln
    );

    newLines.push({
      id: `exp_up_${file.id}_${ln}_${Date.now()}`,
      type: 'context',
      raw: ' ' + rawContent,
      content: rawContent,
      oldLineNumber: ln,
      newLineNumber: ln,
      tokens: tokenizeCode(rawContent),
      findings: matchingFindings,
    });
  }

  // Prepend to hunk.lines right after the hunk header
  const headerLineIndex = hunk.lines.findIndex((l) => l.type === 'hunk-header');
  if (headerLineIndex >= 0) {
    hunk.lines.splice(headerLineIndex + 1, 0, ...newLines);
  } else {
    hunk.lines.unshift(...newLines);
  }

  // Update hunk start properties
  hunk.oldStart = targetStart;
  hunk.newStart = targetStart;
  hunk.newLength += newLines.length;
  hunk.oldLength += newLines.length;

  return true;
}

/**
 * Expand lines below a target hunk in a parsed diff file
 */
export function expandHunkDown(
  file: ParsedDiffFile,
  hunkIndex: number,
  lineCount = 20,
  findings: DiffFindingRef[] = []
): boolean {
  if (!file || !file.hunks || !file.hunks[hunkIndex]) return false;

  const hunk = file.hunks[hunkIndex];
  const codeLines = hunk.lines.filter((l) => l.type !== 'hunk-header');
  const currentEnd = codeLines.length > 0
    ? Math.max(...codeLines.map((l) => l.newLineNumber ?? l.oldLineNumber ?? 0))
    : hunk.newStart + hunk.newLength;

  const nextHunk = hunkIndex < file.hunks.length - 1 ? file.hunks[hunkIndex + 1] : null;
  const nextStartLine = nextHunk
    ? (nextHunk.lines.find((l) => l.type !== 'hunk-header')?.newLineNumber ?? nextHunk.newStart)
    : Infinity;

  const sourceLines = FileContextEngine.getFileLines(file.newPath || file.oldPath, currentEnd + lineCount + 20);
  const maxAvailableLines = Math.max(sourceLines.length, currentEnd + lineCount);

  const targetEnd = Math.min(nextStartLine - 1, currentEnd + lineCount, maxAvailableLines);
  if (targetEnd <= currentEnd) return false;

  const newLines: DiffLine[] = [];
  for (let ln = currentEnd + 1; ln <= targetEnd; ln++) {
    const rawContent = sourceLines[ln - 1] !== undefined ? sourceLines[ln - 1] : `// Context line ${ln}`;
    const matchingFindings = findings.filter(
      (f) => (f.path.includes(file.fileName) || file.newPath.includes(f.path)) && f.line === ln
    );

    newLines.push({
      id: `exp_down_${file.id}_${ln}_${Date.now()}`,
      type: 'context',
      raw: ' ' + rawContent,
      content: rawContent,
      oldLineNumber: ln,
      newLineNumber: ln,
      tokens: tokenizeCode(rawContent),
      findings: matchingFindings,
    });
  }

  // Append new lines to hunk
  hunk.lines.push(...newLines);
  hunk.newLength += newLines.length;
  hunk.oldLength += newLines.length;

  return true;
}

/**
 * Expand all surrounding lines (top and bottom) for the entire file
 */
export function expandAllHunksInFile(
  file: ParsedDiffFile,
  findings: DiffFindingRef[] = []
): void {
  if (!file || !file.hunks) return;

  for (let i = 0; i < file.hunks.length; i++) {
    expandHunkUp(file, i, 100, findings);
    expandHunkDown(file, i, 100, findings);
  }
}

/**
 * Collapse expanded lines for a specific hunk in the parsed diff file,
 * restoring original minimal diff lines
 */
export function collapseHunk(
  file: ParsedDiffFile,
  hunkIndex: number,
  originalFile: ParsedDiffFile
): boolean {
  if (!file || !file.hunks || !file.hunks[hunkIndex]) return false;
  if (!originalFile || !originalFile.hunks || !originalFile.hunks[hunkIndex]) return false;

  file.hunks[hunkIndex] = JSON.parse(JSON.stringify(originalFile.hunks[hunkIndex]));
  return true;
}

