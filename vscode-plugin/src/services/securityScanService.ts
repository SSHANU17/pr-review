import * as vscode from 'vscode';
import { ApiClient } from './apiClient';
import {
  CoverityStream,
  CoverityDefect,
  AppScanReport,
  AppScanFinding,
  SecurityFixRequest,
  SecurityFixResponse,
} from '../models/types';

export interface UnifiedSecurityIssue {
  id: string;
  source: 'coverity' | 'appscan';
  title: string;
  checkerOrCwe: string;
  severity: 'High' | 'Medium' | 'Low' | 'Information';
  file: string;
  line: number;
  description: string;
  vulnerableCode: string;
  remediationFix: string;
  rawDefect?: CoverityDefect;
  rawFinding?: AppScanFinding;
  streamOrReportId: string;
}

export class SecurityScanService implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  private diagnosticCollection: vscode.DiagnosticCollection;
  private coverityStreams: CoverityStream[] = [];
  private appScanReports: AppScanReport[] = [];
  private unifiedIssues: UnifiedSecurityIssue[] = [];

  constructor(private apiClient: ApiClient) {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('geminiSecurity');
  }

  public getStreams(): CoverityStream[] {
    return this.coverityStreams;
  }

  public getReports(): AppScanReport[] {
    return this.appScanReports;
  }

  public getIssues(): UnifiedSecurityIssue[] {
    return this.unifiedIssues;
  }

  /**
   * Fetches latest scans from the backend and updates the native VS Code Problems diagnostics.
   */
  public async refreshScans(): Promise<{
    coverityStreams: CoverityStream[];
    appScanReports: AppScanReport[];
    totalDefects: number;
  }> {
    try {
      const [streams, reports] = await Promise.all([
        this.apiClient.getCoverityStreams().catch(() => [] as CoverityStream[]),
        this.apiClient.getAppScanReports().catch(() => [] as AppScanReport[]),
      ]);

      this.coverityStreams = streams;
      this.appScanReports = reports;
      this.buildUnifiedIssues();
      this.updateDiagnostics();

      const totalDefects = this.unifiedIssues.length;
      return { coverityStreams: streams, appScanReports: reports, totalDefects };
    } catch (err) {
      console.error('[SecurityScanService] Refresh failed:', err);
      throw err;
    }
  }

  /**
   * Converts Coverity and AppScan data into a normalized issue list.
   */
  private buildUnifiedIssues(): void {
    const list: UnifiedSecurityIssue[] = [];

    // Ingest Coverity Defects
    for (const stream of this.coverityStreams) {
      for (const defect of stream.defects || []) {
        if (defect.status === 'Fixed' || defect.status === 'Dismissed') continue;

        list.push({
          id: `CID-${defect.cid}`,
          source: 'coverity',
          title: `${defect.checker}: ${defect.category}`,
          checkerOrCwe: defect.cwe || defect.checker,
          severity: defect.impact,
          file: defect.file,
          line: defect.line,
          description: defect.description,
          vulnerableCode: defect.vulnerableSnippet || '',
          remediationFix: defect.remediationFix || '',
          rawDefect: defect,
          streamOrReportId: stream.id,
        });
      }
    }

    // Ingest AppScan Findings
    for (const report of this.appScanReports) {
      for (const finding of report.findings || []) {
        if (finding.status === 'Remediated' || finding.status === 'False Positive') continue;

        list.push({
          id: finding.id,
          source: 'appscan',
          title: `${finding.issueType} (${finding.scannerType})`,
          checkerOrCwe: finding.cwe,
          severity: finding.severity,
          file: finding.fileOrUrl,
          line: finding.line || 1,
          description: finding.threatVector || finding.remediationAdvice || finding.issueType,
          vulnerableCode: finding.vulnerableSnippet || '',
          remediationFix: finding.remediationFix || '',
          rawFinding: finding,
          streamOrReportId: report.id,
        });
      }
    }

    this.unifiedIssues = list;
  }

  /**
   * Emits native VS Code diagnostics for all security defects.
   */
  private updateDiagnostics(): void {
    this.diagnosticCollection.clear();
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const diagnosticsMap = new Map<string, vscode.Diagnostic[]>();

    for (const issue of this.unifiedIssues) {
      if (!issue.file) continue;

      let fileUri: vscode.Uri;
      if (workspaceFolders && workspaceFolders.length > 0) {
        // Strip leading slashes for relative path resolution
        const cleanPath = issue.file.replace(/^[/\\]+/, '');
        fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, cleanPath);
      } else {
        fileUri = vscode.Uri.file(issue.file);
      }

      const lineIdx = Math.max(0, issue.line - 1);
      const range = new vscode.Range(lineIdx, 0, lineIdx, 250);

      let severity = vscode.DiagnosticSeverity.Warning;
      if (issue.severity === 'High') {
        severity = vscode.DiagnosticSeverity.Error;
      } else if (issue.severity === 'Low' || issue.severity === 'Information') {
        severity = vscode.DiagnosticSeverity.Information;
      }

      const prefix = issue.source === 'coverity' ? 'Coverity CID' : 'AppScan';
      const diagnostic = new vscode.Diagnostic(
        range,
        `[${prefix}] ${issue.title}\nCWE/Checker: ${issue.checkerOrCwe}\n${issue.description}`,
        severity
      );

      diagnostic.source = 'Gemini Security Architect';
      diagnostic.code = issue.id;

      const existing = diagnosticsMap.get(fileUri.fsPath) || [];
      existing.push(diagnostic);
      diagnosticsMap.set(fileUri.fsPath, existing);
    }

    for (const [filePath, diags] of diagnosticsMap) {
      this.diagnosticCollection.set(vscode.Uri.file(filePath), diags);
    }
  }

  /**
   * VS Code CodeActionProvider: offers 1-click AI security fix when cursor is on a defect.
   */
  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    for (const diag of context.diagnostics) {
      if (diag.source !== 'Gemini Security Architect') continue;

      const codeStr = String(diag.code || '');
      const issue = this.unifiedIssues.find((i) => i.id === codeStr);
      if (!issue) continue;

      const action = new vscode.CodeAction(
        `✨ Gemini AI: Remediate ${issue.id} (${issue.checkerOrCwe})`,
        vscode.CodeActionKind.QuickFix
      );

      action.isPreferred = true;
      action.diagnostics = [diag];
      action.command = {
        command: 'geminiPrReviewer.applyAiSecurityFix',
        title: 'Remediate with Gemini AI',
        arguments: [issue],
      };

      actions.push(action);
    }

    return actions;
  }

  /**
   * Invokes the backend Gemini Security Remediation engine and applies the fix.
   */
  public async remediateIssue(issue: UnifiedSecurityIssue): Promise<SecurityFixResponse> {
    const req: SecurityFixRequest = {
      source: issue.source,
      defectId: issue.id,
      checkerOrCwe: issue.checkerOrCwe,
      title: issue.title,
      file: issue.file,
      vulnerableCode: issue.vulnerableCode || '',
      existingRemediation: issue.remediationFix || '',
    };

    const fixResult = await this.apiClient.generateSecurityFix(req);

    // Apply to active editor if the file matches
    const editor = vscode.window.activeTextEditor;
    if (editor && fixResult.remediatedCode) {
      const docPath = editor.document.uri.fsPath.replace(/\\/g, '/');
      const issuePath = issue.file.replace(/\\/g, '/');

      if (docPath.endsWith(issuePath) || issuePath.endsWith(editor.document.fileName)) {
        const lineIdx = Math.max(0, issue.line - 1);
        const line = editor.document.lineAt(Math.min(lineIdx, editor.document.lineCount - 1));

        await editor.edit((editBuilder: vscode.TextEditorEdit) => {
          editBuilder.replace(line.range, fixResult.remediatedCode);
        });

        vscode.window.showInformationMessage(
          `Security patch applied for ${issue.id}: ${fixResult.explanation}`
        );
      }
    }

    return fixResult;
  }

  public dispose(): void {
    this.diagnosticCollection.dispose();
  }
}
