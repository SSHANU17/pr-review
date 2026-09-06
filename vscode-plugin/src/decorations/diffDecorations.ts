import * as vscode from 'vscode';
import { ReviewFinding } from '../models/types';

export class DiffDecorationManager {
  private criticalDecoration: vscode.TextEditorDecorationType;
  private warningDecoration: vscode.TextEditorDecorationType;
  private suggestionDecoration: vscode.TextEditorDecorationType;
  private currentFindings: ReviewFinding[] = [];

  constructor() {
    this.criticalDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(255, 95, 86, 0.15)',
      isWholeLine: true,
      overviewRulerColor: '#ff5f56',
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      gutterIconPath: vscode.Uri.parse('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="%23ff5f56"><circle cx="8" cy="8" r="7"/></svg>'),
      gutterIconSize: 'contain',
    });

    this.warningDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(255, 189, 46, 0.15)',
      isWholeLine: true,
      overviewRulerColor: '#ffbd2e',
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      gutterIconPath: vscode.Uri.parse('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="%23ffbd2e"><polygon points="8,1 15,15 1,15"/></svg>'),
      gutterIconSize: 'contain',
    });

    this.suggestionDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(0, 122, 204, 0.12)',
      isWholeLine: true,
      overviewRulerColor: '#007acc',
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });
  }

  public setFindings(findings: ReviewFinding[]): void {
    this.currentFindings = findings;
    this.updateActiveEditorDecorations();
  }

  public updateActiveEditorDecorations(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const filePath = vscode.workspace.asRelativePath(editor.document.uri);
    const fileFindings = this.currentFindings.filter(
      (f) => f.path.endsWith(filePath) || filePath.endsWith(f.path)
    );

    const criticalOptions: vscode.DecorationOptions[] = [];
    const warningOptions: vscode.DecorationOptions[] = [];
    const suggestionOptions: vscode.DecorationOptions[] = [];

    for (const f of fileFindings) {
      const lineIndex = Math.max(0, f.line - 1);
      const range = new vscode.Range(lineIndex, 0, lineIndex, 100);

      const hoverMessage = new vscode.MarkdownString();
      hoverMessage.isTrusted = true;
      hoverMessage.appendMarkdown(`### 🤖 Gemini Review: [${f.category}] ${f.title}\n\n`);
      hoverMessage.appendMarkdown(`**Severity**: \`${f.severity}\`\n\n`);
      hoverMessage.appendMarkdown(`${f.comment}\n\n`);

      if (f.suggestedCode) {
        hoverMessage.appendMarkdown(`**Suggested Refactoring:**\n\`\`\`typescript\n${f.suggestedCode}\n\`\`\`\n`);
      }

      const opt: vscode.DecorationOptions = { range, hoverMessage };

      if (f.severity === 'CRITICAL') {
        criticalOptions.push(opt);
      } else if (f.severity === 'WARNING') {
        warningOptions.push(opt);
      } else {
        suggestionOptions.push(opt);
      }
    }

    editor.setDecorations(this.criticalDecoration, criticalOptions);
    editor.setDecorations(this.warningDecoration, warningOptions);
    editor.setDecorations(this.suggestionDecoration, suggestionOptions);
  }

  public dispose(): void {
    this.criticalDecoration.dispose();
    this.warningDecoration.dispose();
    this.suggestionDecoration.dispose();
  }
}
