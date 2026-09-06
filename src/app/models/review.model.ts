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
  author?: 'ai' | 'user';
  originalTitle?: string;
  originalComment?: string;
  isCustom?: boolean;
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

// ==========================================
// COVERITY STREAMS & DEFECTS
// ==========================================
export interface CoverityDefectEvent {
  eventNumber: number;
  line: number;
  description: string;
  tag: string;
}

export interface CoverityDefect {
  cid: number;
  checker: string;
  impact: 'High' | 'Medium' | 'Low';
  category: string;
  file: string;
  line: number;
  functionName?: string;
  status: 'New' | 'Triaged' | 'Dismissed' | 'Fixed';
  description: string;
  vulnerableSnippet: string;
  remediationFix: string;
  events?: CoverityDefectEvent[];
  cwe?: string;
}

export interface CoverityStream {
  id: string;
  name: string;
  project: string;
  branch: string;
  lastAnalyzed: string;
  totalDefects: number;
  highImpactCount: number;
  mediumImpactCount: number;
  lowImpactCount: number;
  defects: CoverityDefect[];
}

// ==========================================
// APPSCAN REPORTS & VULNERABILITIES
// ==========================================
export interface AppScanFinding {
  id: string;
  issueType: string;
  cwe: string;
  cvssScore: number;
  severity: 'High' | 'Medium' | 'Low' | 'Information';
  scannerType: 'SAST' | 'DAST' | 'IAST';
  fileOrUrl: string;
  line?: number;
  threatVector: string;
  vulnerableSnippet: string;
  remediationFix: string;
  status: 'Open' | 'Remediated' | 'False Positive';
  remediationAdvice?: string;
}

export interface AppScanReport {
  id: string;
  scanName: string;
  scanType: 'SAST' | 'DAST' | 'IAST';
  timestamp: string;
  targetApplication: string;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
  findings: AppScanFinding[];
}

export interface SecurityFixRequest {
  source: 'coverity' | 'appscan' | 'custom';
  defectId: string | number;
  checkerOrCwe: string;
  title: string;
  file: string;
  vulnerableCode: string;
  existingRemediation?: string;
  contextDiff?: string;
}

export interface SecurityFixResponse {
  success: boolean;
  defectId: string | number;
  remediatedCode: string;
  explanation: string;
  patchDiff: string;
  cweMitigation: string;
  confidence?: number;
  vulnerableCode?: string;
}

