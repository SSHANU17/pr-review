import * as vscode from 'vscode';
import { SecurityScanService, UnifiedSecurityIssue } from '../services/securityScanService';
import { CoverityStream, AppScanReport } from '../models/types';

type SecurityTreeItemType =
  | { kind: 'header'; label: string; count: number }
  | { kind: 'stream'; stream: CoverityStream }
  | { kind: 'report'; report: AppScanReport }
  | { kind: 'issue'; issue: UnifiedSecurityIssue };

export class SecurityTreeItem extends vscode.TreeItem {
  constructor(
    public readonly data: SecurityTreeItemType,
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(SecurityTreeItem.getLabel(data), collapsibleState);
    this.contextValue = data.kind;
    this.tooltip = SecurityTreeItem.getTooltip(data);
    this.description = SecurityTreeItem.getDescription(data);
    this.iconPath = SecurityTreeItem.getIcon(data);

    if (data.kind === 'issue') {
      this.command = {
        command: 'geminiPrReviewer.openSecurityDefect',
        title: 'Open Security Defect',
        arguments: [data.issue],
      };
    }
  }

  private static getLabel(data: SecurityTreeItemType): string {
    switch (data.kind) {
      case 'header':
        return `${data.label} (${data.count})`;
      case 'stream':
        return `${data.stream.name} [${data.stream.branch}]`;
      case 'report':
        return `${data.report.scanName} (${data.report.scanType})`;
      case 'issue':
        return `[${data.issue.severity.toUpperCase()}] ${data.issue.id}: ${data.issue.checkerOrCwe}`;
    }
  }

  private static getDescription(data: SecurityTreeItemType): string {
    switch (data.kind) {
      case 'stream':
        return `${data.stream.totalDefects} defects`;
      case 'report':
        return `${data.report.findings.length} findings`;
      case 'issue':
        return `${data.issue.file}:${data.issue.line}`;
      default:
        return '';
    }
  }

  private static getTooltip(data: SecurityTreeItemType): string {
    switch (data.kind) {
      case 'stream':
        return `Project: ${data.stream.project}\nBranch: ${data.stream.branch}\nHigh: ${data.stream.highImpactCount}, Med: ${data.stream.mediumImpactCount}`;
      case 'report':
        return `App: ${data.report.targetApplication}\nType: ${data.report.scanType}\nHigh: ${data.report.highCount}, Med: ${data.report.mediumCount}`;
      case 'issue':
        return `${data.issue.title}\nFile: ${data.issue.file}:${data.issue.line}\n${data.issue.description}`;
      default:
        return '';
    }
  }

  private static getIcon(data: SecurityTreeItemType): vscode.ThemeIcon {
    switch (data.kind) {
      case 'header':
        return new vscode.ThemeIcon('shield');
      case 'stream':
        return new vscode.ThemeIcon('repo-forked');
      case 'report':
        return new vscode.ThemeIcon('report');
      case 'issue':
        if (data.issue.severity === 'High') {
          return new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
        }
        if (data.issue.severity === 'Medium') {
          return new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'));
        }
        return new vscode.ThemeIcon('info');
    }
  }
}

export class SecurityTreeDataProvider implements vscode.TreeDataProvider<SecurityTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<SecurityTreeItem | undefined | void> =
    new vscode.EventEmitter<SecurityTreeItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<SecurityTreeItem | undefined | void> =
    this._onDidChangeTreeData.event;

  constructor(private securityService: SecurityScanService) {}

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: SecurityTreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(element?: SecurityTreeItem): Promise<SecurityTreeItem[]> {
    if (!element) {
      // Root level: Coverity Section and AppScan Section
      const streams = this.securityService.getStreams();
      const reports = this.securityService.getReports();

      const items: SecurityTreeItem[] = [];

      items.push(
        new SecurityTreeItem(
          {
            kind: 'header',
            label: 'Coverity Static Analysis Streams',
            count: streams.reduce((acc, s) => acc + s.totalDefects, 0),
          },
          vscode.TreeItemCollapsibleState.Expanded
        )
      );

      items.push(
        new SecurityTreeItem(
          {
            kind: 'header',
            label: 'HCL AppScan SAST / DAST Reports',
            count: reports.reduce((acc, r) => acc + r.findings.length, 0),
          },
          vscode.TreeItemCollapsibleState.Expanded
        )
      );

      return items;
    }

    if (element.data.kind === 'header') {
      if (element.data.label.startsWith('Coverity')) {
        const streams = this.securityService.getStreams();
        return streams.map(
          (s) =>
            new SecurityTreeItem(
              { kind: 'stream', stream: s },
              vscode.TreeItemCollapsibleState.Collapsed
            )
        );
      } else {
        const reports = this.securityService.getReports();
        return reports.map(
          (r) =>
            new SecurityTreeItem(
              { kind: 'report', report: r },
              vscode.TreeItemCollapsibleState.Collapsed
            )
        );
      }
    }

    if (element.data.kind === 'stream') {
      const stream = element.data.stream;
      const issues = this.securityService
        .getIssues()
        .filter((i) => i.source === 'coverity' && i.streamOrReportId === stream.id);

      return issues.map(
        (issue) =>
          new SecurityTreeItem(
            { kind: 'issue', issue },
            vscode.TreeItemCollapsibleState.None
          )
      );
    }

    if (element.data.kind === 'report') {
      const report = element.data.report;
      const issues = this.securityService
        .getIssues()
        .filter((i) => i.source === 'appscan' && i.streamOrReportId === report.id);

      return issues.map(
        (issue) =>
          new SecurityTreeItem(
            { kind: 'issue', issue },
            vscode.TreeItemCollapsibleState.None
          )
      );
    }

    return [];
  }
}
