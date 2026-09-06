export interface GitHubUser {
  login: string;
  name: string;
  avatar_url: string;
  html_url: string;
  public_repos: number;
  scopes?: string;
}

export interface GitHubOrg {
  login: string;
  id: number;
  avatar_url: string;
  description: string | null;
}

export interface GitHubLabel {
  id: number;
  name: string;
  color: string;
  description?: string | null;
}

export interface GitHubMilestone {
  id: number;
  number: number;
  title: string;
  description?: string | null;
  state: 'open' | 'closed' | string;
  open_issues?: number;
  closed_issues?: number;
  due_on?: string | null;
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
  labels?: GitHubLabel[];
  milestone?: GitHubMilestone | null;
  draft?: boolean;
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
  forks_count?: number;
  open_issues_count?: number;
  fork?: boolean;
  topics?: string[];
  visibility?: string;
  updated_at: string;
  default_branch: string;
  owner?: {
    login: string;
    avatar_url: string;
  };
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
        : `Bearer ${cleanToken}`;
    }
    return headers;
  }

  public async verifyToken(token: string): Promise<{ valid: boolean; user?: GitHubUser; error?: string }> {
    if (!token || token.trim() === '') {
      return { valid: false, error: 'GitHub Token is empty' };
    }

    const cleanToken = token.trim();

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

        let specificHelp = 'Please verify the repository name and PR number.';
        if (prRes.status === 404) {
          specificHelp = token
            ? 'The repository or PR was not found. If this is a private repository, please ensure your GitHub Token has the "repo" scope enabled and permission to access this organization/repository.'
            : 'The repository or PR was not found. If this is a private repository, you must configure a GitHub Personal Access Token (PAT) with "repo" scope.';
        } else if (prRes.status === 401) {
          specificHelp = 'Your GitHub Token is invalid, expired, or revoked. Please provide a fresh Personal Access Token.';
        } else if (prRes.status === 403) {
          specificHelp = 'Rate limit exceeded (unauthenticated limit is 60 req/hr) or your token lacks permission. Provide a GitHub PAT to increase limits to 5,000 req/hr.';
        }

        return {
          success: false,
          error: `Failed to fetch PR #${pullNumber} from ${owner}/${repo} (${prRes.status}): ${errorDetails}. ${specificHelp}`,
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
      const pulls: GitHubPullRequestSummary[] = rawPulls.map((p) => {
        const rawLabels = Array.isArray(p['labels']) ? (p['labels'] as Record<string, unknown>[]) : [];
        const labels: GitHubLabel[] = rawLabels.map((l) => ({
          id: Number(l['id'] || 0),
          name: String(l['name'] || ''),
          color: String(l['color'] || '0075ca'),
          description: l['description'] ? String(l['description']) : null,
        }));

        let milestone: GitHubMilestone | null = null;
        if (p['milestone'] && typeof p['milestone'] === 'object') {
          const m = p['milestone'] as Record<string, unknown>;
          milestone = {
            id: Number(m['id'] || 0),
            number: Number(m['number'] || 0),
            title: String(m['title'] || ''),
            description: m['description'] ? String(m['description']) : null,
            state: String(m['state'] || 'open'),
            open_issues: Number(m['open_issues'] || 0),
            closed_issues: Number(m['closed_issues'] || 0),
            due_on: m['due_on'] ? String(m['due_on']) : null,
          };
        }

        return {
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
          additions: Number(p['additions'] || 0),
          deletions: Number(p['deletions'] || 0),
          changed_files: Number(p['changed_files'] || 0),
          labels,
          milestone,
          draft: Boolean(p['draft']),
        };
      });

      return { success: true, pulls };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async listOrgRepos(
    token: string | undefined,
    org: string
  ): Promise<{ success: boolean; org: string; repos?: GitHubRepositoryItem[]; error?: string }> {
    const cleanOrg = org.trim().replace(/^@/, '');
    if (!cleanOrg) {
      return { success: false, org: '', error: 'Organization name is required.' };
    }

    try {
      // 1. Try fetching from /orgs/{org}/repos
      let res = await fetch(`https://api.github.com/orgs/${encodeURIComponent(cleanOrg)}/repos?sort=updated&direction=desc&per_page=60`, {
        headers: this.getHeaders(token),
      });

      // 2. If 404, fallback to /users/{username}/repos (e.g. user personal profiles acting as organizations)
      if (res.status === 404) {
        res = await fetch(`https://api.github.com/users/${encodeURIComponent(cleanOrg)}/repos?sort=updated&direction=desc&per_page=60`, {
          headers: this.getHeaders(token),
        });
      }

      if (!res.ok) {
        let err = res.statusText;
        try {
          const j = (await res.json()) as { message?: string };
          if (j.message) err = j.message;
        } catch {
          // ignore
        }

        return { success: false, org: cleanOrg, error: `GitHub API error (${res.status}): ${err}` };
      }

      const rawRepos = (await res.json()) as Record<string, unknown>[];
      const repos: GitHubRepositoryItem[] = rawRepos.map((r) => ({
        id: Number(r['id'] || 0),
        name: String(r['name'] || ''),
        full_name: String(r['full_name'] || `${cleanOrg}/${r['name']}`),
        private: Boolean(r['private']),
        html_url: String(r['html_url'] || `https://github.com/${cleanOrg}/${r['name']}`),
        description: r['description'] ? String(r['description']) : null,
        language: r['language'] ? String(r['language']) : null,
        stargazers_count: Number(r['stargazers_count'] || 0),
        forks_count: Number(r['forks_count'] || 0),
        open_issues_count: Number(r['open_issues_count'] || 0),
        fork: Boolean(r['fork']),
        topics: Array.isArray(r['topics']) ? (r['topics'] as string[]) : [],
        visibility: String(r['visibility'] || (r['private'] ? 'private' : 'public')),
        updated_at: String(r['updated_at'] || new Date().toISOString()),
        default_branch: String(r['default_branch'] || 'main'),
        owner: {
          login: String((r['owner'] as Record<string, unknown>)?.['login'] || cleanOrg),
          avatar_url: String((r['owner'] as Record<string, unknown>)?.['avatar_url'] || ''),
        },
      }));

      return { success: true, org: cleanOrg, repos };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, org: cleanOrg, error: msg };
    }
  }

  public async listUserOrgs(token: string): Promise<{ success: boolean; orgs?: GitHubOrg[]; error?: string }> {
    if (!token) {
      return { success: false, error: 'Token required to fetch user organizations.' };
    }

    try {
      const res = await fetch('https://api.github.com/user/orgs', {
        headers: this.getHeaders(token),
      });

      if (!res.ok) {
        return { success: false, error: `GitHub API error: ${res.statusText}` };
      }

      const raw = (await res.json()) as Record<string, unknown>[];
      const orgs: GitHubOrg[] = raw.map((o) => ({
        login: String(o['login']),
        id: Number(o['id'] || 0),
        avatar_url: String(o['avatar_url'] || ''),
        description: o['description'] ? String(o['description']) : null,
      }));

      return { success: true, orgs };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async listRepoLabels(
    token: string | undefined,
    owner: string,
    repo: string
  ): Promise<{ success: boolean; labels?: GitHubLabel[]; error?: string }> {
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/labels?per_page=100`, {
        headers: this.getHeaders(token),
      });

      if (!res.ok) {
        return { success: false, labels: [], error: `Failed to fetch repository labels (${res.status})` };
      }

      const raw = (await res.json()) as Record<string, unknown>[];
      const labels: GitHubLabel[] = raw.map((l) => ({
        id: Number(l['id'] || 0),
        name: String(l['name'] || ''),
        color: String(l['color'] || '0075ca'),
        description: l['description'] ? String(l['description']) : null,
      }));

      return { success: true, labels };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, labels: [], error: msg };
    }
  }

  public async listRepoMilestones(
    token: string | undefined,
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'all'
  ): Promise<{ success: boolean; milestones?: GitHubMilestone[]; error?: string }> {
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/milestones?state=${state}&per_page=50`, {
        headers: this.getHeaders(token),
      });

      if (!res.ok) {
        return { success: false, milestones: [], error: `Failed to fetch repository milestones (${res.status})` };
      }

      const raw = (await res.json()) as Record<string, unknown>[];
      const milestones: GitHubMilestone[] = raw.map((m) => ({
        id: Number(m['id'] || 0),
        number: Number(m['number'] || 0),
        title: String(m['title'] || ''),
        description: m['description'] ? String(m['description']) : null,
        state: String(m['state'] || 'open'),
        open_issues: Number(m['open_issues'] || 0),
        closed_issues: Number(m['closed_issues'] || 0),
        due_on: m['due_on'] ? String(m['due_on']) : null,
      }));

      return { success: true, milestones };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, milestones: [], error: msg };
    }
  }

  public async listPullRequestsWithFilters(
    token: string | undefined,
    owner: string,
    repo: string,
    options: {
      state?: 'open' | 'closed' | 'all';
      label?: string;
      milestone?: string;
    } = {}
  ): Promise<{ success: boolean; pulls?: GitHubPullRequestSummary[]; error?: string }> {
    try {
      const state = options.state || 'open';
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=${state}&sort=updated&direction=desc&per_page=60`, {
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
        return { success: false, pulls: [], error: `GitHub API error (${res.status}): ${err}` };
      }

      const rawPulls = (await res.json()) as Record<string, unknown>[];
      let pulls: GitHubPullRequestSummary[] = rawPulls.map((p) => {
        const rawLabels = Array.isArray(p['labels']) ? (p['labels'] as Record<string, unknown>[]) : [];
        const labels: GitHubLabel[] = rawLabels.map((l) => ({
          id: Number(l['id'] || 0),
          name: String(l['name'] || ''),
          color: String(l['color'] || '0075ca'),
          description: l['description'] ? String(l['description']) : null,
        }));

        let milestone: GitHubMilestone | null = null;
        if (p['milestone'] && typeof p['milestone'] === 'object') {
          const m = p['milestone'] as Record<string, unknown>;
          milestone = {
            id: Number(m['id'] || 0),
            number: Number(m['number'] || 0),
            title: String(m['title'] || ''),
            description: m['description'] ? String(m['description']) : null,
            state: String(m['state'] || 'open'),
            open_issues: Number(m['open_issues'] || 0),
            closed_issues: Number(m['closed_issues'] || 0),
            due_on: m['due_on'] ? String(m['due_on']) : null,
          };
        }

        return {
          number: Number(p['number']),
          title: String(p['title'] || ''),
          body: String(p['body'] || ''),
          state: String(p['state'] || 'open'),
          html_url: String(p['html_url'] || `https://github.com/${owner}/${repo}/pull/${p['number']}`),
          user: {
            login: String((p['user'] as Record<string, unknown>)?.['login'] || 'contributor'),
            avatar_url: String((p['user'] as Record<string, unknown>)?.['avatar_url'] || 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png'),
          },
          head: {
            sha: String((p['head'] as Record<string, unknown>)?.['sha'] || 'abc1234'),
            ref: String((p['head'] as Record<string, unknown>)?.['ref'] || 'feature-branch'),
            label: String((p['head'] as Record<string, unknown>)?.['label'] || 'contributor:feature-branch'),
          },
          base: {
            sha: String((p['base'] as Record<string, unknown>)?.['sha'] || 'def5678'),
            ref: String((p['base'] as Record<string, unknown>)?.['ref'] || 'main'),
            label: String((p['base'] as Record<string, unknown>)?.['label'] || 'main'),
          },
          created_at: String(p['created_at'] || new Date().toISOString()),
          updated_at: String(p['updated_at'] || new Date().toISOString()),
          additions: Number(p['additions'] || 0),
          deletions: Number(p['deletions'] || 0),
          changed_files: Number(p['changed_files'] || 0),
          labels,
          milestone,
          draft: Boolean(p['draft']),
        };
      });

      // Filter by label if requested
      if (options.label && options.label.trim() !== '') {
        const targetLabel = options.label.trim().toLowerCase();
        pulls = pulls.filter((pr) => pr.labels?.some((l) => l.name.toLowerCase() === targetLabel));
      }

      // Filter by milestone if requested
      if (options.milestone && options.milestone.trim() !== '') {
        const targetMilestone = options.milestone.trim().toLowerCase();
        pulls = pulls.filter((pr) => pr.milestone && (
          pr.milestone.title.toLowerCase() === targetMilestone ||
          String(pr.milestone.number) === targetMilestone
        ));
      }

      return { success: true, pulls };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, pulls: [], error: msg };
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
    if (!token || token.trim() === '') {
      return { success: false, error: 'GitHub authentication token is required to submit review comments' };
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
