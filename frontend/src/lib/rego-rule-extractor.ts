// Temporary stub to satisfy build; replace with real policy parsing logic when available
export interface IExtractedRule {
    name: string;
    category?: string;
    enabled: boolean;
    content?: string;
    description?: string;
    lineNumber?: number;
}

export interface IRuleGroup {
    category: string;
    rules: IExtractedRule[];
}

export function extractAllRules(_content: string): IExtractedRule[] {
    return [];
}

export function groupRulesByCategory(rules: IExtractedRule[]): IRuleGroup[] {
    return [];
}

export function filterRules(rules: IExtractedRule[], _query: string, _category?: string): IExtractedRule[] {
    return rules;
}
