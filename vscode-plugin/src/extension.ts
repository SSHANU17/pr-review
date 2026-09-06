import * as vscode from 'vscode';
import { ApiClient } from './services/apiClient';
import { GitHubAuthProvider } from './auth/authProvider';
import { DiffDecorationManager } from './decorations/diffDecorations';
import { RuleManager } from './rules/ruleManager';
import { ReviewWebviewPanel } from './views/reviewPanel';
import { GitDiffService } from './services/gitDiffService';
import { SecurityScanService, UnifiedSecurityIssue } from './services/securityScanService';
import { SecurityTreeDataProvider } from './views/securityTreeProvider';

let decorationManager: DiffDecorationManager;
let authProvider: GitHubAuthProvider;
let ruleManager: RuleManager;
let apiClient: ApiClient;
let gitDiffService: GitDiffService;
let securityScanService: SecurityScanService;
let securityTreeProvider: SecurityTreeDataProvider;

export async function activate(context: vscode.ExtensionContext) {
  console.log('Gemini PR Architect Reviewer extension activating...');

  const config = vscode.workspace.getConfiguration('geminiPrReviewer');
  const backendUrl = config.get<string>('backendUrl') || 'http://localhost:3000/api';

  apiClient = new ApiClient(backendUrl);
  authProvider = new GitHubAuthProvider(context, apiClient);
  decorationManager = new DiffDecorationManager();
  ruleManager = new RuleManager(apiClient);
  gitDiffService = new GitDiffService();
  securityScanService = new SecurityScanService(apiClient);
  securityTreeProvider = new SecurityTreeDataProvider(securityScanService);

  // Register TreeDataProvider for Coverity & AppScan in Activity Bar
  const securityTreeView = vscode.window.registerTreeDataProvider(
    'geminiSecurityScansView',
    securityTreeProvider
  );

  // Register CodeActionProvider for 1-click AI security remediation squiggles
  const codeActionProvider = vscode.languages.registerCodeActionsProvider(
    { scheme: 'file' },
    securityScanService,
    { providedCodeActionKinds: SecurityScanService.providedCodeActionKinds }
  );

  context.subscriptions.push(vscode.window.registerUriHandler(authProvider));
  context.subscriptions.push(securityTreeView, codeActionProvider);

  await authProvider.initialize();
  await ruleManager.loadWorkspaceRules();

  // Background refresh of Coverity & AppScan security scans
  securityScanService.refreshScans().then(
    ({ totalDefects }) => {
      securityTreeProvider.refresh();
      if (totalDefects > 0) {
        console.log(`[SecurityScanService] Loaded ${totalDefects} Coverity/AppScan defects into Problems panel.`);
      }
    },
    (err) => console.warn('[SecurityScanService] Initial scan fetch failed:', err)
  );

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

  // Command: Refresh Security Scans (Coverity & AppScan)
  const refreshSecurityCommand = vscode.commands.registerCommand(
    'geminiPrReviewer.refreshSecurityScans',
    async () => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Refreshing Coverity streams and AppScan SAST/DAST reports...',
          cancellable: false,
        },
        async () => {
          try {
            const { coverityStreams, appScanReports, totalDefects } =
              await securityScanService.refreshScans();
            securityTreeProvider.refresh();
            vscode.window.showInformationMessage(
              `Security Scans Refreshed: ${coverityStreams.length} Coverity streams, ${appScanReports.length} AppScan reports with ${totalDefects} active defects in Problems panel.`
            );
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`Failed to refresh security scans: ${msg}`);
          }
        }
      );
    }
  );

  // Command: Open Security Defect in Editor
  const openSecurityDefectCommand = vscode.commands.registerCommand(
    'geminiPrReviewer.openSecurityDefect',
    async (issue: UnifiedSecurityIssue) => {
      if (!issue) return;
      const workspaceFolders = vscode.workspace.workspaceFolders;
      let uri: vscode.Uri;
      if (workspaceFolders && workspaceFolders.length > 0) {
        const cleanPath = issue.file.replace(/^[/\\]+/, '');
        uri = vscode.Uri.joinPath(workspaceFolders[0].uri, cleanPath);
      } else {
        uri = vscode.Uri.file(issue.file);
      }

      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc);
        const lineIdx = Math.max(0, issue.line - 1);
        const pos = new vscode.Position(lineIdx, 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Could not open file ${issue.file}: ${msg}`);
      }
    }
  );

  // Command: Apply 1-Click AI Security Fix
  const applyAiSecurityFixCommand = vscode.commands.registerCommand(
    'geminiPrReviewer.applyAiSecurityFix',
    async (issue?: UnifiedSecurityIssue) => {
      let targetIssue = issue;

      // If called without argument, show QuickPick
      if (!targetIssue) {
        const issues = securityScanService.getIssues();
        if (issues.length === 0) {
          vscode.window.showInformationMessage('No active Coverity or AppScan security defects found.');
          return;
        }

        const items = issues.map((i) => ({
          label: `[${i.source.toUpperCase()}] ${i.id}: ${i.title}`,
          description: `${i.file}:${i.line} (${i.severity})`,
          detail: i.description,
          issue: i,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a Coverity defect or AppScan finding to remediate with Gemini AI',
        });

        if (!selected) return;
        targetIssue = selected.issue;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Gemini AI generating secure patch for ${targetIssue.id} (${targetIssue.checkerOrCwe})...`,
          cancellable: false,
        },
        async () => {
          try {
            // First jump to code location
            await vscode.commands.executeCommand('geminiPrReviewer.openSecurityDefect', targetIssue);
            const fixResult = await securityScanService.remediateIssue(targetIssue!);

            const action = await vscode.window.showInformationMessage(
              `✨ Gemini Patched ${targetIssue!.id}: ${fixResult.explanation}`,
              'View Explanation & CWE Mitigation'
            );

            if (action === 'View Explanation & CWE Mitigation') {
              vscode.window.showInformationMessage(
                `CWE Mitigation: ${fixResult.cweMitigation || 'N/A'}\n\nConfidence: ${Math.round((fixResult.confidence || 0.95) * 100)}%`
              );
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`Remediation failed: ${msg}`);
          }
        }
      );
    }
  );

  // Command: Browse All Security Defects
  const viewSecurityDefectsCommand = vscode.commands.registerCommand(
    'geminiPrReviewer.viewSecurityDefects',
    async () => {
      const issues = securityScanService.getIssues();
      if (issues.length === 0) {
        const refresh = await vscode.window.showInformationMessage(
          'No security scan defects loaded. Would you like to fetch latest scans?',
          'Refresh Scans'
        );
        if (refresh === 'Refresh Scans') {
          await vscode.commands.executeCommand('geminiPrReviewer.refreshSecurityScans');
        }
        return;
      }

      const items = issues.map((i) => ({
        label: `[${i.source.toUpperCase()} ${i.severity}] ${i.id}: ${i.checkerOrCwe}`,
        description: `${i.file}:${i.line}`,
        detail: i.title,
        issue: i,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `Select from ${issues.length} active Coverity & AppScan security vulnerabilities`,
      });

      if (selected) {
        await vscode.commands.executeCommand('geminiPrReviewer.openSecurityDefect', selected.issue);
      }
    }
  );

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

  context.subscriptions.push(
    reviewCommand,
    refreshSecurityCommand,
    openSecurityDefectCommand,
    applyAiSecurityFixCommand,
    viewSecurityDefectsCommand,
    authCommand,
    rulesCommand
  );

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
  if (securityScanService) {
    securityScanService.dispose();
  }
}

