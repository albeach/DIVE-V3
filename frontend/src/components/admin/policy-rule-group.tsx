import { IRuleGroup } from "@/lib/rego-rule-extractor";

type Props = {
    group: IRuleGroup;
    onToggle: (ruleName: string, enabled: boolean) => Promise<void> | void;
    saving?: boolean;
    defaultExpanded?: boolean;
};

// Temporary stub to satisfy build; replace with real implementation when available
export function PolicyRuleGroup({ group }: Props) {
    return (
        <div>
            <strong>{group.category}</strong>
        </div>
    );
}
