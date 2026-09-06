import * as vscode from 'vscode';

export interface GitDiffPayload {
  diff: string;
  title: string;
  repoName: string;
  branchName?: string;
  isFallback?: boolean;
}

export class GitDiffService {
  /**
   * Retrieves the unified git diff from staged or unstaged changes,
   * or falls back to generating a unified diff from the active editor document.
   */
  public async getDiffForReview(): Promise<GitDiffPayload> {
    // 1. Try to obtain diff via VS Code built-in Git extension
    const gitDiff = await this.getGitExtensionDiff();
    if (gitDiff && gitDiff.diff.trim().length > 0) {
      return gitDiff;
    }

    // 2. Fallback: inspect the active open text editor document
    const activeDocDiff = this.getActiveEditorDiff();
    if (activeDocDiff && activeDocDiff.diff.trim().length > 0) {
      return activeDocDiff;
    }

    throw new Error(
      'No git diff found and no active file is open. Stage your git changes, edit a file, or open a source code document in the editor.'
    );
  }

  /**
   * Extracts git diff from the workspace using VS Code Git extension API.
   */
  private async getGitExtensionDiff(): Promise<GitDiffPayload | null> {
    try {
      const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
      if (!gitExtension) {
        return null;
      }

      const git = gitExtension.getAPI(1);
      if (!git || !git.repositories || git.repositories.length === 0) {
        return null;
      }

      // Check current repository (or first available in workspace)
      const activeUri = vscode.window.activeTextEditor?.document.uri;
      const repo = activeUri
        ? git.getRepository(activeUri) || git.repositories[0]
        : git.repositories[0];

      if (!repo) {
        return null;
      }

      const repoPath = repo.rootUri.fsPath;
      const pathParts = repoPath.replace(/\\/g, '/').split('/');
      const repoName = pathParts.slice(-2).join('/') || 'workspace/repo';
      const branchName = repo.state?.HEAD?.name || 'HEAD';

      // 1. Check staged changes (git diff --cached)
      let diffOutput = await repo.diff(true);

      // 2. If no staged changes, check unstaged changes (git diff)
      if (!diffOutput || diffOutput.trim().length === 0) {
        diffOutput = await repo.diff(false);
      }

      // 3. If still empty and on a feature branch, try diffing against main/master
      if (!diffOutput || diffOutput.trim().length === 0) {
        try {
          if (branchName && branchName !== 'main' && branchName !== 'master') {
            diffOutput = await repo.diffBetween('main', branchName).catch(() => '');
            if (!diffOutput) {
              diffOutput = await repo.diffBetween('master', branchName).catch(() => '');
            }
          }
        } catch {
          // Ignore branch diff fallback error
        }
      }

      if (diffOutput && diffOutput.trim().length > 0) {
        return {
          diff: diffOutput,
          title: `PR Review: ${branchName} (${repoName})`,
          repoName,
          branchName,
          isFallback: false,
        };
      }

      return null;
    } catch (err) {
      console.warn('[GitDiffService] Git extension query failed:', err);
      return null;
    }
  }

  /**
   * Fallback: generates a unified diff representation from the active text editor.
   */
  private getActiveEditorDiff(): GitDiffPayload | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return null;
    }

    const doc = editor.document;
    // Skip output/log channels
    if (doc.uri.scheme !== 'file' && doc.uri.scheme !== 'untitled') {
      return null;
    }

    const relativePath = vscode.workspace.asRelativePath(doc.uri);
    const text = doc.getText();
    if (!text || text.trim().length === 0) {
      return null;
    }

    const lines = text.split('\n');
    const pseudoDiff = [
      `diff --git a/${relativePath} b/${relativePath}`,
      `--- a/${relativePath}`,
      `+++ b/${relativePath}`,
      `@@ -1,1 +1,${lines.length} @@`,
      ...lines.map((line: string) => `+${line}`),
    ].join('\n');

    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspaceName = workspaceFolders && workspaceFolders.length > 0
      ? workspaceFolders[0].name
      : 'current-workspace';

    return {
      diff: pseudoDiff,
      title: `File Review: ${relativePath}`,
      repoName: workspaceName,
      branchName: 'active-file',
      isFallback: true,
    };
  }
}
