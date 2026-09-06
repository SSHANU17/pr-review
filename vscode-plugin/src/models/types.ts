export interface CustomRule {
  id: string;
  title: string;
  category: 'SOLID' | 'SECURITY' | 'PERFORMANCE' | 'BUG' | 'CLEAN_CODE' | 'CUSTOM';
  severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
  description: string;
  pattern?: string;
  suggestedCodeTemplate?: string;
  enabled: boolean;
}

export interface ReviewFinding {
  id?: string;
  path: string;
  line: number;
  category: 'SOLID' | 'SECURITY' | 'PERFORMANCE' | 'BUG' | 'CLEAN_CODE' | 'CUSTOM';
  severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
  title: string;
  comment: string;
  suggestedCode?: string;
  approved?: boolean;
}

export interface ReviewResult {
  summary: string;
  score: number;
  findings: ReviewFinding[];
}

export interface GitHubUser {
  login: string;
  name: string;
  avatar_url: string;
  html_url: string;
  scopes: string;
}
