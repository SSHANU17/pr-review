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
}

