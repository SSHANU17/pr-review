import * as vscode from 'vscode';
import { ReviewResult, ReviewFinding } from '../models/types';
import { GitHubAuthProvider } from '../auth/authProvider';
import { ApiClient } from '../services/apiClient';

export class ReviewWebviewPanel {
  public static currentPanel: ReviewWebviewPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private currentResult: ReviewResult | null = null;

  public static createOrShow(
    extensionUri: vscode.Uri,
    apiClient: ApiClient,
    authProvider: GitHubAuthProvider
  ): ReviewWebviewPanel {
    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

    if (ReviewWebviewPanel.currentPanel) {
      ReviewWebviewPanel.currentPanel._panel.reveal(column);
      return ReviewWebviewPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'geminiReviewPanel',
      'Gemini PR Architect Review',
      column || vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    ReviewWebviewPanel.currentPanel = new ReviewWebviewPanel(panel, apiClient, authProvider);
    return ReviewWebviewPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly apiClient: ApiClient,
    private readonly authProvider: GitHubAuthProvider
  ) {
    this._panel = panel;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message: { command: string; finding?: ReviewFinding; path?: string; line?: number }) => {
        switch (message.command) {
          case 'applyFix':
            if (message.finding) {
              await this.applyFixToEditor(message.finding);
            }
            break;
          case 'submitToGitHub':
            await this.submitApprovedReviews();
            break;
          case 'jumpToLine':
            if (message.path && message.line !== undefined) {
              await this.jumpToCodeLine(message.path, message.line);
            }
            break;
        }
      },
      null,
      this._disposables
    );

    this._panel.webview.html = this.getWebviewContent();
  }

  public setResult(result: ReviewResult): void {
    this.currentResult = result;
    this._panel.webview.postMessage({ command: 'updateResult', result });
    this._panel.webview.html = this.getWebviewContent();
  }

  private async jumpToCodeLine(path: string, line: number): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return;

    const fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, path);
    const doc = await vscode.workspace.openTextDocument(fileUri);
    const editor = await vscode.window.showTextDocument(doc);
    const pos = new vscode.Position(Math.max(0, line - 1), 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
  }

  private async applyFixToEditor(finding: ReviewFinding): Promise<void> {
    if (!finding.suggestedCode) return;
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const lineIndex = Math.max(0, finding.line - 1);
    await editor.edit((editBuilder: vscode.TextEditorEdit) => {
      const lineRange = editor.document.lineAt(lineIndex).range;
      editBuilder.replace(lineRange, finding.suggestedCode!);
    });

    vscode.window.showInformationMessage(`Applied refactored code for: ${finding.title}`);
  }

  private async submitApprovedReviews(): Promise<void> {
    const token = await this.authProvider.getToken();
    if (!token) {
      vscode.window.showErrorMessage('Please sign in with GitHub first to submit PR reviews.');
      await this.authProvider.signIn();
      return;
    }

    if (!this.currentResult) return;

    const approved = this.currentResult.findings.filter((f) => f.approved !== false);
    const comments = approved.map((f) => ({
      path: f.path,
      line: f.line,
      body: `**[${f.category} - ${f.severity}] ${f.title}**\n\n${f.comment}\n\n\`\`\`typescript\n${
        f.suggestedCode || ''
      }\n\`\`\``,
    }));

    try {
      const res = await this.apiClient.submitReview(
        token,
        'owner',
        'repo',
        1,
        'head-sha',
        `## 🤖 Gemini PR Architect Review\nOverall Code Health Score: ${this.currentResult.score}/100\n\n${this.currentResult.summary}`,
        comments
      );
      if (res.success) {
        vscode.window.showInformationMessage(`Successfully posted review #${res.reviewId} to GitHub!`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to post review: ${msg}`);
    }
  }

  private getWebviewContent(): string {
    const findingsHtml = (this.currentResult?.findings || [])
      .map(
        (f) => `
        <div class="finding-card ${f.severity.toLowerCase()}">
          <div class="finding-header">
            <span class="badge ${f.category.toLowerCase()}">${f.category}</span>
            <span class="badge ${f.severity.toLowerCase()}">${f.severity}</span>
            <strong>${f.title}</strong>
          </div>
          <p>${f.comment}</p>
          <div class="code-preview">
            <code>${f.path}:${f.line}</code>
          </div>
          ${
            f.suggestedCode
              ? `<pre><code>${f.suggestedCode}</code></pre>`
              : ''
          }
        </div>
      `
      )
      .join('');

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 16px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
        .score-box { background: var(--vscode-sideBar-background); padding: 12px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--vscode-widget-border); }
        .finding-card { border-left: 4px solid #888; background: var(--vscode-editor-inactiveSelectionBackground); padding: 12px; border-radius: 4px; margin-bottom: 12px; }
        .finding-card.critical { border-left-color: #ff5f56; }
        .finding-card.warning { border-left-color: #ffbd2e; }
        .finding-card.suggestion { border-left-color: #27c93f; }
        .badge { font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 3px; background: rgba(255,255,255,0.1); margin-right: 6px; }
        pre { background: var(--vscode-textCodeBlock-background); padding: 8px; border-radius: 4px; overflow-x: auto; }
      </style>
    </head>
    <body>
      <h2>🤖 Gemini PR Architecture Matrix</h2>
      <div class="score-box">
        <h3>Score: ${this.currentResult?.score ?? '--'}/100</h3>
        <p>${this.currentResult?.summary || 'No active diff review running. Run "Gemini: Review Current Git Diff".'}</p>
      </div>
      <div class="findings-list">
        ${findingsHtml}
      </div>
    </body>
    </html>`;
  }

  public dispose(): void {
    ReviewWebviewPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) x.dispose();
    }
  }
}
