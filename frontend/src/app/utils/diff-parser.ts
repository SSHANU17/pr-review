export interface DiffFindingRef {
  id: string;
  path: string;
  line: number;
  category: 'SOLID' | 'SECURITY' | 'PERFORMANCE' | 'BUG' | 'CLEAN_CODE' | 'CUSTOM';
  severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
  title: string;
  comment: string;
  suggestedCode?: string;
  approved?: boolean;
  userEditedComment?: string;
}

export type DiffLineType = 'file-header' | 'hunk-header' | 'add' | 'delete' | 'context';

export interface DiffSyntaxToken {
  text: string;
  type: 'keyword' | 'type' | 'string' | 'comment' | 'number' | 'function' | 'decorator' | 'operator' | 'plain';
}

export interface DiffLine {
  id: string;
  type: DiffLineType;
  raw: string;
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
  tokens: DiffSyntaxToken[];
  findings: DiffFindingRef[];
  isHighlighted?: boolean;
}

export interface SplitDiffRow {
  left?: DiffLine;
  right?: DiffLine;
  findings: DiffFindingRef[];
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldLength: number;
  newStart: number;
  newLength: number;
  lines: DiffLine[];
}

export interface ParsedDiffFile {
  id: string;
  oldPath: string;
  newPath: string;
  fileName: string;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
  findingsCount: number;
  status: 'M' | 'A' | 'D';
}

const TS_KEYWORDS = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete',
  'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'from', 'function',
  'get', 'if', 'implements', 'import', 'in', 'instanceof', 'interface', 'let', 'new', 'null',
  'of', 'package', 'private', 'protected', 'public', 'readonly', 'return', 'set', 'static',
  'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while',
  'with', 'yield', 'async', 'await', 'as', 'type', 'namespace', 'module', 'declare', 'abstract'
]);

const TS_TYPES = new Set([
  'string', 'number', 'boolean', 'any', 'void', 'never', 'unknown', 'object', 'symbol',
  'bigint', 'Promise', 'Observable', 'Array', 'Record', 'Map', 'Set', 'Date', 'Error',
  'Request', 'Response', 'NextFunction', 'Router', 'Express', 'UserService', 'OrderController',
  'ReviewFinding', 'ReviewResponse', 'SourceFileDoc', 'GitHubUserProfile', 'OAuthConfigResponse'
]);

/**
 * Tokenize a line of code into syntax tokens
 */
export function tokenizeCode(text: string): DiffSyntaxToken[] {
  if (!text) return [];

  const tokens: DiffSyntaxToken[] = [];
  const regex = /(\/\/.*$|\/\*[\s\S]*?\*\/|`(?:\\.|[^`\\])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|@\w+|\b\d+(?:\.\d+)?\b|\b(?:SELECT|INSERT|INTO|VALUES|WHERE|FROM|UPDATE|DELETE|JOIN|ORDER BY|GROUP BY)\b|\b[a-zA-Z_$][a-zA-Z0-9_$]*\b|[+\-*/%=<>!&|^~?:;,.]+|\s+)/gy;

  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = regex.exec(text)) !== null) {
    const raw = match[0];
    const isKeyword = TS_KEYWORDS.has(raw);
    const isType = TS_TYPES.has(raw) || /^[A-Z][a-zA-Z0-9_$]*$/.test(raw);

    if (raw.startsWith('//') || raw.startsWith('/*')) {
      tokens.push({ text: raw, type: 'comment' });
    } else if (raw.startsWith("'") || raw.startsWith('"') || raw.startsWith('`')) {
      tokens.push({ text: raw, type: 'string' });
    } else if (raw.startsWith('@')) {
      tokens.push({ text: raw, type: 'decorator' });
    } else if (/^\d+(?:\.\d+)?$/.test(raw)) {
      tokens.push({ text: raw, type: 'number' });
    } else if (isKeyword) {
      tokens.push({ text: raw, type: 'keyword' });
    } else if (isType) {
      tokens.push({ text: raw, type: 'type' });
    } else if (/^(?:SELECT|INSERT|INTO|VALUES|WHERE|FROM|UPDATE|DELETE)$/i.test(raw)) {
      tokens.push({ text: raw, type: 'keyword' });
    } else if (/^[+\-*/%=<>!&|^~?:;,.]$/.test(raw)) {
      tokens.push({ text: raw, type: 'operator' });
    } else {
      // Check if next token starts with '('
      const remaining = text.slice(regex.lastIndex).trimStart();
      if (remaining.startsWith('(') && /^[a-zA-Z_$]/.test(raw)) {
        tokens.push({ text: raw, type: 'function' });
      } else {
        tokens.push({ text: raw, type: 'plain' });
      }
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push({ text: text.slice(lastIndex), type: 'plain' });
  }

  return tokens;
}

/**
 * Check if a finding applies to a given file path
 */
function pathMatches(findingPath: string, filePath: string): boolean {
  if (!findingPath || !filePath) return false;
  const cleanFinding = findingPath.replace(/^[./]+/, '').toLowerCase();
  const cleanFile = filePath.replace(/^[./]+/, '').toLowerCase();
  const fName1 = cleanFinding.split('/').pop() || '';
  const fName2 = cleanFile.split('/').pop() || '';

  return cleanFinding === cleanFile ||
    cleanFinding.endsWith(cleanFile) ||
    cleanFile.endsWith(cleanFinding) ||
    (fName1.length > 3 && fName1 === fName2);
}

/**
 * Parse a unified diff stream into structured files and hunks, attaching matching findings
 */
export function parseUnifiedDiff(rawDiff: string, findings: DiffFindingRef[] = []): ParsedDiffFile[] {
  if (!rawDiff || !rawDiff.trim()) return [];

  const rawLines = rawDiff.split(/\r?\n/);
  const files: ParsedDiffFile[] = [];

  let currentFile: ParsedDiffFile | null = null;
  let currentHunk: DiffHunk | null = null;

  let oldLineCounter = 1;
  let newLineCounter = 1;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];

    // File header: diff --git a/src/... b/src/...
    if (line.startsWith('diff --git')) {
      if (currentHunk && currentFile) {
        currentFile.hunks.push(currentHunk);
        currentHunk = null;
      }
      if (currentFile) {
        files.push(currentFile);
      }

      const match = line.match(/diff --git a\/(.+?) b\/(.+)/);
      const oldPath = match ? match[1] : 'unknown';
      const newPath = match ? match[2] : oldPath;
      const fileName = newPath.split('/').pop() || newPath;

      currentFile = {
        id: `file_${files.length}_${fileName}`,
        oldPath,
        newPath,
        fileName,
        hunks: [],
        additions: 0,
        deletions: 0,
        findingsCount: 0,
        status: 'M',
      };
      continue;
    }

    // index line or mode lines
    if (line.startsWith('index ') || line.startsWith('new file mode') || line.startsWith('deleted file mode')) {
      if (currentFile && line.startsWith('new file mode')) currentFile.status = 'A';
      if (currentFile && line.startsWith('deleted file mode')) currentFile.status = 'D';
      continue;
    }

    // --- a/path or +++ b/path
    if (line.startsWith('--- ') || line.startsWith('+++ ')) {
      if (!currentFile) {
        const pathPart = line.substring(4).replace(/^[ab]\//, '');
        currentFile = {
          id: `file_${files.length}_${pathPart.split('/').pop() || 'diff'}`,
          oldPath: pathPart,
          newPath: pathPart,
          fileName: pathPart.split('/').pop() || 'diff',
          hunks: [],
          additions: 0,
          deletions: 0,
          findingsCount: 0,
          status: 'M',
        };
      }
      continue;
    }

    // Hunk Header: @@ -oldStart,oldLength +newStart,newLength @@
    if (line.startsWith('@@')) {
      if (currentHunk && currentFile) {
        currentFile.hunks.push(currentHunk);
      }

      if (!currentFile) {
        currentFile = {
          id: `file_${files.length}_diff`,
          oldPath: 'source-diff',
          newPath: 'source-diff',
          fileName: 'source-diff',
          hunks: [],
          additions: 0,
          deletions: 0,
          findingsCount: 0,
          status: 'M',
        };
      }

      const hunkMatch = line.match(/@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(.*)/);
      const oldStart = hunkMatch ? parseInt(hunkMatch[1], 10) : 1;
      const oldLength = hunkMatch && hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1;
      const newStart = hunkMatch ? parseInt(hunkMatch[3], 10) : 1;
      const newLength = hunkMatch && hunkMatch[4] ? parseInt(hunkMatch[4], 10) : 1;

      oldLineCounter = oldStart;
      newLineCounter = newStart;

      currentHunk = {
        header: line,
        oldStart,
        oldLength,
        newStart,
        newLength,
        lines: [
          {
            id: `hunk_hdr_${i}`,
            type: 'hunk-header',
            raw: line,
            content: line,
            tokens: [{ text: line, type: 'comment' }],
            findings: [],
          },
        ],
      };
      continue;
    }

    // Code lines within a hunk
    if (currentHunk && currentFile) {
      if (line.startsWith('+')) {
        const content = line.substring(1);
        const curLineNum = newLineCounter++;
        currentFile.additions++;

        const matchingFindings = findings.filter(
          (f) => pathMatches(f.path, currentFile!.newPath) && (f.line === curLineNum || (curLineNum >= f.line - 1 && curLineNum <= f.line + 1))
        );

        currentHunk.lines.push({
          id: `line_${currentFile.id}_add_${curLineNum}_${i}`,
          type: 'add',
          raw: line,
          content,
          newLineNumber: curLineNum,
          tokens: tokenizeCode(content),
          findings: matchingFindings,
        });
      } else if (line.startsWith('-')) {
        const content = line.substring(1);
        const curLineNum = oldLineCounter++;
        currentFile.deletions++;

        const matchingFindings = findings.filter(
          (f) => pathMatches(f.path, currentFile!.oldPath) && f.line === curLineNum
        );

        currentHunk.lines.push({
          id: `line_${currentFile.id}_del_${curLineNum}_${i}`,
          type: 'delete',
          raw: line,
          content,
          oldLineNumber: curLineNum,
          tokens: tokenizeCode(content),
          findings: matchingFindings,
        });
      } else if (line.startsWith('\\ No newline at end of file')) {
        // Ignore git special comment
      } else {
        // Context line
        const content = line.startsWith(' ') ? line.substring(1) : line;
        const curOld = oldLineCounter++;
        const curNew = newLineCounter++;

        const matchingFindings = findings.filter(
          (f) => pathMatches(f.path, currentFile!.newPath) && (f.line === curNew || f.line === curOld)
        );

        currentHunk.lines.push({
          id: `line_${currentFile.id}_ctx_${curNew}_${i}`,
          type: 'context',
          raw: line,
          content,
          oldLineNumber: curOld,
          newLineNumber: curNew,
          tokens: tokenizeCode(content),
          findings: matchingFindings,
        });
      }
    }
  }

  if (currentHunk && currentFile) {
    currentFile.hunks.push(currentHunk);
  }
  if (currentFile) {
    files.push(currentFile);
  }

  // Count total matched findings per file
  for (const file of files) {
    let count = 0;
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        count += line.findings.length;
      }
    }
    file.findingsCount = count;
  }

  return files;
}

/**
 * Builds side-by-side (split) rows from a hunk for split view rendering
 */
export function buildSplitHunkRows(hunk: DiffHunk): SplitDiffRow[] {
  const rows: SplitDiffRow[] = [];
  const lines = hunk.lines;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.type === 'hunk-header') {
      rows.push({
        left: line,
        right: line,
        findings: [],
      });
      i++;
      continue;
    }

    if (line.type === 'context') {
      rows.push({
        left: line,
        right: line,
        findings: line.findings,
      });
      i++;
      continue;
    }

    // Handle delete + add sequence
    if (line.type === 'delete') {
      const delLines: DiffLine[] = [];
      while (i < lines.length && lines[i].type === 'delete') {
        delLines.push(lines[i]);
        i++;
      }

      const addLines: DiffLine[] = [];
      while (i < lines.length && lines[i].type === 'add') {
        addLines.push(lines[i]);
        i++;
      }

      const maxLen = Math.max(delLines.length, addLines.length);
      for (let j = 0; j < maxLen; j++) {
        const left = delLines[j];
        const right = addLines[j];
        const combinedFindings = [...(left?.findings || []), ...(right?.findings || [])];
        rows.push({
          left,
          right,
          findings: combinedFindings,
        });
      }
      continue;
    }

    if (line.type === 'add') {
      rows.push({
        left: undefined,
        right: line,
        findings: line.findings,
      });
      i++;
      continue;
    }

    i++;
  }

  return rows;
}
