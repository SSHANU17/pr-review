import { CustomRule, ReviewResult, GitHubUser } from '../models/types';

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:3000/api') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
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
}
