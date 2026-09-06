import { GoogleGenAI, Type } from '@google/genai';
import { CustomRule, ReviewResponse } from '../models/types';
import { ruleEngineService } from './rule-engine.service';
import { astAnalyzerService } from './ast-analyzer.service';

export class GeminiService {
  private ai: GoogleGenAI | null = null;
  private readonly apiKey: string;

  constructor() {
    this.apiKey = process.env['GEMINI_API_KEY'] || '';
    if (this.apiKey) {
      this.ai = new GoogleGenAI({ apiKey: this.apiKey });
    }
  }

  public isConfigured(): boolean {
    return Boolean(this.ai);
  }

  public async reviewDiff(
    diff: string,
    prTitle: string,
    prDescription = '',
    repoName = 'unknown-repo',
    customRules?: CustomRule[]
  ): Promise<ReviewResponse> {
    if (!this.ai) {
      console.warn('[GeminiService] GEMINI_API_KEY not configured, using AST & rule-engine fallback');
      const activeRules = customRules && customRules.length > 0 ? customRules : ruleEngineService.getAllRules();
      return astAnalyzerService.analyzeLocally(diff, prTitle, activeRules);
    }

    const customRuleDirectives = ruleEngineService.compileActiveRuleDirectives(customRules);

    const systemPrompt = `You are a Principal Software Architect & Automated Pull Request Reviewer for enterprise systems.
Review the provided Unified Git Diff strictly against:
1. SOLID Principles:
   - Single Responsibility (SRP): Flag bloated classes/methods managing multiple concerns.
   - Open-Closed (OCP): Flag switch/case chains easily extensible via polymorphism or strategy pattern.
   - Liskov Substitution (LSP): Flag subclasses throwing UnsupportedOperationException or violating contracts.
   - Interface Segregation (ISP): Flag monolithic interfaces forcing unused method implementations.
   - Dependency Inversion (DIP): Flag high-level services directly instantiating low-level concretions with 'new'.
2. Bugs & Security Vulnerabilities:
   - SQL Injections, hardcoded API keys/passwords/JWT secrets, unvalidated inputs, ReDoS, memory leaks, unhandled promises.
3. Performance & Resource Management:
   - N+1 database queries in loops, unindexed searches, lack of batching, unclosed streams.
4. Clean Code & Maintainability:
   - Deep nesting, magic numbers, poor naming conventions.
${customRuleDirectives}
Important Instructions:
- Output JSON strictly complying with the schema.
- For each finding, provide:
  - "path": Relative file path from the diff (e.g., 'src/app/services/user.service.ts').
  - "line": The EXACT new line number (in the target file after the patch) where the issue is introduced or exists.
  - "category": 'SOLID' | 'SECURITY' | 'PERFORMANCE' | 'BUG' | 'CLEAN_CODE' | 'CUSTOM'.
  - "severity": 'CRITICAL' | 'WARNING' | 'SUGGESTION'.
  - "title": Short concise headline (e.g., 'N+1 Database Query in Asynchronous Loop').
  - "comment": Precise architectural review explanation with trade-offs.
  - "suggestedCode": Complete, drop-in replacement snippet illustrating the fix/refactoring.
- Provide a summary and an overall code quality score (0 to 100).`;

    const userPrompt = `Pull Request Details:
Repository: ${repoName}
PR Title: ${prTitle}
PR Description: ${prDescription || 'None'}

Unified Git Diff to Review:
\`\`\`diff
${diff}
\`\`\``;

    // Retry with exponential backoff for resilience against transient upstream rate limits or model switching
    const modelsToTry = ['gemini-3.7-flash', 'gemini-3.6-flash'];
    let lastError: Error | null = null;

    for (const modelName of modelsToTry) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await this.ai.models.generateContent({
            model: modelName,
            contents: [
              {
                role: 'user',
                parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
              },
            ],
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  summary: {
                    type: Type.STRING,
                    description: 'Executive summary of PR code quality and architectural health.',
                  },
                  score: {
                    type: Type.NUMBER,
                    description: 'Overall code quality score between 0 and 100.',
                  },
                  findings: {
                    type: Type.ARRAY,
                    description: 'List of pinpoint review findings directly tied to diff lines.',
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        path: { type: Type.STRING, description: 'Relative path to the affected file' },
                        line: { type: Type.NUMBER, description: 'New line number in the target file' },
                        category: {
                          type: Type.STRING,
                          enum: ['SOLID', 'SECURITY', 'PERFORMANCE', 'BUG', 'CLEAN_CODE', 'CUSTOM'],
                        },
                        severity: {
                          type: Type.STRING,
                          enum: ['CRITICAL', 'WARNING', 'SUGGESTION'],
                        },
                        title: { type: Type.STRING, description: 'Short summary headline' },
                        comment: { type: Type.STRING, description: 'Detailed review feedback' },
                        suggestedCode: { type: Type.STRING, description: 'Refactored code snippet' },
                      },
                      required: ['path', 'line', 'category', 'severity', 'title', 'comment'],
                    },
                  },
                },
                required: ['summary', 'score', 'findings'],
              },
            },
          });

          if (response && response.text) {
            const parsed = JSON.parse(response.text) as ReviewResponse;
            return parsed;
          }
        } catch (err: unknown) {
          lastError = err instanceof Error ? err : new Error(String(err));
          console.warn(`[GeminiService] Model ${modelName} attempt ${attempt} failed: ${lastError.message}`);
          await new Promise((res) => setTimeout(res, 500 * attempt));
        }
      }
    }

    console.warn('[GeminiService] All Gemini calls failed or timed out. Falling back to local AST analyzer.', lastError);
    const activeRules = customRules && customRules.length > 0 ? customRules : ruleEngineService.getAllRules();
    return astAnalyzerService.analyzeLocally(diff, prTitle, activeRules);
  }
}

export const geminiService = new GeminiService();
