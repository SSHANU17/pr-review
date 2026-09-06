import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import {
  DiffFindingRef,
  DiffLine,
  DiffSyntaxToken,
  ParsedDiffFile,
  SplitDiffRow,
  buildSplitHunkRows,
  parseUnifiedDiff,
} from '../utils/diff-parser';

@Component({
  selector: 'app-diff-viewer',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      [class]="isExpanded() ? 'fixed inset-0 z-50 p-3 sm:p-6 bg-black/80 backdrop-blur-md flex flex-col' : 'flex flex-col h-full'"
    >
      <div
        class="flex flex-col h-full bg-[#1e1e1e] text-[#d4d4d4] border border-[#333333] rounded-lg overflow-hidden font-mono shadow-2xl transition-all duration-300"
      >
        <!-- Top Control Bar / Toolbar -->
        <div class="bg-[#252526] border-b border-[#333333] px-3 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0 select-none text-xs font-sans">
          <!-- File Selector Tabs -->
          <div class="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 sm:pb-0">
            <div class="flex items-center gap-1 text-[11px] text-neutral-400 mr-1 font-semibold uppercase tracking-wider">
              <mat-icon class="text-sm text-[#007acc]">difference</mat-icon>
              <span class="hidden md:inline">Side-by-Side Diff</span>
            </div>

            @for (file of parsedFiles(); track file.id) {
              <button
                type="button"
                (click)="selectFile(file.id)"
                [class]="selectedFileId() === file.id ? 'bg-[#1e1e1e] text-white border-t-2 border-t-[#007acc] border-x border-[#333]' : 'bg-[#2d2d2d] text-neutral-400 hover:text-neutral-200 border border-transparent'"
                class="px-2.5 py-1 rounded-t text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
              >
                <span class="w-2 h-2 rounded-full" [class]="file.status === 'A' ? 'bg-[#81b88b]' : file.status === 'D' ? 'bg-[#ff5f56]' : 'bg-[#e2c08d]'"></span>
                <span>{{ file.fileName }}</span>
                <span class="text-[10px] text-[#81b88b] font-bold">+{{ file.additions }}</span>
                <span class="text-[10px] text-[#ff5f56] font-bold">-{{ file.deletions }}</span>
                @if (file.findingsCount > 0) {
                  <span class="bg-[#0e639c] text-white text-[9px] px-1.5 py-0.2 rounded-full font-bold">
                    {{ file.findingsCount }} AI
                  </span>
                }
              </button>
            }
          </div>

          <!-- View Mode, Comments & Fullscreen / Expand Controls -->
          <div class="flex items-center gap-2">
            <!-- View Mode Switcher (Split Side-by-Side default) -->
            <div class="bg-[#1e1e1e] p-0.5 rounded border border-[#3c3c3c] flex items-center text-[11px]">
              <button
                type="button"
                (click)="setViewMode('split')"
                [class]="viewMode() === 'split' ? 'bg-[#007acc] text-white font-bold' : 'text-neutral-400 hover:text-white'"
                class="px-2.5 py-1 rounded transition-all cursor-pointer flex items-center gap-1"
                title="Side-by-Side Split Diff Comparison"
              >
                <mat-icon class="text-xs">vertical_split</mat-icon>
                <span>Side-by-Side</span>
              </button>
              <button
                type="button"
                (click)="setViewMode('unified')"
                [class]="viewMode() === 'unified' ? 'bg-[#007acc] text-white font-bold' : 'text-neutral-400 hover:text-white'"
                class="px-2 py-1 rounded transition-all cursor-pointer flex items-center gap-1"
                title="Unified Inline Stream"
              >
                <mat-icon class="text-xs">view_stream</mat-icon>
                <span>Unified</span>
              </button>
            </div>

            <!-- Inline Comments Toggle -->
            <button
              type="button"
              (click)="toggleAllInlineComments()"
              [class]="showInlineComments() ? 'bg-[#1e3a5f] text-[#9cdcfe] border-[#0e639c]' : 'bg-[#2d2d2d] text-neutral-400 border-[#3c3c3c]'"
              class="px-2.5 py-1 rounded text-[11px] font-medium border flex items-center gap-1 transition-all cursor-pointer"
              title="Toggle inline AI comment annotations"
            >
              <mat-icon class="text-xs">{{ showInlineComments() ? 'visibility' : 'visibility_off' }}</mat-icon>
              <span class="hidden sm:inline">{{ showInlineComments() ? 'AI Comments (On)' : 'AI Comments (Off)' }}</span>
            </button>

            <!-- Expand / Minimize Window Button -->
            <button
              type="button"
              (click)="toggleExpand()"
              [class]="isExpanded() ? 'bg-[#ff5f56]/20 text-[#ff5f56] border-[#ff5f56]/50 hover:bg-[#ff5f56]/30' : 'bg-[#2d2d2d] text-neutral-200 border-[#3c3c3c] hover:bg-[#3c3c3c]'"
              class="px-2.5 py-1 rounded text-[11px] font-semibold border flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
              [title]="isExpanded() ? 'Minimize to Normal View (Esc)' : 'Expand Window to Fullscreen Focus View'"
            >
              <mat-icon class="text-xs">{{ isExpanded() ? 'fullscreen_exit' : 'fullscreen' }}</mat-icon>
              <span>{{ isExpanded() ? 'Minimize' : 'Expand' }}</span>
            </button>
          </div>
        </div>

        <!-- File Header Info Strip & Side-by-Side Column Headers -->
        @if (activeFile()) {
          <div class="bg-[#1e1e1e] border-b border-[#2d2d2d] px-4 py-1.5 flex items-center justify-between text-xs text-neutral-400 shrink-0">
            <div class="flex items-center gap-2 font-mono text-[11px] truncate">
              <span class="text-[#569cd6] font-semibold">{{ activeFile()!.newPath }}</span>
              <span class="text-neutral-500">•</span>
              <span class="text-[#81b88b] font-semibold">+{{ activeFile()!.additions }} additions</span>
              <span class="text-neutral-500">•</span>
              <span class="text-[#ff5f56] font-semibold">-{{ activeFile()!.deletions }} deletions</span>
            </div>

            <div class="flex items-center gap-2 text-[11px]">
              @if (activeFile()!.findingsCount > 0) {
                <span class="text-[#ffbd2e] flex items-center gap-1 font-semibold">
                  <mat-icon class="text-xs">smart_toy</mat-icon>
                  {{ activeFile()!.findingsCount }} AI Findings attached
                </span>
              } @else {
                <span class="text-neutral-500 text-[10px]">No findings in this file</span>
              }
            </div>
          </div>

          <!-- Column Header Banner for Side-by-Side view -->
          @if (viewMode() === 'split') {
            <div class="grid grid-cols-2 bg-[#252526] border-b border-[#333333] text-[10px] uppercase font-bold tracking-wider divide-x divide-[#333333] select-none shrink-0 font-sans">
              <div class="px-4 py-1 flex items-center justify-between text-[#ff7b72]">
                <span class="flex items-center gap-1">
                  <mat-icon class="text-xs text-[#ff5f56]">remove_circle_outline</mat-icon>
                  <span>Original / Deletions ({{ activeFile()!.oldPath }})</span>
                </span>
                <span class="text-[9px] opacity-60 font-mono">BASE</span>
              </div>
              <div class="px-4 py-1 flex items-center justify-between text-[#7ee787]">
                <span class="flex items-center gap-1">
                  <mat-icon class="text-xs text-[#81b88b]">add_circle_outline</mat-icon>
                  <span>Modified / Additions ({{ activeFile()!.newPath }})</span>
                </span>
                <span class="text-[9px] opacity-60 font-mono">HEAD</span>
              </div>
            </div>
          }
        }

        <!-- Main Diff Content Body -->
        <div class="flex-1 overflow-auto bg-[#1e1e1e] text-[12px] leading-5 select-text">
          @if (!activeFile() || activeFile()!.hunks.length === 0) {
            <div class="p-12 text-center text-neutral-400 font-sans space-y-3">
              <mat-icon class="text-5xl text-neutral-500">code_off</mat-icon>
              <div class="text-base font-semibold text-white">No Diffs Available to Render</div>
              <p class="text-xs opacity-60 max-w-md mx-auto">
                Paste a unified git diff in the editor or select one of the preset review scenarios.
              </p>
            </div>
          } @else {
            <!-- ==================== SIDE-BY-SIDE (SPLIT) DIFF VIEW (DEFAULT) ==================== -->
            @if (viewMode() === 'split') {
              <div class="divide-y divide-[#282828] font-mono">
                @for (hunk of activeFile()!.hunks; track hunk.header) {
                  <div class="split-hunk-container">
                    <!-- Hunk Header across both columns -->
                    <div class="bg-[#161b22] text-[#79b8ff] px-4 py-1.5 text-[11px] font-bold border-y border-[#30363d] select-none flex items-center gap-2">
                      <mat-icon class="text-xs opacity-80 text-[#58a6ff]">unfold_more</mat-icon>
                      <span class="font-mono text-[#58a6ff]">{{ hunk.header }}</span>
                    </div>

                    @for (row of getSplitRows(hunk); track $index) {
                      <!-- Split Row: 2 equal-width columns -->
                      <div class="grid grid-cols-2 divide-x divide-[#333333] hover:brightness-110">
                        <!-- Left Column (Original / Deleted) -->
                        <div
                          [class]="row.left ? getLineContainerClass(row.left) : 'bg-[#181818] opacity-30'"
                          class="flex items-start overflow-hidden min-w-0"
                        >
                          <!-- Gutter -->
                          <div class="w-14 shrink-0 px-1 text-right text-[10px] select-none text-neutral-500 font-mono bg-black/25 border-r border-[#333333]/50">
                            {{ row.left?.oldLineNumber !== undefined ? row.left?.oldLineNumber : '' }}
                          </div>
                          <!-- Marker Sign -->
                          <div class="w-5 text-center select-none font-bold shrink-0 text-[#ff5f56]">
                            {{ row.left?.type === 'delete' ? '-' : '' }}
                          </div>
                          <!-- Code Text -->
                          <div class="flex-1 px-1.5 py-0.5 overflow-x-auto whitespace-pre font-mono text-[11px]">
                            @if (row.left) {
                              @for (token of row.left.tokens; track $index) {
                                <span [class]="getTokenColorClass(token)">{{ token.text }}</span>
                              }
                              @if (row.left.tokens.length === 0) {
                                <span>&nbsp;</span>
                              }
                            } @else {
                              <span>&nbsp;</span>
                            }
                          </div>
                        </div>

                        <!-- Right Column (Modified / Added) -->
                        <div
                          [class]="row.right ? getLineContainerClass(row.right) : 'bg-[#181818] opacity-30'"
                          class="flex items-start overflow-hidden min-w-0"
                        >
                          <!-- Gutter with AI badge trigger -->
                          <div class="w-14 shrink-0 px-1 text-right text-[10px] select-none text-neutral-500 font-mono bg-black/25 border-r border-[#333333]/50 flex items-center justify-between">
                            <span class="w-3 text-center">
                              @if (row.right && row.right.findings.length > 0) {
                                <span
                                  class="w-2.5 h-2.5 rounded-full inline-block"
                                  [class]="getFindingGutterBadgeClass(row.right.findings[0].severity)"
                                  [title]="row.right.findings[0].title"
                                ></span>
                              }
                            </span>
                            <span [class.text-[#81b88b]]="row.right?.type === 'add'">
                              {{ row.right?.newLineNumber !== undefined ? row.right?.newLineNumber : '' }}
                            </span>
                          </div>
                          <!-- Marker Sign -->
                          <div class="w-5 text-center select-none font-bold shrink-0 text-[#81b88b]">
                            {{ row.right?.type === 'add' ? '+' : '' }}
                          </div>
                          <!-- Code Text -->
                          <div class="flex-1 px-1.5 py-0.5 overflow-x-auto whitespace-pre font-mono text-[11px]">
                            @if (row.right) {
                              @for (token of row.right.tokens; track $index) {
                                <span [class]="getTokenColorClass(token)">{{ token.text }}</span>
                              }
                              @if (row.right.tokens.length === 0) {
                                <span>&nbsp;</span>
                              }
                            } @else {
                              <span>&nbsp;</span>
                            }
                          </div>
                        </div>
                      </div>

                      <!-- Inline AI Comments spanning full width for split row -->
                      @if (showInlineComments() && row.findings.length > 0) {
                        @for (finding of row.findings; track finding.id) {
                          <div
                            [id]="'line_finding_' + finding.id"
                            class="p-3 bg-[#1a1a1a] border-l-4 border-l-[#007acc] border-y border-[#333333] font-sans my-1.5 mx-2 rounded-r-lg shadow-xl"
                          >
                            <div class="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-[#333]">
                              <div class="flex items-center gap-2">
                                <span class="bg-[#007acc] text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                                  <mat-icon class="text-xs">smart_toy</mat-icon>
                                  GEMINI REVIEW
                                </span>
                                <span class="text-xs font-bold text-white">{{ finding.title }}</span>
                                <span class="text-[10px] font-mono text-neutral-400">Line {{ finding.line }}</span>
                              </div>
                              <div class="flex items-center gap-2">
                                <span class="text-[10px] font-mono px-2 py-0.5 rounded" [class]="getCategoryBadgeClass(finding.category)">
                                  {{ finding.category }}
                                </span>
                                <span class="text-[10px] px-2 py-0.5 rounded text-white font-bold" [class]="getSeverityBadgeClass(finding.severity)">
                                  {{ finding.severity }}
                                </span>
                                <label [attr.for]="'splitApprove_' + finding.id" class="flex items-center gap-1.5 cursor-pointer ml-2 pl-2 border-l border-[#444]">
                                  <input
                                    [id]="'splitApprove_' + finding.id"
                                    type="checkbox"
                                    [checked]="finding.approved"
                                    (change)="onToggleApproval(finding.id)"
                                    class="accent-[#007acc] h-3.5 w-3.5 cursor-pointer"
                                  />
                                  <span class="text-[10px] text-neutral-300 select-none">Include in PR</span>
                                </label>
                              </div>
                            </div>
                            <div class="pt-2 text-xs text-neutral-300 space-y-2">
                              <textarea
                                #commentBoxSplit
                                [value]="finding.userEditedComment || finding.comment"
                                (input)="onUpdateComment(finding.id, commentBoxSplit.value)"
                                rows="2"
                                class="w-full bg-[#252526] border border-[#3c3c3c] rounded p-2 text-xs text-[#d4d4d4] font-sans focus:border-[#007acc] focus:outline-none"
                                placeholder="Edit AI comment before posting..."
                              ></textarea>
                              @if (finding.suggestedCode) {
                                <div class="bg-[#20252b] border border-[#30363d] rounded p-2 text-[11px] font-mono space-y-1">
                                  <div class="flex items-center justify-between text-[10px] text-[#81b88b] font-bold">
                                    <span>SUGGESTED REFACTORING:</span>
                                    <button
                                      type="button"
                                      (click)="copyCode(finding.suggestedCode!)"
                                      class="text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer"
                                    >
                                      <mat-icon class="text-xs">content_copy</mat-icon>
                                      <span>Copy</span>
                                    </button>
                                  </div>
                                  <pre class="text-[#9cdcfe] overflow-x-auto whitespace-pre p-1 leading-relaxed">{{ finding.suggestedCode }}</pre>
                                </div>
                              }
                            </div>
                          </div>
                        }
                      }
                    }
                  </div>
                }
              </div>
            }

            <!-- ==================== UNIFIED DIFF VIEW ==================== -->
            @if (viewMode() === 'unified') {
              <div class="divide-y divide-[#282828] font-mono">
                @for (hunk of activeFile()!.hunks; track hunk.header) {
                  <div class="hunk-container">
                    @for (line of hunk.lines; track line.id) {
                      <!-- Line Row -->
                      @if (line.type === 'hunk-header') {
                        <div class="bg-[#161b22] text-[#79b8ff] px-4 py-1 text-[11px] font-bold border-y border-[#30363d] select-none flex items-center gap-2">
                          <mat-icon class="text-xs opacity-70">unfold_more</mat-icon>
                          <span>{{ line.content }}</span>
                        </div>
                      } @else {
                        <div
                          [id]="'line_' + line.id"
                          [class]="getLineContainerClass(line)"
                          class="group flex items-start border-l-4 transition-colors hover:brightness-110"
                        >
                          <!-- Gutter: AI Marker + Line Numbers -->
                          <div class="w-24 shrink-0 flex items-center justify-between px-2 text-[10px] select-none text-neutral-500 font-mono bg-black/20 border-r border-[#333333]/50">
                            <!-- AI Finding Badge in Gutter -->
                            <div class="w-4 flex items-center justify-center">
                              @if (line.findings.length > 0) {
                                <button
                                  type="button"
                                  (click)="toggleLineComment(line.findings[0].id)"
                                  class="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold cursor-pointer transition-transform hover:scale-125"
                                  [class]="getFindingGutterBadgeClass(line.findings[0].severity)"
                                  [title]="line.findings[0].title"
                                >
                                  !
                                </button>
                              }
                            </div>

                            <!-- Old Line Number -->
                            <span class="w-7 text-right opacity-60">
                              {{ line.oldLineNumber !== undefined ? line.oldLineNumber : '' }}
                            </span>

                            <!-- New Line Number -->
                            <span class="w-7 text-right" [class.text-[#81b88b]]="line.type === 'add'" [class.text-[#ff5f56]]="line.type === 'delete'">
                              {{ line.newLineNumber !== undefined ? line.newLineNumber : '' }}
                            </span>
                          </div>

                          <!-- Diff Sign (+/-) -->
                          <div class="w-6 text-center select-none font-bold shrink-0" [class.text-[#81b88b]]="line.type === 'add'" [class.text-[#ff5f56]]="line.type === 'delete'" [class.opacity-30]="line.type === 'context'">
                            {{ line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' ' }}
                          </div>

                          <!-- Code Content with Syntax Highlighting -->
                          <div class="flex-1 px-2 py-0.5 overflow-x-auto whitespace-pre font-mono">
                            @for (token of line.tokens; track $index) {
                              <span [class]="getTokenColorClass(token)">{{ token.text }}</span>
                            }
                            @if (line.tokens.length === 0) {
                              <span>&nbsp;</span>
                            }
                          </div>
                        </div>

                        <!-- Inline AI Comment Box rendered directly below flagged line -->
                        @if (showInlineComments() && line.findings.length > 0) {
                          @for (finding of line.findings; track finding.id) {
                            <div
                              [id]="'line_finding_' + finding.id"
                              class="px-6 py-2 bg-[#1a1a1a] border-l-4 border-l-[#007acc] border-y border-[#333333] font-sans my-1 mx-2 rounded-r-lg shadow-xl"
                            >
                              <!-- Comment Header -->
                              <div class="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-[#333]">
                                <div class="flex items-center gap-2">
                                  <span class="bg-[#007acc] text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                                    <mat-icon class="text-xs">smart_toy</mat-icon>
                                    GEMINI REVIEW
                                  </span>
                                  <span class="text-xs font-bold text-white">{{ finding.title }}</span>
                                  <span class="text-[10px] font-mono text-neutral-400">Line {{ finding.line }}</span>
                                </div>

                                <div class="flex items-center gap-2">
                                  <span class="text-[10px] font-mono px-2 py-0.5 rounded" [class]="getCategoryBadgeClass(finding.category)">
                                    {{ finding.category }}
                                  </span>
                                  <span class="text-[10px] px-2 py-0.5 rounded text-white font-bold" [class]="getSeverityBadgeClass(finding.severity)">
                                    {{ finding.severity }}
                                  </span>
                                  <label [attr.for]="'inlineApprove_' + finding.id" class="flex items-center gap-1.5 cursor-pointer ml-2 pl-2 border-l border-[#444]">
                                    <input
                                      [id]="'inlineApprove_' + finding.id"
                                      type="checkbox"
                                      [checked]="finding.approved"
                                      (change)="onToggleApproval(finding.id)"
                                      class="accent-[#007acc] h-3.5 w-3.5 cursor-pointer"
                                    />
                                    <span class="text-[10px] text-neutral-300 select-none">Include in PR</span>
                                  </label>
                                </div>
                              </div>

                              <!-- Comment Content -->
                              <div class="py-2 text-xs text-neutral-300 space-y-2">
                                <textarea
                                  #commentBox
                                  [value]="finding.userEditedComment || finding.comment"
                                  (input)="onUpdateComment(finding.id, commentBox.value)"
                                  rows="2"
                                  class="w-full bg-[#252526] border border-[#3c3c3c] rounded p-2 text-xs text-[#d4d4d4] font-sans focus:border-[#007acc] focus:outline-none"
                                  placeholder="Edit AI comment before posting..."
                                ></textarea>

                                @if (finding.suggestedCode) {
                                  <div class="bg-[#20252b] border border-[#30363d] rounded p-2 text-[11px] font-mono space-y-1">
                                    <div class="flex items-center justify-between text-[10px] text-[#81b88b] font-bold">
                                      <span>SUGGESTED REFACTORING:</span>
                                      <button
                                        type="button"
                                        (click)="copyCode(finding.suggestedCode!)"
                                        class="text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer"
                                      >
                                        <mat-icon class="text-xs">content_copy</mat-icon>
                                        <span>Copy</span>
                                      </button>
                                    </div>
                                    <pre class="text-[#9cdcfe] overflow-x-auto whitespace-pre p-1 leading-relaxed">{{ finding.suggestedCode }}</pre>
                                  </div>
                                }
                              </div>
                            </div>
                          }
                        }
                      }
                    }
                  </div>
                }
              </div>
            }
          }
        </div>

        <!-- Footer Info Status Bar -->
        <div class="bg-[#252526] border-t border-[#333333] px-3 py-1.5 flex items-center justify-between text-[11px] text-neutral-400 shrink-0 font-sans select-none">
          <div class="flex items-center gap-3">
            <span class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-[#007acc]"></span>
              <span>Mode: {{ viewMode() === 'split' ? 'Side-by-Side (Split)' : 'Unified Stream' }}</span>
            </span>
            <span>•</span>
            <span>{{ parsedFiles().length }} changed files</span>
            <span>•</span>
            <span class="text-[#81b88b] font-bold">+{{ totalAdditions() }}</span>
            <span class="text-[#ff5f56] font-bold">-{{ totalDeletions() }}</span>
          </div>

          <div class="flex items-center gap-2">
            <button
              type="button"
              (click)="toggleExpand()"
              class="text-[#007acc] hover:underline flex items-center gap-1 font-mono text-[10px] cursor-pointer"
            >
              <mat-icon class="text-xs">{{ isExpanded() ? 'fullscreen_exit' : 'fullscreen' }}</mat-icon>
              <span>{{ isExpanded() ? 'Minimize (Esc)' : 'Expand Window' }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  host: {
    '(window:keydown.escape)': 'onEscapeKey()',
  },
})
export class DiffViewer {
  public readonly diffText = input<string>('');
  public readonly findings = input<DiffFindingRef[]>([]);
  public readonly activeFindingId = input<string | null>(null);

  public readonly toggleApproval = output<string>();
  public readonly updateFindingComment = output<{ id: string; comment: string }>();

  // Default to side-by-side split view
  public readonly viewMode = signal<'unified' | 'split'>('split');
  public readonly isExpanded = signal<boolean>(false);
  public readonly selectedFileId = signal<string>('');
  public readonly showInlineComments = signal<boolean>(true);
  public readonly expandedFindings = signal<Set<string>>(new Set());

  public readonly parsedFiles = computed(() => {
    return parseUnifiedDiff(this.diffText(), this.findings());
  });

  public readonly activeFile = computed<ParsedDiffFile | null>(() => {
    const files = this.parsedFiles();
    if (files.length === 0) return null;
    const found = files.find((f) => f.id === this.selectedFileId());
    return found || files[0];
  });

  public readonly totalAdditions = computed(() => {
    return this.parsedFiles().reduce((acc, f) => acc + f.additions, 0);
  });

  public readonly totalDeletions = computed(() => {
    return this.parsedFiles().reduce((acc, f) => acc + f.deletions, 0);
  });

  constructor() {
    effect(() => {
      const files = this.parsedFiles();
      if (files.length > 0 && (!this.selectedFileId() || !files.some((f) => f.id === this.selectedFileId()))) {
        this.selectedFileId.set(files[0].id);
      }
    });
  }

  public selectFile(id: string): void {
    this.selectedFileId.set(id);
  }

  public setViewMode(mode: 'unified' | 'split'): void {
    this.viewMode.set(mode);
  }

  public toggleExpand(): void {
    this.isExpanded.update((v) => !v);
  }

  public onEscapeKey(): void {
    if (this.isExpanded()) {
      this.isExpanded.set(false);
    }
  }

  public toggleAllInlineComments(): void {
    this.showInlineComments.update((v) => !v);
  }

  public toggleLineComment(findingId: string): void {
    this.showInlineComments.set(true);
    this.expandedFindings.update((set) => {
      const next = new Set(set);
      if (next.has(findingId)) {
        next.delete(findingId);
      } else {
        next.add(findingId);
      }
      return next;
    });
  }

  public onToggleApproval(id: string): void {
    this.toggleApproval.emit(id);
  }

  public onUpdateComment(id: string, comment: string): void {
    this.updateFindingComment.emit({ id, comment });
  }

  public copyCode(code: string): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code);
    }
  }

  public getSplitRows(hunk: ParsedDiffFile['hunks'][0]): SplitDiffRow[] {
    return buildSplitHunkRows(hunk);
  }

  public getLineContainerClass(line: DiffLine): string {
    if (line.type === 'add') {
      return 'bg-[#15341c]/50 text-[#e6f7e8] border-l-[#238636]';
    }
    if (line.type === 'delete') {
      return 'bg-[#3b1c1d]/50 text-[#fcdcdc] border-l-[#da3633]';
    }
    if (line.findings.length > 0) {
      return 'bg-[#222a35] border-l-[#007acc]';
    }
    return 'bg-[#1e1e1e] text-[#d4d4d4] border-l-transparent';
  }

  public getTokenColorClass(token: DiffSyntaxToken): string {
    switch (token.type) {
      case 'keyword':
        return 'text-[#569cd6] font-medium';
      case 'type':
        return 'text-[#4ec9b0]';
      case 'string':
        return 'text-[#ce9178]';
      case 'comment':
        return 'text-[#6a9955] italic';
      case 'number':
        return 'text-[#b5cea8]';
      case 'function':
        return 'text-[#dcdcaa]';
      case 'decorator':
        return 'text-[#c586c0] font-semibold';
      case 'operator':
        return 'text-[#d4d4d4] opacity-80';
      case 'plain':
      default:
        return 'text-[#d4d4d4]';
    }
  }

  public getFindingGutterBadgeClass(severity: string): string {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-[#ff5f56] text-white shadow-sm';
      case 'WARNING':
        return 'bg-[#ffbd2e] text-black shadow-sm';
      case 'SUGGESTION':
      default:
        return 'bg-[#007acc] text-white shadow-sm';
    }
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

  public getSeverityBadgeClass(severity: string): string {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-[#ff5f56] text-white';
      case 'WARNING':
        return 'bg-[#ffbd2e] text-black';
      case 'SUGGESTION':
      default:
        return 'bg-[#007acc] text-white';
    }
  }
}
