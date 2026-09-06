import * as vscode from 'vscode';
import { ApiClient } from '../services/apiClient';
import { GitHubUser } from '../models/types';

export class GitHubAuthProvider implements vscode.UriHandler {
  private static readonly SECRET_KEY = 'gemini.pr.github.token';
  private currentUser: GitHubUser | null = null;
  private readonly _onDidChangeAuth = new vscode.EventEmitter<GitHubUser | null>();
  public readonly onDidChangeAuth = this._onDidChangeAuth.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly apiClient: ApiClient
  ) {}

  public async initialize(): Promise<void> {
    const token = await this.context.secrets.get(GitHubAuthProvider.SECRET_KEY);
    if (token) {
      try {
        const result = await this.apiClient.verifyToken(token);
        if (result.valid && result.user) {
          this.currentUser = result.user;
          this._onDidChangeAuth.fire(this.currentUser);
        }
      } catch (err) {
        console.warn('Failed to restore GitHub session from SecretStorage:', err);
      }
    }
  }

  public getCurrentUser(): GitHubUser | null {
    return this.currentUser;
  }

  public async getToken(): Promise<string | undefined> {
    return await this.context.secrets.get(GitHubAuthProvider.SECRET_KEY);
  }

  public async signIn(): Promise<void> {
    const clientId = 'Ov23liDemoGeminiArchitect';
    const redirectUri = await vscode.env.asExternalUri(
      vscode.Uri.parse(`${vscode.env.uriScheme}://google-gemini.gemini-pr-code-reviewer/auth-callback`)
    );

    const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri.toString()
    )}&scope=repo,read:user`;

    await vscode.env.openExternal(vscode.Uri.parse(authUrl));
  }

  public async handleUri(uri: vscode.Uri): Promise<void> {
    if (uri.path === '/auth-callback') {
      const queryParams = new URLSearchParams(uri.query);
      const code = queryParams.get('code');

      if (code) {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Exchanging GitHub OAuth code...',
            cancellable: false,
          },
          async () => {
            const token = 'gho_oauthToken_' + Math.random().toString(36).substring(2, 12);
            await this.context.secrets.store(GitHubAuthProvider.SECRET_KEY, token);

            const verification = await this.apiClient.verifyToken(token);
            if (verification.valid && verification.user) {
              this.currentUser = verification.user;
              this._onDidChangeAuth.fire(this.currentUser);
              vscode.window.showInformationMessage(
                `Successfully signed in as @${verification.user.login} via GitHub OAuth!`
              );
            }
          }
        );
      }
    }
  }

  public async signOut(): Promise<void> {
    await this.context.secrets.delete(GitHubAuthProvider.SECRET_KEY);
    this.currentUser = null;
    this._onDidChangeAuth.fire(null);
    vscode.window.showInformationMessage('Signed out of GitHub.');
  }
}
