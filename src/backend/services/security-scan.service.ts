import {
  CoverityStream,
  CoverityDefect,
  AppScanReport,
  AppScanFinding,
  SecurityFixRequest,
  SecurityFixResponse,
} from '../models/types';
import { GoogleGenAI } from '@google/genai';

export class SecurityScanService {
  private coverityStreams: CoverityStream[] = [
    {
      id: 'ecommerce-checkout-stream',
      name: 'ecommerce-checkout-stream',
      project: 'acme-corp/financial-core',
      branch: 'main',
      lastAnalyzed: '2026-09-06T04:15:00Z',
      totalDefects: 4,
      highImpactCount: 3,
      mediumImpactCount: 1,
      lowImpactCount: 0,
      defects: [
        {
          cid: 284910,
          checker: 'FORWARD_NULL',
          impact: 'High',
          category: 'Null Pointer Dereference',
          file: 'src/app/services/checkout.service.ts',
          line: 42,
          functionName: 'processOrderPayment',
          status: 'New',
          cwe: 'CWE-476',
          description:
            'Passing potentially null pointer "user.billingAddress" to "paymentGateway.charge()". If the user did not specify a secondary address, this will throw an unhandled NullPointerException.',
          vulnerableSnippet: `const address = user.billingAddress;\nconst tx = await this.gateway.charge(address.zipCode, amount);`,
          remediationFix: `const address = user.billingAddress ?? user.shippingAddress;\nif (!address?.zipCode) {\n  throw new Error('Billing ZIP code is required for card verification');\n}\nconst tx = await this.gateway.charge(address.zipCode, amount);`,
          events: [
            {
              eventNumber: 1,
              line: 38,
              description: 'Variable "user.billingAddress" is assigned from optional profile property without null check.',
              tag: 'var_assigned',
            },
            {
              eventNumber: 2,
              line: 42,
              description: 'Dereference of nullable pointer "address.zipCode".',
              tag: 'deref',
            },
          ],
        },
        {
          cid: 284915,
          checker: 'TAINTED_SCALAR',
          impact: 'High',
          category: 'Security',
          file: 'src/backend/routes/order.routes.ts',
          line: 68,
          functionName: 'handleOrderSearch',
          status: 'New',
          cwe: 'CWE-89',
          description:
            'Untrusted HTTP request query parameter "req.query.status" flows into dynamic string concatenation in raw database query.',
          vulnerableSnippet: `const query = "SELECT * FROM orders WHERE status = '" + req.query.status + "' ORDER BY created_at DESC";\nconst rows = await db.raw(query);`,
          remediationFix: `const status = String(req.query.status || 'PENDING');\nconst rows = await db('orders').where({ status }).orderBy('created_at', 'desc');`,
          events: [
            {
              eventNumber: 1,
              line: 65,
              description: 'Taint source: req.query.status reads untrusted user input.',
              tag: 'taint_source',
            },
            {
              eventNumber: 2,
              line: 68,
              description: 'Taint sink: concatenated string passed to database query parser.',
              tag: 'taint_sink',
            },
          ],
        },
        {
          cid: 284922,
          checker: 'RESOURCE_LEAK',
          impact: 'Medium',
          category: 'Resource Management',
          file: 'src/backend/services/invoice-generator.service.ts',
          line: 35,
          functionName: 'renderPdfInvoice',
          status: 'Triaged',
          cwe: 'CWE-775',
          description:
            'File stream created by "fs.createReadStream(templatePath)" is not destroyed or piped on early validation return, causing file descriptor exhaustion under load.',
          vulnerableSnippet: `const stream = fs.createReadStream(templatePath);\nif (!order.isPaid) return null;\nreturn await this.pdfEngine.render(stream, order);`,
          remediationFix: `if (!order.isPaid) return null;\nconst stream = fs.createReadStream(templatePath);\ntry {\n  return await this.pdfEngine.render(stream, order);\n} finally {\n  stream.destroy();\n}`,
          events: [
            {
              eventNumber: 1,
              line: 32,
              description: 'Allocated file descriptor stream resource.',
              tag: 'alloc',
            },
            {
              eventNumber: 2,
              line: 35,
              description: 'Function returns prematurely without releasing stream resource.',
              tag: 'leak',
            },
          ],
        },
        {
          cid: 284930,
          checker: 'SECURITY_DECISION_ON_UNTRUSTED_INPUT',
          impact: 'High',
          category: 'Authorization',
          file: 'src/app/guards/role-auth.guard.ts',
          line: 28,
          functionName: 'canActivate',
          status: 'New',
          cwe: 'CWE-807',
          description:
            'Authorization decision for administrative actions relies directly on unvalidated client-side state stored in localStorage.',
          vulnerableSnippet: `const role = localStorage.getItem('user_role');\nif (role === 'SUPER_ADMIN') return true;`,
          remediationFix: `const token = this.authService.getAccessToken();\nif (!token) return false;\nconst claims = await this.authService.verifyAndDecodeClaims(token);\nreturn claims.roles.includes('SUPER_ADMIN');`,
          events: [
            {
              eventNumber: 1,
              line: 27,
              description: 'Input read from mutable client storage.',
              tag: 'untrusted_input',
            },
            {
              eventNumber: 2,
              line: 28,
              description: 'Security gate condition evaluated against untrusted input.',
              tag: 'sec_decision',
            },
          ],
        },
      ],
    },
    {
      id: 'payment-core-stream',
      name: 'payment-core-stream',
      project: 'acme-corp/payment-service',
      branch: 'release/v3.2',
      lastAnalyzed: '2026-09-05T18:30:00Z',
      totalDefects: 2,
      highImpactCount: 1,
      mediumImpactCount: 1,
      lowImpactCount: 0,
      defects: [
        {
          cid: 301402,
          checker: 'INSECURE_RANDOM',
          impact: 'Medium',
          category: 'Cryptography',
          file: 'src/backend/utils/token.util.ts',
          line: 18,
          functionName: 'generateCsrfToken',
          status: 'New',
          cwe: 'CWE-330',
          description:
            'Pseudo-random number generator "Math.random()" is cryptographically weak and predictable. Use crypto.randomBytes() or crypto.getRandomValues().',
          vulnerableSnippet: `export function generateCsrfToken(): string {\n  return Math.random().toString(36).substring(2) + Date.now().toString(36);\n}`,
          remediationFix: `import { randomBytes } from 'crypto';\n\nexport function generateCsrfToken(): string {\n  return randomBytes(32).toString('hex');\n}`,
        },
        {
          cid: 301419,
          checker: 'UNCHECKED_RETURN_VALUE',
          impact: 'High',
          category: 'Error Handling',
          file: 'src/backend/services/ledger.service.ts',
          line: 54,
          functionName: 'commitTransfer',
          status: 'Triaged',
          cwe: 'CWE-252',
          description:
            'Return value of database transaction "await trx.commit()" is not verified, and errors during disk flush are ignored.',
          vulnerableSnippet: `trx.commit();\nreturn { status: 'SUCCESS' };`,
          remediationFix: `try {\n  await trx.commit();\n  return { status: 'SUCCESS' };\n} catch (err) {\n  await trx.rollback();\n  throw new Error('Transaction commit failed: ' + (err instanceof Error ? err.message : String(err)));\n}`,
        },
      ],
    },
    {
      id: 'auth-identity-stream',
      name: 'auth-identity-stream',
      project: 'acme-corp/identity-provider',
      branch: 'main',
      lastAnalyzed: '2026-09-06T01:00:00Z',
      totalDefects: 2,
      highImpactCount: 2,
      mediumImpactCount: 0,
      lowImpactCount: 0,
      defects: [
        {
          cid: 312090,
          checker: 'HARDCODED_CREDENTIALS',
          impact: 'High',
          category: 'Security',
          file: 'src/backend/config/jwt.config.ts',
          line: 12,
          functionName: 'getJwtSecret',
          status: 'New',
          cwe: 'CWE-798',
          description:
            'Default fallback HMAC secret "super-secret-key-12345" committed to repository. Allows attacker to forge valid authentication JWT tokens.',
          vulnerableSnippet: `const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-12345';`,
          remediationFix: `const JWT_SECRET = process.env.JWT_SECRET;\nif (!JWT_SECRET || JWT_SECRET.length < 32) {\n  throw new Error('Fatal: JWT_SECRET environment variable is missing or insufficiently random (<32 chars)');\n}`,
        },
        {
          cid: 312095,
          checker: 'MISSING_AUTHENTICATION',
          impact: 'High',
          category: 'Access Control',
          file: 'src/backend/routes/admin.routes.ts',
          line: 15,
          functionName: 'registerAdminRoutes',
          status: 'New',
          cwe: 'CWE-306',
          description:
            'Route handler "app.post(\'/api/admin/reset-database\')" lacks authentication middleware, allowing unauthenticated remote execution.',
          vulnerableSnippet: `app.post('/api/admin/reset-database', (req, res) => {\n  this.dbManager.truncateAll();\n  res.json({ ok: true });\n});`,
          remediationFix: `app.post('/api/admin/reset-database', requireMfaAdminAuth, (req, res) => {\n  if (process.env.NODE_ENV === 'production') {\n    return res.status(403).json({ error: 'Prohibited in production environment' });\n  }\n  this.dbManager.truncateAll();\n  return res.json({ ok: true });\n});`,
        },
      ],
    },
  ];

  private appScanReports: AppScanReport[] = [
    {
      id: 'appscan-sast-core-audit',
      scanName: 'AppScan Standard SAST Core Platform Security Audit',
      scanType: 'SAST',
      timestamp: '2026-09-06T03:45:00Z',
      targetApplication: 'acme-corp/financial-core (Monorepo)',
      highCount: 3,
      mediumCount: 2,
      lowCount: 0,
      infoCount: 1,
      findings: [
        {
          id: 'AS-8901',
          issueType: 'SQL Injection',
          cwe: 'CWE-89',
          cvssScore: 9.8,
          severity: 'High',
          scannerType: 'SAST',
          fileOrUrl: 'src/backend/services/user-repository.service.ts',
          line: 45,
          threatVector:
            "Attacker supplies payload like ' OR '1'='1' -- in search filter to dump database records or bypass access barriers.",
          vulnerableSnippet: `const sql = \`SELECT * FROM users WHERE email = '\${email}' AND tenant_id = '\${tenantId}'\`;\nreturn await this.db.query(sql);`,
          remediationFix: `const sql = 'SELECT * FROM users WHERE email = ? AND tenant_id = ?';\nreturn await this.db.query(sql, [email, tenantId]);`,
          remediationAdvice:
            'Use parameterized queries, prepared statements, or ORM criteria query builders. Never assemble SQL using string concatenation or template literals.',
          status: 'Open',
        },
        {
          id: 'AS-7902',
          issueType: 'Cross-Site Scripting (Reflected XSS)',
          cwe: 'CWE-79',
          cvssScore: 8.2,
          severity: 'High',
          scannerType: 'SAST',
          fileOrUrl: 'src/app/components/search-results.component.ts',
          line: 32,
          threatVector:
            'Query parameter "searchTerm" is rendered into innerHTML without sanitization, permitting attacker to execute arbitrary scripts in victim browser context.',
          vulnerableSnippet: `element.innerHTML = \`<div class="highlight">Results for: <b>\${searchTerm}</b></div>\`;`,
          remediationFix: `// Avoid innerHTML: use textContent or Angular DomSanitizer\nconst b = document.createElement('b');\nb.textContent = searchTerm;\ncontainer.replaceChildren(document.createTextNode('Results for: '), b);`,
          remediationAdvice:
            'Bind dynamic text using safe interpolation (e.g. {{ searchTerm }}) or explicitly sanitize via DOMPurify / SecurityContext.HTML before rendering.',
          status: 'Open',
        },
        {
          id: 'AS-9180',
          issueType: 'Server-Side Request Forgery (SSRF)',
          cwe: 'CWE-918',
          cvssScore: 8.6,
          severity: 'High',
          scannerType: 'SAST',
          fileOrUrl: 'src/backend/services/webhook-dispatcher.service.ts',
          line: 58,
          threatVector:
            'Destination URL provided by webhook configuration is fetched directly by the backend server, allowing attackers to access internal cloud metadata (e.g. http://169.254.169.254) or intranet systems.',
          vulnerableSnippet: `export async function dispatchWebhook(url: string, payload: any) {\n  return await fetch(url, { method: 'POST', body: JSON.stringify(payload) });\n}`,
          remediationFix: `import { isAllowedWebhookTarget } from '../utils/network.util';\n\nexport async function dispatchWebhook(url: string, payload: any) {\n  if (!isAllowedWebhookTarget(url)) {\n    throw new Error('Rejected webhook dispatch: Target URL resolves to forbidden internal or private network IP');\n  }\n  return await fetch(url, {\n    method: 'POST',\n    headers: { 'Content-Type': 'application/json' },\n    body: JSON.stringify(payload),\n    signal: AbortSignal.timeout(5000)\n  });\n}`,
          remediationAdvice:
            'Validate the target URL against an explicit domain allowlist and verify resolved IP does not belong to RFC 1918 private ranges, localhost (127.0.0.1), or cloud metadata services (169.254.169.254).',
          status: 'Open',
        },
        {
          id: 'AS-3210',
          issueType: 'Hardcoded Cryptographic Key',
          cwe: 'CWE-321',
          cvssScore: 7.4,
          severity: 'Medium',
          scannerType: 'SAST',
          fileOrUrl: 'src/backend/services/cipher.service.ts',
          line: 14,
          threatVector:
            'Symmetric AES-256 key initialized from static hardcoded byte array in source code, jeopardizing all encrypted customer tokens.',
          vulnerableSnippet: `const ENCRYPTION_KEY = Buffer.from('8f2d91b4a0c8e7f1d2e3f4a5b6c7d8e9', 'hex');`,
          remediationFix: `const rawKey = process.env.DATA_ENCRYPTION_KEY;\nif (!rawKey || rawKey.length !== 64) {\n  throw new Error('DATA_ENCRYPTION_KEY must be a 64-character hex string (256-bit)');\n}\nconst ENCRYPTION_KEY = Buffer.from(rawKey, 'hex');`,
          remediationAdvice:
            'Store cryptographic keys in secure key management vaults (e.g., Google Cloud KMS, AWS KMS, HashiCorp Vault) and inject via environment secrets.',
          status: 'Open',
        },
        {
          id: 'AS-2870',
          issueType: 'Improper Authentication & Session Fixation',
          cwe: 'CWE-287',
          cvssScore: 8.5,
          severity: 'High',
          scannerType: 'SAST',
          fileOrUrl: 'src/backend/middleware/auth.ts',
          line: 22,
          threatVector:
            'Session identifier generated before login is retained after successful password verification, facilitating session hijacking.',
          vulnerableSnippet: `req.session.authenticated = true;\nreq.session.user = user;\nreturn res.json({ success: true });`,
          remediationFix: `req.session.regenerate((err) => {\n  if (err) return res.status(500).json({ error: 'Session regeneration failed' });\n  req.session.authenticated = true;\n  req.session.user = user;\n  return res.json({ success: true });\n});`,
          remediationAdvice:
            'Always regenerate session IDs upon privilege transition or authentication to prevent session fixation attacks.',
          status: 'Open',
        },
      ],
    },
    {
      id: 'appscan-dast-payment-api',
      scanName: 'AppScan Dynamic Application Security Testing (DAST) API Scan',
      scanType: 'DAST',
      timestamp: '2026-09-05T20:10:00Z',
      targetApplication: 'https://api.acme-corp.com/v2',
      highCount: 2,
      mediumCount: 1,
      lowCount: 1,
      infoCount: 0,
      findings: [
        {
          id: 'AS-6391',
          issueType: 'Insecure Direct Object Reference (IDOR)',
          cwe: 'CWE-639',
          cvssScore: 8.8,
          severity: 'High',
          scannerType: 'DAST',
          fileOrUrl: 'GET /api/v2/orders/:id',
          threatVector:
            'DAST scanner manipulated numeric order ID parameter from /api/v2/orders/1001 to /api/v2/orders/1002 and successfully read another tenant financial record.',
          vulnerableSnippet: `app.get('/api/v2/orders/:id', async (req, res) => {\n  const order = await db('orders').where({ id: req.params.id }).first();\n  res.json(order);\n});`,
          remediationFix: `app.get('/api/v2/orders/:id', requireAuth, async (req, res) => {\n  const order = await db('orders')\n    .where({ id: req.params.id, organization_id: req.user.orgId })\n    .first();\n  if (!order) return res.status(404).json({ error: 'Order not found or unauthorized' });\n  return res.json(order);\n});`,
          remediationAdvice:
            'Scope all database queries by the authenticated user organization or tenant identifier to enforce horizontal authorization.',
          status: 'Open',
        },
        {
          id: 'AS-3520',
          issueType: 'Cross-Site Request Forgery (CSRF)',
          cwe: 'CWE-352',
          cvssScore: 7.5,
          severity: 'High',
          scannerType: 'DAST',
          fileOrUrl: 'POST /api/v2/user/email',
          threatVector:
            'Endpoint accepts state-changing POST requests with ambient cookie credentials without validating an Anti-CSRF token or Origin header.',
          vulnerableSnippet: `app.post('/api/v2/user/email', async (req, res) => {\n  await updateUserEmail(req.user.id, req.body.email);\n  res.json({ ok: true });\n});`,
          remediationFix: `app.post('/api/v2/user/email', verifyCsrfToken, async (req, res) => {\n  await updateUserEmail(req.user.id, req.body.email);\n  return res.json({ ok: true });\n});`,
          remediationAdvice:
            'Implement anti-CSRF synchronizer tokens or set SameSite=Strict on session cookies, and enforce custom header validation (e.g. X-Requested-With).',
          status: 'Open',
        },
        {
          id: 'AS-2001',
          issueType: 'Information Exposure Through Directory Listing',
          cwe: 'CWE-200',
          cvssScore: 5.3,
          severity: 'Medium',
          scannerType: 'DAST',
          fileOrUrl: '/public/assets/exports/',
          threatVector:
            'Automated crawler indexed /public/assets/exports/ and retrieved internal database export dumps and staging configuration files.',
          vulnerableSnippet: `app.use('/public/assets', express.static(publicPath, { dotfiles: 'allow' }));`,
          remediationFix: `app.use('/public/assets', express.static(publicPath, {\n  dotfiles: 'ignore',\n  index: false\n}));`,
          remediationAdvice:
            'Disable directory indexing in reverse proxy and web framework static file servers. Keep backup and export directories outside public web root.',
          status: 'Open',
        },
      ],
    },
  ];

  public getCoverityStreams(): CoverityStream[] {
    return this.coverityStreams;
  }

  public getCoverityStream(streamId: string): CoverityStream | undefined {
    return this.coverityStreams.find((s) => s.id === streamId);
  }

  public addCoverityStream(stream: CoverityStream): CoverityStream {
    const existingIndex = this.coverityStreams.findIndex((s) => s.id === stream.id);
    if (existingIndex >= 0) {
      this.coverityStreams[existingIndex] = stream;
    } else {
      this.coverityStreams.unshift(stream);
    }
    return stream;
  }

  public updateCoverityDefectStatus(
    streamId: string,
    cid: number,
    status: 'New' | 'Triaged' | 'Dismissed' | 'Fixed'
  ): CoverityDefect | null {
    const stream = this.getCoverityStream(streamId);
    if (!stream) return null;
    const defect = stream.defects.find((d) => d.cid === cid);
    if (!defect) return null;
    defect.status = status;
    return defect;
  }

  public getAppScanReports(): AppScanReport[] {
    return this.appScanReports;
  }

  public getAppScanReport(reportId: string): AppScanReport | undefined {
    return this.appScanReports.find((r) => r.id === reportId);
  }

  public addAppScanReport(report: AppScanReport): AppScanReport {
    const existingIndex = this.appScanReports.findIndex((r) => r.id === report.id);
    if (existingIndex >= 0) {
      this.appScanReports[existingIndex] = report;
    } else {
      this.appScanReports.unshift(report);
    }
    return report;
  }

  public updateAppScanFindingStatus(
    reportId: string,
    findingId: string,
    status: 'Open' | 'Remediated' | 'False Positive'
  ): AppScanFinding | null {
    const report = this.getAppScanReport(reportId);
    if (!report) return null;
    const finding = report.findings.find((f) => f.id === findingId);
    if (!finding) return null;
    finding.status = status;
    return finding;
  }

  public async generateSecurityFix(req: SecurityFixRequest): Promise<SecurityFixResponse> {
    const apiKey = process.env['GEMINI_API_KEY'];

    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const prompt = `You are a Principal Application Security Architect specializing in Synopsys Coverity and HCL AppScan static/dynamic remediation.
Generate a verified, production-ready fix for the following security vulnerability/defect.

Source: ${req.source}
Defect Identifier: ${req.defectId}
Checker / CWE: ${req.checkerOrCwe}
Title: ${req.title}
File: ${req.file}

Vulnerable Code Snippet:
\`\`\`
${req.vulnerableCode}
\`\`\`

Existing Baseline Remediation (if any):
\`\`\`
${req.existingRemediation || 'None provided'}
\`\`\`

Requirements:
1. Provide ONLY secure, enterprise-grade TypeScript/JavaScript replacement code that eliminates the defect without introducing side effects or regressions.
2. Adhere strictly to OWASP, CERT, and SANS security guidelines.
3. Return clean JSON in this format:
{
  "remediatedCode": "string (the replacement code)",
  "explanation": "string (2-3 sentences explaining why this fix eliminates the vulnerability)",
  "cweMitigation": "string (e.g. CWE-89 Parameterization)",
  "patchDiff": "string (unified git diff chunk with - and + lines showing the change)"
}`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        });

        const raw = response.text || '';
        const parsed = JSON.parse(raw);

        return {
          success: true,
          defectId: req.defectId,
          remediatedCode: parsed.remediatedCode || req.existingRemediation || req.vulnerableCode,
          explanation: parsed.explanation || `Eliminated ${req.checkerOrCwe} vulnerability with secure coding standards.`,
          patchDiff: parsed.patchDiff || this.buildPatchDiff(req.vulnerableCode, parsed.remediatedCode || req.existingRemediation || ''),
          cweMitigation: parsed.cweMitigation || req.checkerOrCwe,
        };
      } catch (err) {
        console.warn('Gemini AI security fix generation encountered error, falling back to deterministic remediation:', err);
      }
    }

    // Deterministic fallback remediation
    const remediatedCode = req.existingRemediation || this.generateDeterministicFix(req.checkerOrCwe, req.vulnerableCode);
    const patchDiff = this.buildPatchDiff(req.vulnerableCode, remediatedCode);

    return {
      success: true,
      defectId: req.defectId,
      remediatedCode,
      explanation: `Deterministic security rule applied for ${req.checkerOrCwe}. Replaced vulnerable dynamic constructs with safe parameterized/sanitized patterns.`,
      patchDiff,
      cweMitigation: `${req.checkerOrCwe} Hardened Mitigation`,
    };
  }

  private generateDeterministicFix(checkerOrCwe: string, vulnerableCode: string): string {
    const upper = checkerOrCwe.toUpperCase();

    if (upper.includes('SQL') || upper.includes('CWE-89') || upper.includes('TAINTED_SCALAR')) {
      return `// Hardened parameterized query (CWE-89 Mitigation)\nconst query = 'SELECT * FROM records WHERE id = ? AND tenant_id = ?';\nconst [rows] = await db.execute(query, [sanitizedId, currentTenantId]);`;
    }

    if (upper.includes('NULL') || upper.includes('CWE-476') || upper.includes('FORWARD_NULL')) {
      return `// Safe optional chaining with default fallback (CWE-476 Mitigation)\nconst safeTarget = target?.property ?? defaultFallback;\nif (!safeTarget) {\n  throw new Error('Required attribute cannot be null or undefined');\n}`;
    }

    if (upper.includes('XSS') || upper.includes('CWE-79')) {
      return `// Strict context-aware sanitization (CWE-79 Mitigation)\nconst safeHtml = DOMPurify.sanitize(userInput);\nelement.textContent = userInput; // Prefer textContent over innerHTML`;
    }

    if (upper.includes('RANDOM') || upper.includes('CWE-330') || upper.includes('INSECURE_RANDOM')) {
      return `import { randomBytes } from 'crypto';\n// Cryptographically secure pseudorandom token\nconst secureToken = randomBytes(32).toString('hex');`;
    }

    if (upper.includes('SECRET') || upper.includes('KEY') || upper.includes('CWE-798') || upper.includes('HARDCODED')) {
      return `const secretKey = process.env.API_SECRET_KEY;\nif (!secretKey) {\n  throw new Error('Required environment secret API_SECRET_KEY is not defined');\n}`;
    }

    return `// Remediated code for ${checkerOrCwe}\n` + vulnerableCode.split('\n').map((l) => '// [FIXED] ' + l).join('\n');
  }

  private buildPatchDiff(vulnerableCode: string, remediatedCode: string): string {
    const vulnLines = vulnerableCode.split('\n').map((l) => `-${l}`).join('\n');
    const remLines = remediatedCode.split('\n').map((l) => `+${l}`).join('\n');
    return `@@ -1,${vulnerableCode.split('\n').length} +1,${remediatedCode.split('\n').length} @@\n${vulnLines}\n${remLines}`;
  }
}

export const securityScanService = new SecurityScanService();
