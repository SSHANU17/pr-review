import { Router, Request, Response } from 'express';
import { geminiService } from '../services/gemini.service';
import { ruleEngineService } from '../services/rule-engine.service';
import { webhookService } from '../services/webhook.service';
import { octokitService } from '../services/octokit.service';

export const apiRouter = Router();

// Health Check
apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'Gemini PR Architect Review Engine',
    version: '1.3.0',
    geminiConfigured: geminiService.isConfigured(),
    webhookSecretConfigured: webhookService.isSecretConfigured(),
    activeRulesCount: ruleEngineService.getActiveRules().length,
    webhookDeliveriesCount: webhookService.getDeliveries().length,
  });
});

// Diff Review Endpoint
apiRouter.post('/review', async (req: Request, res: Response) => {
  try {
    const { diff, prTitle, prDescription, repoName, customRules, rules } = req.body;

    if (!diff || typeof diff !== 'string') {
      res.status(400).json({ error: 'Diff string is required in request body.' });
      return;
    }

    const rulesToUse = customRules || rules;
    const reviewResult = await geminiService.reviewDiff(
      diff,
      prTitle || 'Untitled Pull Request',
      prDescription || '',
      repoName || 'google-gemini/architect-ai',
      rulesToUse
    );

    res.json({
      success: true,
      data: reviewResult,
      analyzedAt: new Date().toISOString(),
      engine: geminiService.isConfigured() ? 'gemini-3.7-flash' : 'ast-static-analyzer',
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal review engine error';
    res.status(500).json({ error: msg });
  }
});

// Rules CRUD Endpoints
apiRouter.get('/rules', (_req: Request, res: Response) => {
  const rules = ruleEngineService.getAllRules();
  res.json({
    success: true,
    count: rules.length,
    total: rules.length,
    activeCount: rules.filter((r) => r.enabled).length,
    rules,
  });
});

apiRouter.post('/rules', (req: Request, res: Response) => {
  try {
    const { title, category, severity, description, pattern, suggestedCodeTemplate, enabled } = req.body;

    if (!title || !description) {
      res.status(400).json({ error: 'Title and description are required for creating a rule.' });
      return;
    }

    const newRule = ruleEngineService.createRule({
      title,
      category: category || 'CUSTOM',
      severity: severity || 'WARNING',
      description,
      pattern: pattern || '',
      suggestedCodeTemplate: suggestedCodeTemplate || '',
      enabled: enabled !== undefined ? enabled : true,
    });

    res.status(201).json({
      success: true,
      message: 'Rule created successfully',
      rule: newRule,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to create rule';
    res.status(500).json({ error: msg });
  }
});

apiRouter.put('/rules/:id', (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
    const updates = req.body;
    const updatedRule = ruleEngineService.updateRule(id, updates);

    res.json({
      success: true,
      message: 'Rule updated successfully',
      rule: updatedRule,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to update rule';
    res.status(404).json({ error: msg });
  }
});

apiRouter.delete('/rules/:id', (req: Request, res: Response) => {
  const id = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
  const deleted = ruleEngineService.deleteRule(id);
  if (!deleted) {
    res.status(404).json({ error: `Rule ${id} not found` });
    return;
  }
  res.json({
    success: true,
    id,
    message: `Rule ${id} deleted successfully`,
  });
});

apiRouter.post('/rules/reset', (_req: Request, res: Response) => {
  const rules = ruleEngineService.resetToDefaults();
  res.json({
    success: true,
    message: 'Rules successfully reset to standard architecture baseline',
    rules,
  });
});

// Helper: parse owner, repo, pull number from URL or parts
function parseRepoAndPR(input: {
  prUrl?: string;
  repo?: string;
  owner?: string;
  pullNumber?: number | string;
}): { owner: string; repo: string; pullNumber: number } | null {
  if (input.prUrl) {
    const clean = input.prUrl.trim();
    const urlMatch = clean.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i) ||
      clean.match(/^([^/#\s]+)\/([^/#\s]+)#(\d+)$/) ||
      clean.match(/^([^/#\s]+)\/([^/#\s]+)\/pull\/(\d+)$/);

    if (urlMatch) {
      return {
        owner: urlMatch[1],
        repo: urlMatch[2].replace(/\.git$/, ''),
        pullNumber: parseInt(urlMatch[3], 10),
      };
    }
  }

  let owner = input.owner || '';
  let repo = input.repo || '';
  const pullNumber = input.pullNumber ? parseInt(String(input.pullNumber), 10) : 0;

  if (repo.includes('/') && !owner) {
    const parts = repo.split('/');
    owner = parts[0];
    repo = parts[1];
  }

  if (owner && repo && pullNumber > 0) {
    return { owner, repo, pullNumber };
  }

  return null;
}

// GitHub Live PR & Code Fetch Endpoints
apiRouter.post('/github/fetch-pr', async (req: Request, res: Response) => {
  try {
    const { token, prUrl, repo, owner, pullNumber } = req.body;
    const parsed = parseRepoAndPR({ prUrl, repo, owner, pullNumber });

    if (!parsed) {
      res.status(400).json({
        success: false,
        error: 'Please provide a valid GitHub PR URL (e.g. https://github.com/owner/repo/pull/123) or owner, repo, and PR number.',
      });
      return;
    }

    const result = await octokitService.fetchPullRequest(token, parsed.owner, parsed.repo, parsed.pullNumber);
    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json({
      success: true,
      repository: `${parsed.owner}/${parsed.repo}`,
      owner: parsed.owner,
      repo: parsed.repo,
      pullNumber: parsed.pullNumber,
      pr: result.pr,
      diff: result.diff,
      files: result.files,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

apiRouter.post('/github/list-prs', async (req: Request, res: Response) => {
  try {
    const { token, repo, owner, state } = req.body;
    let targetOwner = owner;
    let targetRepo = repo;

    if (repo && repo.includes('/') && !owner) {
      const parts = repo.split('/');
      targetOwner = parts[0];
      targetRepo = parts[1];
    }

    if (!targetOwner || !targetRepo) {
      res.status(400).json({ success: false, error: 'Owner and repository name are required.' });
      return;
    }

    const result = await octokitService.listPullRequests(token, targetOwner, targetRepo, state || 'open');
    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

apiRouter.post('/github/user-repos', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) {
      res.status(400).json({ success: false, error: 'GitHub Token is required to fetch repositories.' });
      return;
    }

    const result = await octokitService.listUserRepos(token);
    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

apiRouter.post('/github/fetch-file', async (req: Request, res: Response) => {
  try {
    const { token, owner, repo, path, ref } = req.body;
    let targetOwner = owner;
    let targetRepo = repo;

    if (repo && repo.includes('/') && !owner) {
      const parts = repo.split('/');
      targetOwner = parts[0];
      targetRepo = parts[1];
    }

    if (!targetOwner || !targetRepo || !path) {
      res.status(400).json({ success: false, error: 'Owner, repository, and file path are required.' });
      return;
    }

    const result = await octokitService.fetchFileContent(token, targetOwner, targetRepo, path, ref);
    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

// GitHub Webhook Ingestion & CI/CD Trigger
apiRouter.post('/webhook/github', async (req: Request, res: Response) => {
  const githubEvent = req.headers['x-github-event'] as string;
  const signature = req.headers['x-hub-signature-256'] as string;

  // Verify HMAC signature
  const rawBody = JSON.stringify(req.body);
  const isValid = webhookService.verifySignature(rawBody, signature);
  if (!isValid) {
    console.warn('[Webhook] Invalid X-Hub-Signature-256 signature.');
    webhookService.recordFailedDelivery(
      githubEvent || 'unknown',
      req.body?.action || 'unknown',
      req.body?.repository?.full_name || 'unknown',
      'Invalid HMAC SHA256 Signature',
      false
    );
    res.status(401).json({ error: 'Signature verification failed.' });
    return;
  }

  if (githubEvent === 'ping') {
    res.json({ message: 'Pong! Webhook connection verified successfully.' });
    return;
  }

  if (githubEvent === 'pull_request') {
    const action = req.body.action;
    if (['opened', 'synchronize', 'reopened'].includes(action)) {
      try {
        const { delivery, review } = await webhookService.processPullRequestEvent(req.body);
        res.json({
          success: true,
          message: `PR #${req.body.number} ${action} processed successfully by Gemini Review Engine.`,
          deliveryId: delivery.id,
          reviewScore: review.score,
          findingsCount: review.findings.length,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error processing webhook event';
        webhookService.recordFailedDelivery(
          'pull_request',
          action,
          req.body?.repository?.full_name || 'unknown',
          msg,
          true
        );
        res.status(500).json({ error: msg });
      }
      return;
    }
  }

  res.json({ status: 'ignored', reason: `Event "${githubEvent}" / action "${req.body?.action}" is not subscribed.` });
});

// Webhook Logs & History
const getWebhookHistoryHandler = (_req: Request, res: Response) => {
  const deliveries = webhookService.getDeliveries();
  res.json({
    success: true,
    total: deliveries.length,
    deliveries,
  });
};

const clearWebhookHistoryHandler = (_req: Request, res: Response) => {
  webhookService.clearDeliveries();
  res.json({ success: true, message: 'Webhook delivery logs cleared.' });
};

apiRouter.get('/webhook/history', getWebhookHistoryHandler);
apiRouter.get('/webhook/deliveries', getWebhookHistoryHandler);
apiRouter.delete('/webhook/history', clearWebhookHistoryHandler);
apiRouter.delete('/webhook/deliveries', clearWebhookHistoryHandler);

// Webhook Simulation
const simulateWebhookHandler = async (req: Request, res: Response) => {
  try {
    const action = req.body.action || 'opened';
    const repo = req.body.repoName || req.body.repo || 'acme-corp/financial-core';
    const prTitle = req.body.prTitle || req.body.title || 'feat: PR #448 - Multi-currency billing gateway';
    const simulatedSha = 'f9e8d7c' + Math.random().toString(36).substring(2, 8);

    const mockPayload = {
      action,
      number: 448,
      pull_request: {
        title: prTitle,
        body: 'Automated PR trigger via webhook simulator with custom rule checks',
        head: { sha: simulatedSha, ref: 'feature/multi-currency' },
        base: { sha: 'a1b2c3d4e5f6', ref: 'main' },
      },
      repository: { full_name: repo, name: repo.split('/')[1] || repo },
      sender: { login: 'ci-runner[bot]' },
    };

    const { delivery, review } = await webhookService.processPullRequestEvent(mockPayload);

    res.json({
      success: true,
      simulated: true,
      action,
      repository: repo,
      prNumber: 448,
      latestCommitSha: simulatedSha,
      delivery,
      review,
      message: `Simulated '${action}' event processed!`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Simulation failed';
    res.status(500).json({ error: msg });
  }
};

apiRouter.post('/webhook/test-simulate', simulateWebhookHandler);
apiRouter.post('/webhook/simulate', simulateWebhookHandler);

// GitHub Token Verification & OAuth Endpoints
const verifyTokenHandler = async (req: Request, res: Response) => {
  const token = req.body.token || '';
  const result = await octokitService.verifyToken(token);
  if (result.valid) {
    res.json({
      valid: true,
      user: result.user,
      scopes: (result.user as { scopes?: string })?.scopes || 'repo, read:user, workflow',
      authenticatedVia: token.startsWith('ghp_demo') || token.startsWith('gho_oauthToken') ? 'OAuth Simulated SecretStorage' : 'GitHub REST API',
    });
  } else {
    res.status(401).json({
      valid: false,
      message: result.error || 'Invalid GitHub token',
    });
  }
};

apiRouter.post('/auth/github/verify', verifyTokenHandler);
apiRouter.post('/github/token-verify', verifyTokenHandler);

// OAuth Configuration Endpoints
const getOAuthConfigHandler = (_req: Request, res: Response) => {
  res.json({
    clientId: 'Iv1.gemini_pr_architect_client',
    authUrl: 'https://github.com/login/oauth/authorize',
    redirectUri: 'vscode://google.gemini-pr-reviewer/auth-callback',
    scopes: ['repo', 'read:user', 'workflow'],
  });
};

apiRouter.get('/auth/github/oauth-config', getOAuthConfigHandler);
apiRouter.get('/github/oauth-config', getOAuthConfigHandler);

apiRouter.post('/github/submit-review', async (req: Request, res: Response) => {
  const { token, owner, repo, pullNumber, commitId, body, comments } = req.body;
  let targetOwner = owner;
  let targetRepo = repo;

  if (repo && repo.includes('/') && !owner) {
    const parts = repo.split('/');
    targetOwner = parts[0];
    targetRepo = parts[1];
  }

  const result = await octokitService.submitPullRequestReview(
    token,
    targetOwner,
    targetRepo,
    Number(pullNumber),
    commitId || 'HEAD',
    body,
    comments || []
  );
  res.json(result);
});

// API 404 handler
apiRouter.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'API route not found' });
});
