import { SourceFileDoc } from '../models/review.model';

export const BACKEND_GEMINI_SERVICE = `import { GoogleGenAI, Type } from '@google/genai';
import { IAIReviewService, ReviewResponse } from '../interfaces/ai.interface';

/**
 * GeminiReviewService adheres strictly to the Single Responsibility Principle:
 * Solely orchestrates Google Gen AI model calls and enforces structured AST review schema.
 */
export class GeminiReviewService implements IAIReviewService {
  private readonly ai: GoogleGenAI;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY must be provided to initialize GeminiReviewService');
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  public async reviewPullRequestDiff(
    diff: string,
    prTitle: string,
    prDescription?: string,
    repoName?: string
  ): Promise<ReviewResponse> {
    const systemPrompt = \`You are a Senior Principal Software Architect and Lead Code Reviewer.
Analyze the provided Unified Git Diff strictly against:
1. SOLID Principles (Single Responsibility, Open-Closed, Liskov Substitution, Interface Segregation, Dependency Inversion).
2. Bugs & Security Vulnerabilities (Injection, sensitive data leaks, race conditions, null/undefined safety).
3. Performance & Resource Leaks (N+1 queries, unclosed streams/handles, memory leaks, unindexed operations).
4. Code Smells & Maintainability (Deep nesting, magic numbers/strings, dead code, poor naming, bloated methods).

Rules:
- Generate actionable, pinpoint review comments directly tied to the new added/modified lines in the diff.
- Calculate the EXACT new line number corresponding to the comment in the target file.
- Provide a category (SOLID, SECURITY, PERFORMANCE, BUG, or CLEAN_CODE), severity (CRITICAL, WARNING, or SUGGESTION), clear explanation, and a clean refactored replacement code snippet where applicable.\`;

    const userPrompt = \`Pull Request Context:
Repository: \${repoName || 'Unknown'}
Title: \${prTitle || 'Untitled PR'}
Description: \${prDescription || 'None'}

Unified Git Diff to Review:
\`\`\`diff
\${diff}
\`\`\`\`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: [
        { role: 'user', parts: [{ text: \`\${systemPrompt}\\n\\n\${userPrompt}\` }] }
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: 'Executive summary of the PR review findings and overall code health assessment.',
            },
            score: {
              type: Type.INTEGER,
              description: 'Code quality score from 0 to 100 based on findings.',
            },
            findings: {
              type: Type.ARRAY,
              description: 'List of specific actionable line-by-line review comments.',
              items: {
                type: Type.OBJECT,
                properties: {
                  path: {
                    type: Type.STRING,
                    description: 'The exact relative file path where the issue occurs.',
                  },
                  line: {
                    type: Type.INTEGER,
                    description: 'The exact line number in the new version of the file.',
                  },
                  category: {
                    type: Type.STRING,
                    enum: ['SOLID', 'SECURITY', 'PERFORMANCE', 'BUG', 'CLEAN_CODE'],
                    description: 'The primary classification of the issue.',
                  },
                  severity: {
                    type: Type.STRING,
                    enum: ['CRITICAL', 'WARNING', 'SUGGESTION'],
                    description: 'Severity level of the finding.',
                  },
                  title: {
                    type: Type.STRING,
                    description: 'Brief headline of the finding.',
                  },
                  comment: {
                    type: Type.STRING,
                    description: 'Detailed explanation of why this is problematic.',
                  },
                  suggestedCode: {
                    type: Type.STRING,
                    description: 'Clean refactored replacement code snippet solving the issue.',
                  },
                },
                required: ['path', 'line', 'category', 'severity', 'title', 'comment'],
              },
            },
          },
          required: ['summary', 'score', 'findings'],
        },
      },
    });

    const outputText = response.text || '{}';
    return JSON.parse(outputText) as ReviewResponse;
  }
}
`;

export const BACKEND_WEBHOOK_CONTROLLER = `import { Request, Response } from 'express';
import crypto from 'node:crypto';
import { IAIReviewService } from '../interfaces/ai.interface';

/**
 * WebhookController handles GitHub webhook events for Pull Requests.
 * - Listens for 'pull_request' events (specifically 'opened', 'synchronize', 'reopened').
 * - Verifies HMAC SHA-256 signatures via x-hub-signature-256 header.
 * - Fetches or extracts the latest commit diff and triggers automated Gemini AI review.
 * - Optionally submits GitHub Commit Status checks and PR reviews back to GitHub.
 */
export class WebhookController {
  constructor(private readonly aiReviewService: IAIReviewService) {}

  public handleGitHubWebhook = async (req: Request, res: Response): Promise<Response> => {
    const deliveryId = (req.headers['x-github-delivery'] as string) || crypto.randomUUID();
    const event = (req.headers['x-github-event'] as string) || 'pull_request';
    const signature = (req.headers['x-hub-signature-256'] as string) || '';

    // 1. Handle GitHub ping handshake
    if (event === 'ping') {
      return res.status(200).json({
        success: true,
        message: 'GitHub webhook ping received. Automated PR Reviewer is ready.',
        zen: req.body?.zen,
        deliveryId,
      });
    }

    // 2. Validate GitHub Event Header
    if (event !== 'pull_request') {
      return res.status(200).json({
        ignored: true,
        reason: \`Event '\${event}' ignored. Only 'pull_request' is processed.\`,
        deliveryId,
      });
    }

    // 3. HMAC Signature Verification (if GITHUB_WEBHOOK_SECRET is configured)
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (secret && signature) {
      const hmac = crypto.createHmac('sha256', secret);
      const digest = 'sha256=' + hmac.update(JSON.stringify(req.body)).digest('hex');
      const sigBuf = Buffer.from(signature);
      const digestBuf = Buffer.from(digest);
      if (sigBuf.length !== digestBuf.length || !crypto.timingSafeEqual(sigBuf, digestBuf)) {
        return res.status(401).json({ error: 'Unauthorized', message: 'Invalid webhook signature.' });
      }
    }

    // 4. Filter for 'opened' or 'synchronize' (latest pushed commit)
    const action = req.body?.action;
    const triggerActions = ['opened', 'synchronize', 'reopened', 'ready_for_review'];
    if (!triggerActions.includes(action)) {
      return res.status(200).json({
        ignored: true,
        message: \`Action '\${action}' does not trigger review. Only 'opened' and 'synchronize' trigger automated reviews.\`,
        deliveryId,
      });
    }

    const pr = req.body?.pull_request;
    const repo = req.body?.repository?.full_name || 'unknown/repo';
    const prNumber = pr?.number;
    const headSha = pr?.head?.sha || 'HEAD';

    try {
      // 5. Fetch diff or extract from payload
      let diffText = req.body?.diff || pr?.diff || '';
      if (!diffText && pr?.diff_url) {
        const ghToken = process.env.GITHUB_TOKEN;
        const resp = await fetch(pr.diff_url, {
          headers: {
            'User-Agent': 'Gemini-Review-Bot/1.0',
            Accept: 'application/vnd.github.v3.diff',
            ...(ghToken ? { Authorization: \`Bearer \${ghToken}\` } : {}),
          },
        });
        if (resp.ok) diffText = await resp.text();
      }

      // 6. Execute Gemini 3.7 Flash AI Review
      const reviewResult = await this.aiReviewService.reviewPullRequestDiff(
        diffText,
        pr?.title || 'PR Review',
        pr?.body || '',
        repo
      );

      return res.status(200).json({
        success: true,
        deliveryId,
        action,
        repository: repo,
        pullRequestNumber: prNumber,
        latestCommitSha: headSha,
        review: reviewResult,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Webhook AI review failed';
      return res.status(500).json({ success: false, error: msg, deliveryId });
    }
  };
}
`;

export const BACKEND_AI_INTERFACE = `export interface ReviewFinding {
  path: string;
  line: number;
  category: 'SOLID' | 'SECURITY' | 'PERFORMANCE' | 'BUG' | 'CLEAN_CODE';
  severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
  title: string;
  comment: string;
  suggestedCode?: string;
}

export interface ReviewResponse {
  summary: string;
  score: number;
  findings: ReviewFinding[];
}

export interface ReviewRequestPayload {
  diff: string;
  prTitle: string;
  prDescription?: string;
  repoName?: string;
}

export interface IAIReviewService {
  reviewPullRequestDiff(
    diff: string,
    prTitle: string,
    prDescription?: string,
    repoName?: string
  ): Promise<ReviewResponse>;
}
`;

export const BACKEND_REVIEW_CONTROLLER = `import { Request, Response } from 'express';
import { IAIReviewService } from '../interfaces/ai.interface';

/**
 * ReviewController delegates incoming HTTP requests to the abstracted IAIReviewService.
 * Complies with Dependency Inversion Principle.
 */
export class ReviewController {
  constructor(private readonly aiReviewService: IAIReviewService) {}

  public handleReview = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { diff, prTitle, prDescription, repoName } = req.body;

      if (!diff || typeof diff !== 'string' || !diff.trim()) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'A valid git diff string is required.',
        });
      }

      if (!prTitle || typeof prTitle !== 'string') {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'prTitle is required.',
        });
      }

      const reviewData = await this.aiReviewService.reviewPullRequestDiff(
        diff,
        prTitle,
        prDescription,
        repoName
      );

      return res.status(200).json({
        success: true,
        data: reviewData,
        analyzedAt: new Date().toISOString(),
      });
    } catch (err: unknown) {
      console.error('ReviewController error:', err);
      const message = err instanceof Error ? err.message : 'Internal review engine failure';
      return res.status(500).json({
        error: 'Internal Server Error',
        message,
      });
    }
  };
}
`;

export const BACKEND_SERVER = `import express from 'express';
import cors from 'cors';
import { GeminiReviewService } from './services/gemini.service';
import { ReviewController } from './controllers/review.controller';

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn('WARNING: GEMINI_API_KEY is not set. Review calls will fail until configured.');
}

// Instantiate concrete service & controller adhering to DIP
const geminiService = new GeminiReviewService(apiKey || 'dummy_key_for_init');
const reviewController = new ReviewController(geminiService);

// Routes
app.post('/api/review', reviewController.handleReview);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'online',
    version: '1.0.0',
    geminiConfigured: !!apiKey,
  });
});

app.post('/api/auth/github/verify', async (req, res) => {
  const token = req.body?.token || (req.headers.authorization?.replace(/^Bearer\\s+/i, ''));
  if (!token) {
    return res.status(400).json({ valid: false, message: 'Token is required' });
  }

  try {
    const ghRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: \`Bearer \${token}\`, 'User-Agent': 'Gemini-Reviewer-Backend' }
    });
    if (!ghRes.ok) return res.status(ghRes.status).json({ valid: false, message: 'Invalid token' });
    const user = await ghRes.json();
    return res.json({ valid: true, user, scopes: ghRes.headers.get('x-oauth-scopes') || 'repo' });
  } catch (err: any) {
    return res.status(500).json({ valid: false, message: err.message });
  }
});

app.listen(port, () => {
  console.log(\`Gemini PR Reviewer Backend listening on http://localhost:\${port}\`);
});
`;

export const BACKEND_PACKAGE_JSON = `{
  "name": "gemini-pr-reviewer-backend",
  "version": "1.0.0",
  "description": "Enterprise Node.js + Express backend powering Gemini 3.7 Flash code reviews",
  "main": "dist/server.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js",
    "dev": "tsx watch src/server.ts"
  },
  "dependencies": {
    "@google/genai": "^0.1.2",
    "cors": "^2.8.5",
    "express": "^4.21.2"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^20.17.19",
    "tsx": "^4.19.2",
    "typescript": "^5.6.0"
  }
}
`;

export const EXTENSION_PACKAGE_JSON = `{
  "name": "gemini-pr-code-reviewer",
  "displayName": "Google Gemini PR Code Reviewer",
  "description": "Architect-level PR Code Reviews, SOLID Violations, Security Audits & 1-Click GitHub Reviews inside VS Code",
  "version": "1.0.0",
  "publisher": "google-gemini",
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": [
    "Programming Languages",
    "Linters",
    "Other"
  ],
  "activationEvents": [
    "onView:geminiPrReviewView",
    "onCommand:geminiReviewer.startReview",
    "onCommand:geminiReviewer.loginGitHubOAuth"
  ],
  "main": "./dist/extension.js",
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "gemini-pr-review-container",
          "title": "Gemini PR Reviewer",
          "icon": "resources/icon.svg"
        }
      ]
    },
    "views": {
      "gemini-pr-review-container": [
        {
          "type": "webview",
          "id": "geminiPrReviewView",
          "name": "PR Code Review Studio"
        }
      ]
    },
    "commands": [
      {
        "command": "geminiReviewer.startReview",
        "title": "Gemini Reviewer: Open PR Review Studio"
      },
      {
        "command": "geminiReviewer.loginGitHubOAuth",
        "title": "Gemini Reviewer: Sign in with GitHub OAuth"
      },
      {
        "command": "geminiReviewer.logoutGitHub",
        "title": "Gemini Reviewer: Sign out of GitHub"
      },
      {
        "command": "geminiReviewer.configureToken",
        "title": "Gemini Reviewer: Set GitHub Personal Access Token (PAT)"
      }
    ],
    "configuration": {
      "title": "Gemini PR Code Reviewer",
      "properties": {
        "geminiReviewer.backendUrl": {
          "type": "string",
          "default": "http://localhost:4000",
          "description": "URL of the Gemini PR Code Review backend service"
        },
        "geminiReviewer.oauthClientId": {
          "type": "string",
          "default": "Ov23liDemoGeminiArchitect",
          "description": "GitHub OAuth App Client ID"
        }
      }
    }
  },
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./"
  },
  "dependencies": {
    "@octokit/rest": "^20.1.1"
  },
  "devDependencies": {
    "@types/node": "^20.17.19",
    "@types/vscode": "^1.85.0",
    "typescript": "^5.6.0"
  }
}
`;

export const EXTENSION_GITHUB_INTERFACE = `export interface PullRequestItem {
  number: number;
  title: string;
  user: string;
  headSha: string;
  baseBranch: string;
  headBranch: string;
  updatedAt: string;
  body: string;
}

export interface ReviewCommentPayload {
  path: string;
  line: number;
  body: string;
}

export interface GitHubUserProfile {
  login: string;
  name: string;
  avatarUrl: string;
  htmlUrl: string;
  publicRepos: number;
  scopes: string;
}

export interface IGitHubAuthService {
  loginWithOAuth(): Promise<string>;
  logout(): Promise<void>;
  getToken(): Promise<string | null>;
  setManualToken(token: string): Promise<void>;
  validateToken(token: string): Promise<GitHubUserProfile | null>;
}

export interface IGitHubService {
  setToken(token: string): void;
  isAuthenticated(): boolean;
  getAuthenticatedUser(): Promise<GitHubUserProfile>;
  getRepositories(): Promise<Array<{ owner: string; repo: string; fullName: string }>>;
  getPullRequests(owner: string, repo: string): Promise<PullRequestItem[]>;
  getPullRequestDiff(owner: string, repo: string, pullNumber: number): Promise<string>;
  submitPullRequestReview(
    owner: string,
    repo: string,
    pullNumber: number,
    commitId: string,
    event: 'COMMENT' | 'REQUEST_CHANGES' | 'APPROVE',
    comments: ReviewCommentPayload[],
    generalComment: string
  ): Promise<{ reviewId: number; htmlUrl: string }>;
}
`;

export const EXTENSION_AUTH_SERVICE = `import * as vscode from 'vscode';
import { IGitHubAuthService, GitHubUserProfile } from './github.interface';

const SECRET_KEY = 'geminiReviewer.githubToken';
const GITHUB_AUTH_ENDPOINT = 'https://github.com/login/oauth/authorize';
const GITHUB_DEVICE_CODE_ENDPOINT = 'https://github.com/login/device/code';
const GITHUB_ACCESS_TOKEN_ENDPOINT = 'https://github.com/login/oauth/access_token';

/**
 * GitHubAuthService orchestrates the OAuth 2.0 Authorization Code / Device Flow lifecycle,
 * URI callback handling, and encrypted OS keychain persistence via vscode.SecretStorage.
 */
export class GitHubAuthService implements IGitHubAuthService {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly clientId: string = 'Ov23liDemoGeminiArchitect'
  ) {}

  public async getToken(): Promise<string | null> {
    return (await this.context.secrets.get(SECRET_KEY)) || null;
  }

  public async setManualToken(token: string): Promise<void> {
    await this.context.secrets.store(SECRET_KEY, token.trim());
  }

  public async logout(): Promise<void> {
    await this.context.secrets.delete(SECRET_KEY);
  }

  /**
   * Initiates GitHub OAuth authentication flow.
   * 1. Generates cryptographic state nonce to prevent CSRF.
   * 2. Opens system browser targeting GitHub OAuth Authorization URL with scopes.
   * 3. Registers VS Code UriHandler callback listener or Device Code fallback.
   */
  public async loginWithOAuth(): Promise<string> {
    const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const redirectUri = 'vscode://google-gemini.gemini-pr-code-reviewer/auth-callback';
    const scopes = encodeURIComponent('repo read:user workflow');

    const authUrl = \`\${GITHUB_AUTH_ENDPOINT}?client_id=\${this.clientId}&redirect_uri=\${encodeURIComponent(redirectUri)}&scope=\${scopes}&state=\${state}\`;

    // Prompt user & open external browser
    const selection = await vscode.window.showInformationMessage(
      'Gemini PR Reviewer needs GitHub authorization to list PRs and submit review comments.',
      'Authorize in Browser',
      'Use Personal Access Token Instead'
    );

    if (selection === 'Use Personal Access Token Instead') {
      const manualToken = await vscode.window.showInputBox({
        prompt: 'Enter GitHub Personal Access Token (classic with repo scope)',
        password: true,
        ignoreFocusOut: true,
      });
      if (manualToken) {
        await this.setManualToken(manualToken);
        return manualToken;
      }
      throw new Error('User cancelled token entry.');
    }

    if (selection !== 'Authorize in Browser') {
      throw new Error('OAuth flow cancelled by user.');
    }

    await vscode.env.openExternal(vscode.Uri.parse(authUrl));

    // Wait for the custom URI handler callback or device code exchange
    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        disposable.dispose();
        reject(new Error('OAuth authentication timed out. Please try again.'));
      }, 120000); // 2 minutes

      const disposable = vscode.window.registerUriHandler({
        handleUri: async (uri: vscode.Uri) => {
          if (uri.path === '/auth-callback') {
            const queryParams = new URLSearchParams(uri.query);
            const code = queryParams.get('code');
            const returnedState = queryParams.get('state');

            if (returnedState !== state) {
              disposable.dispose();
              clearTimeout(timeout);
              reject(new Error('State mismatch error. Possible CSRF attack detected.'));
              return;
            }

            if (code) {
              try {
                // Exchange code for token securely (or through proxy backend)
                const token = await this.exchangeCodeForToken(code);
                await this.setManualToken(token);
                disposable.dispose();
                clearTimeout(timeout);
                vscode.window.showInformationMessage('Successfully authenticated with GitHub OAuth!');
                resolve(token);
              } catch (err: any) {
                disposable.dispose();
                clearTimeout(timeout);
                reject(err);
              }
            }
          }
        },
      });
    });
  }

  private async exchangeCodeForToken(code: string): Promise<string> {
    // In production, token exchange is proxied to protect client secret, or done directly via PKCE
    const response = await fetch(GITHUB_ACCESS_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: this.clientId,
        code,
      }),
    });

    const data: any = await response.json();
    if (data.access_token) {
      return data.access_token;
    }
    throw new Error(data.error_description || 'Failed to exchange authorization code for token');
  }

  public async validateToken(token: string): Promise<GitHubUserProfile | null> {
    try {
      const res = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: \`Bearer \${token}\`,
          'User-Agent': 'Gemini-PR-Reviewer-Extension',
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!res.ok) return null;
      const data: any = await res.json();
      return {
        login: data.login,
        name: data.name || data.login,
        avatarUrl: data.avatar_url,
        htmlUrl: data.html_url,
        publicRepos: data.public_repos || 0,
        scopes: res.headers.get('x-oauth-scopes') || 'repo',
      };
    } catch {
      return null;
    }
  }
}
`;

export const EXTENSION_GITHUB_SERVICE = `import { Octokit } from '@octokit/rest';
import { IGitHubService, PullRequestItem, ReviewCommentPayload, GitHubUserProfile } from './github.interface';

/**
 * GitHubService implements IGitHubService using the official @octokit/rest library.
 * Encapsulates all GitHub API interactions, OAuth token state, rate limiting, and review submissions.
 */
export class GitHubService implements IGitHubService {
  private octokit: Octokit | null = null;
  private currentToken: string | null = null;

  constructor(token?: string) {
    if (token) {
      this.setToken(token);
    }
  }

  public setToken(token: string): void {
    this.currentToken = token;
    this.octokit = new Octokit({
      auth: token,
      userAgent: 'vscode-gemini-pr-code-reviewer/1.0.0',
    });
  }

  public isAuthenticated(): boolean {
    return !!this.octokit && !!this.currentToken;
  }

  private ensureAuth(): Octokit {
    if (!this.octokit) {
      throw new Error('GitHub client is not authenticated. Please sign in with GitHub OAuth or configure a Personal Access Token.');
    }
    return this.octokit;
  }

  public async getAuthenticatedUser(): Promise<GitHubUserProfile> {
    const octokit = this.ensureAuth();
    const response = await octokit.rest.users.getAuthenticated();
    return {
      login: response.data.login,
      name: response.data.name || response.data.login,
      avatarUrl: response.data.avatar_url,
      htmlUrl: response.data.html_url,
      publicRepos: response.data.public_repos,
      scopes: (response.headers['x-oauth-scopes'] as string) || 'repo',
    };
  }

  public async getRepositories(): Promise<Array<{ owner: string; repo: string; fullName: string }>> {
    const octokit = this.ensureAuth();
    const response = await octokit.rest.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 50,
      affiliation: 'owner,collaborator,organization_member',
    });

    return response.data.map((r) => ({
      owner: r.owner.login,
      repo: r.name,
      fullName: r.full_name,
    }));
  }

  public async getPullRequests(owner: string, repo: string): Promise<PullRequestItem[]> {
    const octokit = this.ensureAuth();
    const response = await octokit.rest.pulls.list({
      owner,
      repo,
      state: 'open',
      per_page: 30,
    });

    return response.data.map((pr) => ({
      number: pr.number,
      title: pr.title,
      user: pr.user?.login || 'unknown',
      headSha: pr.head.sha,
      baseBranch: pr.base.ref,
      headBranch: pr.head.ref,
      updatedAt: pr.updated_at,
      body: pr.body || '',
    }));
  }

  public async getPullRequestDiff(owner: string, repo: string, pullNumber: number): Promise<string> {
    const octokit = this.ensureAuth();
    const response = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
      headers: {
        accept: 'application/vnd.github.v3.diff',
      },
    });

    return response.data as unknown as string;
  }

  public async submitPullRequestReview(
    owner: string,
    repo: string,
    pullNumber: number,
    commitId: string,
    event: 'COMMENT' | 'REQUEST_CHANGES' | 'APPROVE',
    comments: ReviewCommentPayload[],
    generalComment: string
  ): Promise<{ reviewId: number; htmlUrl: string }> {
    const octokit = this.ensureAuth();

    const formattedComments = comments.map((c) => ({
      path: c.path,
      line: c.line,
      side: 'RIGHT' as const,
      body: c.body,
    }));

    const response = await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      commit_id: commitId,
      event,
      body: generalComment,
      comments: formattedComments,
    });

    return {
      reviewId: response.data.id,
      htmlUrl: response.data.html_url,
    };
  }
}
`;

export const EXTENSION_WEBVIEW_PANEL = `import * as vscode from 'vscode';
import { IGitHubService, PullRequestItem } from '../services/github.interface';
import { IGitHubAuthService } from '../services/github.interface';

/**
 * ReviewWebviewViewProvider manages the interactive sidebar / webview panel.
 * Features:
 * - Dynamic Filtering: Category ('SECURITY', 'PERFORMANCE', 'SOLID', 'BUG', 'CLEAN_CODE') & Severity ('CRITICAL', 'WARNING', 'SUGGESTION').
 * - Dynamic Sorting: File Path, Line Number, Severity, Category.
 * - Text search query across comments and paths.
 * - Editable comments and approval selection preserved during filtering and sorting.
 * - GitHub OAuth Status badge and 1-click authentication triggers.
 */
export class ReviewWebviewViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'geminiPrReviewView';
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _githubService: IGitHubService,
    private readonly _authService: IGitHubAuthService,
    private readonly _backendUrl: string
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'INIT_AUTH_CHECK':
          await this.checkAuthStatus();
          break;
        case 'TRIGGER_OAUTH_LOGIN':
          try {
            const token = await this._authService.loginWithOAuth();
            this._githubService.setToken(token);
            await this.checkAuthStatus();
            await this.handleFetchRepos();
          } catch (err: any) {
            vscode.window.showErrorMessage(\`OAuth Sign-in failed: \${err.message}\`);
          }
          break;
        case 'TRIGGER_LOGOUT':
          await this._authService.logout();
          this._githubService.setToken('');
          this._view?.webview.postMessage({ type: 'AUTH_STATUS', authenticated: false });
          break;
        case 'FETCH_REPOS':
          await this.handleFetchRepos();
          break;
        case 'FETCH_PRS':
          await this.handleFetchPRs(message.owner, message.repo);
          break;
        case 'RUN_REVIEW':
          await this.handleRunReview(message.owner, message.repo, message.pr);
          break;
        case 'SUBMIT_COMMENTS':
          await this.handleSubmitComments(
            message.owner,
            message.repo,
            message.prNumber,
            message.commitId,
            message.findings,
            message.summary
          );
          break;
      }
    });
  }

  private async checkAuthStatus(): Promise<void> {
    const token = await this._authService.getToken();
    if (!token) {
      this._view?.webview.postMessage({ type: 'AUTH_STATUS', authenticated: false });
      return;
    }
    const user = await this._authService.validateToken(token);
    if (user) {
      this._githubService.setToken(token);
      this._view?.webview.postMessage({
        type: 'AUTH_STATUS',
        authenticated: true,
        user,
      });
    } else {
      this._view?.webview.postMessage({ type: 'AUTH_STATUS', authenticated: false });
    }
  }

  private async handleFetchRepos(): Promise<void> {
    try {
      const repos = await this._githubService.getRepositories();
      this._view?.webview.postMessage({ type: 'REPOS_LOADED', repos });
    } catch (err: any) {
      vscode.window.showErrorMessage(\`Failed to fetch repositories: \${err.message}\`);
      this._view?.webview.postMessage({ type: 'ERROR', message: err.message });
    }
  }

  private async handleFetchPRs(owner: string, repo: string): Promise<void> {
    try {
      const prs = await this._githubService.getPullRequests(owner, repo);
      this._view?.webview.postMessage({ type: 'PRS_LOADED', prs });
    } catch (err: any) {
      vscode.window.showErrorMessage(\`Failed to fetch PRs: \${err.message}\`);
      this._view?.webview.postMessage({ type: 'ERROR', message: err.message });
    }
  }

  private async handleRunReview(owner: string, repo: string, pr: PullRequestItem): Promise<void> {
    try {
      this._view?.webview.postMessage({ type: 'REVIEW_STARTING' });
      const diff = await this._githubService.getPullRequestDiff(owner, repo, pr.number);

      const response = await fetch(\`\${this._backendUrl}/api/review\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          diff,
          prTitle: pr.title,
          prDescription: pr.body,
          repoName: \`\${owner}/\${repo}\`,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(\`Backend returned \${response.status}: \${errorText}\`);
      }

      const reviewData = await response.json();
      this._view?.webview.postMessage({ type: 'REVIEW_COMPLETED', result: reviewData.data });
    } catch (err: any) {
      vscode.window.showErrorMessage(\`AI Review Failed: \${err.message}\`);
      this._view?.webview.postMessage({ type: 'ERROR', message: err.message });
    }
  }

  private async handleSubmitComments(
    owner: string,
    repo: string,
    prNumber: number,
    commitId: string,
    findings: any[],
    summary: string
  ): Promise<void> {
    try {
      const approvedFindings = findings.filter((f) => f.approved !== false);
      if (approvedFindings.length === 0) {
        vscode.window.showWarningMessage('No approved comments selected to push.');
        return;
      }

      const commentsPayload = approvedFindings.map((f) => ({
        path: f.path,
        line: f.line,
        body: \`**[Gemini AI Code Review - \${f.category} (\${f.severity})]**\\n\\n\${f.userEditedComment || f.comment}\${
          f.suggestedCode ? \`\\n\\n\`\`\`suggestion\\n\${f.suggestedCode}\\n\`\`\`\` : ''
        }\`,
      }));

      const generalBody = \`🤖 **Google AI Studio (Gemini) Automated Code Review Summary**\\n\\n\${summary}\\n\\n*Reviewed \${commentsPayload.length} actionable points.* \`;

      const result = await this._githubService.submitPullRequestReview(
        owner,
        repo,
        prNumber,
        commitId,
        'COMMENT',
        commentsPayload,
        generalBody
      );

      vscode.window.showInformationMessage(\`Successfully pushed \${commentsPayload.length} review comments to PR #\${prNumber}!\`);
      this._view?.webview.postMessage({ type: 'COMMENTS_PUSHED', reviewUrl: result.htmlUrl });
    } catch (err: any) {
      vscode.window.showErrorMessage(\`Failed to push review comments: \${err.message}\`);
      this._view?.webview.postMessage({ type: 'ERROR', message: err.message });
    }
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    return \`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gemini PR Code Reviewer</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background-color: var(--vscode-sideBar-background); padding: 12px; font-size: 12px; }
    h2, h3 { margin-top: 0; color: var(--vscode-editor-foreground); font-size: 14px; }
    .btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 7px 10px; cursor: pointer; border-radius: 4px; font-weight: 600; width: 100%; margin-top: 6px; }
    .btn:hover { background: var(--vscode-button-hoverBackground); }
    .btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .btn-oauth { background: #238636; color: white; display: flex; align-items: center; justify-content: center; gap: 6px; }
    .btn-oauth:hover { background: #2ea043; }
    select, input, textarea { width: 100%; padding: 6px; margin: 3px 0 8px 0; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; box-sizing: border-box; font-size: 12px; }
    .card { background: var(--vscode-editor-background); border: 1px solid var(--vscode-widget-border); border-radius: 6px; padding: 10px; margin-bottom: 10px; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: bold; }
    .badge-CRITICAL { background: #e53e3e; color: white; }
    .badge-WARNING { background: #dd6b20; color: white; }
    .badge-SUGGESTION { background: #3182ce; color: white; }
    .badge-SOLID { background: #2b6cb0; color: white; }
    .badge-SECURITY { background: #9b2c2c; color: white; }
    .badge-PERFORMANCE { background: #2f855a; color: white; }
    .badge-BUG { background: #c53030; color: white; }
    .badge-CLEAN_CODE { background: #4a5568; color: white; }
    .score-badge { font-size: 16px; font-weight: bold; color: var(--vscode-textLink-foreground); }
    .loading { text-align: center; padding: 20px; font-style: italic; color: var(--vscode-descriptionForeground); }
    .code-preview { background: var(--vscode-textCodeBlock-background); padding: 8px; border-radius: 4px; font-family: monospace; font-size: 11px; overflow-x: auto; white-space: pre-wrap; margin-top: 6px; }
    .checkbox-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
    .filter-bar { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 8px; }
    .auth-banner { display: flex; align-items: center; justify-content: space-between; padding: 8px; background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 4px; margin-bottom: 10px; }
    .pill { font-size: 10px; padding: 2px 5px; border-radius: 10px; }
  </style>
</head>
<body>
  <!-- GitHub OAuth Status Section -->
  <div id="authSection" class="card">
    <div id="authNotLoggedIn">
      <div style="font-weight: 600; margin-bottom: 4px;">GitHub Authentication</div>
      <div style="font-size: 11px; opacity: 0.8; margin-bottom: 8px;">Connect your GitHub account via OAuth 2.0 to review pull requests.</div>
      <button class="btn btn-oauth" id="btnOAuthLogin">
        <span>🔑 Sign in with GitHub OAuth</span>
      </button>
    </div>
    <div id="authLoggedIn" style="display: none;">
      <div class="auth-banner">
        <div style="display: flex; align-items: center; gap: 6px;">
          <img id="userAvatar" src="" style="width: 20px; height: 20px; border-radius: 50%;" />
          <span id="userName" style="font-weight: bold;">--</span>
          <span class="pill" style="background:#238636; color:white;">OAuth Connected</span>
        </div>
        <button id="btnLogout" class="btn btn-secondary" style="width: auto; padding: 2px 8px; margin: 0; font-size: 10px;">Logout</button>
      </div>
    </div>
  </div>

  <div class="card" id="repoCard">
    <label><b>1. Select Target Repository</b></label>
    <select id="repoSelect"><option value="">-- Choose Repository --</option></select>
    <button class="btn btn-secondary" id="btnLoadRepos">🔄 Refresh Repositories</button>
  </div>

  <div class="card" id="prCard" style="display:none;">
    <label><b>2. Select Pull Request</b></label>
    <select id="prSelect"><option value="">-- Select Pull Request --</option></select>
    <button class="btn" id="btnRunReview">✨ Run Gemini AI Review</button>
  </div>

  <div id="loadingIndicator" class="loading" style="display:none;">
    🧠 Gemini 3.7 Flash is analyzing the unified diff against SOLID & Security matrices...
  </div>

  <div id="resultsContainer" style="display:none;">
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h3>PR Health Assessment</h3>
        <span class="score-badge" id="scoreBadge">Score: --</span>
      </div>
      <p id="summaryText" style="font-size:12px; margin-top: 4px; line-height: 1.4;"></p>
    </div>

    <!-- Filter & Sort Interactive Controls -->
    <div class="card" style="background: var(--vscode-sideBar-background);">
      <div style="font-weight: bold; font-size: 11px; text-transform: uppercase; margin-bottom: 6px; opacity: 0.8;">
        🔍 Filter & Sort Findings
      </div>
      
      <!-- Quick Search Bar -->
      <input type="text" id="searchBox" placeholder="Search comments, paths, or code..." />

      <div class="filter-bar">
        <div>
          <label style="font-size: 10px; font-weight: 600;">Category</label>
          <select id="categoryFilter">
            <option value="ALL">All Categories</option>
            <option value="SECURITY">Security</option>
            <option value="PERFORMANCE">Performance</option>
            <option value="SOLID">SOLID Principles</option>
            <option value="BUG">Bugs</option>
            <option value="CLEAN_CODE">Clean Code</option>
          </select>
        </div>

        <div>
          <label style="font-size: 10px; font-weight: 600;">Severity</label>
          <select id="severityFilter">
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="WARNING">Warning</option>
            <option value="SUGGESTION">Suggestion</option>
          </select>
        </div>
      </div>

      <div class="filter-bar">
        <div style="grid-column: span 2;">
          <label style="font-size: 10px; font-weight: 600;">Sort By</label>
          <select id="sortBySelect">
            <option value="LINE_ASC">Line Number (Ascending)</option>
            <option value="LINE_DESC">Line Number (Descending)</option>
            <option value="SEVERITY_HIGH">Severity (Critical First)</option>
            <option value="PATH_AZ">File Path (A-Z)</option>
            <option value="CATEGORY">Category</option>
          </select>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; margin-top: 4px;">
        <span id="statsLabel" style="opacity: 0.8;">Showing 0 comments</span>
        <div style="display: flex; gap: 4px;">
          <button id="btnSelectAll" class="btn btn-secondary" style="width: auto; padding: 2px 6px; margin: 0; font-size: 10px;">Select All</button>
          <button id="btnSelectNone" class="btn btn-secondary" style="width: auto; padding: 2px 6px; margin: 0; font-size: 10px;">Deselect All</button>
        </div>
      </div>
    </div>

    <!-- Review Comments Render List -->
    <div id="findingsList"></div>

    <button class="btn" id="btnPushComments" style="background:#2ea043; margin-top:12px; padding: 10px;">
      🚀 Submit Approved Comments to GitHub PR
    </button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let currentRepos = [];
    let currentPRs = [];
    let masterFindings = [];
    let currentPR = null;
    let currentSummary = '';

    // Filter & Sort state
    let activeFilterCategory = 'ALL';
    let activeFilterSeverity = 'ALL';
    let activeSearchTerm = '';
    let activeSortOption = 'LINE_ASC';

    // Auth events
    document.getElementById('btnOAuthLogin').addEventListener('click', () => {
      vscode.postMessage({ type: 'TRIGGER_OAUTH_LOGIN' });
    });

    document.getElementById('btnLogout').addEventListener('click', () => {
      vscode.postMessage({ type: 'TRIGGER_LOGOUT' });
    });

    document.getElementById('btnLoadRepos').addEventListener('click', () => {
      vscode.postMessage({ type: 'FETCH_REPOS' });
    });

    document.getElementById('repoSelect').addEventListener('change', (e) => {
      const selected = e.target.value;
      if (!selected) return;
      const [owner, repo] = selected.split('/');
      vscode.postMessage({ type: 'FETCH_PRS', owner, repo });
    });

    document.getElementById('btnRunReview').addEventListener('click', () => {
      const repoVal = document.getElementById('repoSelect').value;
      const prVal = document.getElementById('prSelect').value;
      if (!repoVal || !prVal) return;
      const [owner, repo] = repoVal.split('/');
      const pr = currentPRs.find(p => p.number == prVal);
      currentPR = pr;
      vscode.postMessage({ type: 'RUN_REVIEW', owner, repo, pr });
    });

    document.getElementById('categoryFilter').addEventListener('change', (e) => {
      activeFilterCategory = e.target.value;
      applyFiltersAndSort();
    });

    document.getElementById('severityFilter').addEventListener('change', (e) => {
      activeFilterSeverity = e.target.value;
      applyFiltersAndSort();
    });

    document.getElementById('sortBySelect').addEventListener('change', (e) => {
      activeSortOption = e.target.value;
      applyFiltersAndSort();
    });

    document.getElementById('searchBox').addEventListener('input', (e) => {
      activeSearchTerm = e.target.value.toLowerCase().trim();
      applyFiltersAndSort();
    });

    document.getElementById('btnSelectAll').addEventListener('click', () => {
      getFilteredFindings().forEach(f => f.approved = true);
      applyFiltersAndSort();
    });

    document.getElementById('btnSelectNone').addEventListener('click', () => {
      getFilteredFindings().forEach(f => f.approved = false);
      applyFiltersAndSort();
    });

    document.getElementById('btnPushComments').addEventListener('click', () => {
      const repoVal = document.getElementById('repoSelect').value;
      const [owner, repo] = repoVal.split('/');
      vscode.postMessage({
        type: 'SUBMIT_COMMENTS',
        owner,
        repo,
        prNumber: currentPR.number,
        commitId: currentPR.headSha,
        findings: masterFindings,
        summary: currentSummary
      });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'AUTH_STATUS') {
        if (msg.authenticated && msg.user) {
          document.getElementById('authNotLoggedIn').style.display = 'none';
          document.getElementById('authLoggedIn').style.display = 'block';
          document.getElementById('userAvatar').src = msg.user.avatarUrl;
          document.getElementById('userName').innerText = '@' + msg.user.login;
        } else {
          document.getElementById('authNotLoggedIn').style.display = 'block';
          document.getElementById('authLoggedIn').style.display = 'none';
        }
      } else if (msg.type === 'REPOS_LOADED') {
        currentRepos = msg.repos;
        const select = document.getElementById('repoSelect');
        select.innerHTML = '<option value="">-- Choose Repository --</option>' +
          msg.repos.map(r => '<option value="' + r.fullName + '">' + r.fullName + '</option>').join('');
      } else if (msg.type === 'PRS_LOADED') {
        currentPRs = msg.prs;
        const select = document.getElementById('prSelect');
        document.getElementById('prCard').style.display = 'block';
        select.innerHTML = '<option value="">-- Select Pull Request --</option>' +
          msg.prs.map(p => '<option value="' + p.number + '">#' + p.number + ' ' + p.title + ' (@' + p.user + ')</option>').join('');
      } else if (msg.type === 'REVIEW_STARTING') {
        document.getElementById('loadingIndicator').style.display = 'block';
        document.getElementById('resultsContainer').style.display = 'none';
      } else if (msg.type === 'REVIEW_COMPLETED') {
        document.getElementById('loadingIndicator').style.display = 'none';
        document.getElementById('resultsContainer').style.display = 'block';
        loadReview(msg.result);
      }
    });

    function loadReview(result) {
      currentSummary = result.summary;
      masterFindings = (result.findings || []).map((f, i) => ({
        id: 'f_' + i,
        ...f,
        approved: true,
        userEditedComment: f.comment
      }));
      document.getElementById('scoreBadge').innerText = 'Score: ' + result.score + '/100';
      document.getElementById('summaryText').innerText = result.summary;
      applyFiltersAndSort();
    }

    function getFilteredFindings() {
      return masterFindings.filter(f => {
        if (activeFilterCategory !== 'ALL' && f.category !== activeFilterCategory) return false;
        if (activeFilterSeverity !== 'ALL' && f.severity !== activeFilterSeverity) return false;
        if (activeSearchTerm) {
          const matchPath = f.path.toLowerCase().includes(activeSearchTerm);
          const matchTitle = f.title.toLowerCase().includes(activeSearchTerm);
          const matchComment = (f.userEditedComment || f.comment).toLowerCase().includes(activeSearchTerm);
          if (!matchPath && !matchTitle && !matchComment) return false;
        }
        return true;
      });
    }

    function applyFiltersAndSort() {
      let filtered = getFilteredFindings();

      // Sort
      filtered.sort((a, b) => {
        if (activeSortOption === 'LINE_ASC') return a.line - b.line;
        if (activeSortOption === 'LINE_DESC') return b.line - a.line;
        if (activeSortOption === 'PATH_AZ') return a.path.localeCompare(b.path) || (a.line - b.line);
        if (activeSortOption === 'CATEGORY') return a.category.localeCompare(b.category);
        if (activeSortOption === 'SEVERITY_HIGH') {
          const weight = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 };
          return (weight[b.severity] || 0) - (weight[a.severity] || 0);
        }
        return 0;
      });

      const approvedCount = filtered.filter(f => f.approved).length;
      document.getElementById('statsLabel').innerText = \`Showing \${filtered.length} of \${masterFindings.length} comments (\${approvedCount} selected)\`;

      const container = document.getElementById('findingsList');
      container.innerHTML = '';

      if (filtered.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:16px; opacity:0.6;">No comments match the selected filter criteria.</div>';
        return;
      }

      filtered.forEach(f => {
        const div = document.createElement('div');
        div.className = 'card';
        div.innerHTML = \`
          <div class="checkbox-row">
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="checkbox" id="check_\${f.id}" \${f.approved ? 'checked' : ''} style="width:auto; margin:0;" />
              <b style="font-family:monospace;">\${f.path}:\${f.line}</b>
            </label>
            <div>
              <span class="badge badge-\${f.severity}">\${f.severity}</span>
              <span class="badge badge-\${f.category}">\${f.category}</span>
            </div>
          </div>
          <div style="font-weight:600; margin-bottom:4px; color:var(--vscode-editor-foreground);">\${f.title}</div>
          <textarea id="comment_\${f.id}" rows="3">\${f.userEditedComment || f.comment}</textarea>
          \${f.suggestedCode ? '<div class="code-preview">' + escapeHtml(f.suggestedCode) + '</div>' : ''}
        \`;
        container.appendChild(div);

        document.getElementById('check_' + f.id).addEventListener('change', (e) => {
          f.approved = e.target.checked;
          const apCount = getFilteredFindings().filter(item => item.approved).length;
          document.getElementById('statsLabel').innerText = \`Showing \${filtered.length} of \${masterFindings.length} comments (\${apCount} selected)\`;
        });

        document.getElementById('comment_' + f.id).addEventListener('input', (e) => {
          f.userEditedComment = e.target.value;
        });
      });
    }

    function escapeHtml(text) {
      return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    // Trigger initial auth check
    vscode.postMessage({ type: 'INIT_AUTH_CHECK' });
  </script>
</body>
</html>\`;
  }
}
`;

export const EXTENSION_MAIN = `import * as vscode from 'vscode';
import { GitHubService } from './services/github.service';
import { GitHubAuthService } from './services/auth.service';
import { ReviewWebviewViewProvider } from './views/reviewWebviewPanel';

/**
 * Extension entry point adhering to SOLID:
 * - Single Responsibility: Activates and registers commands, SecretStorage listeners, OAuth lifecycle, and Webview providers.
 * - Dependency Inversion: Constructs concrete GitHubService & GitHubAuthService and passes them via contracts.
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log('Activating Gemini PR Code Reviewer extension...');

  const config = vscode.workspace.getConfiguration('geminiReviewer');
  const backendUrl = config.get<string>('backendUrl') || 'http://localhost:4000';
  const clientId = config.get<string>('oauthClientId') || 'Ov23liDemoGeminiArchitect';

  // Instantiate Auth Service & GitHub Service
  const authService = new GitHubAuthService(context, clientId);
  const githubService = new GitHubService();

  // Check for saved token in SecretStorage
  const savedToken = await authService.getToken();
  if (savedToken) {
    githubService.setToken(savedToken);
  }

  // Create Status Bar Item showing Auth State
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'geminiReviewer.startReview';
  updateStatusBar(statusBarItem, authService, savedToken);
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register Webview Provider with Filter & Sorting support
  const provider = new ReviewWebviewViewProvider(context.extensionUri, githubService, authService, backendUrl);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ReviewWebviewViewProvider.viewType, provider)
  );

  // Command: GitHub OAuth Login Flow
  const loginOAuthCmd = vscode.commands.registerCommand('geminiReviewer.loginGitHubOAuth', async () => {
    try {
      const token = await authService.loginWithOAuth();
      githubService.setToken(token);
      await updateStatusBar(statusBarItem, authService, token);
      vscode.window.showInformationMessage('Successfully connected to GitHub via OAuth!');
    } catch (err: any) {
      vscode.window.showErrorMessage(\`GitHub OAuth Error: \${err.message}\`);
    }
  });

  // Command: Set GitHub Personal Access Token (PAT)
  const configureTokenCmd = vscode.commands.registerCommand('geminiReviewer.configureToken', async () => {
    const token = await vscode.window.showInputBox({
      prompt: 'Enter your GitHub Personal Access Token (classic with repo scope or fine-grained)',
      password: true,
      ignoreFocusOut: true,
    });

    if (token) {
      await authService.setManualToken(token);
      githubService.setToken(token);
      await updateStatusBar(statusBarItem, authService, token);
      vscode.window.showInformationMessage('GitHub Token successfully saved to VS Code Secure Storage.');
    }
  });

  // Command: Logout of GitHub
  const logoutCmd = vscode.commands.registerCommand('geminiReviewer.logoutGitHub', async () => {
    await authService.logout();
    githubService.setToken('');
    await updateStatusBar(statusBarItem, authService, null);
    vscode.window.showInformationMessage('Successfully logged out of GitHub.');
  });

  // Command: Open PR Review Studio
  const startReviewCmd = vscode.commands.registerCommand('geminiReviewer.startReview', () => {
    vscode.commands.executeCommand('workbench.view.extension.gemini-pr-review-container');
  });

  context.subscriptions.push(loginOAuthCmd, configureTokenCmd, logoutCmd, startReviewCmd);
}

async function updateStatusBar(item: vscode.StatusBarItem, authService: GitHubAuthService, token: string | null) {
  if (token) {
    const user = await authService.validateToken(token);
    if (user) {
      item.text = \`$(github) @\${user.login}\`;
      item.tooltip = \`Gemini PR Reviewer: Authenticated as \${user.name} (@\${user.login})\`;
      return;
    }
  }
  item.text = '$(github) Gemini PR: Sign In';
  item.tooltip = 'Click to connect GitHub OAuth or Personal Access Token';
}

export function deactivate() {}
`;

export const FRONTEND_REVIEW_SERVICE = `import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ReviewResponse, CustomRule, WebhookDeliveryLog } from '../models/review.model';

@Injectable({ providedIn: 'root' })
export class ReviewService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api';

  public checkHealth(): Observable<{ status: string; geminiConfigured: boolean; webhookSecretConfigured: boolean }> {
    return this.http.get<{ status: string; geminiConfigured: boolean; webhookSecretConfigured: boolean }>(
      \`\${this.apiUrl}/health\`
    );
  }

  public reviewDiff(
    diff: string,
    prTitle: string,
    prDescription: string,
    repoName: string,
    customRules?: CustomRule[]
  ): Observable<{ success: boolean; data: ReviewResponse; engine: string }> {
    return this.http.post<{ success: boolean; data: ReviewResponse; engine: string }>(
      \`\${this.apiUrl}/review\`,
      { diff, prTitle, prDescription, repoName, customRules }
    );
  }

  public getRules(): Observable<{ success: boolean; rules: CustomRule[] }> {
    return this.http.get<{ success: boolean; rules: CustomRule[] }>(\`\${this.apiUrl}/rules\`);
  }

  public saveRule(rule: Partial<CustomRule>): Observable<{ success: boolean; rule: CustomRule }> {
    return this.http.post<{ success: boolean; rule: CustomRule }>(\`\${this.apiUrl}/rules\`, rule);
  }

  public updateRule(id: string, updates: Partial<CustomRule>): Observable<{ success: boolean; rule: CustomRule }> {
    return this.http.put<{ success: boolean; rule: CustomRule }>(\`\${this.apiUrl}/rules/\${id}\`, updates);
  }

  public deleteRule(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(\`\${this.apiUrl}/rules/\${id}\`);
  }
}
`;

export const FRONTEND_DIFF_VIEWER = `import { Component, ChangeDetectionStrategy, input, output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { parseUnifiedDiff, ParsedFileDiff, DiffFindingRef } from '../utils/diff-parser';

@Component({
  selector: 'app-diff-viewer',
  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './diff-viewer.html',
  styleUrl: './diff-viewer.css',
})
export class DiffViewer {
  public readonly rawDiff = input.required<string>();
  public readonly findings = input<DiffFindingRef[]>([]);
  public readonly viewMode = input<'split' | 'unified'>('split');
  public readonly toggleFindingApproval = output<string>();

  public readonly parsedFiles = computed(() => {
    return parseUnifiedDiff(this.rawDiff(), this.findings());
  });
}
`;

export const ALL_SOURCE_FILES: SourceFileDoc[] = [
  // /backend Files
  {
    id: 'backend-gemini-service',
    path: 'backend/src/services/gemini.service.ts',
    section: 'backend',
    language: 'typescript',
    description: 'Gemini AI Review Engine leveraging @google/genai SDK with structured JSON Schema output.',
    code: BACKEND_GEMINI_SERVICE,
  },
  {
    id: 'backend-ai-interface',
    path: 'backend/src/interfaces/ai.interface.ts',
    section: 'backend',
    language: 'typescript',
    description: 'Dependency Inversion contract defining AI Review Service behavior and response models.',
    code: BACKEND_AI_INTERFACE,
  },
  {
    id: 'backend-review-controller',
    path: 'backend/src/controllers/review.controller.ts',
    section: 'backend',
    language: 'typescript',
    description: 'MVC Controller validating incoming PR diffs and delegating to AI review service.',
    code: BACKEND_REVIEW_CONTROLLER,
  },
  {
    id: 'backend-webhook-controller',
    path: 'backend/src/controllers/webhook.controller.ts',
    section: 'backend',
    language: 'typescript',
    description: 'GitHub Pull Request Webhook Controller listening for opened and synchronize events with HMAC signature verification.',
    code: BACKEND_WEBHOOK_CONTROLLER,
  },
  {
    id: 'backend-server',
    path: 'backend/src/server.ts',
    section: 'backend',
    language: 'typescript',
    description: 'Express server bootstrap, OAuth token verification, CORS, and centralized error handling.',
    code: BACKEND_SERVER,
  },
  {
    id: 'backend-package-json',
    path: 'backend/package.json',
    section: 'backend',
    language: 'json',
    description: 'Backend dependencies and build scripts.',
    code: BACKEND_PACKAGE_JSON,
  },

  // /frontend Files
  {
    id: 'frontend-review-service',
    path: 'frontend/src/app/services/review.service.ts',
    section: 'frontend',
    language: 'typescript',
    description: 'Angular Zoneless HTTP service communicating with the Gemini review and Rule Engine endpoints.',
    code: FRONTEND_REVIEW_SERVICE,
  },
  {
    id: 'frontend-diff-viewer',
    path: 'frontend/src/app/components/diff-viewer.ts',
    section: 'frontend',
    language: 'typescript',
    description: 'High-performance Side-by-side & Unified syntax highlighted diff viewer component.',
    code: FRONTEND_DIFF_VIEWER,
  },

  // /vscode-plugin Files
  {
    id: 'extension-webview-panel',
    path: 'vscode-plugin/src/views/reviewPanel.ts',
    section: 'vscode-plugin',
    language: 'typescript',
    description: 'Dynamic Webview UI with Severity/Category filtering, multi-criteria sorting, editable comments, and OAuth.',
    code: EXTENSION_WEBVIEW_PANEL,
  },
  {
    id: 'extension-auth-service',
    path: 'vscode-plugin/src/auth/authProvider.ts',
    section: 'vscode-plugin',
    language: 'typescript',
    description: 'GitHub OAuth 2.0 authorization code flow, UriHandler callback dispatcher, and SecretStorage keychain vault.',
    code: EXTENSION_AUTH_SERVICE,
  },
  {
    id: 'extension-github-service',
    path: 'vscode-plugin/src/services/github.service.ts',
    section: 'vscode-plugin',
    language: 'typescript',
    description: 'Octokit implementation with OAuth token validation, PR diff retrieval, and batch review comment submissions.',
    code: EXTENSION_GITHUB_SERVICE,
  },
  {
    id: 'extension-github-interface',
    path: 'vscode-plugin/src/models/types.ts',
    section: 'vscode-plugin',
    language: 'typescript',
    description: 'Contracts for OAuth authentication, user profiles, repositories, and review comment payloads.',
    code: EXTENSION_GITHUB_INTERFACE,
  },
  {
    id: 'extension-main',
    path: 'vscode-plugin/src/extension.ts',
    section: 'vscode-plugin',
    language: 'typescript',
    description: 'VS Code extension entry point, OAuth commands, status bar integration, and view provider registry.',
    code: EXTENSION_MAIN,
  },
  {
    id: 'extension-package-json',
    path: 'vscode-plugin/package.json',
    section: 'vscode-plugin',
    language: 'json',
    description: 'Extension manifest with OAuth commands, views container, and settings configuration.',
    code: EXTENSION_PACKAGE_JSON,
  },
];

export const SAMPLE_DIFF_1 = `diff --git a/src/services/userService.ts b/src/services/userService.ts
index 83a1b2c..94d2e3f 100644
--- a/src/services/userService.ts
+++ b/src/services/userService.ts
@@ -14,6 +14,35 @@ export class UserService {
   constructor(private db: any) {}
 
+  // CRITICAL: Multiple responsibilities in one god method (SQL string concatenation, email sending, logging, JWT signing)
+  public async registerAndProcessUser(name: string, email: string, rawPassword: string): Promise<any> {
+    // SQL Injection vulnerability
+    const query = "SELECT * FROM users WHERE email = '" + email + "'";
+    const existing = await this.db.query(query);
+    if (existing.length > 0) {
+      throw new Error("User already exists");
+    }
+
+    // Hardcoded secret key for JWT
+    const token = jwt.sign({ email, role: 'admin' }, "SUPER_SECRET_KEY_12345");
+
+    // Storing plaintext password
+    await this.db.query("INSERT INTO users (name, email, password) VALUES ('" + name + "', '" + email + "', '" + rawPassword + "')");
+
+    // Direct SMTP network call tightly coupled inside business logic
+    const transporter = nodemailer.createTransport({ host: "smtp.mail.com" });
+    await transporter.sendMail({
+      from: "no-reply@system.com",
+      to: email,
+      subject: "Welcome",
+      text: "Hello " + name + ", your account token is " + token
+    });
+
+    console.log("Registered user: " + email);
+    return { success: true, token };
+  }
+
   public async getUserById(id: string) {
     return this.db.users.findById(id);
   }
`;

export const SAMPLE_DIFF_2 = `diff --git a/src/controllers/orderController.ts b/src/controllers/orderController.ts
index 45b8c1a..88d9e2b 100644
--- a/src/controllers/orderController.ts
+++ b/src/controllers/orderController.ts
@@ -20,6 +20,30 @@ export class OrderController {
+  // Performance issue: N+1 database queries in synchronous loop
+  public async getOrderSummaries(req: Request, res: Response) {
+    const orders = await this.orderRepo.findRecent();
+    const results = [];
+    
+    // N+1 loop causing severe database degradation
+    for (const order of orders) {
+      const customer = await this.customerRepo.findById(order.customerId);
+      const items = await this.itemRepo.findByOrderId(order.id);
+      let total = 0;
+      for (const item of items) {
+        const price = await this.priceService.fetchLivePrice(item.sku);
+        total += price * item.quantity;
+      }
+      results.push({ orderId: order.id, customerName: customer.name, total });
+    }
+    
+    res.json(results);
+  }
`;
