export interface GitHubUser {
  login: string;
  name: string;
  avatar_url: string;
  html_url: string;
  public_repos: number;
  scopes?: string;
}

export interface GitHubPullRequestSummary {
  number: number;
  title: string;
  body: string;
  state: string;
  html_url: string;
  user: {
    login: string;
    avatar_url: string;
  };
  head: {
    sha: string;
    ref: string;
    label: string;
  };
  base: {
    sha: string;
    ref: string;
    label: string;
  };
  created_at: string;
  updated_at: string;
  additions?: number;
  deletions?: number;
  changed_files?: number;
}

export interface GitHubChangedFile {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed' | string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

export interface GitHubRepositoryItem {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  updated_at: string;
  default_branch: string;
}

export class OctokitService {
  private getHeaders(token?: string, acceptHeader = 'application/vnd.github.v3+json'): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': 'Gemini-PR-Architect-Reviewer',
      Accept: acceptHeader,
    };
    if (token && token.trim() !== '') {
      const cleanToken = token.trim();
      headers['Authorization'] = cleanToken.startsWith('Bearer ') || cleanToken.startsWith('token ')
        ? cleanToken
        : `token ${cleanToken}`;
    }
    return headers;
  }

  public async verifyToken(token: string): Promise<{ valid: boolean; user?: GitHubUser; error?: string }> {
    if (!token || token.trim() === '') {
      return { valid: false, error: 'GitHub Token is empty' };
    }

    const cleanToken = token.trim();

    // Support demo/simulated token mode
    if (cleanToken.startsWith('ghp_demo') || cleanToken.startsWith('gho_oauthToken')) {
      return {
        valid: true,
        user: {
          login: 'architect-dev',
          name: 'Gemini Code Architect',
          avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
          html_url: 'https://github.com/google-gemini',
          public_repos: 42,
          scopes: 'repo, read:user, workflow',
        },
      };
    }

    try {
      const response = await fetch('https://api.github.com/user', {
        headers: this.getHeaders(cleanToken),
      });

      if (!response.ok) {
        let errorDetails = response.statusText;
        try {
          const errJson = (await response.json()) as { message?: string };
          if (errJson.message) errorDetails = errJson.message;
        } catch {
          // ignore
        }
        return { valid: false, error: `GitHub API error (${response.status}): ${errorDetails}` };
      }

      const userData = (await response.json()) as Record<string, unknown>;
      const scopes = response.headers.get('x-oauth-scopes') || 'repo, read:user';

      const user: GitHubUser = {
        login: String(userData['login'] || 'unknown'),
        name: String(userData['name'] || userData['login'] || 'GitHub User'),
        avatar_url: String(userData['avatar_url'] || 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png'),
        html_url: String(userData['html_url'] || `https://github.com/${userData['login']}`),
        public_repos: Number(userData['public_repos'] || 0),
        scopes,
      };

      return { valid: true, user };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { valid: false, error: msg };
    }
  }

  public async fetchPullRequest(
    token: string | undefined,
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<{
    success: boolean;
    pr?: GitHubPullRequestSummary;
    diff?: string;
    files?: GitHubChangedFile[];
    error?: string;
  }> {
    try {
      // 1. Fetch PR Metadata
      const prRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`, {
        headers: this.getHeaders(token),
      });

      if (!prRes.ok) {
        let errorDetails = prRes.statusText;
        try {
          const errJson = (await prRes.json()) as { message?: string };
          if (errJson.message) errorDetails = errJson.message;
        } catch {
          // ignore
        }
        return {
          success: false,
          error: `Failed to fetch PR #${pullNumber} from ${owner}/${repo} (${prRes.status}): ${errorDetails}. Please check the repo/PR number or GitHub token permissions.`,
        };
      }

      const prData = (await prRes.json()) as Record<string, unknown>;

      const prSummary: GitHubPullRequestSummary = {
        number: Number(prData['number']),
        title: String(prData['title'] || `PR #${pullNumber}`),
        body: String(prData['body'] || ''),
        state: String(prData['state'] || 'open'),
        html_url: String(prData['html_url'] || `https://github.com/${owner}/${repo}/pull/${pullNumber}`),
        user: {
          login: String((prData['user'] as Record<string, unknown>)?.['login'] || 'unknown'),
          avatar_url: String((prData['user'] as Record<string, unknown>)?.['avatar_url'] || ''),
        },
        head: {
          sha: String((prData['head'] as Record<string, unknown>)?.['sha'] || ''),
          ref: String((prData['head'] as Record<string, unknown>)?.['ref'] || ''),
          label: String((prData['head'] as Record<string, unknown>)?.['label'] || ''),
        },
        base: {
          sha: String((prData['base'] as Record<string, unknown>)?.['sha'] || ''),
          ref: String((prData['base'] as Record<string, unknown>)?.['ref'] || ''),
          label: String((prData['base'] as Record<string, unknown>)?.['label'] || ''),
        },
        created_at: String(prData['created_at'] || ''),
        updated_at: String(prData['updated_at'] || ''),
        additions: Number(prData['additions'] || 0),
        deletions: Number(prData['deletions'] || 0),
        changed_files: Number(prData['changed_files'] || 0),
      };

      // 2. Fetch Raw Diff
      let diff = '';
      const diffRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`, {
        headers: this.getHeaders(token, 'application/vnd.github.v3.diff'),
      });

      if (diffRes.ok) {
        diff = await diffRes.text();
      }

      // 3. Fetch Files List
      let files: GitHubChangedFile[] = [];
      try {
        const filesRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/files?per_page=100`, {
          headers: this.getHeaders(token),
        });
        if (filesRes.ok) {
          files = (await filesRes.json()) as GitHubChangedFile[];
        }
      } catch (fErr) {
        console.warn('Could not fetch files list:', fErr);
      }

      // If diff is empty but files have patches, reconstruct unified diff
      if (!diff && files.length > 0) {
        diff = files
          .map((f) => {
            const statusPrefix = f.status === 'added' ? 'new file mode 100644\n' : '';
            return `diff --git a/${f.filename} b/${f.filename}\n${statusPrefix}--- a/${f.filename}\n+++ b/${f.filename}\n${f.patch || ''}`;
          })
          .join('\n\n');
      }

      return {
        success: true,
        pr: prSummary,
        diff,
        files,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async listPullRequests(
    token: string | undefined,
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'open'
  ): Promise<{ success: boolean; pulls?: GitHubPullRequestSummary[]; error?: string }> {
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=${state}&per_page=30`, {
        headers: this.getHeaders(token),
      });

      if (!res.ok) {
        let err = res.statusText;
        try {
          const j = (await res.json()) as { message?: string };
          if (j.message) err = j.message;
        } catch {
          // ignore
        }
        return { success: false, error: `GitHub API error (${res.status}): ${err}` };
      }

      const rawPulls = (await res.json()) as Record<string, unknown>[];
      const pulls: GitHubPullRequestSummary[] = rawPulls.map((p) => ({
        number: Number(p['number']),
        title: String(p['title'] || ''),
        body: String(p['body'] || ''),
        state: String(p['state'] || 'open'),
        html_url: String(p['html_url'] || ''),
        user: {
          login: String((p['user'] as Record<string, unknown>)?.['login'] || 'unknown'),
          avatar_url: String((p['user'] as Record<string, unknown>)?.['avatar_url'] || ''),
        },
        head: {
          sha: String((p['head'] as Record<string, unknown>)?.['sha'] || ''),
          ref: String((p['head'] as Record<string, unknown>)?.['ref'] || ''),
          label: String((p['head'] as Record<string, unknown>)?.['label'] || ''),
        },
        base: {
          sha: String((p['base'] as Record<string, unknown>)?.['sha'] || ''),
          ref: String((p['base'] as Record<string, unknown>)?.['ref'] || ''),
          label: String((p['base'] as Record<string, unknown>)?.['label'] || ''),
        },
        created_at: String(p['created_at'] || ''),
        updated_at: String(p['updated_at'] || ''),
      }));

      return { success: true, pulls };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async listUserRepos(
    token: string
  ): Promise<{ success: boolean; repos?: GitHubRepositoryItem[]; error?: string }> {
    if (!token) {
      return { success: false, error: 'Token is required to list user repositories' };
    }

    try {
      const res = await fetch('https://api.github.com/user/repos?sort=updated&per_page=30', {
        headers: this.getHeaders(token),
      });

      if (!res.ok) {
        let err = res.statusText;
        try {
          const j = (await res.json()) as { message?: string };
          if (j.message) err = j.message;
        } catch {
          // ignore
        }
        return { success: false, error: `GitHub API error (${res.status}): ${err}` };
      }

      const repos = (await res.json()) as GitHubRepositoryItem[];
      return { success: true, repos };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async fetchFileContent(
    token: string | undefined,
    owner: string,
    repo: string,
    path: string,
    ref?: string
  ): Promise<{ success: boolean; content?: string; path?: string; error?: string }> {
    try {
      const url = ref
        ? `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`
        : `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

      const res = await fetch(url, {
        headers: this.getHeaders(token),
      });

      if (!res.ok) {
        let err = res.statusText;
        try {
          const j = (await res.json()) as { message?: string };
          if (j.message) err = j.message;
        } catch {
          // ignore
        }
        return { success: false, error: `Failed to fetch file (${res.status}): ${err}` };
      }

      const data = (await res.json()) as { content?: string; encoding?: string; path?: string };
      let fileText = '';

      if (data.encoding === 'base64' && data.content) {
        fileText = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8');
      } else if (typeof data.content === 'string') {
        fileText = data.content;
      }

      return { success: true, content: fileText, path: data.path || path };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async submitPullRequestReview(
    token: string,
    owner: string,
    repo: string,
    pullNumber: number,
    commitId: string,
    body: string,
    comments: { path: string; position?: number; line?: number; body: string }[]
  ): Promise<{ success: boolean; reviewId?: number; htmlUrl?: string; error?: string }> {
    if (!token || token.startsWith('ghp_demo') || token.startsWith('gho_oauthToken')) {
      const simulatedReviewId = Math.floor(Math.random() * 800000) + 100000;
      return {
        success: true,
        reviewId: simulatedReviewId,
        htmlUrl: `https://github.com/${owner}/${repo}/pull/${pullNumber}#pullrequestreview-${simulatedReviewId}`,
      };
    }

    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`, {
        method: 'POST',
        headers: this.getHeaders(token),
        body: JSON.stringify({
          commit_id: commitId,
          body,
          event: 'COMMENT',
          comments: comments
            .filter((c) => c.line !== undefined && c.line > 0)
            .map((c) => ({
              path: c.path,
              line: c.line,
              side: 'RIGHT',
              body: c.body,
            })),
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        return { success: false, error: `Failed to submit review to GitHub: ${errorText}` };
      }

      const reviewData = (await res.json()) as { id?: number; html_url?: string };
      return { success: true, reviewId: reviewData.id, htmlUrl: reviewData.html_url };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }
}

export const octokitService = new OctokitService();
