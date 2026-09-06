import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  ReviewResponse,
  CustomRule,
  GitHubVerifyResponse,
  OAuthConfigResponse,
  WebhookDeliveryLog,
  FetchPRResponse,
  GitHubPullRequestSummary,
  GitHubRepositoryItem,
  GitHubOrg,
  GitHubLabel,
  GitHubMilestone,
  CoverityStream,
  CoverityDefect,
  AppScanReport,
  AppScanFinding,
  SecurityFixRequest,
  SecurityFixResponse,
} from '../models/review.model';

@Injectable({
  providedIn: 'root',
})
export class ReviewService {
  private readonly http = inject(HttpClient);

  public analyzeDiff(
    diff: string,
    prTitle: string,
    prDescription: string,
    repoName: string,
    rules?: CustomRule[]
  ): Observable<{ success: boolean; data: ReviewResponse; analyzedAt: string }> {
    return this.http.post<{ success: boolean; data: ReviewResponse; analyzedAt: string }>(
      '/api/review',
      {
        diff,
        prTitle,
        prDescription,
        repoName,
        rules,
      }
    );
  }

  public getRules(): Observable<{ rules: CustomRule[]; total: number }> {
    return this.http.get<{ rules: CustomRule[]; total: number }>('/api/rules');
  }

  public createRule(rule: Omit<CustomRule, 'id' | 'createdAt'>): Observable<{ success: boolean; rule: CustomRule }> {
    return this.http.post<{ success: boolean; rule: CustomRule }>('/api/rules', rule);
  }

  public updateRule(id: string, updates: Partial<CustomRule>): Observable<{ success: boolean; rule: CustomRule }> {
    return this.http.put<{ success: boolean; rule: CustomRule }>(`/api/rules/${id}`, updates);
  }

  public deleteRule(id: string): Observable<{ success: boolean; id: string; message: string }> {
    return this.http.delete<{ success: boolean; id: string; message: string }>(`/api/rules/${id}`);
  }

  public resetRulesToDefault(): Observable<{ success: boolean; rules: CustomRule[] }> {
    return this.http.post<{ success: boolean; rules: CustomRule[] }>('/api/rules/reset', {});
  }

  public checkHealth(): Observable<{
    status: string;
    geminiConfigured: boolean;
    webhookDeliveriesCount: number;
    webhookSecretConfigured: boolean;
    activeRulesCount: number;
  }> {
    return this.http.get<{
      status: string;
      geminiConfigured: boolean;
      webhookDeliveriesCount: number;
      webhookSecretConfigured: boolean;
      activeRulesCount: number;
    }>('/api/health');
  }

  public verifyGitHubToken(token: string): Observable<GitHubVerifyResponse> {
    return this.http.post<GitHubVerifyResponse>('/api/auth/github/verify', { token });
  }

  public getOAuthConfig(): Observable<OAuthConfigResponse> {
    return this.http.get<OAuthConfigResponse>('/api/auth/github/oauth-config');
  }

  public fetchPullRequest(params: {
    token?: string;
    prUrl?: string;
    repo?: string;
    owner?: string;
    pullNumber?: number | string;
  }): Observable<FetchPRResponse> {
    return this.http.post<FetchPRResponse>('/api/github/fetch-pr', params);
  }

  public listPullRequests(params: {
    token?: string;
    repo: string;
    owner?: string;
    state?: 'open' | 'closed' | 'all';
  }): Observable<{ success: boolean; pulls: GitHubPullRequestSummary[]; error?: string }> {
    return this.http.post<{ success: boolean; pulls: GitHubPullRequestSummary[]; error?: string }>(
      '/api/github/list-prs',
      params
    );
  }

  public listUserRepos(token: string): Observable<{ success: boolean; repos: GitHubRepositoryItem[]; error?: string }> {
    return this.http.post<{ success: boolean; repos: GitHubRepositoryItem[]; error?: string }>(
      '/api/github/user-repos',
      { token }
    );
  }

  public listOrgRepos(
    org: string,
    token?: string
  ): Observable<{ success: boolean; org: string; repos: GitHubRepositoryItem[]; error?: string }> {
    return this.http.post<{ success: boolean; org: string; repos: GitHubRepositoryItem[]; error?: string }>(
      '/api/github/org-repos',
      { org, token }
    );
  }

  public listUserOrgs(token: string): Observable<{ success: boolean; orgs: GitHubOrg[]; error?: string }> {
    return this.http.post<{ success: boolean; orgs: GitHubOrg[]; error?: string }>(
      '/api/github/user-orgs',
      { token }
    );
  }

  public listRepoLabels(
    repo: string,
    owner?: string,
    token?: string
  ): Observable<{ success: boolean; labels: GitHubLabel[]; error?: string }> {
    return this.http.post<{ success: boolean; labels: GitHubLabel[]; error?: string }>(
      '/api/github/repo-labels',
      { repo, owner, token }
    );
  }

  public listRepoMilestones(
    repo: string,
    owner?: string,
    state?: string,
    token?: string
  ): Observable<{ success: boolean; milestones: GitHubMilestone[]; error?: string }> {
    return this.http.post<{ success: boolean; milestones: GitHubMilestone[]; error?: string }>(
      '/api/github/repo-milestones',
      { repo, owner, state, token }
    );
  }

  public listPullRequestsWithFilters(params: {
    repo: string;
    owner?: string;
    state?: string;
    label?: string;
    milestone?: string;
    token?: string;
  }): Observable<{ success: boolean; pulls: GitHubPullRequestSummary[]; error?: string }> {
    return this.http.post<{ success: boolean; pulls: GitHubPullRequestSummary[]; error?: string }>(
      '/api/github/repo-prs-filtered',
      params
    );
  }

  public fetchFileContent(params: {
    token?: string;
    owner?: string;
    repo: string;
    path: string;
    ref?: string;
  }): Observable<{ success: boolean; content: string; path: string; error?: string }> {
    return this.http.post<{ success: boolean; content: string; path: string; error?: string }>(
      '/api/github/fetch-file',
      params
    );
  }

  public submitReview(payload: {
    token: string;
    owner?: string;
    repo: string;
    pullNumber: number;
    commitId?: string;
    body: string;
    comments: { path: string; line?: number; body: string }[];
  }): Observable<{ success: boolean; reviewId?: number; htmlUrl?: string; error?: string }> {
    return this.http.post<{ success: boolean; reviewId?: number; htmlUrl?: string; error?: string }>(
      '/api/github/submit-review',
      payload
    );
  }

  public getWebhookHistory(): Observable<{ deliveries: WebhookDeliveryLog[]; total: number }> {
    return this.http.get<{ deliveries: WebhookDeliveryLog[]; total: number }>('/api/webhook/history');
  }

  public clearWebhookHistory(): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>('/api/webhook/history');
  }

  public simulateWebhook(
    action: 'opened' | 'synchronize',
    customDiff?: string,
    repoName?: string,
    prTitle?: string
  ): Observable<{
    success: boolean;
    simulated: boolean;
    action: string;
    repository: string;
    prNumber: number;
    latestCommitSha: string;
    review: ReviewResponse;
  }> {
    return this.http.post<{
      success: boolean;
      simulated: boolean;
      action: string;
      repository: string;
      prNumber: number;
      latestCommitSha: string;
      review: ReviewResponse;
    }>('/api/webhook/test-simulate', {
      action,
      customDiff,
      repoName,
      prTitle,
    });
  }

  // ==========================================
  // COVERITY STREAMS & DEFECTS API
  // ==========================================
  public getCoverityStreams(): Observable<{ success: boolean; count: number; streams: CoverityStream[] }> {
    return this.http.get<{ success: boolean; count: number; streams: CoverityStream[] }>('/api/coverity/streams');
  }

  public getCoverityStream(id: string): Observable<{ success: boolean; stream: CoverityStream }> {
    return this.http.get<{ success: boolean; stream: CoverityStream }>(`/api/coverity/streams/${id}`);
  }

  public createCoverityStream(stream: Partial<CoverityStream>): Observable<{ success: boolean; stream: CoverityStream }> {
    return this.http.post<{ success: boolean; stream: CoverityStream }>('/api/coverity/streams', stream);
  }

  public updateCoverityDefectStatus(
    streamId: string,
    cid: number,
    status: 'New' | 'Triaged' | 'Dismissed' | 'Fixed'
  ): Observable<{ success: boolean; defect: CoverityDefect }> {
    return this.http.patch<{ success: boolean; defect: CoverityDefect }>(
      `/api/coverity/streams/${streamId}/defects/${cid}`,
      { status }
    );
  }

  // ==========================================
  // APPSCAN REPORTS & VULNERABILITIES API
  // ==========================================
  public getAppScanReports(): Observable<{ success: boolean; count: number; reports: AppScanReport[] }> {
    return this.http.get<{ success: boolean; count: number; reports: AppScanReport[] }>('/api/appscan/reports');
  }

  public getAppScanReport(id: string): Observable<{ success: boolean; report: AppScanReport }> {
    return this.http.get<{ success: boolean; report: AppScanReport }>(`/api/appscan/reports/${id}`);
  }

  public createAppScanReport(report: Partial<AppScanReport>): Observable<{ success: boolean; report: AppScanReport }> {
    return this.http.post<{ success: boolean; report: AppScanReport }>('/api/appscan/reports', report);
  }

  public updateAppScanFindingStatus(
    reportId: string,
    findingId: string,
    status: 'Open' | 'Remediated' | 'False Positive'
  ): Observable<{ success: boolean; finding: AppScanFinding }> {
    return this.http.patch<{ success: boolean; finding: AppScanFinding }>(
      `/api/appscan/reports/${reportId}/findings/${findingId}`,
      { status }
    );
  }

  // ==========================================
  // SECURITY REMEDIATION & FIX GENERATOR
  // ==========================================
  public requestSecurityFix(payload: SecurityFixRequest): Observable<SecurityFixResponse> {
    return this.http.post<SecurityFixResponse>('/api/security/fix', payload);
  }
}
