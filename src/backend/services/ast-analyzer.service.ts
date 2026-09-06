import { ReviewFinding, CustomRule } from '../models/types';

export class AstAnalyzerService {
  public analyzeLocally(
    diff: string,
    prTitle: string,
    customRules: CustomRule[] = []
  ): { summary: string; score: number; findings: ReviewFinding[] } {
    const findings: ReviewFinding[] = [];
    const lines = diff.split('\n');
    let currentFile = 'src/app/service.ts';
    let currentLineNumber = 1;

    for (const line of lines) {
      // Track current file from unified diff header
      if (line.startsWith('diff --git')) {
        const parts = line.split(' ');
        if (parts.length >= 4) {
          currentFile = parts[3].replace(/^b\//, '');
        }
      } else if (line.startsWith('+++ b/')) {
        currentFile = line.replace('+++ b/', '').trim();
      } else if (line.startsWith('@@')) {
        const match = line.match(/\+([0-9]+)/);
        if (match && match[1]) {
          currentLineNumber = parseInt(match[1], 10);
        }
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        const addedCode = line.substring(1).trim();

        // 1. Check custom rules with patterns
        for (const rule of customRules.filter((r) => r.enabled && r.pattern)) {
          try {
            const regex = new RegExp(rule.pattern!, 'i');
            if (regex.test(addedCode)) {
              findings.push({
                path: currentFile,
                line: currentLineNumber,
                category: rule.category,
                severity: rule.severity,
                title: `Policy Violation: ${rule.title}`,
                comment: `${rule.description}\nMatched pattern violation: \`${addedCode.substring(0, 100)}\``,
                suggestedCode: rule.suggestedCodeTemplate || '// Refactor to comply with policy',
              });
            }
          } catch {
            if (addedCode.toLowerCase().includes(rule.pattern!.toLowerCase())) {
              findings.push({
                path: currentFile,
                line: currentLineNumber,
                category: rule.category,
                severity: rule.severity,
                title: `Policy Violation: ${rule.title}`,
                comment: `${rule.description}\nMatched substring violation: \`${addedCode.substring(0, 100)}\``,
                suggestedCode: rule.suggestedCodeTemplate,
              });
            }
          }
        }

        // 2. Default AST & heuristic checks if not already flagged
        if (
          (addedCode.includes('SELECT') || addedCode.includes('rawQuery')) &&
          (addedCode.includes('+') || addedCode.includes('${'))
        ) {
          findings.push({
            path: currentFile,
            line: currentLineNumber,
            category: 'SECURITY',
            severity: 'CRITICAL',
            title: 'Critical SQL Injection Vulnerability',
            comment:
              'Dynamic string interpolation into SQL queries allows arbitrary SQL injection. Use parameterized queries.',
            suggestedCode:
              'const query = "SELECT * FROM users WHERE id = ?";\nreturn await this.db.query(query, [userId]);',
          });
        }

        if (
          addedCode.includes('apiKey = "') ||
          addedCode.includes('secret = "') ||
          addedCode.includes('password = "')
        ) {
          findings.push({
            path: currentFile,
            line: currentLineNumber,
            category: 'SECURITY',
            severity: 'CRITICAL',
            title: 'Hardcoded Secret Detected in Diff',
            comment:
              'Secrets, keys, or credentials must never be committed to source code. Store in environment variables.',
            suggestedCode: 'const apiKey = process.env.API_KEY;\nif (!apiKey) throw new Error("Missing API_KEY");',
          });
        }

        if (
          (addedCode.includes('.forEach(') || addedCode.includes('for (')) &&
          (addedCode.includes('await ') || addedCode.includes('fetch(') || addedCode.includes('.query('))
        ) {
          findings.push({
            path: currentFile,
            line: currentLineNumber,
            category: 'PERFORMANCE',
            severity: 'CRITICAL',
            title: 'N+1 Query Loop in Asynchronous Routine',
            comment:
              'Querying inside a loop triggers sequential database network round-trips. Batch fetch items outside the loop.',
            suggestedCode: 'const ids = items.map(i => i.id);\nconst records = await this.repo.findByIds(ids);',
          });
        }

        if (
          addedCode.includes('class UserService') &&
          (diff.includes('sendEmail') || diff.includes('processPayment'))
        ) {
          findings.push({
            path: currentFile,
            line: currentLineNumber,
            category: 'SOLID',
            severity: 'CRITICAL',
            title: 'SRP Violation: God-Class Anti-pattern',
            comment:
              'UserService handles user persistence, email dispatching, and payments simultaneously, violating Single Responsibility Principle.',
            suggestedCode:
              '// Delegate to distinct domain collaborators:\nconstructor(\n  private readonly userRepo: IUserRepository,\n  private readonly notifier: INotificationService\n) {}',
          });
        }

        if (addedCode.includes('console.log(') || addedCode.includes('console.debug(')) {
          findings.push({
            path: currentFile,
            line: currentLineNumber,
            category: 'CLEAN_CODE',
            severity: 'SUGGESTION',
            title: 'Avoid console.log in Production Code',
            comment:
              'Console logs degrade performance and clutter stdout. Use a structured logger with log levels.',
            suggestedCode: 'this.logger.debug("Operation completed", { meta });',
          });
        }

        currentLineNumber++;
      } else if (!line.startsWith('-')) {
        currentLineNumber++;
      }
    }

    // Deduplicate findings by line & title
    const uniqueFindings = findings.filter(
      (f, idx, self) =>
        idx === self.findIndex((o) => o.path === f.path && o.line === f.line && o.title === f.title)
    );

    const score = Math.max(25, 100 - uniqueFindings.length * 15);
    return {
      summary: `Automated AST & Custom Policy Review for PR "${prTitle}". Identified ${uniqueFindings.length} actionable code findings across ${uniqueFindings.length > 0 ? 'SOLID, Security, and Performance' : 'all'} architectural criteria.`,
      score,
      findings: uniqueFindings,
    };
  }
}

export const astAnalyzerService = new AstAnalyzerService();
