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

export interface ReviewFinding {
  path: string;
  line: number;
  category: 'SOLID' | 'SECURITY' | 'PERFORMANCE' | 'BUG' | 'CLEAN_CODE' | 'CUSTOM';
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

export interface WebhookDeliveryLog {
  id: string;
  timestamp: string;
  event: string;
  action: string;
  repository: string;
  prNumber: number;
  prTitle: string;
  prDescription?: string;
  sender: string;
  headSha: string;
  baseSha: string;
  status: 'PROCESSED' | 'FAILED' | 'IGNORED';
  signatureVerified: boolean;
  review?: ReviewResponse;
  diffSnippet?: string;
  error?: string;
}
