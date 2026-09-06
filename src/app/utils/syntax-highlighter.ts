export interface SyntaxToken {
  text: string;
  type: 'keyword' | 'type' | 'string' | 'comment' | 'number' | 'function' | 'decorator' | 'operator' | 'plain';
}

const KEYWORDS = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete',
  'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'from', 'function',
  'get', 'if', 'implements', 'import', 'in', 'instanceof', 'interface', 'let', 'new', 'null',
  'of', 'package', 'private', 'protected', 'public', 'readonly', 'return', 'set', 'static',
  'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while',
  'with', 'yield', 'async', 'await', 'as', 'type', 'namespace', 'module', 'declare', 'abstract'
]);

export function highlightCode(code: string): SyntaxToken[] {
  if (!code) return [];
  const tokens: SyntaxToken[] = [];
  const regex = /(\/\/.*$|\/\*[\s\S]*?\*\/|`(?:\\.|[^`\\])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|@\w+|\b\d+(?:\.\d+)?\b|\b[a-zA-Z_$][a-zA-Z0-9_$]*\b|[+\-*/%=<>!&|^~?:;,.]+|\s+)/gy;

  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = regex.exec(code)) !== null) {
    const raw = match[0];
    if (raw.startsWith('//') || raw.startsWith('/*')) {
      tokens.push({ text: raw, type: 'comment' });
    } else if (raw.startsWith("'") || raw.startsWith('"') || raw.startsWith('`')) {
      tokens.push({ text: raw, type: 'string' });
    } else if (raw.startsWith('@')) {
      tokens.push({ text: raw, type: 'decorator' });
    } else if (/^\d+(?:\.\d+)?$/.test(raw)) {
      tokens.push({ text: raw, type: 'number' });
    } else if (KEYWORDS.has(raw)) {
      tokens.push({ text: raw, type: 'keyword' });
    } else if (/^[A-Z][a-zA-Z0-9_$]*$/.test(raw)) {
      tokens.push({ text: raw, type: 'type' });
    } else if (/^[+\-*/%=<>!&|^~?:;,.]$/.test(raw)) {
      tokens.push({ text: raw, type: 'operator' });
    } else {
      tokens.push({ text: raw, type: 'plain' });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < code.length) {
    tokens.push({ text: code.slice(lastIndex), type: 'plain' });
  }

  return tokens;
}
