export interface ReviewFinding {
  path: string;
  line: number;
  category: 'SOLID' | 'SECURITY' | 'PERFORMANCE' | 'BUG' | 'CLEAN_CODE' | 'CUSTOM';
  severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
  title: string;
  comment: string;
  suggestedCode?: string;
  approved?: boolean;
  userEditedComment?: string;
  matchedRuleId?: string;
}

export interface ReviewResponse {
  summary: string;
  score: number;
  findings: ReviewFinding[];
  activeRulesCount?: number;
}

export interface CustomRule {
  id: string;
  title: string;
  category: 'SOLID' | 'SECURITY' | 'PERFORMANCE' | 'BUG' | 'CLEAN_CODE' | 'CUSTOM';
  severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
  description: string;
  pattern?: string;
  suggestedCodeTemplate?: string;
  enabled: boolean;
  isDefault?: boolean;
  createdAt: string;
}

export interface WebhookDeliveryLog {
  id: string;
  deliveryId: string;
  event: string;
  action: 'opened' | 'synchronize' | 'reopened' | 'ready_for_review' | 'ping' | string;
  repository: string;
  prNumber: number;
  prTitle: string;
  prDescription?: string;
  sender: string;
  headSha: string;
  headRef: string;
  baseRef: string;
  status: 'SUCCESS' | 'WARNING' | 'CRITICAL_ISSUES' | 'FAILED' | 'IGNORED';
  executionTimeMs: number;
  timestamp: string;
  diffSnippet?: string;
  review?: ReviewResponse;
  githubStatusPosted?: boolean;
  error?: string;
}

export interface SourceFileDoc {
  id: string;
  path: string;
  section: 'frontend' | 'backend' | 'vscode-plugin' | 'extension' | 'config' | 'guide';
  language: string;
  description: string;
  code: string;
}

export interface GitHubUserProfile {
  login: string;
  name: string;
  avatar_url: string;
  html_url: string;
  public_repos: number;
  scopes?: string;
}

export interface GitHubVerifyResponse {
  valid: boolean;
  user?: GitHubUserProfile;
  scopes?: string;
  message?: string;
  authenticatedVia?: string;
}

export interface OAuthConfigResponse {
  clientId: string;
  authUrl: string;
  redirectUri: string;
  scopes: string[];
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

export interface FetchPRResponse {
  success: boolean;
  repository: string;
  owner: string;
  repo: string;
  pullNumber: number;
  pr: GitHubPullRequestSummary;
  diff: string;
  files: GitHubChangedFile[];
  error?: string;
}
