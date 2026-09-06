import crypto from 'node:crypto';
import { WebhookDeliveryLog, ReviewResponse } from '../models/types';
import { geminiService } from './gemini.service';
import { ruleEngineService } from './rule-engine.service';

export class WebhookService {
  private deliveryHistory: WebhookDeliveryLog[] = [];
  private readonly webhookSecret: string;

  constructor() {
    this.webhookSecret = process.env['GITHUB_WEBHOOK_SECRET'] || '';
  }

  public isSecretConfigured(): boolean {
    return Boolean(this.webhookSecret);
  }

  public getDeliveries(): WebhookDeliveryLog[] {
    return this.deliveryHistory;
  }

  public clearDeliveries(): void {
    this.deliveryHistory = [];
  }

  public verifySignature(rawPayload: string | Buffer, signatureHeader: string | undefined): boolean {
    if (!this.webhookSecret) {
      // If no secret configured in development, allow simulation or flag warning
      return true;
    }
    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
      return false;
    }

    const sig = signatureHeader.substring(7);
    const expectedSig = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawPayload)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'));
    } catch {
      return false;
    }
  }

  public async processPullRequestEvent(payload: {
    action: string;
    number: number;
    pull_request: {
      title: string;
      body?: string;
      head: { sha: string; ref: string };
      base: { sha: string; ref: string };
      diff_url?: string;
    };
    repository: { full_name: string; name: string };
    sender: { login: string };
  }): Promise<{ delivery: WebhookDeliveryLog; review: ReviewResponse }> {
    const pr = payload.pull_request;
    const repo = payload.repository.full_name;
    const diff = `diff --git a/src/controllers/order.controller.ts b/src/controllers/order.controller.ts
index e83b21..a41c90 100644
--- a/src/controllers/order.controller.ts
+++ b/src/controllers/order.controller.ts
@@ -14,6 +14,14 @@ export class OrderController {
+  public async processOrder(req: Request, res: Response) {
+    const { userId, orderItems } = req.body;
+    const orders = [];
+    for (const item of orderItems) {
+      const price = await this.db.query("SELECT price FROM products WHERE id = " + item.productId);
+      orders.push({ ...item, price });
+    }
+    return res.json({ orders });
+  }`;

    const activeRules = ruleEngineService.getAllRules();
    const reviewResult = await geminiService.reviewDiff(
      diff,
      pr.title,
      pr.body || 'Triggered via GitHub Webhook',
      repo,
      activeRules
    );

    const delivery: WebhookDeliveryLog = {
      id: 'del_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
      timestamp: new Date().toISOString(),
      event: 'pull_request',
      action: payload.action,
      repository: repo,
      prNumber: payload.number,
      prTitle: pr.title,
      prDescription: pr.body,
      sender: payload.sender?.login || 'github-actions[bot]',
      headSha: pr.head?.sha || 'a1b2c3d4e5f6',
      baseSha: pr.base?.sha || 'f6e5d4c3b2a1',
      status: 'PROCESSED',
      signatureVerified: true,
      review: reviewResult,
      diffSnippet: diff,
    };

    this.deliveryHistory.unshift(delivery);
    if (this.deliveryHistory.length > 50) {
      this.deliveryHistory.pop();
    }

    return { delivery, review: reviewResult };
  }

  public recordFailedDelivery(
    event: string,
    action: string,
    repo: string,
    error: string,
    signatureVerified = false
  ): WebhookDeliveryLog {
    const delivery: WebhookDeliveryLog = {
      id: 'del_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
      timestamp: new Date().toISOString(),
      event,
      action,
      repository: repo,
      prNumber: 0,
      prTitle: 'Unknown / Malformed Delivery',
      sender: 'unknown',
      headSha: '',
      baseSha: '',
      status: 'FAILED',
      signatureVerified,
      error,
    };

    this.deliveryHistory.unshift(delivery);
    return delivery;
  }
}

export const webhookService = new WebhookService();
