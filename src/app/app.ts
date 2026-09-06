import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ReviewService } from './services/review.service';
import { DiffViewer } from './components/diff-viewer';
import { DiffFindingRef } from './utils/diff-parser';
import {
  ReviewFinding,
  CustomRule,
  SourceFileDoc,
  GitHubUserProfile,
  WebhookDeliveryLog,
  GitHubPullRequestSummary,
  GitHubChangedFile,
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

function getPresetPrSummary(presetId: string): GitHubPullRequestSummary {
  if (presetId === 'n-plus-one') {
    return {
      number: 441,
      title: 'feat(orders): Implement order summary aggregator endpoint',
      body: 'Fetches recent customer orders with live pricing data and resolves N+1 query latency.',
      state: 'open',
      html_url: 'https://github.com/ecommerce/order-processing-engine/pull/441',
      user: {
        login: 'sarah-backend',
        avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100',
      },
      head: {
        sha: '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
        ref: 'fix/n-plus-one-orders',
        label: 'ecommerce:fix/n-plus-one-orders',
      },
      base: {
        sha: '2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c',
        ref: 'main',
        label: 'ecommerce:main',
      },
      created_at: new Date(Date.now() - 5 * 3600000).toISOString(),
      updated_at: new Date(Date.now() - 3600000).toISOString(),
      additions: 64,
      deletions: 19,
      changed_files: 3,
      labels: [
        { id: 3, name: 'performance', color: 'd73a4a', description: 'Performance optimization' },
        { id: 4, name: 'database', color: '0075ca', description: 'Database query tuning' },
      ],
      milestone: {
        id: 2,
        number: 2,
        title: 'v1.8 Database Optimization',
        state: 'open',
      },
    };
  }

  return {
    number: 442,
    title: 'feat(auth): Implement user onboarding and notification routine',
    body: 'Handles registration, database inserts, and email dispatch.',
    state: 'open',
    html_url: 'https://github.com/google-gemini/architect-ai/pull/442',
    user: {
      login: 'alex-architect',
      avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
    },
    head: {
      sha: '9f8a2c4e1b3d5f7a9c2e4b6d8a0f1c3e5a7b9d1f',
      ref: 'feature/mvc-auth-service',
      label: 'google-gemini:feature/mvc-auth-service',
    },
    base: {
      sha: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
      ref: 'main',
      label: 'google-gemini:main',
    },
    created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    updated_at: new Date(Date.now() - 1800000).toISOString(),
    additions: 148,
    deletions: 32,
    changed_files: 3,
    labels: [
      { id: 1, name: 'architecture', color: '8957e5', description: 'Architectural changes' },
      { id: 2, name: 'needs-review', color: '007acc', description: 'Requires architect review' },
    ],
    milestone: {
      id: 1,
      number: 1,
      title: 'v2.4 Core Platform Release',
      state: 'open',
    },
  };
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, DiffViewer, DragDropModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
  host: {
    '(window:keydown)': 'handleGlobalKeydown($event)',
    '(window:resize)': 'handleWindowResize()',
  },
})
export class App implements OnInit {
  private readonly reviewService = inject(ReviewService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  // Responsive & Collapsible Panels State
  public readonly isSidebarOpen = signal<boolean>(true);
  public readonly isSourceTreeOpen = signal<boolean>(true);
  public readonly isMobileMenuOpen = signal<boolean>(false);
  public readonly isMobileScreen = signal<boolean>(false);
  public readonly isFindingsPanelOpen = signal<boolean>(true);

  // Universal Hamburger Menu
  public readonly isHamburgerMenuOpen = signal<boolean>(false);

  // Component Expand / Collapse State (Accordion Engine for clean decluttering)
  public readonly isLivePrBarCollapsed = signal<boolean>(false);
  public readonly isPrSummaryCardCollapsed = signal<boolean>(false);
  public readonly isSecurityCardCollapsed = signal<boolean>(false);
  public readonly isPrDetailsCollapsed = signal<boolean>(true); // default collapsed to minimize visual clutter
  public readonly isDiffViewerCollapsed = signal<boolean>(false);
  public readonly isReviewSummaryCollapsed = signal<boolean>(false);
  public readonly isFindingsToolbarCollapsed = signal<boolean>(false);
  public readonly collapsedFindingIds = signal<Set<string>>(new Set());

  // Sub-modules Expand / Collapse State
  public readonly isRuleFormCollapsed = signal<boolean>(true); // default collapsed
  public readonly isRepoExplorerFiltersCollapsed = signal<boolean>(false);

  // Tabs: 'studio' | 'repo-explorer' | 'rules' | 'security-scans' | 'webhooks' | 'source-code' | 'architecture' | 'oauth-guide' | 'deployment'
  public readonly activeTab = signal<'studio' | 'repo-explorer' | 'rules' | 'security-scans' | 'webhooks' | 'source-code' | 'architecture' | 'oauth-guide' | 'deployment'>('studio');

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

  // Current PR metadata and stats from GitHub API
  public readonly currentPrDetails = signal<GitHubPullRequestSummary | null>(getPresetPrSummary('god-class'));
  public readonly currentPrNumber = signal<number | null>(null);
  public readonly currentCommitSha = signal<string | null>(null);

  // ==========================================
  // REPOSITORY EXPLORER (ORGANIZATIONAL & PR FILTERS) STATE
  // ==========================================
  public readonly orgInput = signal<string>('angular');
  public readonly currentOrg = signal<string>('angular');
  public readonly orgRepositories = signal<GitHubRepositoryItem[]>([]);
  public readonly isLoadingOrgRepos = signal<boolean>(false);
  public readonly orgReposError = signal<string | null>(null);
  public readonly selectedOrgRepo = signal<GitHubRepositoryItem | null>(null);
  public readonly userOrgs = signal<GitHubOrg[]>([]);
  public readonly isLoadingUserOrgs = signal<boolean>(false);
  public readonly repoLanguageFilter = signal<string>('ALL');
  public readonly repoSearchFilter = signal<string>('');
  public readonly popularOrgs: string[] = ['angular', 'google', 'facebook', 'vercel', 'microsoft'];

  // PR Filters within Selected Repo
  public readonly repoLabels = signal<GitHubLabel[]>([]);
  public readonly isLoadingRepoLabels = signal<boolean>(false);
  public readonly selectedLabelFilter = signal<string>('ALL');
  public readonly repoMilestones = signal<GitHubMilestone[]>([]);
  public readonly isLoadingRepoMilestones = signal<boolean>(false);
  public readonly selectedMilestoneFilter = signal<string>('ALL');
  public readonly selectedPrStateFilter = signal<'open' | 'closed' | 'all'>('open');
  public readonly prSearchFilter = signal<string>('');
  public readonly filteredPullRequests = signal<GitHubPullRequestSummary[]>([]);
  public readonly isLoadingFilteredPrs = signal<boolean>(false);
  public readonly filteredPrsError = signal<string | null>(null);

  public readonly availableLanguages = computed(() => {
    const repos = this.orgRepositories();
    const set = new Set<string>();
    for (const r of repos) {
      if (r.language) set.add(r.language);
    }
    return Array.from(set).sort();
  });

  public readonly filteredOrgRepositories = computed(() => {
    const repos = this.orgRepositories();
    const lang = this.repoLanguageFilter();
    const q = this.repoSearchFilter().toLowerCase().trim();

    return repos.filter((r) => {
      if (lang !== 'ALL' && r.language !== lang) return false;
      if (q) {
        const matchName = r.name.toLowerCase().includes(q);
        const matchDesc = (r.description || '').toLowerCase().includes(q);
        const matchTopic = (r.topics || []).some((t) => t.toLowerCase().includes(q));
        if (!matchName && !matchDesc && !matchTopic) return false;
      }
      return true;
    });
  });

  public readonly displayedPullRequests = computed(() => {
    const pulls = this.filteredPullRequests();
    const q = this.prSearchFilter().toLowerCase().trim();
    if (!q) return pulls;
    return pulls.filter((pr) => {
      const matchTitle = pr.title.toLowerCase().includes(q);
      const matchNum = String(pr.number).includes(q);
      const matchAuthor = pr.user?.login?.toLowerCase().includes(q);
      const matchBranch = (pr.head?.ref || '').toLowerCase().includes(q);
      return matchTitle || matchNum || matchAuthor || matchBranch;
    });
  });

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

  // Live PR Quick Token Input State
  public readonly quickTokenInput = signal<string>('');

  public setQuickTokenInput(val: string): void {
    this.quickTokenInput.set(val);
  }

  public quickSaveTokenAndRetry(customToken?: string): void {
    const token = (customToken !== undefined ? customToken : this.quickTokenInput()).trim();
    if (!token) return;

    this.githubToken.set(token);
    this.tokenInput.set(token);
    if (this.isBrowser) {
      localStorage.setItem('gemini_github_token', token);
    }
    this.addLog(`[AUTH] Saved GitHub Personal Access Token. Retrying PR fetch...`);
    this.verifyTokenAndLoadProfile(token, true);
    this.fetchLivePullRequest(this.livePrInput(), true);
  }

  // Auto-Save State & Persistence
  public readonly lastAutoSavedTime = signal<string | null>(null);
  public readonly autoSaveEnabled = signal<boolean>(true);
  public readonly hasSavedSession = signal<boolean>(false);

  // Master Review Findings & State
  public readonly isReviewing = signal<boolean>(false);
  public readonly masterFindings = signal<EditableFinding[]>([]);
  public readonly reviewSummary = signal<string>('');
  public readonly reviewScore = signal<number>(0);
  public readonly reviewError = signal<string | null>(null);
  public readonly githubPushSuccess = signal<string | null>(null);
  public readonly isPushingToGitHub = signal<boolean>(false);

  // ==========================================
  // COVERITY STREAMS & DEFECTS STATE
  // ==========================================
  public readonly coverityStreams = signal<CoverityStream[]>([]);
  public readonly selectedCoverityStreamId = signal<string>('ecommerce-checkout-stream');
  public readonly selectedCoverityStream = computed(() => {
    const list = this.coverityStreams();
    const id = this.selectedCoverityStreamId();
    return list.find((s) => s.id === id) || (list.length > 0 ? list[0] : null);
  });
  public readonly selectedCoverityDefect = signal<CoverityDefect | null>(null);
  public readonly coverityImpactFilter = signal<string>('ALL');
  public readonly coveritySearchQuery = signal<string>('');
  public readonly isLoadingCoverity = signal<boolean>(false);
  public readonly isImportCoverityModalOpen = signal<boolean>(false);
  public readonly coverityImportJson = signal<string>('');
  public readonly coverityImportError = signal<string | null>(null);

  public readonly filteredCoverityDefects = computed(() => {
    const stream = this.selectedCoverityStream();
    if (!stream) return [];
    const impact = this.coverityImpactFilter();
    const q = this.coveritySearchQuery().toLowerCase().trim();

    return stream.defects.filter((d) => {
      if (impact !== 'ALL' && d.impact !== impact) return false;
      if (q) {
        const matchChecker = d.checker.toLowerCase().includes(q);
        const matchDesc = d.description.toLowerCase().includes(q);
        const matchFile = d.file.toLowerCase().includes(q);
        const matchCid = String(d.cid).includes(q);
        const matchCwe = (d.cwe || '').toLowerCase().includes(q);
        if (!matchChecker && !matchDesc && !matchFile && !matchCid && !matchCwe) return false;
      }
      return true;
    });
  });

  // ==========================================
  // APPSCAN REPORTS & FINDINGS STATE
  // ==========================================
  public readonly appScanReports = signal<AppScanReport[]>([]);
  public readonly selectedAppScanReportId = signal<string>('appscan-sast-core-audit');
  public readonly selectedAppScanReport = computed(() => {
    const list = this.appScanReports();
    const id = this.selectedAppScanReportId();
    return list.find((r) => r.id === id) || (list.length > 0 ? list[0] : null);
  });
  public readonly selectedAppScanFinding = signal<AppScanFinding | null>(null);
  public readonly appScanSeverityFilter = signal<string>('ALL');
  public readonly appScanTypeFilter = signal<string>('ALL');
  public readonly appScanSearchQuery = signal<string>('');
  public readonly isLoadingAppScan = signal<boolean>(false);
  public readonly isImportAppScanModalOpen = signal<boolean>(false);
  public readonly appScanImportContent = signal<string>('');
  public readonly appScanImportError = signal<string | null>(null);

  public readonly filteredAppScanFindings = computed(() => {
    const report = this.selectedAppScanReport();
    if (!report) return [];
    const sev = this.appScanSeverityFilter();
    const typ = this.appScanTypeFilter();
    const q = this.appScanSearchQuery().toLowerCase().trim();

    return report.findings.filter((f) => {
      if (sev !== 'ALL' && f.severity !== sev) return false;
      if (typ !== 'ALL' && f.scannerType !== typ) return false;
      if (q) {
        const matchType = f.issueType.toLowerCase().includes(q);
        const matchCwe = f.cwe.toLowerCase().includes(q);
        const matchFile = f.fileOrUrl.toLowerCase().includes(q);
        const matchThreat = f.threatVector.toLowerCase().includes(q);
        if (!matchType && !matchCwe && !matchFile && !matchThreat) return false;
      }
      return true;
    });
  });

  // ==========================================
  // SECURITY SCANS SUB-TAB & REMEDIATION STATE
  // ==========================================
  public readonly activeSecuritySubTab = signal<'coverity' | 'appscan' | 'remediation'>('coverity');
  public readonly isGeneratingSecurityFix = signal<boolean>(false);
  public readonly activeSecurityFixResult = signal<SecurityFixResponse | null>(null);
  public readonly appliedFixesCount = signal<number>(0);

  constructor() {
    // Auto-save effect: Whenever masterFindings or reviewForm values change, persist to localStorage
    effect(() => {
      const findings = this.masterFindings();
      const formVal = this.reviewForm.value;
      const summary = this.reviewSummary();
      const score = this.reviewScore();
      const presetId = this.activePresetId();
      const prNum = this.currentPrNumber();
      const enabled = this.autoSaveEnabled();

      if (this.isBrowser && enabled && findings.length > 0) {
        try {
          const now = new Date();
          const timeFormatted = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const sessionData = {
            version: 1,
            timestamp: now.toISOString(),
            timeFormatted,
            presetId,
            prNumber: prNum,
            summary,
            score,
            form: {
              repoName: formVal.repoName,
              prTitle: formVal.prTitle,
              prDescription: formVal.prDescription,
              diff: formVal.diff,
            },
            findings,
          };
          localStorage.setItem('gemini_review_autosave_session', JSON.stringify(sessionData));
          this.lastAutoSavedTime.set(timeFormatted);
          this.hasSavedSession.set(true);
        } catch (err) {
          console.warn('Failed to auto-save review session to localStorage', err);
        }
      }
    });
  }

  // Review Finding Modal & Operations State
  public readonly isFindingModalOpen = signal<boolean>(false);
  public readonly editingFindingId = signal<string | null>(null);
  public readonly findingOperationMessage = signal<{ type: 'success' | 'info'; text: string } | null>(null);

  public readonly findingForm = new FormGroup({
    path: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    line: new FormControl(1, { nonNullable: true, validators: [Validators.required, Validators.min(1)] }),
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    category: new FormControl<'SOLID' | 'SECURITY' | 'PERFORMANCE' | 'BUG' | 'CLEAN_CODE' | 'CUSTOM'>('CUSTOM', { nonNullable: true }),
    severity: new FormControl<'CRITICAL' | 'WARNING' | 'SUGGESTION'>('WARNING', { nonNullable: true }),
    comment: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    suggestedCode: new FormControl('', { nonNullable: true }),
    approved: new FormControl(true, { nonNullable: true }),
  });

  // Webhooks CI/CD State
  public readonly webhookDeliveries = signal<WebhookDeliveryLog[]>([]);
  public readonly isLoadingWebhooks = signal<boolean>(false);
  public readonly selectedWebhookDelivery = signal<WebhookDeliveryLog | null>(null);
  public readonly webhookSecretConfigured = signal<boolean>(false);
  public readonly webhookEndpointUrl = signal<string>('');

  // Filter & Sort Signals
  public readonly selectedCategoryFilter = signal<string>('ALL');
  public readonly selectedSeverityFilter = signal<string>('ALL');
  public readonly selectedAuthorFilter = signal<'ALL' | 'AI' | 'USER'>('ALL');
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

  // Pull Request Statistics & Metadata Computed Property
  public readonly prStats = computed(() => {
    const pr = this.currentPrDetails();
    const repoName = this.reviewForm.get('repoName')?.value || 'google-gemini/architect-ai';
    const prTitle = this.reviewForm.get('prTitle')?.value || 'Pull Request';
    const diff = this.reviewForm.get('diff')?.value || '';

    // Calculate diff additions and deletions as fallback if API doesn't specify
    let diffAdditions = 0;
    let diffDeletions = 0;
    const lines = diff.split('\n');
    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        diffAdditions++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        diffDeletions++;
      }
    }

    const additions = pr?.additions !== undefined && pr.additions > 0 ? pr.additions : diffAdditions;
    const deletions = pr?.deletions !== undefined && pr.deletions > 0 ? pr.deletions : diffDeletions;
    const totalChanges = additions + deletions;
    const additionsRatio = totalChanges > 0 ? Math.round((additions / totalChanges) * 100) : 50;

    const author = pr?.user?.login || 'alex-architect';
    const authorAvatar = pr?.user?.avatar_url || '';
    const authorProfileUrl = `https://github.com/${author}`;

    const createdAt = pr?.created_at || '';
    const timeAgo = this.formatTimeAgo(createdAt);
    const formattedDate = createdAt
      ? new Date(createdAt).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : 'Recently';

    const number = pr?.number || this.currentPrNumber() || 442;
    const title = pr?.title || prTitle;
    const state = (pr?.state || 'open').toLowerCase();
    const isDraft = Boolean(pr?.draft);
    const changedFilesCount = pr?.changed_files || this.activeChangedFiles().length;
    const baseBranch = pr?.base?.ref || 'main';
    const headBranch = pr?.head?.ref || 'feature-branch';
    const htmlUrl = pr?.html_url || `https://github.com/${repoName}/pull/${number}`;

    return {
      pr,
      number,
      title,
      repo: repoName,
      state,
      isDraft,
      author,
      authorAvatar,
      authorProfileUrl,
      createdAt,
      timeAgo,
      formattedDate,
      additions,
      deletions,
      totalChanges,
      additionsRatio,
      changedFilesCount,
      baseBranch,
      headBranch,
      htmlUrl,
      labels: pr?.labels || [],
      milestone: pr?.milestone || null,
    };
  });

  public formatTimeAgo(dateString?: string | null): string {
    if (!dateString) return 'recently';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'recently';
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      if (diffMs < 0) return 'just now';

      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 60) return 'just now';

      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;

      const diffHour = Math.floor(diffMin / 60);
      if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`;

      const diffDays = Math.floor(diffHour / 24);
      if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;

      const diffMonths = Math.floor(diffDays / 30);
      if (diffMonths < 12) return `${diffMonths} month${diffMonths === 1 ? '' : 's'} ago`;

      const diffYears = Math.floor(diffDays / 365);
      return `${diffYears} year${diffYears === 1 ? '' : 's'} ago`;
    } catch {
      return 'recently';
    }
  }

  // Computed Filtered & Sorted Findings
  public readonly filteredFindings = computed(() => {
    const list = this.masterFindings();
    const cat = this.selectedCategoryFilter();
    const sev = this.selectedSeverityFilter();
    const auth = this.selectedAuthorFilter();
    const query = this.searchQuery().toLowerCase().trim();
    const sortOpt = this.selectedSortOption();

    let result = list.filter((f) => {
      if (cat !== 'ALL' && f.category !== cat) return false;
      if (sev !== 'ALL' && f.severity !== sev) return false;
      if (auth === 'AI' && f.author === 'user') return false;
      if (auth === 'USER' && f.author !== 'user') return false;
      if (query) {
        const matchPath = f.path.toLowerCase().includes(query);
        const matchTitle = f.title.toLowerCase().includes(query);
        const matchComment = (f.userEditedComment || f.comment).toLowerCase().includes(query);
        if (!matchPath && !matchTitle && !matchComment) return false;
      }
      return true;
    });

    // Apply sorting
    if (sortOpt === 'MANUAL') {
      // Preserve manual drag-and-drop order from masterFindings
      return result;
    }

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
        this.authenticatedUser.set(null);
      }

      // Initialize responsive viewport state
      const isMobile = window.innerWidth < 1024;
      this.isMobileScreen.set(isMobile);
      if (isMobile) {
        this.isSidebarOpen.set(false);
      }

      this.loadRules();

      // Check and restore auto-saved session if present
      const restored = this.restoreAutoSavedSession();
      if (!restored) {
        this.runReview();
      }

      this.loadWebhookHistory();
      this.loadOrgRepositories('angular');
      this.loadCoverityStreams();
      this.loadAppScanReports();
    }
  }

  // ==========================================
  // RESPONSIVE & PANEL TOGGLE ACTIONS
  // ==========================================
  public toggleSidebar(): void {
    this.isSidebarOpen.update((v) => !v);
  }

  public openSidebar(): void {
    this.isSidebarOpen.set(true);
  }

  public closeSidebar(): void {
    this.isSidebarOpen.set(false);
  }

  public toggleSourceTree(): void {
    this.isSourceTreeOpen.update((v) => !v);
  }

  public toggleMobileMenu(): void {
    this.isMobileMenuOpen.update((v) => !v);
  }

  // Universal Hamburger Menu Controls
  public toggleHamburgerMenu(): void {
    this.isHamburgerMenuOpen.update((v) => !v);
  }

  public closeHamburgerMenu(): void {
    this.isHamburgerMenuOpen.set(false);
  }

  // Component Expand / Collapse Toggle Actions
  public toggleLivePrBar(): void {
    this.isLivePrBarCollapsed.update((v) => !v);
  }

  public togglePrSummaryCard(): void {
    this.isPrSummaryCardCollapsed.update((v) => !v);
  }

  public toggleSecurityCard(): void {
    this.isSecurityCardCollapsed.update((v) => !v);
  }

  public togglePrDetails(): void {
    this.isPrDetailsCollapsed.update((v) => !v);
  }

  public toggleDiffViewer(): void {
    this.isDiffViewerCollapsed.update((v) => !v);
  }

  public toggleReviewSummary(): void {
    this.isReviewSummaryCollapsed.update((v) => !v);
  }

  public toggleFindingsToolbar(): void {
    this.isFindingsToolbarCollapsed.update((v) => !v);
  }

  public toggleRuleForm(): void {
    this.isRuleFormCollapsed.update((v) => !v);
  }

  public toggleRepoExplorerFilters(): void {
    this.isRepoExplorerFiltersCollapsed.update((v) => !v);
  }

  // Per-finding accordion collapse/expand
  public toggleFindingCollapse(findingId: string): void {
    this.collapsedFindingIds.update((set) => {
      const next = new Set(set);
      if (next.has(findingId)) {
        next.delete(findingId);
      } else {
        next.add(findingId);
      }
      return next;
    });
  }

  public isFindingCollapsed(findingId: string): boolean {
    return this.collapsedFindingIds().has(findingId);
  }

  public toggleFindingCollapsed(findingId: string): void {
    this.toggleFindingCollapse(findingId);
  }

  public toggleAllFindings(expand: boolean): void {
    if (expand) {
      this.expandAllFindings();
    } else {
      this.collapseAllFindings();
    }
  }

  public expandAllFindings(): void {
    this.collapsedFindingIds.set(new Set());
    this.showFindingToast('info', 'All finding cards expanded');
  }

  public collapseAllFindings(): void {
    const allIds = new Set(this.masterFindings().map((f) => f.id));
    this.collapsedFindingIds.set(allIds);
    this.showFindingToast('info', 'All finding cards collapsed');
  }

  // Global Workspace Declutter & Accordion Actions
  public readonly areAllComponentsCollapsed = computed(() => {
    return (
      this.isLivePrBarCollapsed() &&
      this.isPrSummaryCardCollapsed() &&
      this.isSecurityCardCollapsed() &&
      this.isPrDetailsCollapsed()
    );
  });

  public collapseAllComponents(): void {
    this.isLivePrBarCollapsed.set(true);
    this.isPrSummaryCardCollapsed.set(true);
    this.isSecurityCardCollapsed.set(true);
    this.isPrDetailsCollapsed.set(true);
    this.isReviewSummaryCollapsed.set(true);
    this.isFindingsToolbarCollapsed.set(true);
    this.isRuleFormCollapsed.set(true);
    const allIds = new Set(this.masterFindings().map((f) => f.id));
    this.collapsedFindingIds.set(allIds);
    this.showFindingToast('info', 'All components collapsed for clean workspace view');
  }

  public expandAllComponents(): void {
    this.isLivePrBarCollapsed.set(false);
    this.isPrSummaryCardCollapsed.set(false);
    this.isSecurityCardCollapsed.set(false);
    this.isPrDetailsCollapsed.set(false);
    this.isDiffViewerCollapsed.set(false);
    this.isReviewSummaryCollapsed.set(false);
    this.isFindingsToolbarCollapsed.set(false);
    this.isRuleFormCollapsed.set(false);
    this.collapsedFindingIds.set(new Set());
    this.showFindingToast('info', 'All components expanded');
  }

  public clearSavedSession(): void {
    this.clearAutoSavedSession();
  }

  public toggleFindingsPanel(): void {
    this.isFindingsPanelOpen.update((v) => !v);
  }

  public handleWindowResize(): void {
    if (this.isBrowser) {
      const isMobile = window.innerWidth < 1024;
      const wasMobile = this.isMobileScreen();
      this.isMobileScreen.set(isMobile);
      if (isMobile && !wasMobile) {
        this.isSidebarOpen.set(false);
      }
    }
  }

  public handleGlobalKeydown(event: KeyboardEvent): void {
    // Ctrl+B / Cmd+B toggles the primary sidebar
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      this.toggleSidebar();
    }
    // Escape closes hamburger menu, mobile menu or side drawer
    if (event.key === 'Escape') {
      if (this.isHamburgerMenuOpen()) {
        this.isHamburgerMenuOpen.set(false);
      }
      if (this.isMobileMenuOpen()) {
        this.isMobileMenuOpen.set(false);
      }
      if (this.isMobileScreen() && this.isSidebarOpen()) {
        this.isSidebarOpen.set(false);
      }
    }
  }

  public setTab(tab: 'studio' | 'repo-explorer' | 'rules' | 'security-scans' | 'webhooks' | 'source-code' | 'architecture' | 'oauth-guide' | 'deployment'): void {
    this.activeTab.set(tab);
    this.isHamburgerMenuOpen.set(false);
    this.isMobileMenuOpen.set(false);
    if (this.isMobileScreen()) {
      this.isSidebarOpen.set(false);
    }
    if (tab === 'webhooks') {
      this.loadWebhookHistory();
    } else if (tab === 'rules') {
      this.loadRules();
    } else if (tab === 'security-scans') {
      this.loadCoverityStreams();
      this.loadAppScanReports();
    } else if (tab === 'repo-explorer') {
      if (this.orgRepositories().length === 0) {
        this.loadOrgRepositories();
      }
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
    this.currentPrDetails.set(getPresetPrSummary(preset.id));
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
          this.currentPrDetails.set(pr);
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
    this.currentPrDetails.set(pr);
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

    // Preserve any existing user custom comments
    const existingCustomFindings = this.masterFindings().filter((f) => f.author === 'user' || f.isCustom);

    // Keep track of any customized comments or approval overrides
    const userEditOverrides = new Map<string, { userEditedComment?: string; approved?: boolean }>();
    for (const f of this.masterFindings()) {
      const key = `${f.path}:${f.line}:${f.title}`;
      if (f.userEditedComment !== f.originalComment || f.approved === false) {
        userEditOverrides.set(key, { userEditedComment: f.userEditedComment, approved: f.approved });
      }
    }

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

          const findingsWithApproval: EditableFinding[] = (res.data.findings || []).map((f, idx) => {
            const key = `${f.path}:${f.line}:${f.title}`;
            const override = userEditOverrides.get(key);
            return {
              id: `finding_${idx}_${Date.now()}`,
              ...f,
              approved: override?.approved !== undefined ? override.approved : true,
              author: 'ai',
              originalTitle: f.title,
              originalComment: f.comment,
              userEditedComment: override?.userEditedComment || f.comment,
            };
          });

          this.masterFindings.set([...existingCustomFindings, ...findingsWithApproval]);

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

  // ==========================================
  // AUTO-SAVE & SESSION PERSISTENCE HELPERS
  // ==========================================
  public restoreAutoSavedSession(): boolean {
    if (!this.isBrowser) return false;
    try {
      const raw = localStorage.getItem('gemini_review_autosave_session');
      if (!raw) return false;

      const data = JSON.parse(raw);
      if (data && Array.isArray(data.findings) && data.findings.length > 0) {
        if (data.form) {
          this.reviewForm.patchValue({
            repoName: data.form.repoName || this.reviewForm.getRawValue().repoName,
            prTitle: data.form.prTitle || this.reviewForm.getRawValue().prTitle,
            prDescription: data.form.prDescription || '',
            diff: data.form.diff || this.reviewForm.getRawValue().diff,
          });
        }

        if (data.presetId) {
          this.activePresetId.set(data.presetId);
        }
        if (data.prNumber !== undefined) {
          this.currentPrNumber.set(data.prNumber);
        }
        if (data.summary) {
          this.reviewSummary.set(data.summary);
        }
        if (typeof data.score === 'number') {
          this.reviewScore.set(data.score);
        }

        this.masterFindings.set(data.findings);
        const timeStr = data.timeFormatted || (data.timestamp ? new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'recently');
        this.lastAutoSavedTime.set(timeStr);
        this.hasSavedSession.set(true);

        const approvedCount = data.findings.filter((f: EditableFinding) => f.approved).length;
        const customCount = data.findings.filter((f: EditableFinding) => f.author === 'user' || f.isCustom).length;
        this.addLog(`[STORAGE] Restored auto-saved session: ${data.findings.length} findings (${approvedCount} approved, ${customCount} custom) from ${timeStr}`);
        return true;
      }
    } catch (err) {
      console.warn('Could not restore auto-saved session from localStorage', err);
    }
    return false;
  }

  public clearAutoSavedSession(): void {
    if (!this.isBrowser) return;
    localStorage.removeItem('gemini_review_autosave_session');
    this.lastAutoSavedTime.set(null);
    this.hasSavedSession.set(false);
    this.addLog('[STORAGE] Cleared auto-saved session from localStorage');
    this.showFindingToast('info', 'Auto-saved session cleared. Resetting to fresh review...');
    this.runReview();
  }

  public toggleAutoSave(): void {
    const nextState = !this.autoSaveEnabled();
    this.autoSaveEnabled.set(nextState);
    if (!nextState) {
      this.showFindingToast('info', 'Auto-save disabled for this session.');
      this.addLog('[STORAGE] Auto-save disabled');
    } else {
      this.showFindingToast('success', 'Auto-save enabled. Session will persist automatically.');
      this.addLog('[STORAGE] Auto-save enabled');
    }
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
      author: 'ai',
      originalTitle: f.title,
      originalComment: f.comment,
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

  public copyCodeToClipboard(code: string | undefined): void {
    if (!code) return;
    if (this.isBrowser && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      this.showFindingToast('info', 'Code snippet copied to clipboard');
    }
  }

  public readonly copiedFindingId = signal<string | null>(null);

  public copyFindingToClipboard(finding: EditableFinding): void {
    if (!finding) return;
    const comment = finding.userEditedComment || finding.comment || '';
    const lines = [
      `[${finding.severity.toUpperCase()}] ${finding.title}`,
      `File: ${finding.path}:${finding.line} | Category: ${finding.category}`,
      ``,
      comment,
    ];
    if (finding.suggestedCode) {
      lines.push(``);
      lines.push('```');
      lines.push(finding.suggestedCode);
      lines.push('```');
    }

    const payload = lines.join('\n');
    if (this.isBrowser && navigator.clipboard) {
      navigator.clipboard.writeText(payload);
      this.copiedFindingId.set(finding.id);
      this.showFindingToast('info', `Finding #${finding.id.slice(0, 6)} copied to clipboard for Slack / Jira`);
      this.addLog(`[CLIPBOARD] Copied finding "${finding.title}" to clipboard`);
      setTimeout(() => {
        if (this.copiedFindingId() === finding.id) {
          this.copiedFindingId.set(null);
        }
      }, 2000);
    }
  }

  private addLog(log: string): void {
    const current = this.backendLogs();
    this.backendLogs.set([...current.slice(-15), log]);
  }

  // ==================== FINDING OPERATIONS & CRUD ====================

  public setAuthorFilter(val: string): void {
    this.selectedAuthorFilter.set(val as 'ALL' | 'AI' | 'USER');
  }

  public openAddFindingModal(prefillPath?: string, prefillLine?: number): void {
    this.editingFindingId.set(null);

    // Default path to the first changed file or active path
    let defaultPath = prefillPath;
    if (!defaultPath) {
      const files = this.activeChangedFiles();
      defaultPath = files && files.length > 0 ? files[0].name : 'src/main.ts';
    }

    this.findingForm.reset({
      path: defaultPath,
      line: prefillLine ? Math.max(1, prefillLine) : 1,
      title: '',
      category: 'CUSTOM',
      severity: 'WARNING',
      comment: '',
      suggestedCode: '',
      approved: true,
    });

    this.isFindingModalOpen.set(true);
  }

  public openEditFindingModal(finding: EditableFinding | DiffFindingRef): void {
    this.editingFindingId.set(finding.id);

    this.findingForm.reset({
      path: finding.path,
      line: finding.line,
      title: finding.title,
      category: finding.category,
      severity: finding.severity,
      comment: finding.userEditedComment || finding.comment,
      suggestedCode: finding.suggestedCode || '',
      approved: finding.approved !== false,
    });

    this.isFindingModalOpen.set(true);
  }

  public closeFindingModal(): void {
    this.isFindingModalOpen.set(false);
    this.editingFindingId.set(null);
  }

  public saveFindingModal(): void {
    if (this.findingForm.invalid) {
      this.findingForm.markAllAsTouched();
      return;
    }

    const val = this.findingForm.getRawValue();
    const editId = this.editingFindingId();

    if (editId) {
      // Update existing finding
      this.masterFindings.update((list) =>
        list.map((f) => {
          if (f.id === editId) {
            return {
              ...f,
              path: val.path.trim(),
              line: val.line,
              title: val.title.trim(),
              category: val.category,
              severity: val.severity,
              userEditedComment: val.comment.trim(),
              suggestedCode: val.suggestedCode.trim() || undefined,
              approved: val.approved,
            };
          }
          return f;
        })
      );
      this.showFindingToast('success', 'Review point updated successfully.');
      this.addLog(`[REVIEW] Updated finding ${editId} (${val.path}:${val.line})`);
    } else {
      // Create new custom finding
      const newFinding: EditableFinding = {
        id: `user_point_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        path: val.path.trim(),
        line: val.line,
        title: val.title.trim(),
        category: val.category,
        severity: val.severity,
        comment: val.comment.trim(),
        userEditedComment: val.comment.trim(),
        suggestedCode: val.suggestedCode.trim() || undefined,
        approved: val.approved,
        author: 'user',
        isCustom: true,
      };

      this.masterFindings.update((list) => [newFinding, ...list]);
      this.showFindingToast('success', 'Custom review point added.');
      this.addLog(`[REVIEW] Added custom review point: "${val.title}" on ${val.path}:${val.line}`);
    }

    this.closeFindingModal();
  }

  public deleteFinding(id: string): void {
    this.masterFindings.update((list) => list.filter((f) => f.id !== id));
    this.showFindingToast('info', 'Review point removed.');
    this.addLog(`[REVIEW] Deleted review finding: ${id}`);
  }

  public deleteSelectedFindings(): void {
    const selectedIds = new Set(this.filteredFindings().filter((f) => f.approved).map((f) => f.id));
    if (selectedIds.size === 0) return;

    this.masterFindings.update((list) => list.filter((f) => !selectedIds.has(f.id)));
    this.showFindingToast('info', `Removed ${selectedIds.size} selected review points.`);
    this.addLog(`[REVIEW] Batch removed ${selectedIds.size} approved review points`);
  }

  public deleteUnapprovedFindings(): void {
    const unapprovedCount = this.masterFindings().filter((f) => !f.approved).length;
    if (unapprovedCount === 0) return;

    this.masterFindings.update((list) => list.filter((f) => f.approved));
    this.showFindingToast('info', `Removed ${unapprovedCount} unapproved review points.`);
    this.addLog(`[REVIEW] Cleaned up ${unapprovedCount} unapproved findings`);
  }

  public clearAllFindings(): void {
    if (this.masterFindings().length === 0) return;
    this.masterFindings.set([]);
    this.showFindingToast('info', 'All review findings cleared.');
    this.addLog('[REVIEW] Cleared all review findings from workspace');
  }

  public revertFindingToOriginal(id: string): void {
    this.masterFindings.update((list) =>
      list.map((f) => {
        if (f.id === id) {
          return {
            ...f,
            title: f.originalTitle || f.title,
            userEditedComment: f.originalComment || f.comment,
          };
        }
        return f;
      })
    );
    this.showFindingToast('info', 'Reverted comment back to original AI suggestion.');
    this.addLog(`[REVIEW] Reverted finding ${id} to original AI output`);
  }

  public onAddCustomFindingFromDiff(finding: DiffFindingRef): void {
    const newEditable: EditableFinding = {
      ...finding,
      author: 'user',
      isCustom: true,
      userEditedComment: finding.userEditedComment || finding.comment,
    };

    this.masterFindings.update((list) => [newEditable, ...list]);
    this.showFindingToast('success', `Added custom comment on ${finding.path}:${finding.line}`);
    this.addLog(`[REVIEW] Added inline custom comment on ${finding.path}:${finding.line}`);
  }

  private showFindingToast(type: 'success' | 'info', text: string): void {
    this.findingOperationMessage.set({ type, text });
    setTimeout(() => {
      if (this.findingOperationMessage()?.text === text) {
        this.findingOperationMessage.set(null);
      }
    }, 4000);
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

  public onFindingDrop(event: CdkDragDrop<EditableFinding[]>): void {
    if (event.previousIndex === event.currentIndex) {
      return;
    }

    // Auto-switch to manual order mode so drag-and-drop sequence is preserved and reflected
    if (this.selectedSortOption() !== 'MANUAL') {
      this.selectedSortOption.set('MANUAL');
    }

    const currentFiltered = [...this.filteredFindings()];
    const itemMoved = currentFiltered[event.previousIndex];
    const targetItem = currentFiltered[event.currentIndex];

    if (!itemMoved || !targetItem) {
      return;
    }

    this.masterFindings.update((master) => {
      const list = [...master];
      const fromIndex = list.findIndex((f) => f.id === itemMoved.id);
      const toIndex = list.findIndex((f) => f.id === targetItem.id);

      if (fromIndex !== -1 && toIndex !== -1) {
        moveItemInArray(list, fromIndex, toIndex);
      }
      return list;
    });

    this.showFindingToast('success', `Reordered: "${itemMoved.title}" to position #${event.currentIndex + 1}`);
    this.addLog(`[REORDER] Dragged review finding "${itemMoved.title}" to position #${event.currentIndex + 1}`);
  }

  public pushToGitHub(): void {
    const approved = this.masterFindings().filter((f) => f.approved);
    if (approved.length === 0) {
      alert('Please approve at least one review comment before pushing to GitHub.');
      return;
    }

    const repo = this.reviewForm.getRawValue().repoName;
    const token = this.githubToken().trim();
    if (!token) {
      this.githubPushSuccess.set('Please provide a GitHub Personal Access Token (PAT) with repo scope in settings to submit review comments.');
      this.addLog('[OCTOKIT] Cannot submit review: GitHub token is required.');
      this.openOAuthModal();
      return;
    }

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
        token,
        repo,
        pullNumber: prNumber,
        commitId,
        body: reviewBody,
        comments: commentsPayload,
      })
      .subscribe({
        next: (res) => {
          this.isPushingToGitHub.set(false);
          const reviewId = res.reviewId || 1;
          this.githubPushSuccess.set(
            `Successfully posted review #${reviewId} with ${approved.length} approved comments to ${repo} PR #${prNumber}!`
          );
          this.addLog(`[OCTOKIT] Review #${reviewId} submitted to ${repo}#${prNumber}: ${approved.length} inline comments posted`);
        },
        error: (err) => {
          this.isPushingToGitHub.set(false);
          const msg = err.error?.error || err.message || 'Failed to submit review';
          this.addLog(`[OCTOKIT] Review submission failed: ${msg}`);
          this.githubPushSuccess.set(
            `Review submission failed: ${msg}`
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
    this.isAuthenticatingOAuth.set(false);
    this.oauthStatusMessage.set('Please provide your GitHub Personal Access Token (PAT) with "repo" and "read:user" scopes in the field above, then click "Verify & Save Token".');
    this.addLog('[AUTH] Please enter a valid GitHub PAT in the modal above.');
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

  // ==========================================
  // REPOSITORY EXPLORER METHODS
  // ==========================================
  public setOrgInput(val: string): void {
    this.orgInput.set(val);
  }

  public selectPopularOrg(org: string): void {
    this.orgInput.set(org);
    this.loadOrgRepositories(org);
  }

  public loadOrgRepositories(orgName?: string): void {
    const raw = (orgName !== undefined ? orgName : this.orgInput()).trim().replace(/^@/, '');
    const org = raw || 'angular';

    this.currentOrg.set(org);
    this.isLoadingOrgRepos.set(true);
    this.orgReposError.set(null);
    const token = this.githubToken() || undefined;

    this.addLog(`[REPO-EXPLORER] Fetching organizational repositories for "@${org}"...`);

    this.reviewService.listOrgRepos(org, token).subscribe({
      next: (res) => {
        this.isLoadingOrgRepos.set(false);
        if (res.success && res.repos) {
          this.orgRepositories.set(res.repos);
          this.addLog(`[REPO-EXPLORER] Loaded ${res.repos.length} repositories for "${org}"`);

          // Auto-select first repository if none selected or not in current list
          const current = this.selectedOrgRepo();
          if (!current || !res.repos.some((r) => r.id === current.id)) {
            if (res.repos.length > 0) {
              this.selectOrgRepo(res.repos[0]);
            } else {
              this.selectedOrgRepo.set(null);
              this.filteredPullRequests.set([]);
            }
          }
        } else {
          this.orgReposError.set(res.error || `Could not find organization or repositories for "${org}".`);
          this.addLog(`[REPO-EXPLORER] Error: ${res.error}`);
        }
      },
      error: (err) => {
        this.isLoadingOrgRepos.set(false);
        const msg = err.error?.error || err.message || 'Failed to fetch repositories';
        this.orgReposError.set(msg);
        this.addLog(`[REPO-EXPLORER] Request failed: ${msg}`);
      },
    });
  }

  public selectOrgRepo(repo: GitHubRepositoryItem): void {
    this.selectedOrgRepo.set(repo);
    this.selectedLabelFilter.set('ALL');
    this.selectedMilestoneFilter.set('ALL');
    this.prSearchFilter.set('');
    this.loadRepoLabelsAndMilestones(repo);
    this.loadFilteredPullRequests();
  }

  public loadRepoLabelsAndMilestones(repo: GitHubRepositoryItem): void {
    const [owner, repoName] = repo.full_name.includes('/')
      ? repo.full_name.split('/')
      : [this.currentOrg(), repo.name];
    const token = this.githubToken() || undefined;

    this.isLoadingRepoLabels.set(true);
    this.reviewService.listRepoLabels(repoName, owner, token).subscribe({
      next: (res) => {
        this.isLoadingRepoLabels.set(false);
        if (res.success && res.labels) {
          this.repoLabels.set(res.labels);
        }
      },
      error: () => this.isLoadingRepoLabels.set(false),
    });

    this.isLoadingRepoMilestones.set(true);
    this.reviewService.listRepoMilestones(repoName, owner, 'all', token).subscribe({
      next: (res) => {
        this.isLoadingRepoMilestones.set(false);
        if (res.success && res.milestones) {
          this.repoMilestones.set(res.milestones);
        }
      },
      error: () => this.isLoadingRepoMilestones.set(false),
    });
  }

  public loadFilteredPullRequests(): void {
    const repo = this.selectedOrgRepo();
    if (!repo) return;

    const [owner, repoName] = repo.full_name.includes('/')
      ? repo.full_name.split('/')
      : [this.currentOrg(), repo.name];
    const token = this.githubToken() || undefined;
    const state = this.selectedPrStateFilter();
    const label = this.selectedLabelFilter() !== 'ALL' ? this.selectedLabelFilter() : undefined;
    const milestone = this.selectedMilestoneFilter() !== 'ALL' ? this.selectedMilestoneFilter() : undefined;

    this.isLoadingFilteredPrs.set(true);
    this.filteredPrsError.set(null);

    this.reviewService.listPullRequestsWithFilters({
      owner,
      repo: repoName,
      state,
      label,
      milestone,
      token,
    }).subscribe({
      next: (res) => {
        this.isLoadingFilteredPrs.set(false);
        if (res.success && res.pulls) {
          this.filteredPullRequests.set(res.pulls);
          this.addLog(`[REPO-EXPLORER] Loaded ${res.pulls.length} PRs for ${owner}/${repoName} (${state})`);
        } else {
          this.filteredPrsError.set(res.error || 'Failed to fetch PRs');
        }
      },
      error: (err) => {
        this.isLoadingFilteredPrs.set(false);
        this.filteredPrsError.set(err.error?.error || err.message || 'Failed to fetch Pull Requests');
      },
    });
  }

  public selectLabelFilter(labelName: string): void {
    this.selectedLabelFilter.set(labelName);
    this.loadFilteredPullRequests();
  }

  public selectMilestoneFilter(milestone: string): void {
    this.selectedMilestoneFilter.set(milestone);
    this.loadFilteredPullRequests();
  }

  public selectPrStateFilter(state: 'open' | 'closed' | 'all'): void {
    this.selectedPrStateFilter.set(state);
    this.loadFilteredPullRequests();
  }

  public clearPrFilters(): void {
    this.selectedLabelFilter.set('ALL');
    this.selectedMilestoneFilter.set('ALL');
    this.prSearchFilter.set('');
    this.loadFilteredPullRequests();
  }

  public loadUserOrganizations(): void {
    const token = this.githubToken();
    if (!token) {
      this.openOAuthModal();
      return;
    }

    this.isLoadingUserOrgs.set(true);
    this.reviewService.listUserOrgs(token).subscribe({
      next: (res) => {
        this.isLoadingUserOrgs.set(false);
        if (res.success && res.orgs) {
          this.userOrgs.set(res.orgs);
          this.addLog(`[REPO-EXPLORER] Loaded ${res.orgs.length} user organizations`);
        }
      },
      error: () => this.isLoadingUserOrgs.set(false),
    });
  }

  public loadPrIntoStudio(pr: GitHubPullRequestSummary): void {
    const targetRepo = this.selectedOrgRepo()?.full_name || this.reviewForm.get('repoName')?.value || 'angular/angular';
    this.addLog(`[STUDIO] Loading PR #${pr.number} ("${pr.title}") into Studio Workspace...`);
    this.currentPrDetails.set(pr);
    
    // Switch to studio tab
    this.setTab('studio');
    
    // Fetch live PR diff and analyze
    this.fetchLivePullRequest(pr.html_url || `https://github.com/${targetRepo}/pull/${pr.number}`, true);
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

  // ==========================================
  // COVERITY STREAMS & DEFECTS ACTIONS
  // ==========================================
  public loadCoverityStreams(): void {
    this.isLoadingCoverity.set(true);
    this.reviewService.getCoverityStreams().subscribe({
      next: (res) => {
        this.isLoadingCoverity.set(false);
        if (res.success && res.streams) {
          this.coverityStreams.set(res.streams);
          if (res.streams.length > 0 && !this.selectedCoverityStream()) {
            this.selectedCoverityStreamId.set(res.streams[0].id);
          }
          this.addLog(`[COVERITY] Loaded ${res.streams.length} static analysis streams`);
        }
      },
      error: (err) => {
        this.isLoadingCoverity.set(false);
        this.addLog(`[COVERITY] Error loading streams: ${err.message || 'API error'}`);
      },
    });
  }

  public selectCoverityStream(id: string): void {
    this.selectedCoverityStreamId.set(id);
    this.selectedCoverityDefect.set(null);
  }

  public selectCoverityDefect(defect: CoverityDefect): void {
    this.selectedCoverityDefect.set(defect);
  }

  public setCoverityImpactFilter(val: string): void {
    this.coverityImpactFilter.set(val);
  }

  public setCoveritySearchQuery(val: string): void {
    this.coveritySearchQuery.set(val);
  }

  public updateCoverityStatus(streamId: string, cid: number, status: 'New' | 'Triaged' | 'Dismissed' | 'Fixed'): void {
    this.reviewService.updateCoverityDefectStatus(streamId, cid, status).subscribe({
      next: (res) => {
        if (res.success) {
          this.coverityStreams.update((streams) =>
            streams.map((s) => {
              if (s.id !== streamId) return s;
              return {
                ...s,
                defects: s.defects.map((d) => (d.cid === cid ? res.defect : d)),
              };
            })
          );
          if (this.selectedCoverityDefect()?.cid === cid) {
            this.selectedCoverityDefect.set(res.defect);
          }
          this.addLog(`[COVERITY] Defect CID #${cid} marked as ${status}`);
          this.showFindingToast('success', `CID #${cid} marked as ${status}`);
        }
      },
    });
  }

  public openImportCoverityModal(): void {
    this.coverityImportJson.set('');
    this.coverityImportError.set(null);
    this.isImportCoverityModalOpen.set(true);
  }

  public closeImportCoverityModal(): void {
    this.isImportCoverityModalOpen.set(false);
  }

  public submitImportCoverity(): void {
    const raw = this.coverityImportJson().trim();
    if (!raw) {
      this.coverityImportError.set('Please provide JSON payload for Coverity stream');
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      this.reviewService.createCoverityStream(parsed).subscribe({
        next: (res) => {
          if (res.success && res.stream) {
            this.coverityStreams.update((list) => [res.stream, ...list]);
            this.selectedCoverityStreamId.set(res.stream.id);
            this.closeImportCoverityModal();
            this.addLog(`[COVERITY] Successfully imported stream '${res.stream.name}' with ${res.stream.totalDefects} defects`);
            this.showFindingToast('success', `Imported stream '${res.stream.name}'`);
          }
        },
        error: (err) => {
          this.coverityImportError.set(err.error?.error || 'Failed to import stream');
        },
      });
    } catch {
      this.coverityImportError.set('Invalid JSON format. Please verify syntax.');
    }
  }

  // ==========================================
  // APPSCAN REPORTS & VULNERABILITIES ACTIONS
  // ==========================================
  public loadAppScanReports(): void {
    this.isLoadingAppScan.set(true);
    this.reviewService.getAppScanReports().subscribe({
      next: (res) => {
        this.isLoadingAppScan.set(false);
        if (res.success && res.reports) {
          this.appScanReports.set(res.reports);
          if (res.reports.length > 0 && !this.selectedAppScanReport()) {
            this.selectedAppScanReportId.set(res.reports[0].id);
          }
          this.addLog(`[APPSCAN] Loaded ${res.reports.length} enterprise security audit reports`);
        }
      },
      error: (err) => {
        this.isLoadingAppScan.set(false);
        this.addLog(`[APPSCAN] Error loading reports: ${err.message || 'API error'}`);
      },
    });
  }

  public selectAppScanReport(id: string): void {
    this.selectedAppScanReportId.set(id);
    this.selectedAppScanFinding.set(null);
  }

  public selectAppScanFinding(finding: AppScanFinding): void {
    this.selectedAppScanFinding.set(finding);
  }

  public setAppScanSeverityFilter(val: string): void {
    this.appScanSeverityFilter.set(val);
  }

  public setAppScanTypeFilter(val: string): void {
    this.appScanTypeFilter.set(val);
  }

  public setAppScanSearchQuery(val: string): void {
    this.appScanSearchQuery.set(val);
  }

  public updateAppScanStatus(reportId: string, findingId: string, status: 'Open' | 'Remediated' | 'False Positive'): void {
    this.reviewService.updateAppScanFindingStatus(reportId, findingId, status).subscribe({
      next: (res) => {
        if (res.success) {
          this.appScanReports.update((reports) =>
            reports.map((r) => {
              if (r.id !== reportId) return r;
              return {
                ...r,
                findings: r.findings.map((f) => (f.id === findingId ? res.finding : f)),
              };
            })
          );
          if (this.selectedAppScanFinding()?.id === findingId) {
            this.selectedAppScanFinding.set(res.finding);
          }
          this.addLog(`[APPSCAN] Finding ${findingId} marked as ${status}`);
          this.showFindingToast('success', `Finding marked as ${status}`);
        }
      },
    });
  }

  public openImportAppScanModal(): void {
    this.appScanImportContent.set('');
    this.appScanImportError.set(null);
    this.isImportAppScanModalOpen.set(true);
  }

  public closeImportAppScanModal(): void {
    this.isImportAppScanModalOpen.set(false);
  }

  public submitImportAppScan(): void {
    const raw = this.appScanImportContent().trim();
    if (!raw) {
      this.appScanImportError.set('Please provide JSON payload for AppScan report');
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      this.reviewService.createAppScanReport(parsed).subscribe({
        next: (res) => {
          if (res.success && res.report) {
            this.appScanReports.update((list) => [res.report, ...list]);
            this.selectedAppScanReportId.set(res.report.id);
            this.closeImportAppScanModal();
            this.addLog(`[APPSCAN] Successfully imported scan '${res.report.scanName}' with ${res.report.findings.length} findings`);
            this.showFindingToast('success', `Imported scan '${res.report.scanName}'`);
          }
        },
        error: (err) => {
          this.appScanImportError.set(err.error?.error || 'Failed to import report');
        },
      });
    } catch {
      this.appScanImportError.set('Invalid JSON format. Please verify syntax.');
    }
  }

  // ==========================================
  // SECURITY FIX & 1-CLICK REMEDIATION ACTIONS ("and fix too")
  // ==========================================
  public setSecuritySubTab(subTab: 'coverity' | 'appscan' | 'remediation'): void {
    this.activeSecuritySubTab.set(subTab);
  }

  public generateSecurityFix(item: CoverityDefect | AppScanFinding, source: 'coverity' | 'appscan'): void {
    this.isGeneratingSecurityFix.set(true);
    this.activeSecuritySubTab.set('remediation');

    const isCoverity = source === 'coverity';
    const cDefect = isCoverity ? (item as CoverityDefect) : null;
    const aFinding = !isCoverity ? (item as AppScanFinding) : null;

    const payload: SecurityFixRequest = {
      source,
      defectId: cDefect ? cDefect.cid : aFinding ? aFinding.id : 'DEFECT-1',
      checkerOrCwe: cDefect ? cDefect.checker : aFinding ? aFinding.cwe : 'SECURITY-DEFECT',
      title: cDefect ? cDefect.description : aFinding ? aFinding.issueType : 'Security Defect',
      file: cDefect ? cDefect.file : aFinding ? aFinding.fileOrUrl : 'src/main.ts',
      vulnerableCode: item.vulnerableSnippet,
      existingRemediation: item.remediationFix,
      contextDiff: this.reviewForm.getRawValue().diff,
    };

    this.reviewService.requestSecurityFix(payload).subscribe({
      next: (res) => {
        this.isGeneratingSecurityFix.set(false);
        const enriched: SecurityFixResponse = {
          ...res,
          vulnerableCode: payload.vulnerableCode,
          confidence: res.confidence || 98,
        };
        this.activeSecurityFixResult.set(enriched);
        this.addLog(`[REMEDIATION] AI Security patch synthesized for ${payload.title} (${res.cweMitigation})`);
      },
      error: (err) => {
        this.isGeneratingSecurityFix.set(false);
        this.addLog(`[REMEDIATION] Error generating fix: ${err.message || 'API error'}`);
      },
    });
  }

  public setCoverityImportJson(val: string): void {
    this.coverityImportJson.set(val);
  }

  public setAppScanImportContent(val: string): void {
    this.appScanImportContent.set(val);
  }

  public applySecurityFixToDiff(vulnerableCode: string, remediationFix: string, title: string): void {
    const currentDiff = this.reviewForm.controls.diff.value;
    let newDiff = currentDiff;

    if (currentDiff.includes(vulnerableCode)) {
      newDiff = currentDiff.replace(vulnerableCode, remediationFix);
    } else {
      const lines = vulnerableCode.split('\n').filter((l) => l.trim().length > 0);
      let matched = false;
      for (const line of lines) {
        const trimmed = line.trim();
        if (currentDiff.includes(trimmed)) {
          matched = true;
          break;
        }
      }

      if (matched) {
        let workingDiff = currentDiff;
        for (const line of lines) {
          const trimmed = line.trim();
          const targetInDiff = workingDiff.split('\n').find((l) => l.includes(trimmed));
          if (targetInDiff) {
            const indent = targetInDiff.match(/^\+?\s*/)?.[0] || '+ ';
            workingDiff = workingDiff.replace(targetInDiff, `${indent}// [SECURITY REMEDIATED] ${trimmed}`);
          }
        }
        newDiff = workingDiff + `\n\n// --- REMEDIATION PATCH FOR: ${title} ---\n${remediationFix}\n`;
      } else {
        newDiff = currentDiff + `\n\n// --- APPLIED SECURITY REMEDIATION: ${title} ---\n${remediationFix}\n`;
      }
    }

    this.reviewForm.patchValue({ diff: newDiff });
    this.appliedFixesCount.update((c) => c + 1);
    this.addLog(`[SECURITY FIX] Applied 1-click remediation for "${title}" to active PR diff!`);
    this.showFindingToast('success', `Security fix for "${title}" applied to PR diff!`);
  }

  public importDefectAsFinding(item: CoverityDefect | AppScanFinding, source: 'coverity' | 'appscan'): void {
    const isCoverity = source === 'coverity';
    const cDefect = isCoverity ? (item as CoverityDefect) : null;
    const aFinding = !isCoverity ? (item as AppScanFinding) : null;

    const newFinding: EditableFinding = {
      id: `sec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      path: cDefect ? cDefect.file : aFinding ? aFinding.fileOrUrl : 'src/main.ts',
      line: cDefect ? cDefect.line : aFinding ? aFinding.line || 1 : 1,
      title: isCoverity ? `[Coverity CID ${cDefect?.cid}] ${cDefect?.checker}` : `[AppScan] ${aFinding?.issueType} (${aFinding?.cwe})`,
      category: 'SECURITY',
      severity: isCoverity ? (cDefect?.impact === 'High' ? 'CRITICAL' : 'WARNING') : (aFinding?.severity === 'High' ? 'CRITICAL' : 'WARNING'),
      comment: isCoverity
        ? `${cDefect?.description}\n\nCategory: ${cDefect?.category}\nCWE: ${cDefect?.cwe || 'N/A'}`
        : `${aFinding?.threatVector}\n\nScanner: ${aFinding?.scannerType} | CVSS: ${aFinding?.cvssScore} | CWE: ${aFinding?.cwe}`,
      suggestedCode: item.remediationFix,
      approved: true,
      author: 'ai',
    };

    this.masterFindings.update((list) => [newFinding, ...list]);
    this.addLog(`[FINDINGS] Imported ${source.toUpperCase()} defect "${newFinding.title}" into PR Review Findings`);
    this.showFindingToast('success', `Imported ${source.toUpperCase()} defect into PR Findings!`);
  }

  public applyFindingFix(finding: EditableFinding): void {
    if (!finding.suggestedCode) {
      this.showFindingToast('info', 'No suggested code fix available for this finding');
      return;
    }
    this.applySecurityFixToDiff(finding.title, finding.suggestedCode, finding.title);
    finding.approved = true;
  }

  public applyAllMatchingSecurityFixes(): void {
    let applied = 0;
    const stream = this.selectedCoverityStream();
    if (stream) {
      for (const d of stream.defects) {
        if (d.status !== 'Fixed') {
          this.applySecurityFixToDiff(d.vulnerableSnippet, d.remediationFix, `CID #${d.cid} (${d.checker})`);
          this.updateCoverityStatus(stream.id, d.cid, 'Fixed');
          applied++;
        }
      }
    }

    const report = this.selectedAppScanReport();
    if (report) {
      for (const f of report.findings) {
        if (f.status !== 'Remediated') {
          this.applySecurityFixToDiff(f.vulnerableSnippet, f.remediationFix, `${f.issueType} (${f.cwe})`);
          this.updateAppScanStatus(report.id, f.id, 'Remediated');
          applied++;
        }
      }
    }

    if (applied > 0) {
      this.showFindingToast('success', `Applied ${applied} security fixes across Coverity & AppScan to diff!`);
      this.setTab('studio');
      this.setCenterTab('syntax-diff');
    } else {
      this.showFindingToast('info', 'All security findings are already remediated or fixed.');
    }
  }
}
