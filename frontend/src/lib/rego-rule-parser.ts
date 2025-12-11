/**
 * Rego Rule Parser
 * Extracts and categorizes rules from Rego policy files
 */

export interface IPolicyRule {
    name: string;
    type: 'violation' | 'check' | 'helper' | 'decision' | 'default';
    description: string;
    enabled: boolean;
    lineNumber: number;
    definition: string;
    category: string;
    summary?: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    scenarios?: string[];
    dependsOn?: string[];
    referencedInAllow?: boolean;
}

export interface IRuleCategory {
    name: string;
    rules: IPolicyRule[];
    color: string;
    icon: string;
}

/**
 * Extract all rules from Rego policy content
 */
export function extractRules(content: string): IPolicyRule[] {
    const rules: IPolicyRule[] = [];
    const lines = content.split('\n');

    // Patterns to identify different rule types
    const violationPattern = /^(is_not_\w+|is_\w+_violation|is_\w+_blocked|is_\w+_exceeded)\s*:=\s*/;
    const checkPattern = /^(check_\w+|is_\w+_valid|has_\w+)\s*:=\s*/;
    const helperPattern = /^(\w+_rank|\w+_levels|valid_\w+)\s*:=\s*/;
    const decisionPattern = /^(allow|decision|reason|obligations)\s*:=\s*/;
    const defaultPattern = /^default\s+(\w+)\s*:=\s*/;

    // Track which rules are enabled in the allow block
    // Match allow block without using the /s flag to stay compatible with older targets
    const allowBlockMatch = content.match(/allow\s+if\s*\{([\s\S]*?)\}/);
    const enabledRules = new Set<string>();
    const allowRules = new Set<string>();

    if (allowBlockMatch) {
        const allowContent = allowBlockMatch[1];
        // Find all "not ruleName" patterns
        const notMatches = allowContent.matchAll(/not\s+([a-zA-Z_][a-zA-Z0-9_]*)/g);
        for (const match of notMatches) {
            enabledRules.add(match[1]);
            allowRules.add(match[1]);
        }
        const directMatches = allowContent.matchAll(/[\s\(]([a-zA-Z_][a-zA-Z0-9_]*)/g);
        for (const match of directMatches) {
            allowRules.add(match[1]);
        }
    }

    lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;

        let rule: IPolicyRule | null = null;
        let type: IPolicyRule['type'] = 'helper';
        let name = '';

        const metadata = extractRuleMetadata(lines, index);

        // Check for violation rules (is_not_*, is_*_violation)
        const violationMatch = trimmed.match(violationPattern);
        if (violationMatch) {
            name = violationMatch[1];
            type = 'violation';
            rule = {
                name,
                type,
                description: metadata.summary || generateDescription(name, 'violation'),
                summary: metadata.summary,
                severity: metadata.severity,
                scenarios: metadata.scenarios,
                dependsOn: metadata.dependsOn,
                referencedInAllow: allowRules.has(name),
                enabled: enabledRules.has(name),
                lineNumber: index + 1,
                definition: extractRuleDefinition(lines, index),
                category: categorizeRule(name)
            };
        }
        // Check for check rules (check_*, is_*_valid)
        else if (trimmed.match(checkPattern)) {
            const match = trimmed.match(/^(\w+)\s*:=\s*/);
            if (match) {
                name = match[1];
                type = 'check';
                rule = {
                    name,
                    type,
                    description: metadata.summary || generateDescription(name, 'check'),
                    summary: metadata.summary,
                    severity: metadata.severity,
                    scenarios: metadata.scenarios,
                    dependsOn: metadata.dependsOn,
                    referencedInAllow: allowRules.has(name),
                    enabled: enabledRules.has(name),
                    lineNumber: index + 1,
                    definition: extractRuleDefinition(lines, index),
                    category: categorizeRule(name)
                };
            }
        }
        // Check for decision rules (allow, decision, reason)
        else if (trimmed.match(decisionPattern)) {
            const match = trimmed.match(/^(\w+)\s*:=\s*/);
            if (match) {
                name = match[1];
                type = 'decision';
                rule = {
                    name,
                    type,
                    description: metadata.summary || generateDescription(name, 'decision'),
                    summary: metadata.summary,
                    severity: metadata.severity,
                    scenarios: metadata.scenarios,
                    dependsOn: metadata.dependsOn,
                    referencedInAllow: true,
                    enabled: true, // Decision rules are always enabled
                    lineNumber: index + 1,
                    definition: extractRuleDefinition(lines, index),
                    category: 'Decision'
                };
            }
        }
        // Check for default rules
        else if (trimmed.match(defaultPattern)) {
            const match = trimmed.match(/^default\s+(\w+)\s*:=\s*/);
            if (match) {
                name = match[1];
                type = 'default';
                rule = {
                    name,
                    type,
                    description: metadata.summary || generateDescription(name, 'default'),
                    summary: metadata.summary,
                    severity: metadata.severity,
                    scenarios: metadata.scenarios,
                    dependsOn: metadata.dependsOn,
                    referencedInAllow: true,
                    enabled: true, // Default rules are always enabled
                    lineNumber: index + 1,
                    definition: extractRuleDefinition(lines, index),
                    category: 'Default'
                };
            }
        }

        if (rule && !rules.find(r => r.name === rule!.name)) {
            rules.push(rule);
        }
    });

    return rules;
}

/**
 * Extract structured metadata from leading comment block above a rule
 */
function extractRuleMetadata(lines: string[], startIndex: number): {
    summary?: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    scenarios?: string[];
    dependsOn?: string[];
} {
    const metadata: {
        summary?: string;
        severity?: 'low' | 'medium' | 'high' | 'critical';
        scenarios?: string[];
        dependsOn?: string[];
    } = {};

    const commentLines: string[] = [];
    let i = startIndex - 1;

    while (i >= 0) {
        const line = lines[i].trim();
        if (line.startsWith('#')) {
            commentLines.unshift(line);
            i -= 1;
            continue;
        }
        if (line === '') {
            i -= 1;
            continue;
        }
        break;
    }

    commentLines.forEach((line) => {
        const summaryMatch = line.match(/^#\s*@summary\s*:\s*(.+)$/i);
        const severityMatch = line.match(/^#\s*@severity\s*:\s*(.+)$/i);
        const scenarioMatch = line.match(/^#\s*@scenario\s*:\s*(.+)$/i);
        const dependsMatch = line.match(/^#\s*@depends_on\s*:\s*(.+)$/i);

        if (summaryMatch) {
            metadata.summary = summaryMatch[1].trim();
        }
        if (severityMatch) {
            const value = severityMatch[1].trim().toLowerCase();
            if (value === 'low' || value === 'medium' || value === 'high' || value === 'critical') {
                metadata.severity = value;
            }
        }
        if (scenarioMatch) {
            const scenarioValue = scenarioMatch[1].trim();
            metadata.scenarios = [...(metadata.scenarios || []), scenarioValue];
        }
        if (dependsMatch) {
            const depends = dependsMatch[1]
                .split(',')
                .map((d) => d.trim())
                .filter(Boolean);
            metadata.dependsOn = [...(metadata.dependsOn || []), ...depends];
        }
    });

    return metadata;
}

/**
 * Extract the full definition of a rule (multi-line)
 */
function extractRuleDefinition(lines: string[], startIndex: number): string {
    let definition = lines[startIndex];
    let braceCount = (definition.match(/\{/g) || []).length - (definition.match(/\}/g) || []).length;
    let i = startIndex + 1;

    while (i < lines.length && braceCount > 0) {
        definition += '\n' + lines[i];
        braceCount += (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length;
        i++;
    }

    return definition.trim();
}

/**
 * Generate human-readable description from rule name
 */
function generateDescription(name: string, type: string): string {
    // Convert snake_case to Title Case
    const words = name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1));
    const title = words.join(' ');

    if (type === 'violation') {
        if (name.startsWith('is_not_')) {
            return `Check: ${title.replace('Is Not ', '')}`;
        }
        return `Violation: ${title}`;
    }

    return title;
}

/**
 * Categorize rule based on name patterns
 */
function categorizeRule(name: string): string {
    if (name.includes('authentication') || name.includes('authenticated') || name.includes('aal') || name.includes('mfa')) {
        return 'Authentication';
    }
    if (name.includes('clearance') || name.includes('classification')) {
        return 'Clearance';
    }
    if (name.includes('country') || name.includes('releasability') || name.includes('releasable')) {
        return 'Releasability';
    }
    if (name.includes('coi') || name.includes('community')) {
        return 'Community of Interest';
    }
    if (name.includes('embargo') || name.includes('time')) {
        return 'Temporal';
    }
    if (name.includes('ztdf') || name.includes('signature') || name.includes('integrity')) {
        return 'ZTDF';
    }
    if (name.includes('industry') || name.includes('contractor')) {
        return 'Industry';
    }
    if (name.includes('federation') || name.includes('issuer') || name.includes('trusted')) {
        return 'Federation';
    }
    if (name.includes('upload')) {
        return 'Upload';
    }
    return 'Other';
}

/**
 * Group rules by category
 */
export function groupRulesByCategory(rules: IPolicyRule[]): IRuleCategory[] {
    const categories: Record<string, IPolicyRule[]> = {};

    rules.forEach(rule => {
        if (!categories[rule.category]) {
            categories[rule.category] = [];
        }
        categories[rule.category].push(rule);
    });

    const categoryConfig: Record<string, { color: string; icon: string }> = {
        'Authentication': { color: 'from-blue-500 to-cyan-500', icon: '🔐' },
        'Clearance': { color: 'from-purple-500 to-pink-500', icon: '📊' },
        'Releasability': { color: 'from-green-500 to-emerald-500', icon: '🌍' },
        'Community of Interest': { color: 'from-orange-500 to-amber-500', icon: '👥' },
        'Temporal': { color: 'from-indigo-500 to-blue-500', icon: '⏰' },
        'ZTDF': { color: 'from-red-500 to-rose-500', icon: '🔒' },
        'Industry': { color: 'from-yellow-500 to-orange-500', icon: '🏭' },
        'Federation': { color: 'from-teal-500 to-cyan-500', icon: '🔗' },
        'Upload': { color: 'from-violet-500 to-purple-500', icon: '📤' },
        'Decision': { color: 'from-gray-500 to-slate-500', icon: '⚖️' },
        'Default': { color: 'from-gray-400 to-gray-600', icon: '⚙️' },
        'Other': { color: 'from-slate-500 to-gray-500', icon: '📋' }
    };

    return Object.entries(categories).map(([name, rules]) => ({
        name,
        rules,
        color: categoryConfig[name]?.color || categoryConfig['Other'].color,
        icon: categoryConfig[name]?.icon || categoryConfig['Other'].icon
    })).sort((a, b) => {
        // Sort: Decision first, then by name
        if (a.name === 'Decision') return -1;
        if (b.name === 'Decision') return 1;
        return a.name.localeCompare(b.name);
    });
}

