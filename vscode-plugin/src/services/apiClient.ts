import {
  CustomRule,
  ReviewResult,
  GitHubUser,
  CoverityStream,
  AppScanReport,
  SecurityFixRequest,
  SecurityFixResponse,
} from '../models/types';

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:3000/api') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, '');
  }

  public async analyzeDiff(
    diff: string,
    prTitle: string,
    prDescription?: string,
    repoName?: string,
    customRules?: CustomRule[]
  ): Promise<ReviewResult> {
    const res = await fetch(`${this.baseUrl}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        diff,
        prTitle,
        prDescription,
        repoName,
        customRules,
      }),
    });

    if (!res.ok) {
      throw new Error(`Review API failed (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as { success: boolean; data: ReviewResult };
    return data.data;
  }

  public async getRules(): Promise<CustomRule[]> {
    const res = await fetch(`${this.baseUrl}/rules`);
    if (!res.ok) throw new Error('Failed to fetch rules');
    const data = (await res.json()) as { rules: CustomRule[] };
    return data.rules || [];
  }

  public async verifyToken(token: string): Promise<{ valid: boolean; user?: GitHubUser }> {
    const res = await fetch(`${this.baseUrl}/github/token-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) throw new Error('Token verification request failed');
    return (await res.json()) as { valid: boolean; user?: GitHubUser };
  }

  public async submitReview(
    token: string,
    owner: string,
    repo: string,
    pullNumber: number,
    commitId: string,
    body: string,
    comments: Array<{ path: string; line: number; body: string }>
  ): Promise<{ success: boolean; reviewId?: number }> {
    const res = await fetch(`${this.baseUrl}/github/submit-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        owner,
        repo,
        pullNumber,
        commitId,
        body,
        comments,
      }),
    });

    if (!res.ok) throw new Error('Failed to submit review');
    return (await res.json()) as { success: boolean; reviewId?: number };
  }

  // ==========================================
  // COVERITY STATIC ANALYSIS
  // ==========================================
  public async getCoverityStreams(): Promise<CoverityStream[]> {
    const res = await fetch(`${this.baseUrl}/coverity/streams`);
    if (!res.ok) throw new Error('Failed to fetch Coverity streams');
    const data = (await res.json()) as { success: boolean; streams: CoverityStream[] };
    return data.streams || [];
  }

  public async getCoverityStream(id: string): Promise<CoverityStream | null> {
    const res = await fetch(`${this.baseUrl}/coverity/streams/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { success: boolean; stream: CoverityStream };
    return data.stream || null;
  }

  public async updateCoverityDefectStatus(
    streamId: string,
    cid: number,
    status: string
  ): Promise<boolean> {
    const res = await fetch(
      `${this.baseUrl}/coverity/streams/${encodeURIComponent(streamId)}/defects/${cid}/status`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }
    );
    return res.ok;
  }

  // ==========================================
  // HCL APPSCAN SAST / DAST
  // ==========================================
  public async getAppScanReports(): Promise<AppScanReport[]> {
    const res = await fetch(`${this.baseUrl}/appscan/reports`);
    if (!res.ok) throw new Error('Failed to fetch AppScan reports');
    const data = (await res.json()) as { success: boolean; reports: AppScanReport[] };
    return data.reports || [];
  }

  public async getAppScanReport(id: string): Promise<AppScanReport | null> {
    const res = await fetch(`${this.baseUrl}/appscan/reports/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { success: boolean; report: AppScanReport };
    return data.report || null;
  }

  public async updateAppScanFindingStatus(
    reportId: string,
    findingId: string,
    status: string
  ): Promise<boolean> {
    const res = await fetch(
      `${this.baseUrl}/appscan/reports/${encodeURIComponent(reportId)}/findings/${encodeURIComponent(findingId)}/status`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }
    );
    return res.ok;
  }

  // ==========================================
  // 1-CLICK AI SECURITY REMEDIATION
  // ==========================================
  public async generateSecurityFix(req: SecurityFixRequest): Promise<SecurityFixResponse> {
    const res = await fetch(`${this.baseUrl}/security/fix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      throw new Error(`Security AI remediation failed (${res.status}): ${await res.text()}`);
    }
    return (await res.json()) as SecurityFixResponse;
  }
}
