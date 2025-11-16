'use client';

interface PolicyInsightsProps {
  lineCount: number;
  ruleCount: number;
  hasDefaultDeny: boolean;
  hasAllowRule: boolean;
}

/**
 * PolicyInsights - Displays real-time metrics about the policy
 * Features: Dark mode support, color-coded status indicators
 */
export function PolicyInsights({ lineCount, ruleCount, hasDefaultDeny, hasAllowRule }: PolicyInsightsProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      {/* Line Count */}
      <span className="px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium">
        Lines: {lineCount}
      </span>

      {/* Rule Count */}
      <span className="px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium">
        Rules: {ruleCount}
      </span>

      {/* Default Deny Status */}
      <span
        className={`px-3 py-1 rounded-full font-medium ${
          hasDefaultDeny
            ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300'
            : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'
        }`}
        aria-label={hasDefaultDeny ? 'Default deny present' : 'Default deny missing'}
      >
        Default deny {hasDefaultDeny ? '✅' : '⚠️'}
      </span>

      {/* Allow Rule Status */}
      <span
        className={`px-3 py-1 rounded-full font-medium ${
          hasAllowRule
            ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300'
            : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'
        }`}
        aria-label={hasAllowRule ? 'Allow rule present' : 'Allow rule missing'}
      >
        Allow rule {hasAllowRule ? '✅' : '⚠️'}
      </span>
    </div>
  );
}

