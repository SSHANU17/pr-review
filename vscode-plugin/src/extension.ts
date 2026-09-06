import * as vscode from 'vscode';
import { ApiClient } from './services/apiClient';
import { GitHubAuthProvider } from './auth/authProvider';
import { DiffDecorationManager } from './decorations/diffDecorations';
import { RuleManager } from './rules/ruleManager';
import { ReviewWebviewPanel } from './views/reviewPanel';
import { GitDiffService } from './services/gitDiffService';

let decorationManager: DiffDecorationManager;
let authProvider: GitHubAuthProvider;
let ruleManager: RuleManager;
let apiClient: ApiClient;
let gitDiffService: GitDiffService;

export async function activate(context: vscode.ExtensionContext) {
  console.log('Gemini PR Architect Reviewer extension activating...');

  const config = vscode.workspace.getConfiguration('geminiPrReviewer');
  const backendUrl = config.get<string>('backendUrl') || 'http://localhost:3000/api';

  apiClient = new ApiClient(backendUrl);
  authProvider = new GitHubAuthProvider(context, apiClient);
  decorationManager = new DiffDecorationManager();
  ruleManager = new RuleManager(apiClient);
  gitDiffService = new GitDiffService();

  context.subscriptions.push(vscode.window.registerUriHandler(authProvider));
  await authProvider.initialize();
  await ruleManager.loadWorkspaceRules();

  // Status Bar Indicator
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'geminiPrReviewer.reviewCurrentDiff';
  statusBar.text = '$(sparkle) Gemini Architect';
  statusBar.tooltip = 'Click to run Gemini SOLID & Security Code Review on Current Diff / File';
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Command: Review Diff
  const reviewCommand = vscode.commands.registerCommand('geminiPrReviewer.reviewCurrentDiff', async () => {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Gemini AI analyzing Git Diff against SOLID & Security Matrix...',
        cancellable: false,
      },
      async () => {
        try {
          // 1. Extract live diff from Git repository or active editor document
          const diffPayload = await gitDiffService.getDiffForReview();

          // 2. Query active architecture and custom rules
          const rules = ruleManager.getRules();

          // 3. Send diff to Gemini review engine
          const result = await apiClient.analyzeDiff(
            diffPayload.diff,
            diffPayload.title,
            `Branch: ${diffPayload.branchName || 'local'}`,
            diffPayload.repoName,
            rules
          );

          // 4. Update editor gutter glyphs & decorations
          decorationManager.setFindings(result.findings);

          // 5. Present results in interactive review panel
          const panel = ReviewWebviewPanel.createOrShow(context.extensionUri, apiClient, authProvider);
          panel.setResult(result);

          const sourceLabel = diffPayload.isFallback ? 'active file' : 'git diff';
          vscode.window.showInformationMessage(
            `Gemini Review Complete (${sourceLabel}): Quality Score ${result.score}/100 with ${result.findings.length} findings.`
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Review failed: ${msg}`);
        }
      }
    );
  });

  // Command: GitHub Auth
  const authCommand = vscode.commands.registerCommand('geminiPrReviewer.signInWithGitHub', async () => {
    await authProvider.signIn();
  });

  // Command: Manage Rules
  const rulesCommand = vscode.commands.registerCommand('geminiPrReviewer.manageCustomRules', async () => {
    const rules = ruleManager.getRules();
    const items = rules.map((r) => ({
      label: `[${r.category}] ${r.title}`,
      description: r.severity,
      detail: r.description,
      picked: r.enabled,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      placeHolder: 'Select active architecture policies for Gemini AI enforcement',
    });

    if (selected) {
      const selectedLabels = new Set(selected.map((s: vscode.QuickPickItem) => s.label));
      const updated = rules.map((r) => ({
        ...r,
        enabled: selectedLabels.has(`[${r.category}] ${r.title}`),
      }));
      await ruleManager.saveWorkspaceRules(updated);
    }
  });

  context.subscriptions.push(reviewCommand, authCommand, rulesCommand);
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      decorationManager.updateActiveEditorDecorations();
    })
  );
}

export function deactivate() {
  if (decorationManager) {
    decorationManager.dispose();
  }
}
