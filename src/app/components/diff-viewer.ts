import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
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
import {
  FileContextEngine,
  expandHunkUp,
  expandHunkDown,
  expandAllHunksInFile,
  collapseHunk,
} from '../utils/file-context';
import { ReviewService } from '../services/review.service';

interface InlineComposerState {
  fileId: string;
  filePath: string;
  line: number;
  title: string;
  category: 'SOLID' | 'SECURITY' | 'PERFORMANCE' | 'BUG' | 'CLEAN_CODE' | 'CUSTOM';
  severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
  comment: string;
  suggestedCode: string;
}

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

            @for (file of displayedFiles(); track file.id) {
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
                    {{ file.findingsCount }}
                  </span>
                }
              </button>
            }
          </div>

          <!-- View Mode, Comments, Add Comment & Fullscreen Controls -->
          <div class="flex items-center gap-2">
            <!-- Add Comment Action on Active File -->
            @if (activeFile()) {
              <button
                type="button"
                (click)="openComposerForLine(activeFile()!.newPath, 1, activeFile()!.id)"
                class="bg-[#238636] hover:bg-[#2ea043] text-white px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                title="Add a custom review comment to this file"
              >
                <mat-icon class="text-xs">add_comment</mat-icon>
                <span class="hidden sm:inline">Add Comment</span>
              </button>

              <!-- Expand All Surrounding Code in Current File -->
              <button
                type="button"
                (click)="expandAllInActiveFile()"
                class="bg-[#2d2d2d] hover:bg-[#3c3c3c] text-[#58a6ff] hover:text-white px-2.5 py-1 rounded text-[11px] font-semibold border border-[#3c3c3c] flex items-center gap-1 transition-all cursor-pointer"
                title="Expand and show all code context for this file"
              >
                <mat-icon class="text-xs">unfold_more</mat-icon>
                <span class="hidden sm:inline">Expand Full File</span>
              </button>
            }

            <!-- View Mode Switcher -->
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
              title="Toggle inline comment annotations"
            >
              <mat-icon class="text-xs">{{ showInlineComments() ? 'visibility' : 'visibility_off' }}</mat-icon>
              <span class="hidden sm:inline">{{ showInlineComments() ? 'Annotations (On)' : 'Annotations (Off)' }}</span>
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
          <div class="bg-[#181818] border-b border-[#2d2d2d] text-xs font-sans">
            <!-- File Path & Stats Strip -->
            <div class="px-3 py-1.5 flex items-center justify-between border-b border-[#252526]">
              <div class="flex items-center gap-2">
                <mat-icon class="text-sm text-[#007acc]">description</mat-icon>
                <span class="font-bold text-white font-mono">{{ activeFile()!.newPath }}</span>
                <span class="text-[10px] text-neutral-400">({{ activeFile()!.hunks.length }} hunks)</span>
              </div>
              <div class="flex items-center gap-3 text-[11px]">
                <span class="text-[#81b88b] font-bold font-mono">+{{ activeFile()!.additions }} added</span>
                <span class="text-[#ff5f56] font-bold font-mono">-{{ activeFile()!.deletions }} deleted</span>
              </div>
            </div>

            <!-- Side-by-Side Dual Column Headers (Only for Split Mode) -->
            @if (viewMode() === 'split') {
              <div class="grid grid-cols-2 divide-x divide-[#333333] bg-[#1a1a1a] text-[11px] font-semibold uppercase tracking-wider text-neutral-400 select-none">
                <div class="px-4 py-1 flex items-center justify-between">
                  <span class="flex items-center gap-1.5 text-[#ff5f56]">
                    <mat-icon class="text-xs">remove_circle_outline</mat-icon>
                    <span>Original / Deletions ({{ activeFile()!.fileName }}) Base</span>
                  </span>
                  <span class="text-[10px] text-neutral-500 font-mono">HEAD~1</span>
                </div>
                <div class="px-4 py-1 flex items-center justify-between">
                  <span class="flex items-center gap-1.5 text-[#81b88b]">
                    <mat-icon class="text-xs">add_circle_outline</mat-icon>
                    <span>Modified / Additions ({{ activeFile()!.fileName }})</span>
                  </span>
                  <span class="text-[10px] text-neutral-500 font-mono">PR Changes</span>
                </div>
              </div>
            }
          </div>
        }

        <!-- Diff Viewer Body Area (Scrollable) -->
        <div class="flex-1 overflow-y-auto overflow-x-auto text-xs bg-[#1e1e1e]">
          @if (!activeFile()) {
            <div class="p-8 text-center text-neutral-400 font-sans space-y-2">
              <mat-icon class="text-4xl text-neutral-600">code_off</mat-icon>
              <div class="font-semibold text-white">No Diff Loaded</div>
              <p class="text-xs text-neutral-400">
                Paste a unified git diff in the editor or select one of the preset review scenarios.
              </p>
            </div>
          } @else {
            <!-- ==================== SIDE-BY-SIDE (SPLIT) DIFF VIEW (DEFAULT) ==================== -->
            @if (viewMode() === 'split') {
              <div class="divide-y divide-[#282828] font-mono">
                @for (hunk of activeFile()!.hunks; track hunk.header + '_' + $index; let hunkIdx = $index) {
                  <div class="split-hunk-container">
                    <!-- Interactive Hunk Header across both columns with functional Up/Down/All Expand buttons -->
                    <div class="bg-[#161b22] text-[#79b8ff] px-2 sm:px-4 py-1 text-[11px] font-mono border-y border-[#30363d] select-none flex items-center justify-between gap-2 group hover:bg-[#1a202c] transition-colors">
                      <div class="flex items-center gap-1.5">
                        <!-- Up Arrow: Expand 20 lines Above -->
                        <button
                          type="button"
                          (click)="expandHunkAbove(hunkIdx)"
                          [disabled]="isHunkAtTop(hunk)"
                          class="p-1 rounded bg-[#21262d] hover:bg-[#30363d] text-[#58a6ff] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center transition-all shadow-sm border border-[#30363d]"
                          title="Expand code above (20 lines / show preceding code)"
                        >
                          <mat-icon class="text-sm">keyboard_arrow_up</mat-icon>
                        </button>

                        <!-- Down Arrow: Expand 20 lines Below -->
                        <button
                          type="button"
                          (click)="expandHunkBelow(hunkIdx)"
                          class="p-1 rounded bg-[#21262d] hover:bg-[#30363d] text-[#58a6ff] hover:text-white cursor-pointer flex items-center transition-all shadow-sm border border-[#30363d]"
                          title="Expand code below (20 lines / show subsequent code)"
                        >
                          <mat-icon class="text-sm">keyboard_arrow_down</mat-icon>
                        </button>

                        <!-- Center Unfold / Collapse Hunk Context Button -->
                        <button
                          type="button"
                          (click)="toggleExpand(hunkIdx, 'both', 50)"
                          [class]="isHunkExpanded(hunkIdx, 'both') ? 'bg-[#007acc]/30 text-[#9cdcfe] border-[#007acc]' : 'bg-[#21262d]/80 text-[#58a6ff] border-[#30363d]'"
                          class="px-2 py-0.5 rounded hover:bg-[#30363d] hover:text-white cursor-pointer flex items-center gap-1.5 transition-all text-[11px] font-mono border"
                          [title]="isHunkExpanded(hunkIdx, 'both') ? 'Click to collapse expanded context back to diff' : 'Click to expand surrounding code context (50 lines)'"
                        >
                          <mat-icon class="text-xs">{{ isHunkExpanded(hunkIdx, 'both') ? 'unfold_less' : 'unfold_more' }}</mat-icon>
                          <span>{{ hunk.header }}</span>
                          @if (isHunkExpanded(hunkIdx, 'both')) {
                            <span class="text-[9px] bg-[#007acc] text-white px-1 py-0.2 rounded font-sans font-semibold">expanded</span>
                          }
                        </button>
                      </div>

                      <div class="flex items-center gap-2 text-[10px] text-neutral-400 font-sans">
                        <span class="hidden md:inline text-[10px] text-neutral-500">Click arrows to show code above or below</span>
                        <button
                          type="button"
                          (click)="resetActiveFileDiff()"
                          class="text-neutral-400 hover:text-white hover:underline cursor-pointer text-[10px] font-mono"
                          title="Reset to original diff"
                        >
                          Reset Hunks
                        </button>
                      </div>
                    </div>

                    @for (row of getSplitRows(hunk); track $index) {
                      <!-- Split Row: 2 equal-width columns -->
                      <div class="grid grid-cols-2 divide-x divide-[#333333] hover:brightness-110 group relative">
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
                          class="flex items-start overflow-hidden min-w-0 relative"
                        >
                          <!-- Gutter with AI badge trigger and Add Comment (+) button -->
                          <div class="w-14 shrink-0 px-1 text-right text-[10px] select-none text-neutral-500 font-mono bg-black/25 border-r border-[#333333]/50 flex items-center justify-between">
                            <span class="w-4 text-center">
                              @if (row.right && row.right.findings.length > 0) {
                                <span
                                  class="w-2.5 h-2.5 rounded-full inline-block"
                                  [class]="getFindingGutterBadgeClass(row.right.findings[0].severity)"
                                  [title]="row.right.findings[0].title"
                                ></span>
                              } @else if (row.right && row.right.newLineNumber) {
                                <button
                                  type="button"
                                  (click)="openComposerForLine(activeFile()!.newPath, row.right.newLineNumber, activeFile()!.id)"
                                  class="hidden group-hover:inline-flex w-3.5 h-3.5 bg-[#238636] hover:bg-[#2ea043] text-white rounded items-center justify-center text-[9px] font-bold cursor-pointer transition-transform hover:scale-110"
                                  title="Add Review Comment on Line {{ row.right.newLineNumber }}"
                                >
                                  +
                                </button>
                              }
                            </span>
                            <span>{{ row.right?.newLineNumber !== undefined ? row.right?.newLineNumber : '' }}</span>
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

                      <!-- Inline Composer rendered right below the selected line in split view -->
                      @if (activeComposer() && activeComposer()!.fileId === activeFile()!.id && row.right?.newLineNumber === activeComposer()!.line) {
                        <div class="p-3 bg-[#1e2a38] border-y-2 border-[#007acc] font-sans my-2 mx-2 rounded-lg shadow-2xl space-y-2.5">
                          <div class="flex items-center justify-between pb-1 border-b border-[#0e639c]/40 text-xs">
                            <span class="font-bold text-[#9cdcfe] flex items-center gap-1.5">
                              <mat-icon class="text-sm">add_comment</mat-icon>
                              Add Review Comment & Finding on Line {{ activeComposer()!.line }}
                            </span>
                            <button type="button" (click)="cancelComposer()" class="text-neutral-400 hover:text-white cursor-pointer">
                              <mat-icon class="text-xs">close</mat-icon>
                            </button>
                          </div>

                          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                            <div class="sm:col-span-2">
                              <input
                                type="text"
                                #composerTitle
                                [value]="activeComposer()!.title"
                                (input)="updateComposerField('title', composerTitle.value)"
                                placeholder="Issue Title (e.g., Missing error boundary / Validate payload)..."
                                class="w-full bg-[#161b22] border border-[#30363d] rounded px-2.5 py-1 text-xs text-white placeholder-neutral-500 focus:border-[#238636] focus:outline-none"
                              />
                            </div>
                            <div class="flex items-center gap-1">
                              <select
                                #composerCat
                                [value]="activeComposer()!.category"
                                (change)="updateComposerField('category', composerCat.value)"
                                class="w-1/2 bg-[#161b22] border border-[#30363d] rounded px-2 py-1 text-xs text-white focus:border-[#238636] focus:outline-none"
                              >
                                <option value="SOLID">SOLID</option>
                                <option value="SECURITY">Security</option>
                                <option value="PERFORMANCE">Perf</option>
                                <option value="BUG">Bug</option>
                                <option value="CLEAN_CODE">Clean Code</option>
                                <option value="CUSTOM">Custom</option>
                              </select>
                              <select
                                #composerSev
                                [value]="activeComposer()!.severity"
                                (change)="updateComposerField('severity', composerSev.value)"
                                class="w-1/2 bg-[#161b22] border border-[#30363d] rounded px-2 py-1 text-xs text-white focus:border-[#238636] focus:outline-none"
                              >
                                <option value="CRITICAL">Critical</option>
                                <option value="WARNING">Warning</option>
                                <option value="SUGGESTION">Suggestion</option>
                              </select>
                            </div>
                          </div>

                          <textarea
                            #composerComment
                            [value]="activeComposer()!.comment"
                            (input)="updateComposerField('comment', composerComment.value)"
                            rows="2"
                            placeholder="Write your review comment or explanation here..."
                            class="w-full bg-[#161b22] border border-[#30363d] rounded p-2 text-xs text-white placeholder-neutral-500 focus:border-[#238636] focus:outline-none leading-relaxed"
                          ></textarea>

                          <textarea
                            #composerCode
                            [value]="activeComposer()!.suggestedCode"
                            (input)="updateComposerField('suggestedCode', composerCode.value)"
                            rows="2"
                            placeholder="(Optional) Suggested replacement code snippet..."
                            class="w-full bg-[#161b22] border border-[#30363d] rounded p-2 text-xs text-[#7ee787] font-mono placeholder-neutral-500 focus:border-[#238636] focus:outline-none leading-relaxed"
                          ></textarea>

                          <div class="flex items-center justify-end gap-2 pt-1">
                            <button
                              type="button"
                              (click)="cancelComposer()"
                              class="bg-[#2d2d2d] hover:bg-[#3c3c3c] text-neutral-300 px-3 py-1 rounded text-xs cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              (click)="submitComposer()"
                              class="bg-[#238636] hover:bg-[#2ea043] text-white px-3 py-1 rounded text-xs font-bold flex items-center gap-1 cursor-pointer shadow-md"
                            >
                              <mat-icon class="text-xs">check</mat-icon>
                              <span>Save Comment</span>
                            </button>
                          </div>
                        </div>
                      }

                      <!-- Inline Comments spanning full width for split row -->
                      @if (showInlineComments() && row.findings.length > 0) {
                        @for (finding of row.findings; track finding.id) {
                          <div
                            [id]="'line_finding_' + finding.id"
                            class="p-3 bg-[#1a1a1a] border-l-4 border-y border-[#333333] font-sans my-1.5 mx-2 rounded-r-lg shadow-xl space-y-2 transition-all"
                            [class]="finding.author === 'user' ? 'border-l-[#238636] bg-[#1a221c]' : 'border-l-[#007acc]'"
                          >
                            <div class="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-[#333]">
                              <div class="flex items-center gap-2 flex-wrap">
                                @if (finding.author === 'user') {
                                  <span class="bg-[#238636] text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                                    <mat-icon class="text-xs">person</mat-icon>
                                    USER COMMENT
                                  </span>
                                } @else {
                                  <span class="bg-[#007acc] text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                                    <mat-icon class="text-xs">smart_toy</mat-icon>
                                    GEMINI REVIEW
                                  </span>
                                }
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

                                <!-- Edit Finding Button -->
                                <button
                                  type="button"
                                  (click)="onOpenEditModal(finding)"
                                  title="Edit full review point"
                                  class="text-neutral-400 hover:text-white p-1 rounded hover:bg-[#333] cursor-pointer flex items-center"
                                >
                                  <mat-icon class="text-xs">edit</mat-icon>
                                </button>

                                <!-- Delete Finding Button -->
                                <button
                                  type="button"
                                  (click)="onDeleteFinding(finding.id)"
                                  title="Delete this comment"
                                  class="text-[#ff5f56] hover:text-white p-1 rounded hover:bg-[#ff5f56]/20 cursor-pointer flex items-center"
                                >
                                  <mat-icon class="text-xs">delete_outline</mat-icon>
                                </button>

                                <label [attr.for]="'splitApprove_' + finding.id" class="flex items-center gap-1.5 cursor-pointer ml-1 pl-2 border-l border-[#444]">
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

                            <div class="text-xs text-neutral-300 space-y-2">
                              <textarea
                                #commentBoxSplit
                                [value]="finding.userEditedComment || finding.comment"
                                (input)="onUpdateComment(finding.id, commentBoxSplit.value)"
                                rows="2"
                                class="w-full bg-[#252526] border border-[#3c3c3c] rounded p-2 text-xs text-[#d4d4d4] font-sans focus:border-[#007acc] focus:outline-none leading-relaxed"
                                placeholder="Edit comment text before posting..."
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

                <!-- End of File Expansion Footer -->
                @if (activeFile()!.hunks.length > 0) {
                  <div class="bg-[#161b22] text-[#79b8ff] px-4 py-1.5 text-[11px] font-mono border-t border-[#30363d] select-none flex items-center justify-between">
                    <button
                      type="button"
                      (click)="expandHunkBelow(activeFile()!.hunks.length - 1)"
                      class="px-2.5 py-1 rounded bg-[#21262d] hover:bg-[#30363d] text-[#58a6ff] hover:text-white cursor-pointer flex items-center gap-1.5 transition-all text-xs font-sans border border-[#30363d]"
                      title="Expand subsequent lines at bottom of file"
                    >
                      <mat-icon class="text-sm">keyboard_arrow_down</mat-icon>
                      <span>Expand more code below (EOF)</span>
                    </button>
                    <span class="text-[10px] text-neutral-500 font-sans">End of Diff Hunks</span>
                  </div>
                }
              </div>
            }

            <!-- ==================== UNIFIED DIFF VIEW ==================== -->
            @if (viewMode() === 'unified') {
              <div class="divide-y divide-[#282828] font-mono">
                @for (hunk of activeFile()!.hunks; track hunk.header + '_' + $index; let hunkIdx = $index) {
                  <div class="hunk-container">
                    <!-- Interactive Hunk Header in Unified View -->
                    <div class="bg-[#161b22] text-[#79b8ff] px-2 sm:px-4 py-1 text-[11px] font-mono border-y border-[#30363d] select-none flex items-center justify-between gap-2 group hover:bg-[#1a202c] transition-colors">
                      <div class="flex items-center gap-1.5">
                        <!-- Up Arrow Button -->
                        <button
                          type="button"
                          (click)="expandHunkAbove(hunkIdx)"
                          [disabled]="isHunkAtTop(hunk)"
                          class="p-1 rounded bg-[#21262d] hover:bg-[#30363d] text-[#58a6ff] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center transition-all border border-[#30363d]"
                          title="Expand 20 lines above"
                        >
                          <mat-icon class="text-sm">keyboard_arrow_up</mat-icon>
                        </button>

                        <!-- Down Arrow Button -->
                        <button
                          type="button"
                          (click)="expandHunkBelow(hunkIdx)"
                          class="p-1 rounded bg-[#21262d] hover:bg-[#30363d] text-[#58a6ff] hover:text-white cursor-pointer flex items-center transition-all border border-[#30363d]"
                          title="Expand 20 lines below"
                        >
                          <mat-icon class="text-sm">keyboard_arrow_down</mat-icon>
                        </button>

                        <!-- Center Unfold / Collapse Hunk Context Button -->
                        <button
                          type="button"
                          (click)="toggleExpand(hunkIdx, 'both', 50)"
                          [class]="isHunkExpanded(hunkIdx, 'both') ? 'bg-[#007acc]/30 text-[#9cdcfe] border-[#007acc]' : 'bg-[#21262d]/80 text-[#58a6ff] border-[#30363d]'"
                          class="px-2 py-0.5 rounded hover:bg-[#30363d] hover:text-white cursor-pointer flex items-center gap-1.5 transition-all text-[11px] font-mono border"
                          [title]="isHunkExpanded(hunkIdx, 'both') ? 'Click to collapse expanded context back to diff' : 'Click to expand surrounding code context (50 lines)'"
                        >
                          <mat-icon class="text-xs">{{ isHunkExpanded(hunkIdx, 'both') ? 'unfold_less' : 'unfold_more' }}</mat-icon>
                          <span>{{ hunk.header }}</span>
                          @if (isHunkExpanded(hunkIdx, 'both')) {
                            <span class="text-[9px] bg-[#007acc] text-white px-1 py-0.2 rounded font-sans font-semibold">expanded</span>
                          }
                        </button>
                      </div>

                      <div class="flex items-center gap-2 text-[10px] text-neutral-400 font-sans">
                        <span class="hidden md:inline text-[10px] text-neutral-500">Click arrows to show code above or below</span>
                        <button
                          type="button"
                          (click)="resetActiveFileDiff()"
                          class="text-neutral-400 hover:text-white hover:underline cursor-pointer text-[10px] font-mono"
                        >
                          Reset Hunks
                        </button>
                      </div>
                    </div>

                    @for (line of hunk.lines; track line.id) {
                      <!-- Skip separate header line rendering since top bar handles it -->
                      @if (line.type !== 'hunk-header') {
                        <div
                          [id]="'line_' + line.id"
                          [class]="getLineContainerClass(line)"
                          class="group flex items-start border-l-4 transition-colors hover:brightness-110 relative"
                        >
                          <!-- Gutter: AI Marker + Line Numbers + Add Comment (+) Button -->
                          <div class="w-24 shrink-0 flex items-center justify-between px-2 text-[10px] select-none text-neutral-500 font-mono bg-black/20 border-r border-[#333333]/50">
                            <!-- AI Finding Badge or Add Button in Gutter -->
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
                              } @else if (line.newLineNumber || line.oldLineNumber) {
                                <button
                                  type="button"
                                  (click)="openComposerForLine(activeFile()!.newPath, line.newLineNumber || line.oldLineNumber || 1, activeFile()!.id)"
                                  class="hidden group-hover:inline-flex w-3.5 h-3.5 bg-[#238636] hover:bg-[#2ea043] text-white rounded items-center justify-center text-[9px] font-bold cursor-pointer transition-transform hover:scale-110"
                                  title="Add Review Comment on this line"
                                >
                                  +
                                </button>
                              }
                            </div>

                            <!-- Old Line Number -->
                            <span class="w-7 text-right">
                              {{ line.oldLineNumber !== undefined ? line.oldLineNumber : '' }}
                            </span>
                            <!-- New Line Number -->
                            <span class="w-7 text-right">
                              {{ line.newLineNumber !== undefined ? line.newLineNumber : '' }}
                            </span>
                          </div>

                          <!-- Line Sign (+ / - / space) -->
                          <div
                            class="w-6 text-center select-none font-bold shrink-0"
                            [class.text-[#81b88b]]="line.type === 'add'"
                            [class.text-[#ff5f56]]="line.type === 'delete'"
                            [class.text-neutral-500]="line.type === 'context'"
                          >
                            {{ line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' ' }}
                          </div>

                          <!-- Line Code Content with Syntax Highlighting -->
                          <div class="flex-1 px-2 py-0.5 overflow-x-auto whitespace-pre font-mono text-[11px]">
                            @for (token of line.tokens; track $index) {
                              <span [class]="getTokenColorClass(token)">{{ token.text }}</span>
                            }
                            @if (line.tokens.length === 0) {
                              <span>&nbsp;</span>
                            }
                          </div>
                        </div>

                        <!-- Inline Composer Box in Unified View -->
                        @if (activeComposer() && activeComposer()!.fileId === activeFile()!.id && (line.newLineNumber === activeComposer()!.line || line.oldLineNumber === activeComposer()!.line)) {
                          <div class="p-3 bg-[#1e2a38] border-y-2 border-[#007acc] font-sans my-2 mx-4 rounded-lg shadow-2xl space-y-2.5">
                            <div class="flex items-center justify-between pb-1 border-b border-[#0e639c]/40 text-xs">
                              <span class="font-bold text-[#9cdcfe] flex items-center gap-1.5">
                                <mat-icon class="text-sm">add_comment</mat-icon>
                                Add Review Comment & Finding on Line {{ activeComposer()!.line }}
                              </span>
                              <button type="button" (click)="cancelComposer()" class="text-neutral-400 hover:text-white cursor-pointer">
                                <mat-icon class="text-xs">close</mat-icon>
                              </button>
                            </div>

                            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                              <div class="sm:col-span-2">
                                <input
                                  type="text"
                                  #composerTitleUni
                                  [value]="activeComposer()!.title"
                                  (input)="updateComposerField('title', composerTitleUni.value)"
                                  placeholder="Issue Title (e.g., Missing error boundary / Validate payload)..."
                                  class="w-full bg-[#161b22] border border-[#30363d] rounded px-2.5 py-1 text-xs text-white placeholder-neutral-500 focus:border-[#238636] focus:outline-none"
                                />
                              </div>
                              <div class="flex items-center gap-1">
                                <select
                                  #composerCatUni
                                  [value]="activeComposer()!.category"
                                  (change)="updateComposerField('category', composerCatUni.value)"
                                  class="w-1/2 bg-[#161b22] border border-[#30363d] rounded px-2 py-1 text-xs text-white focus:border-[#238636] focus:outline-none"
                                >
                                  <option value="SOLID">SOLID</option>
                                  <option value="SECURITY">Security</option>
                                  <option value="PERFORMANCE">Perf</option>
                                  <option value="BUG">Bug</option>
                                  <option value="CLEAN_CODE">Clean Code</option>
                                  <option value="CUSTOM">Custom</option>
                                </select>
                                <select
                                  #composerSevUni
                                  [value]="activeComposer()!.severity"
                                  (change)="updateComposerField('severity', composerSevUni.value)"
                                  class="w-1/2 bg-[#161b22] border border-[#30363d] rounded px-2 py-1 text-xs text-white focus:border-[#238636] focus:outline-none"
                                >
                                  <option value="CRITICAL">Critical</option>
                                  <option value="WARNING">Warning</option>
                                  <option value="SUGGESTION">Suggestion</option>
                                </select>
                              </div>
                            </div>

                            <textarea
                              #composerCommentUni
                              [value]="activeComposer()!.comment"
                              (input)="updateComposerField('comment', composerCommentUni.value)"
                              rows="2"
                              placeholder="Write your review comment or explanation here..."
                              class="w-full bg-[#161b22] border border-[#30363d] rounded p-2 text-xs text-white placeholder-neutral-500 focus:border-[#238636] focus:outline-none leading-relaxed"
                            ></textarea>

                            <textarea
                              #composerCodeUni
                              [value]="activeComposer()!.suggestedCode"
                              (input)="updateComposerField('suggestedCode', composerCodeUni.value)"
                              rows="2"
                              placeholder="(Optional) Suggested replacement code snippet..."
                              class="w-full bg-[#161b22] border border-[#30363d] rounded p-2 text-xs text-[#7ee787] font-mono placeholder-neutral-500 focus:border-[#238636] focus:outline-none leading-relaxed"
                            ></textarea>

                            <div class="flex items-center justify-end gap-2 pt-1">
                              <button
                                type="button"
                                (click)="cancelComposer()"
                                class="bg-[#2d2d2d] hover:bg-[#3c3c3c] text-neutral-300 px-3 py-1 rounded text-xs cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                (click)="submitComposer()"
                                class="bg-[#238636] hover:bg-[#2ea043] text-white px-3 py-1 rounded text-xs font-bold flex items-center gap-1 cursor-pointer shadow-md"
                              >
                                <mat-icon class="text-xs">check</mat-icon>
                                <span>Save Comment</span>
                              </button>
                            </div>
                          </div>
                        }

                        <!-- Inline Comment Box rendered directly below flagged line -->
                        @if (showInlineComments() && line.findings.length > 0) {
                          @for (finding of line.findings; track finding.id) {
                            <div
                              [id]="'line_finding_' + finding.id"
                              class="px-6 py-2 bg-[#1a1a1a] border-l-4 border-y border-[#333333] font-sans my-1 mx-2 rounded-r-lg shadow-xl space-y-2"
                              [class]="finding.author === 'user' ? 'border-l-[#238636] bg-[#1a221c]' : 'border-l-[#007acc]'"
                            >
                              <!-- Comment Header -->
                              <div class="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-[#333]">
                                <div class="flex items-center gap-2 flex-wrap">
                                  @if (finding.author === 'user') {
                                    <span class="bg-[#238636] text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                                      <mat-icon class="text-xs">person</mat-icon>
                                      USER COMMENT
                                    </span>
                                  } @else {
                                    <span class="bg-[#007acc] text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                                      <mat-icon class="text-xs">smart_toy</mat-icon>
                                      GEMINI REVIEW
                                    </span>
                                  }
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

                                  <!-- Edit Finding Button -->
                                  <button
                                    type="button"
                                    (click)="onOpenEditModal(finding)"
                                    title="Edit full review point"
                                    class="text-neutral-400 hover:text-white p-1 rounded hover:bg-[#333] cursor-pointer flex items-center"
                                  >
                                    <mat-icon class="text-xs">edit</mat-icon>
                                  </button>

                                  <!-- Delete Finding Button -->
                                  <button
                                    type="button"
                                    (click)="onDeleteFinding(finding.id)"
                                    title="Delete this comment"
                                    class="text-[#ff5f56] hover:text-white p-1 rounded hover:bg-[#ff5f56]/20 cursor-pointer flex items-center"
                                  >
                                    <mat-icon class="text-xs">delete_outline</mat-icon>
                                  </button>

                                  <label [attr.for]="'inlineApprove_' + finding.id" class="flex items-center gap-1.5 cursor-pointer ml-1 pl-2 border-l border-[#444]">
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
                                  class="w-full bg-[#252526] border border-[#3c3c3c] rounded p-2 text-xs text-[#d4d4d4] font-sans focus:border-[#007acc] focus:outline-none leading-relaxed"
                                  placeholder="Edit comment text before posting..."
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

                <!-- End of File Expansion Footer for Unified -->
                @if (activeFile()!.hunks.length > 0) {
                  <div class="bg-[#161b22] text-[#79b8ff] px-4 py-1.5 text-[11px] font-mono border-t border-[#30363d] select-none flex items-center justify-between">
                    <button
                      type="button"
                      (click)="expandHunkBelow(activeFile()!.hunks.length - 1)"
                      class="px-2.5 py-1 rounded bg-[#21262d] hover:bg-[#30363d] text-[#58a6ff] hover:text-white cursor-pointer flex items-center gap-1.5 transition-all text-xs font-sans border border-[#30363d]"
                      title="Expand subsequent lines at bottom of file"
                    >
                      <mat-icon class="text-sm">keyboard_arrow_down</mat-icon>
                      <span>Expand more code below (EOF)</span>
                    </button>
                    <span class="text-[10px] text-neutral-500 font-sans">End of Diff Hunks</span>
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
            <span>{{ displayedFiles().length }} changed files</span>
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
  private readonly reviewService = inject(ReviewService, { optional: true });

  public readonly diffText = input<string>('');
  public readonly findings = input<DiffFindingRef[]>([]);
  public readonly activeFindingId = input<string | null>(null);
  public readonly repoName = input<string>('');
  public readonly gitHubToken = input<string>('');

  public readonly toggleApproval = output<string>();
  public readonly updateFindingComment = output<{ id: string; comment: string }>();
  public readonly deleteFinding = output<string>();
  public readonly openEditModal = output<DiffFindingRef>();
  public readonly addCustomFinding = output<DiffFindingRef>();

  // Default to side-by-side split view
  public readonly viewMode = signal<'unified' | 'split'>('split');
  public readonly isExpanded = signal<boolean>(false);
  public readonly selectedFileId = signal<string>('');
  public readonly showInlineComments = signal<boolean>(true);
  public readonly expandedFindings = signal<Set<string>>(new Set());

  // Signal tracking expanded hunk/line context state: key is `${fileId}_hunk_${hunkIndex}` or `${fileId}_${direction}_${hunkIndex}`
  public readonly expandedLines = signal<Record<string, { hunkIndex: number; direction: 'up' | 'down' | 'both'; count: number; expanded: boolean }>>({});

  // Mutable interactive files with expanded hunk lines
  public readonly displayedFiles = signal<ParsedDiffFile[]>([]);

  // Inline comment composer state
  public readonly activeComposer = signal<InlineComposerState | null>(null);

  public readonly activeFile = computed<ParsedDiffFile | null>(() => {
    const files = this.displayedFiles();
    if (files.length === 0) return null;
    const found = files.find((f) => f.id === this.selectedFileId());
    return found || files[0];
  });

  public readonly totalAdditions = computed(() => {
    return this.displayedFiles().reduce((acc, f) => acc + f.additions, 0);
  });

  public readonly totalDeletions = computed(() => {
    return this.displayedFiles().reduce((acc, f) => acc + f.deletions, 0);
  });

  constructor() {
    // Re-parse when diffText or findings input changes
    effect(() => {
      const text = this.diffText();
      const currentFindings = this.findings();
      const parsed = parseUnifiedDiff(text, currentFindings);
      this.displayedFiles.set(parsed);

      if (parsed.length > 0 && (!this.selectedFileId() || !parsed.some((f) => f.id === this.selectedFileId()))) {
        this.selectedFileId.set(parsed[0].id);
      }
    });
  }

  public selectFile(id: string): void {
    this.selectedFileId.set(id);
    this.activeComposer.set(null);
  }

  public setViewMode(mode: 'unified' | 'split'): void {
    this.viewMode.set(mode);
  }

  /**
   * Toggle fullscreen / full-screen focus view or toggle expansion of a hunk when arguments are supplied
   */
  public toggleExpand(hunkIndex?: number, direction: 'up' | 'down' | 'both' = 'both', count = 20): void {
    if (hunkIndex === undefined) {
      this.isExpanded.update((v) => !v);
      return;
    }

    const active = this.activeFile();
    if (!active) return;

    const fileId = active.id;
    const key = `${fileId}_${direction}_${hunkIndex}`;
    const generalKey = `${fileId}_hunk_${hunkIndex}`;

    const currentMap = this.expandedLines();
    const isCurrentlyExpanded = !!currentMap[key]?.expanded || !!currentMap[generalKey]?.expanded;

    if (isCurrentlyExpanded && direction === 'both') {
      // Collapse hunk back to initial state
      const originalParsed = parseUnifiedDiff(this.diffText(), this.findings());
      const originalFile = originalParsed.find((f) => f.id === active.id);
      if (originalFile) {
        this.displayedFiles.update((files) => {
          const target = files.find((f) => f.id === active.id);
          if (target) {
            collapseHunk(target, hunkIndex, originalFile);
          }
          return [...files];
        });
      }

      this.expandedLines.update((m) => {
        const next = { ...m };
        delete next[key];
        delete next[`${fileId}_up_${hunkIndex}`];
        delete next[`${fileId}_down_${hunkIndex}`];
        delete next[generalKey];
        return next;
      });
      return;
    }

    // Expand lines in the specified direction
    this.tryFetchRemoteFileContent(active.newPath);

    this.displayedFiles.update((files) => {
      const file = files.find((f) => f.id === active.id);
      if (file) {
        if (direction === 'up' || direction === 'both') {
          expandHunkUp(file, hunkIndex, count, this.findings());
        }
        if (direction === 'down' || direction === 'both') {
          expandHunkDown(file, hunkIndex, count, this.findings());
        }
      }
      return [...files];
    });

    this.expandedLines.update((m) => ({
      ...m,
      [key]: { hunkIndex, direction, count, expanded: true },
      [generalKey]: { hunkIndex, direction, count, expanded: true },
    }));
  }

  public isHunkExpanded(hunkIndex: number, direction: 'up' | 'down' | 'both' = 'both'): boolean {
    const active = this.activeFile();
    if (!active) return false;
    const key = `${active.id}_${direction}_${hunkIndex}`;
    const generalKey = `${active.id}_hunk_${hunkIndex}`;
    const map = this.expandedLines();
    return !!map[key]?.expanded || !!map[generalKey]?.expanded;
  }

  public onEscapeKey(): void {
    if (this.activeComposer()) {
      this.activeComposer.set(null);
      return;
    }
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

  public openComposerForLine(filePath: string, line: number, fileId: string): void {
    this.showInlineComments.set(true);
    this.activeComposer.set({
      fileId,
      filePath,
      line: Math.max(1, line),
      title: '',
      category: 'CUSTOM',
      severity: 'WARNING',
      comment: '',
      suggestedCode: '',
    });
  }

  public updateComposerField(field: keyof InlineComposerState, value: string | number): void {
    this.activeComposer.update((c) => (c ? { ...c, [field]: value } : null));
  }

  public cancelComposer(): void {
    this.activeComposer.set(null);
  }

  public submitComposer(): void {
    const comp = this.activeComposer();
    if (!comp) return;

    const trimmedComment = comp.comment.trim();
    if (!trimmedComment) return;

    const title = comp.title.trim() || `Review comment on line ${comp.line}`;

    const newFinding: DiffFindingRef = {
      id: `user_comment_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      path: comp.filePath,
      line: comp.line,
      category: comp.category,
      severity: comp.severity,
      title,
      comment: trimmedComment,
      userEditedComment: trimmedComment,
      suggestedCode: comp.suggestedCode.trim() || undefined,
      approved: true,
      author: 'user',
      isCustom: true,
    };

    this.addCustomFinding.emit(newFinding);
    this.activeComposer.set(null);
  }

  public onToggleApproval(id: string): void {
    this.toggleApproval.emit(id);
  }

  public onUpdateComment(id: string, comment: string): void {
    this.updateFindingComment.emit({ id, comment });
  }

  public onDeleteFinding(id: string): void {
    this.deleteFinding.emit(id);
  }

  public onOpenEditModal(finding: DiffFindingRef): void {
    this.openEditModal.emit(finding);
  }

  public copyCode(code: string): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code);
    }
  }

  // ==================== HUNK EXPANSION HANDLERS ====================

  public isHunkAtTop(hunk: ParsedDiffFile['hunks'][0]): boolean {
    const firstCodeLine = hunk.lines.find((l) => l.type !== 'hunk-header');
    if (!firstCodeLine) return hunk.newStart <= 1;
    const start = firstCodeLine.newLineNumber ?? firstCodeLine.oldLineNumber ?? hunk.newStart;
    return start <= 1;
  }

  public expandHunkAbove(hunkIndex: number): void {
    this.toggleExpand(hunkIndex, 'up', 20);
  }

  public expandHunkBelow(hunkIndex: number): void {
    this.toggleExpand(hunkIndex, 'down', 20);
  }

  public expandHunkAll(hunkIndex: number): void {
    this.toggleExpand(hunkIndex, 'both', 50);
  }

  public expandAllInActiveFile(): void {
    const active = this.activeFile();
    if (!active) return;

    this.tryFetchRemoteFileContent(active.newPath);

    this.displayedFiles.update((files) => {
      const file = files.find((f) => f.id === active.id);
      if (file) {
        expandAllHunksInFile(file, this.findings());
      }
      return [...files];
    });
  }

  public resetActiveFileDiff(): void {
    const originalParsed = parseUnifiedDiff(this.diffText(), this.findings());
    const active = this.activeFile();
    if (!active) return;

    const originalFile = originalParsed.find((f) => f.id === active.id);
    if (!originalFile) return;

    this.displayedFiles.update((files) => {
      return files.map((f) => (f.id === active.id ? originalFile : f));
    });
  }

  private tryFetchRemoteFileContent(path: string): void {
    const repo = this.repoName();
    const token = this.gitHubToken();
    if (this.reviewService && repo && path) {
      this.reviewService
        .fetchFileContent({
          token: token || undefined,
          repo,
          path,
        })
        .subscribe({
          next: (res) => {
            if (res.success && res.content) {
              FileContextEngine.registerFileContent(path, res.content);
            }
          },
          error: () => {
            // Fallback to local AST context engine
          },
        });
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
      const isUser = line.findings.some((f) => f.author === 'user');
      return isUser ? 'bg-[#1e2a22] border-l-[#238636]' : 'bg-[#222a35] border-l-[#007acc]';
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
