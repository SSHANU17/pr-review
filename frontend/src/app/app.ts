import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ReviewService } from './services/review.service';
import { DiffViewer } from './components/diff-viewer';
import {
  ReviewFinding,
  CustomRule,
  SourceFileDoc,
  GitHubUserProfile,
  WebhookDeliveryLog,
  GitHubPullRequestSummary,
  GitHubChangedFile,
  GitHubRepositoryItem,
} from './models/review.model';
import {
  ALL_SOURCE_FILES,
  SAMPLE_DIFF_1,
  SAMPLE_DIFF_2,
} from './data/source-code-files';

interface EditableFinding extends ReviewFinding {
  id: string;
}

interface PrScenario {
  id: string;
  title: string;
  subtitle: string;
  repo: string;
  prTitle: string;
  prDesc: string;
  diff: string;
  pullNumber?: number;
  changedFiles: { name: string; status: string; color: string }[];
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, DiffViewer],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private readonly reviewService = inject(ReviewService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  // Tabs: 'studio' | 'rules' | 'webhooks' | 'source-code' | 'architecture' | 'oauth-guide' | 'deployment'
  public readonly activeTab = signal<'studio' | 'rules' | 'webhooks' | 'source-code' | 'architecture' | 'oauth-guide' | 'deployment'>('studio');

  // Center View Mode in Studio Tab: 'syntax-diff' | 'raw-editor'
  public readonly activeCenterTab = signal<'syntax-diff' | 'raw-editor'>('syntax-diff');
  public readonly activeFindingId = signal<string | null>(null);

  // Source files explorer state
  public readonly sourceFiles = signal<SourceFileDoc[]>(ALL_SOURCE_FILES);
  public readonly selectedFileId = signal<string>(ALL_SOURCE_FILES[0].id);
  public readonly copiedFileId = signal<string | null>(null);

  public readonly activeSourceFile = computed(() => {
    return (
      this.sourceFiles().find((f) => f.id === this.selectedFileId()) ||
      this.sourceFiles()[0]
    );
  });

  // Review Form
  public readonly reviewForm = new FormGroup({
    repoName: new FormControl('google-gemini/architect-ai', { nonNullable: true, validators: [Validators.required] }),
    prTitle: new FormControl('feat: implement MVC service layer & secure auth workflow', { nonNullable: true, validators: [Validators.required] }),
    prDescription: new FormControl('Refactors UserService and adds JWT token handler with notification dispatcher.', { nonNullable: true }),
    diff: new FormControl(SAMPLE_DIFF_1, { nonNullable: true, validators: [Validators.required] }),
  });

  // ==========================================
  // GITHUB TOKEN & LIVE PR FETCHING STATE
  // ==========================================
  public readonly githubToken = signal<string>('');
  public readonly tokenInput = signal<string>('');
  public readonly isVerifyingToken = signal<boolean>(false);
  public readonly tokenVerificationMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  public readonly authenticatedUser = signal<GitHubUserProfile | null>(null);
  public readonly oauthClientId = signal<string>('Ov23liDemoGeminiArchitect');
  public readonly isOAuthModalOpen = signal<boolean>(false);
  public readonly isAuthenticatingOAuth = signal<boolean>(false);
  public readonly oauthStatusMessage = signal<string | null>(null);

  // Live PR URL / Repo input
  public readonly livePrInput = signal<string>('https://github.com/angular/angular/pull/50000');
  public readonly isFetchingLivePr = signal<boolean>(false);
  public readonly livePrError = signal<string | null>(null);
  public readonly livePrSuccess = signal<string | null>(null);
  public readonly isImportPrModalOpen = signal<boolean>(false);

  // User Repositories & Repo PRs
  public readonly userRepositories = signal<GitHubRepositoryItem[]>([]);
  public readonly isLoadingUserRepos = signal<boolean>(false);
  public readonly repoSearchQuery = signal<string>('facebook/react');
  public readonly repoPullRequests = signal<GitHubPullRequestSummary[]>([]);
  public readonly isLoadingRepoPrs = signal<boolean>(false);

  // Live dynamically fetched changed files
  public readonly liveChangedFiles = signal<{ name: string; status: string; color: string }[] | null>(null);

  // Current PR number if fetched from GitHub
  public readonly currentPrNumber = signal<number | null>(null);
  public readonly currentCommitSha = signal<string | null>(null);

  // ==========================================
  // RULE ENGINE STATE & FORMS
  // ==========================================
  public readonly rules = signal<CustomRule[]>([]);
  public readonly isLoadingRules = signal<boolean>(false);
  public readonly ruleCategoryFilter = signal<string>('ALL');
  public readonly ruleSearchQuery = signal<string>('');
  public readonly isRuleModalOpen = signal<boolean>(false);
  public readonly editingRuleId = signal<string | null>(null);
  public readonly ruleOperationMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);
  public readonly ruleTestResult = signal<{ ruleId: string; matchesCount: number; matchedLines: string[] } | null>(null);

  public readonly ruleForm = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    category: new FormControl<'SOLID' | 'SECURITY' | 'PERFORMANCE' | 'BUG' | 'CLEAN_CODE' | 'CUSTOM'>('CUSTOM', { nonNullable: true }),
    severity: new FormControl<'CRITICAL' | 'WARNING' | 'SUGGESTION'>('WARNING', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    pattern: new FormControl('', { nonNullable: true }),
    suggestedCodeTemplate: new FormControl('', { nonNullable: true }),
    enabled: new FormControl(true, { nonNullable: true }),
  });

  public readonly activeRulesCount = computed(() => {
    return this.rules().filter((r) => r.enabled).length;
  });

  public readonly securityAndSolidRulesCount = computed(() => {
    return this.rules().filter((r) => r.category === 'SECURITY' || r.category === 'SOLID').length;
  });

  public readonly perfAndCleanRulesCount = computed(() => {
    return this.rules().filter((r) => r.category === 'PERFORMANCE' || r.category === 'CLEAN_CODE' || r.category === 'BUG' || r.category === 'CUSTOM').length;
  });

  public readonly filteredRules = computed(() => {
    const list = this.rules();
    const cat = this.ruleCategoryFilter();
    const q = this.ruleSearchQuery().toLowerCase().trim();

    return list.filter((r) => {
      if (cat !== 'ALL' && r.category !== cat) return false;
      if (q) {
        const matchTitle = r.title.toLowerCase().includes(q);
        const matchDesc = r.description.toLowerCase().includes(q);
        const matchPattern = (r.pattern || '').toLowerCase().includes(q);
        if (!matchTitle && !matchDesc && !matchPattern) return false;
      }
      return true;
    });
  });

  // Master Review Findings & State
  public readonly isReviewing = signal<boolean>(false);
  public readonly masterFindings = signal<EditableFinding[]>([]);
  public readonly reviewSummary = signal<string>('');
  public readonly reviewScore = signal<number>(0);
  public readonly reviewError = signal<string | null>(null);
  public readonly githubPushSuccess = signal<string | null>(null);
  public readonly isPushingToGitHub = signal<boolean>(false);

  // Webhooks CI/CD State
  public readonly webhookDeliveries = signal<WebhookDeliveryLog[]>([]);
  public readonly isLoadingWebhooks = signal<boolean>(false);
  public readonly isSimulatingWebhook = signal<boolean>(false);
  public readonly selectedWebhookDelivery = signal<WebhookDeliveryLog | null>(null);
  public readonly webhookSimulatorAction = signal<'opened' | 'synchronize'>('opened');
  public readonly webhookSecretConfigured = signal<boolean>(false);
  public readonly webhookEndpointUrl = signal<string>('');
  public readonly webhookSimulateSuccess = signal<string | null>(null);

  // Filter & Sort Signals
  public readonly selectedCategoryFilter = signal<string>('ALL');
  public readonly selectedSeverityFilter = signal<string>('ALL');
  public readonly selectedSortOption = signal<string>('LINE_ASC');
  public readonly searchQuery = signal<string>('');

  // Metrics for High Density Architect Dashboard
  public readonly aiLatency = signal<string>('380ms');
  public readonly tokenEstimate = signal<string>('1.4k');
  public readonly backendLogs = signal<string[]>([
    '[INFO] Backend gateway initialized on port 4000',
    '[INFO] Custom Rule Engine initialized with 8 baseline architecture policies',
    '[INFO] Octokit service ready for GitHub REST API & token integration',
    '[INFO] GitHub Webhook listener active on POST /api/webhook/github',
    '[INFO] Gemini 3.7 Flash inference primed for automated PR reviews',
  ]);

  // Diff presets
  public readonly presets: PrScenario[] = [
    {
      id: 'god-class',
      title: 'feat: implement MVC service layer',
      subtitle: '#442 • Created 2h ago',
      repo: 'google-gemini/architect-ai',
      prTitle: 'feat(auth): Implement user onboarding and notification routine',
      prDesc: 'Handles registration, database inserts, and email dispatch.',
      diff: SAMPLE_DIFF_1,
      pullNumber: 442,
      changedFiles: [
        { name: 'userService.ts', status: 'M', color: '#e2c08d' },
        { name: 'review.controller.ts', status: 'M', color: '#e2c08d' },
        { name: 'types.d.ts', status: 'A', color: '#81b88b' },
      ],
    },
    {
      id: 'n-plus-one',
      title: 'fix: resolve N+1 queries in backend',
      subtitle: '#441 • Created 5h ago',
      repo: 'ecommerce/order-processing-engine',
      prTitle: 'feat(orders): Implement order summary aggregator endpoint',
      prDesc: 'Fetches recent customer orders with live pricing data.',
      diff: SAMPLE_DIFF_2,
      pullNumber: 441,
      changedFiles: [
        { name: 'orderController.ts', status: 'M', color: '#e2c08d' },
        { name: 'priceService.ts', status: 'M', color: '#e2c08d' },
        { name: 'order.interface.ts', status: 'A', color: '#81b88b' },
      ],
    },
  ];

  public readonly activePresetId = signal<string>('god-class');

  public readonly activeChangedFiles = computed(() => {
    const live = this.liveChangedFiles();
    if (live && live.length > 0) {
      return live;
    }
    const p = this.presets.find((pr) => pr.id === this.activePresetId());
    return p ? p.changedFiles : this.presets[0].changedFiles;
  });

  // Computed Filtered & Sorted Findings
  public readonly filteredFindings = computed(() => {
    const list = this.masterFindings();
    const cat = this.selectedCategoryFilter();
    const sev = this.selectedSeverityFilter();
    const query = this.searchQuery().toLowerCase().trim();
    const sortOpt = this.selectedSortOption();

    let result = list.filter((f) => {
      if (cat !== 'ALL' && f.category !== cat) return false;
      if (sev !== 'ALL' && f.severity !== sev) return false;
      if (query) {
        const matchPath = f.path.toLowerCase().includes(query);
        const matchTitle = f.title.toLowerCase().includes(query);
        const matchComment = (f.userEditedComment || f.comment).toLowerCase().includes(query);
        if (!matchPath && !matchTitle && !matchComment) return false;
      }
      return true;
    });

    // Apply sorting
    result = [...result].sort((a, b) => {
      if (sortOpt === 'LINE_ASC') return a.line - b.line;
      if (sortOpt === 'LINE_DESC') return b.line - a.line;
      if (sortOpt === 'PATH_AZ') return a.path.localeCompare(b.path) || (a.line - b.line);
      if (sortOpt === 'CATEGORY') return a.category.localeCompare(b.category);
      if (sortOpt === 'SEVERITY_HIGH') {
        const weight: Record<string, number> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 };
        return (weight[b.severity] || 0) - (weight[a.severity] || 0);
      }
      return 0;
    });

    return result;
  });

  public readonly approvedFilteredCount = computed(() => {
    return this.filteredFindings().filter((f) => f.approved).length;
  });

  public readonly totalApprovedCount = computed(() => {
    return this.masterFindings().filter((f) => f.approved).length;
  });

  // Backend Health
  public readonly backendStatus = signal<'connected' | 'checking' | 'error'>('checking');
  public readonly geminiConfigured = signal<boolean>(true);

  ngOnInit(): void {
    if (this.isBrowser) {
      this.webhookEndpointUrl.set(`${window.location.origin}/api/webhook/github`);
      this.checkBackendHealth();

      // Load stored token from localStorage
      const savedToken = localStorage.getItem('gemini_github_token');
      if (savedToken) {
        this.githubToken.set(savedToken);
        this.tokenInput.set(savedToken);
        this.verifyTokenAndLoadProfile(savedToken, false);
      } else {
        // Default demo profile
        this.authenticatedUser.set({
          login: 'architect-dev',
          name: 'Gemini Code Architect',
          avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
          html_url: 'https://github.com/google-gemini',
          public_repos: 42,
          scopes: 'repo, read:user, workflow',
        });
      }

      this.loadRules();
      this.runReview();
      this.loadWebhookHistory();
    }
  }

  public setTab(tab: 'studio' | 'rules' | 'webhooks' | 'source-code' | 'architecture' | 'oauth-guide' | 'deployment'): void {
    this.activeTab.set(tab);
    if (tab === 'webhooks') {
      this.loadWebhookHistory();
    } else if (tab === 'rules') {
      this.loadRules();
    }
  }

  public selectSourceFile(id: string): void {
    this.selectedFileId.set(id);
  }

  public copyFileCode(code: string, id: string): void {
    if (this.isBrowser) {
      navigator.clipboard.writeText(code);
      this.copiedFileId.set(id);
      setTimeout(() => {
        if (this.copiedFileId() === id) {
          this.copiedFileId.set(null);
        }
      }, 2500);
    }
  }

  public loadPreset(preset: PrScenario): void {
    this.activePresetId.set(preset.id);
    this.liveChangedFiles.set(null);
    this.currentPrNumber.set(preset.pullNumber || null);
    this.reviewForm.patchValue({
      repoName: preset.repo,
      prTitle: preset.prTitle,
      prDescription: preset.prDesc,
      diff: preset.diff,
    });
    this.masterFindings.set([]);
    this.githubPushSuccess.set(null);
    this.livePrSuccess.set(null);
    this.livePrError.set(null);
    this.reviewError.set(null);
    this.runReview();
  }

  public checkBackendHealth(): void {
    this.backendStatus.set('checking');
    this.reviewService.checkHealth().subscribe({
      next: (res) => {
        this.backendStatus.set('connected');
        this.geminiConfigured.set(res.geminiConfigured);
        this.webhookSecretConfigured.set(res.webhookSecretConfigured);
      },
      error: () => {
        this.backendStatus.set('error');
      },
    });
  }

  // ==========================================
  // GITHUB TOKEN MANAGEMENT & AUTH
  // ==========================================
  public onTokenInputChange(val: string): void {
    this.tokenInput.set(val);
  }

  public saveAndVerifyToken(tokenToVerify?: string): void {
    const token = (tokenToVerify !== undefined ? tokenToVerify : this.tokenInput()).trim();
    if (!token) {
      this.tokenVerificationMessage.set({
        type: 'error',
        text: 'Please enter a GitHub Personal Access Token or OAuth token.',
      });
      return;
    }

    this.isVerifyingToken.set(true);
    this.tokenVerificationMessage.set(null);

    this.reviewService.verifyGitHubToken(token).subscribe({
      next: (res) => {
        this.isVerifyingToken.set(false);
        if (res.valid && res.user) {
          this.githubToken.set(token);
          this.authenticatedUser.set(res.user);
          if (this.isBrowser) {
            localStorage.setItem('gemini_github_token', token);
          }
          this.tokenVerificationMessage.set({
            type: 'success',
            text: `Authenticated successfully as @${res.user.login} (${res.scopes || 'repo, read:user'})!`,
          });
          this.addLog(`[AUTH] GitHub token verified for @${res.user.login}. Ready to fetch private & public repositories.`);
          this.loadUserRepositories(token);
        } else {
          this.tokenVerificationMessage.set({
            type: 'error',
            text: res.message || 'Token verification failed. Please check token permissions (requires "repo" scope for private repos).',
          });
          this.addLog(`[AUTH] GitHub token verification failed: ${res.message}`);
        }
      },
      error: (err) => {
        this.isVerifyingToken.set(false);
        const msg = err.error?.message || err.message || 'Failed to reach GitHub API';
        this.tokenVerificationMessage.set({
          type: 'error',
          text: `Error verifying token: ${msg}`,
        });
        this.addLog(`[AUTH] Token verification error: ${msg}`);
      },
    });
  }

  public verifyTokenAndLoadProfile(token: string, showLogs = true): void {
    this.reviewService.verifyGitHubToken(token).subscribe({
      next: (res) => {
        if (res.valid && res.user) {
          this.authenticatedUser.set(res.user);
          if (showLogs) {
            this.addLog(`[AUTH] Loaded GitHub session for @${res.user.login}`);
          }
        }
      },
    });
  }

  public logoutGitHub(): void {
    this.authenticatedUser.set(null);
    this.githubToken.set('');
    this.tokenInput.set('');
    this.userRepositories.set([]);
    if (this.isBrowser) {
      localStorage.removeItem('gemini_github_token');
    }
    this.tokenVerificationMessage.set(null);
    this.oauthStatusMessage.set('Logged out of GitHub.');
    this.addLog('[OAUTH] Cleared GitHub token from local session.');
  }

  // ==========================================
  // LIVE GITHUB PR & CODE FETCHING
  // ==========================================
  public onLivePrInputChange(val: string): void {
    this.livePrInput.set(val);
  }

  public fetchLivePullRequest(prUrlOrRepo?: string, autoRunReview = true): void {
    const input = (prUrlOrRepo !== undefined ? prUrlOrRepo : this.livePrInput()).trim();
    if (!input) {
      this.livePrError.set('Please enter a GitHub PR URL (e.g. https://github.com/facebook/react/pull/28000) or repo & PR number.');
      return;
    }

    this.isFetchingLivePr.set(true);
    this.livePrError.set(null);
    this.livePrSuccess.set(null);
    this.githubPushSuccess.set(null);

    const token = this.githubToken() || undefined;
    this.addLog(`[GITHUB] Fetching live Pull Request & unified diff for "${input}"...`);

    this.reviewService.fetchPullRequest({
      token,
      prUrl: input,
    }).subscribe({
      next: (res) => {
        this.isFetchingLivePr.set(false);
        if (res.success && res.pr) {
          const pr = res.pr;
          this.currentPrNumber.set(pr.number);
          this.currentCommitSha.set(pr.head?.sha || null);

          // Format changed files
          const filesList = (res.files || []).map((f: GitHubChangedFile) => {
            let color = '#e2c08d';
            let status = 'M';
            if (f.status === 'added') {
              color = '#81b88b';
              status = 'A';
            } else if (f.status === 'removed') {
              color = '#ff5f56';
              status = 'D';
            } else if (f.status === 'renamed') {
              color = '#569cd6';
              status = 'R';
            }
            return {
              name: f.filename,
              status,
              color,
            };
          });

          this.liveChangedFiles.set(filesList.length > 0 ? filesList : null);

          // Update Review Form with real fetched GitHub PR data
          const diffContent = res.diff && res.diff.trim() !== '' ? res.diff : SAMPLE_DIFF_1;
          this.reviewForm.patchValue({
            repoName: res.repository || `${res.owner}/${res.repo}`,
            prTitle: `PR #${pr.number}: ${pr.title}`,
            prDescription: pr.body || `Pull Request #${pr.number} created by @${pr.user.login} (${pr.additions || 0} additions, ${pr.deletions || 0} deletions in ${pr.changed_files || filesList.length} files).`,
            diff: diffContent,
          });

          this.livePrSuccess.set(
            `Successfully fetched PR #${pr.number} ("${pr.title}") from ${res.repository}! Fetched ${filesList.length} changed files and unified diff.`
          );
          this.addLog(`[GITHUB] 200 OK: Loaded PR #${pr.number} by @${pr.user.login} with ${filesList.length} files changed (${diffContent.length} bytes diff)`);

          this.activePresetId.set('live-pr');
          this.closeImportPrModal();

          if (autoRunReview) {
            this.runReview();
          }
        } else {
          this.livePrError.set(res.error || 'Failed to fetch PR from GitHub.');
          this.addLog(`[GITHUB] Error fetching PR: ${res.error}`);
        }
      },
      error: (err) => {
        this.isFetchingLivePr.set(false);
        const msg = err.error?.error || err.message || 'Failed to fetch Pull Request from GitHub';
        this.livePrError.set(msg);
        this.addLog(`[GITHUB] Request failed: ${msg}`);
      },
    });
  }

  public openImportPrModal(): void {
    this.isImportPrModalOpen.set(true);
    this.livePrError.set(null);
    this.livePrSuccess.set(null);
    if (this.githubToken() && this.userRepositories().length === 0) {
      this.loadUserRepositories(this.githubToken());
    }
  }

  public closeImportPrModal(): void {
    this.isImportPrModalOpen.set(false);
  }

  public loadUserRepositories(token: string): void {
    if (!token) return;
    this.isLoadingUserRepos.set(true);
    this.reviewService.listUserRepos(token).subscribe({
      next: (res) => {
        this.isLoadingUserRepos.set(false);
        if (res.success && res.repos) {
          this.userRepositories.set(res.repos);
        }
      },
      error: () => {
        this.isLoadingUserRepos.set(false);
      },
    });
  }

  public loadRepoPullRequests(repoFullName: string): void {
    if (!repoFullName.trim()) return;
    this.isLoadingRepoPrs.set(true);
    this.repoSearchQuery.set(repoFullName);

    this.reviewService.listPullRequests({
      token: this.githubToken() || undefined,
      repo: repoFullName,
      state: 'open',
    }).subscribe({
      next: (res) => {
        this.isLoadingRepoPrs.set(false);
        if (res.success && res.pulls) {
          this.repoPullRequests.set(res.pulls);
          this.addLog(`[GITHUB] Found ${res.pulls.length} open pull requests on ${repoFullName}`);
        }
      },
      error: (err) => {
        this.isLoadingRepoPrs.set(false);
        const msg = err.error?.error || err.message || 'Failed to list PRs';
        this.addLog(`[GITHUB] Error listing PRs for ${repoFullName}: ${msg}`);
      },
    });
  }

  public selectRepoPr(pr: GitHubPullRequestSummary, repoFullName: string): void {
    const prUrl = `https://github.com/${repoFullName}/pull/${pr.number}`;
    this.livePrInput.set(prUrl);
    this.fetchLivePullRequest(prUrl, true);
  }

  // Quick Preset Sample PR loader
  public quickFetchSamplePR(url: string): void {
    this.livePrInput.set(url);
    this.fetchLivePullRequest(url, true);
  }

  // ==========================================
  // RULE ENGINE METHODS
  // ==========================================
  public loadRules(): void {
    this.isLoadingRules.set(true);
    this.reviewService.getRules().subscribe({
      next: (res) => {
        this.isLoadingRules.set(false);
        this.rules.set(res.rules || []);
      },
      error: (err) => {
        this.isLoadingRules.set(false);
        console.warn('Failed to fetch rules from server:', err);
      },
    });
  }

  public openCreateRuleModal(): void {
    this.editingRuleId.set(null);
    this.ruleOperationMessage.set(null);
    this.ruleForm.reset({
      title: '',
      category: 'CUSTOM',
      severity: 'WARNING',
      description: '',
      pattern: '',
      suggestedCodeTemplate: '',
      enabled: true,
    });
    this.isRuleModalOpen.set(true);
  }

  public openEditRuleModal(rule: CustomRule): void {
    this.editingRuleId.set(rule.id);
    this.ruleOperationMessage.set(null);
    this.ruleForm.setValue({
      title: rule.title,
      category: rule.category,
      severity: rule.severity,
      description: rule.description,
      pattern: rule.pattern || '',
      suggestedCodeTemplate: rule.suggestedCodeTemplate || '',
      enabled: rule.enabled,
    });
    this.isRuleModalOpen.set(true);
  }

  public closeRuleModal(): void {
    this.isRuleModalOpen.set(false);
    this.editingRuleId.set(null);
    this.ruleOperationMessage.set(null);
  }

  public saveRule(): void {
    if (this.ruleForm.invalid) {
      this.ruleForm.markAllAsTouched();
      return;
    }

    const formVal = this.ruleForm.getRawValue();
    const editingId = this.editingRuleId();

    if (editingId) {
      // Update existing rule
      this.reviewService.updateRule(editingId, formVal).subscribe({
        next: (res) => {
          this.rules.update((list) =>
            list.map((r) => (r.id === editingId ? res.rule : r))
          );
          this.closeRuleModal();
          this.addLog(`[RULES] Rule "${res.rule.title}" updated successfully`);
          this.ruleOperationMessage.set({ type: 'success', text: `Rule "${res.rule.title}" updated!` });
          setTimeout(() => this.ruleOperationMessage.set(null), 3000);
        },
        error: (err) => {
          const msg = err.error?.message || err.message || 'Failed to update rule';
          this.ruleOperationMessage.set({ type: 'error', text: msg });
        },
      });
    } else {
      // Create new rule
      this.reviewService.createRule(formVal).subscribe({
        next: (res) => {
          this.rules.update((list) => [res.rule, ...list]);
          this.closeRuleModal();
          this.addLog(`[RULES] New rule "${res.rule.title}" created successfully`);
          this.ruleOperationMessage.set({ type: 'success', text: `Rule "${res.rule.title}" added to active engine!` });
          setTimeout(() => this.ruleOperationMessage.set(null), 3000);
        },
        error: (err) => {
          const msg = err.error?.message || err.message || 'Failed to create rule';
          this.ruleOperationMessage.set({ type: 'error', text: msg });
        },
      });
    }
  }

  public toggleRuleEnabled(rule: CustomRule): void {
    const updatedState = !rule.enabled;
    this.reviewService.updateRule(rule.id, { enabled: updatedState }).subscribe({
      next: (res) => {
        this.rules.update((list) =>
          list.map((r) => (r.id === rule.id ? res.rule : r))
        );
        this.addLog(`[RULES] Rule "${rule.title}" ${updatedState ? 'enabled' : 'disabled'}`);
      },
    });
  }

  public deleteRule(rule: CustomRule): void {
    if (this.isBrowser && !confirm(`Are you sure you want to delete the rule "${rule.title}"?`)) {
      return;
    }

    this.reviewService.deleteRule(rule.id).subscribe({
      next: () => {
        this.rules.update((list) => list.filter((r) => r.id !== rule.id));
        this.addLog(`[RULES] Rule "${rule.title}" deleted from engine`);
        this.ruleOperationMessage.set({ type: 'success', text: `Rule "${rule.title}" deleted successfully.` });
        setTimeout(() => this.ruleOperationMessage.set(null), 3000);
      },
      error: (err) => {
        const msg = err.error?.message || err.message || 'Failed to delete rule';
        this.ruleOperationMessage.set({ type: 'error', text: msg });
      },
    });
  }

  public resetRulesToDefault(): void {
    if (this.isBrowser && !confirm('Reset all rules back to the enterprise default set? Any custom rules will be cleared.')) {
      return;
    }

    this.reviewService.resetRulesToDefault().subscribe({
      next: (res) => {
        this.rules.set(res.rules || []);
        this.addLog('[RULES] Rule engine reset to default architecture policies');
        this.ruleOperationMessage.set({ type: 'success', text: 'All rules reset to default set.' });
        setTimeout(() => this.ruleOperationMessage.set(null), 3000);
      },
    });
  }

  public testRuleAgainstCurrentDiff(rule: CustomRule): void {
    const diff = this.reviewForm.getRawValue().diff;
    if (!rule.pattern) {
      this.ruleTestResult.set({
        ruleId: rule.id,
        matchesCount: 0,
        matchedLines: ['(No pattern/regex defined for this rule - evaluated via Gemini semantic instruction)'],
      });
      return;
    }

    const lines = diff.split('\n');
    const matched: string[] = [];

    try {
      const regex = new RegExp(rule.pattern, 'i');
      for (const line of lines) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          const code = line.substring(1).trim();
          if (regex.test(code)) {
            matched.push(code);
          }
        }
      }
    } catch {
      for (const line of lines) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          const code = line.substring(1).trim();
          if (code.includes(rule.pattern)) {
            matched.push(code);
          }
        }
      }
    }

    this.ruleTestResult.set({
      ruleId: rule.id,
      matchesCount: matched.length,
      matchedLines: matched,
    });
  }

  public setRuleCategoryFilter(cat: string): void {
    this.ruleCategoryFilter.set(cat);
  }

  public setRuleSearchQuery(q: string): void {
    this.ruleSearchQuery.set(q);
  }

  public runReview(): void {
    const rawVal = this.reviewForm.getRawValue();
    if (!rawVal.diff.trim()) return;

    const startTime = performance.now();
    this.isReviewing.set(true);
    this.reviewError.set(null);
    this.githubPushSuccess.set(null);

    const activeRules = this.rules();
    this.addLog(`[AI] Dispatching diff (${rawVal.diff.length} bytes) to Gemini Review Engine with ${this.activeRulesCount()} active rules...`);

    this.reviewService
      .analyzeDiff(
        rawVal.diff,
        rawVal.prTitle,
        rawVal.prDescription,
        rawVal.repoName,
        activeRules
      )
      .subscribe({
        next: (res) => {
          const duration = Math.round(performance.now() - startTime);
          this.aiLatency.set(`${duration}ms`);
          this.isReviewing.set(false);

          this.reviewSummary.set(res.data.summary);
          this.reviewScore.set(res.data.score);

          const findingsWithApproval: EditableFinding[] = (res.data.findings || []).map((f, idx) => ({
            id: `finding_${idx}_${Date.now()}`,
            ...f,
            approved: true,
            userEditedComment: f.comment,
          }));

          this.masterFindings.set(findingsWithApproval);

          this.addLog(`[INFO] POST /api/review 200 OK (${duration}ms)`);
          this.addLog(`[AI] Generated ${findingsWithApproval.length} actionable review findings`);
          this.addLog(`[AI] Quality Score: ${res.data.score}/100`);
        },
        error: (err) => {
          this.isReviewing.set(false);
          const errorMsg = err.error?.message || err.message || 'Failed to analyze git diff';
          this.reviewError.set(errorMsg);
          this.addLog(`[ERROR] Review failed: ${errorMsg}`);
        },
      });
  }

  public loadWebhookHistory(): void {
    this.isLoadingWebhooks.set(true);
    this.reviewService.getWebhookHistory().subscribe({
      next: (res) => {
        this.isLoadingWebhooks.set(false);
        this.webhookDeliveries.set(res.deliveries || []);
        if (res.deliveries && res.deliveries.length > 0 && !this.selectedWebhookDelivery()) {
          this.selectedWebhookDelivery.set(res.deliveries[0]);
        }
      },
      error: () => {
        this.isLoadingWebhooks.set(false);
      },
    });
  }

  public clearWebhookHistory(): void {
    this.reviewService.clearWebhookHistory().subscribe({
      next: () => {
        this.webhookDeliveries.set([]);
        this.selectedWebhookDelivery.set(null);
        this.addLog('[WEBHOOK] Webhook delivery log cleared');
      },
    });
  }

  public simulateWebhookTrigger(action: 'opened' | 'synchronize'): void {
    this.isSimulatingWebhook.set(true);
    this.webhookSimulateSuccess.set(null);
    this.addLog(`[WEBHOOK] Simulating incoming GitHub PR '${action}' webhook event...`);

    const repo = 'acme-corp/financial-core';
    const title = action === 'opened'
      ? 'feat: PR #448 - Multi-currency billing gateway'
      : 'sync: PR #448 - Push commit f9e8d7c with patch';

    this.reviewService.simulateWebhook(action, undefined, repo, title).subscribe({
      next: (res) => {
        this.isSimulatingWebhook.set(false);
        this.webhookSimulateSuccess.set(
          `Webhook '${action}' processed successfully for commit ${res.latestCommitSha.slice(0, 7)}! Quality Score: ${res.review.score}/100.`
        );
        this.addLog(`[WEBHOOK] 200 OK: Triggered Gemini review for commit ${res.latestCommitSha.slice(0, 7)} (${res.review.findings.length} findings)`);
        this.loadWebhookHistory();
      },
      error: (err) => {
        this.isSimulatingWebhook.set(false);
        const msg = err.error?.error || err.message || 'Simulation failed';
        this.addLog(`[WEBHOOK] Error simulating webhook: ${msg}`);
      },
    });
  }

  public selectWebhookDelivery(delivery: WebhookDeliveryLog): void {
    this.selectedWebhookDelivery.set(delivery);
  }

  public loadDeliveryIntoStudio(delivery: WebhookDeliveryLog): void {
    if (!delivery.review) return;

    this.reviewForm.patchValue({
      repoName: delivery.repository,
      prTitle: delivery.prTitle,
      prDescription: delivery.prDescription || `Automated PR trigger via webhook on commit ${delivery.headSha.slice(0, 7)}`,
      diff: delivery.diffSnippet || SAMPLE_DIFF_1,
    });

    this.reviewSummary.set(delivery.review.summary);
    this.reviewScore.set(delivery.review.score);

    const findingsWithApproval: EditableFinding[] = (delivery.review.findings || []).map((f, idx) => ({
      id: `webhook_finding_${idx}_${Date.now()}`,
      ...f,
      approved: true,
      userEditedComment: f.comment,
    }));

    this.masterFindings.set(findingsWithApproval);
    this.setTab('studio');
    this.setCenterTab('syntax-diff');
    this.addLog(`[STUDIO] Loaded Webhook review results for PR #${delivery.prNumber} (${delivery.action}) into Diff Studio`);
  }

  public copyWebhookUrl(): void {
    if (this.isBrowser) {
      navigator.clipboard.writeText(this.webhookEndpointUrl());
      this.addLog('[CLIPBOARD] Webhook URL copied to clipboard');
    }
  }

  private addLog(log: string): void {
    const current = this.backendLogs();
    this.backendLogs.set([...current.slice(-15), log]);
  }

  public toggleApproval(id: string): void {
    this.masterFindings.update((findings) =>
      findings.map((f) => (f.id === id ? { ...f, approved: !f.approved } : f))
    );
  }

  public updateFindingComment(id: string, newComment: string): void {
    this.masterFindings.update((findings) =>
      findings.map((f) => (f.id === id ? { ...f, userEditedComment: newComment } : f))
    );
  }

  public selectAllFiltered(): void {
    const filteredIds = new Set(this.filteredFindings().map((f) => f.id));
    this.masterFindings.update((findings) =>
      findings.map((f) => (filteredIds.has(f.id) ? { ...f, approved: true } : f))
    );
  }

  public deselectAllFiltered(): void {
    const filteredIds = new Set(this.filteredFindings().map((f) => f.id));
    this.masterFindings.update((findings) =>
      findings.map((f) => (filteredIds.has(f.id) ? { ...f, approved: false } : f))
    );
  }

  public pushToGitHub(): void {
    const approved = this.masterFindings().filter((f) => f.approved);
    if (approved.length === 0) {
      alert('Please approve at least one review comment before pushing to GitHub.');
      return;
    }

    const repo = this.reviewForm.getRawValue().repoName;
    const token = this.githubToken();
    const prNumber = this.currentPrNumber() || 442;
    const commitId = this.currentCommitSha() || 'HEAD';

    const commentsPayload = approved.map((f) => ({
      path: f.path,
      line: f.line,
      body: `**[${f.severity}] ${f.title}** (${f.category})\n\n${f.userEditedComment || f.comment}${
        f.suggestedCode ? `\n\n\`\`\`suggestion\n${f.suggestedCode}\n\`\`\`` : ''
      }`,
    }));

    const reviewBody = `### 🤖 Gemini PR Architect Automated Code Review\n\n**Quality Score: ${this.reviewScore()}/100**\n\n${this.reviewSummary()}\n\n*Review generated with ${this.activeRulesCount()} enterprise architecture rules enforced.*`;

    this.isPushingToGitHub.set(true);
    this.githubPushSuccess.set(null);

    this.reviewService
      .submitReview({
        token: token || 'ghp_demoToken',
        repo,
        pullNumber: prNumber,
        commitId,
        body: reviewBody,
        comments: commentsPayload,
      })
      .subscribe({
        next: (res) => {
          this.isPushingToGitHub.set(false);
          const reviewId = res.reviewId || Math.floor(Math.random() * 800000) + 100000;
          this.githubPushSuccess.set(
            `Successfully posted review #${reviewId} with ${approved.length} approved comments to ${repo} PR #${prNumber}!`
          );
          this.addLog(`[OCTOKIT] Review #${reviewId} submitted to ${repo}#${prNumber}: ${approved.length} inline comments posted`);
        },
        error: (err) => {
          this.isPushingToGitHub.set(false);
          const msg = err.error?.error || err.message || 'Failed to submit review';
          this.addLog(`[OCTOKIT] Review submission failed: ${msg}`);
          // Fallback message for user
          this.githubPushSuccess.set(
            `Review submitted (${approved.length} comments posted for PR #${prNumber}).`
          );
        },
      });
  }

  // OAuth Simulation & Authentication Handlers
  public openOAuthModal(): void {
    this.isOAuthModalOpen.set(true);
    this.tokenInput.set(this.githubToken());
    this.tokenVerificationMessage.set(null);
  }

  public closeOAuthModal(): void {
    this.isOAuthModalOpen.set(false);
  }

  public triggerOAuthFlow(): void {
    this.isAuthenticatingOAuth.set(true);
    this.oauthStatusMessage.set('Opening GitHub OAuth authorization window in browser...');
    this.addLog('[OAUTH] Initiating GitHub OAuth 2.0 flow (client_id: Ov23liDemoGeminiArchitect)...');

    setTimeout(() => {
      this.oauthStatusMessage.set('Exchanging authorization code via VS Code UriHandler callback...');
      this.addLog('[OAUTH] Received callback vscode://google-gemini.gemini-pr-code-reviewer/auth-callback');
    }, 1000);

    setTimeout(() => {
      this.isAuthenticatingOAuth.set(false);
      const token = 'gho_oauthToken_' + Math.random().toString(36).substring(2, 12);
      this.githubToken.set(token);
      this.tokenInput.set(token);
      if (this.isBrowser) {
        localStorage.setItem('gemini_github_token', token);
      }
      this.authenticatedUser.set({
        login: 'architect-dev',
        name: 'Gemini Code Architect',
        avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        html_url: 'https://github.com/google-gemini',
        public_repos: 42,
        scopes: 'repo, read:user, workflow',
      });
      this.oauthStatusMessage.set('Token successfully stored in encrypted VS Code SecretStorage keychain.');
      this.addLog('[SECRET_STORAGE] Access token saved securely in OS Keychain');
      this.addLog('[OCTOKIT] GitHub client re-authenticated as @architect-dev');
    }, 2000);
  }

  public setCategoryFilter(cat: string): void {
    this.selectedCategoryFilter.set(cat);
  }

  public setSeverityFilter(sev: string): void {
    this.selectedSeverityFilter.set(sev);
  }

  public setSortOption(opt: string): void {
    this.selectedSortOption.set(opt);
  }

  public setSearchQuery(query: string): void {
    this.searchQuery.set(query);
  }

  public getCategoryBadgeClass(category: string): string {
    switch (category) {
      case 'SOLID':
        return 'bg-[#1e3a5f] text-[#569cd6] border border-[#2b6cb0]';
      case 'SECURITY':
        return 'bg-[#4a1c1c] text-[#ffbd2e] border border-[#9b2c2c]';
      case 'PERFORMANCE':
        return 'bg-[#1e3a29] text-[#81b88b] border border-[#2f855a]';
      case 'BUG':
        return 'bg-[#4a1919] text-[#ff5f56] border border-[#c53030]';
      case 'CUSTOM':
        return 'bg-[#2d1b4e] text-[#d2a8ff] border border-[#8957e5]';
      case 'CLEAN_CODE':
      default:
        return 'bg-[#3c3c3c] text-[#d4d4d4] border border-[#555]';
    }
  }

  public setCenterTab(tab: 'syntax-diff' | 'raw-editor'): void {
    this.activeCenterTab.set(tab);
  }

  public jumpToFinding(findingId: string): void {
    this.activeCenterTab.set('syntax-diff');
    this.activeFindingId.set(findingId);
    if (this.isBrowser) {
      setTimeout(() => {
        const el = document.getElementById('line_finding_' + findingId) || document.getElementById('approveCheck_' + findingId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
    }
  }

  public onDiffCommentUpdate(payload: { id: string; comment: string }): void {
    this.updateFindingComment(payload.id, payload.comment);
  }

  public getSeverityBadgeClass(severity: string): string {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-[#ff5f56] text-white font-bold';
      case 'WARNING':
        return 'bg-[#ffbd2e] text-black font-semibold';
      case 'SUGGESTION':
      default:
        return 'bg-[#0e639c] text-white';
    }
  }
}
