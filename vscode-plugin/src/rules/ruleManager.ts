import * as vscode from 'vscode';
import { CustomRule } from '../models/types';
import { ApiClient } from '../services/apiClient';

export class RuleManager {
  private rules: CustomRule[] = [];

  constructor(private readonly apiClient: ApiClient) {}

  public async loadWorkspaceRules(): Promise<CustomRule[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const rootUri = workspaceFolders[0].uri;
      const ruleFileUri = vscode.Uri.joinPath(rootUri, '.architect-rules.json');

      try {
        const fileData = await vscode.workspace.fs.readFile(ruleFileUri);
        const parsed = JSON.parse(Buffer.from(fileData).toString('utf-8')) as CustomRule[];
        if (Array.isArray(parsed)) {
          this.rules = parsed;
          return this.rules;
        }
      } catch {
        // File does not exist, fetch from backend server
      }
    }

    try {
      this.rules = await this.apiClient.getRules();
    } catch (err) {
      console.warn('Failed to sync rules from backend:', err);
    }
    return this.rules;
  }

  public getRules(): CustomRule[] {
    return this.rules;
  }

  public async saveWorkspaceRules(rules: CustomRule[]): Promise<void> {
    this.rules = rules;
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const rootUri = workspaceFolders[0].uri;
      const ruleFileUri = vscode.Uri.joinPath(rootUri, '.architect-rules.json');
      const content = Buffer.from(JSON.stringify(rules, null, 2), 'utf-8');
      await vscode.workspace.fs.writeFile(ruleFileUri, content);
      vscode.window.showInformationMessage('Architecture rules saved to .architect-rules.json');
    }
  }
}
