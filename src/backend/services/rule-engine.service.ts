import { CustomRule } from '../models/types';
import { DEFAULT_RULES } from '../config/default-rules';

export class RuleEngineService {
  private inMemoryRules: CustomRule[] = [...DEFAULT_RULES];

  public getAllRules(): CustomRule[] {
    return this.inMemoryRules;
  }

  public getActiveRules(): CustomRule[] {
    return this.inMemoryRules.filter((r) => r.enabled);
  }

  public getRuleById(id: string): CustomRule | undefined {
    return this.inMemoryRules.find((r) => r.id === id);
  }

  public createRule(ruleData: Omit<CustomRule, 'id' | 'createdAt'>): CustomRule {
    const newRule: CustomRule = {
      ...ruleData,
      id: 'rule-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now().toString(36),
      isDefault: false,
      createdAt: new Date().toISOString(),
    };
    this.inMemoryRules.unshift(newRule);
    return newRule;
  }

  public updateRule(id: string, updates: Partial<CustomRule>): CustomRule {
    const index = this.inMemoryRules.findIndex((r) => r.id === id);
    if (index === -1) {
      throw new Error(`Rule with ID "${id}" not found`);
    }

    const updated: CustomRule = {
      ...this.inMemoryRules[index],
      ...updates,
    };
    this.inMemoryRules[index] = updated;
    return updated;
  }

  public deleteRule(id: string): boolean {
    const prevLen = this.inMemoryRules.length;
    this.inMemoryRules = this.inMemoryRules.filter((r) => r.id !== id);
    return this.inMemoryRules.length < prevLen;
  }

  public resetToDefaults(): CustomRule[] {
    this.inMemoryRules = [...DEFAULT_RULES];
    return this.inMemoryRules;
  }

  public compileActiveRuleDirectives(customRules?: CustomRule[]): string {
    const rulesToUse = customRules && customRules.length > 0 ? customRules : this.getActiveRules();
    const active = rulesToUse.filter((r) => r.enabled);
    if (active.length === 0) return '';

    const list = active
      .map(
        (r, idx) =>
          `${idx + 1}. [${r.category} - ${r.severity}] ${r.title}: ${r.description}${
            r.pattern ? ` (Pattern hint: ${r.pattern})` : ''
          }`
      )
      .join('\n');

    return `\nCORPORATE POLICIES & CUSTOM ARCHITECTURAL RULES TO ENFORCE:\n${list}\n`;
  }
}

export const ruleEngineService = new RuleEngineService();
