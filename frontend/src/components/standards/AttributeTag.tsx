"use client";

/**
 * Attribute Tag Component
 * 
 * Color-coded badge showing which NATO standard governs an attribute.
 * Used throughout the UI to visually distinguish 5663 vs 240 attributes.
 * 
 * Examples:
 * - issuer → 5663 (indigo) "Federation/Identity"
 * - classification → both (teal) "Shared ABAC"
 * - ztdf_signature → 240 (amber) "Object/Data"
 * 
 * @see ADatP-5663 §4.4 Minimum Subject Attributes
 * @see ACP-240 §4 Resource Attributes
 */

interface AttributeTagProps {
  standard: '5663' | '240' | 'both';
  attribute?: string;
  tooltip?: string;
  size?: 'xs' | 'sm' | 'md';
  showIcon?: boolean;
  showLabel?: boolean;
}

export function AttributeTag({ 
  standard, 
  attribute, 
  tooltip, 
  size = 'sm',
  showIcon = true,
  showLabel = true
}: AttributeTagProps) {
  const configs = {
    '5663': {
      emoji: '🔵',
      label: '5663',
      fullLabel: 'ADatP-5663',
      description: 'Federation/Identity',
      bg: 'bg-indigo-100 dark:bg-indigo-900',
      text: 'text-indigo-800 dark:text-indigo-200',
      border: 'border-indigo-300 dark:border-indigo-700',
    },
    '240': {
      emoji: '🟠',
      label: '240',
      fullLabel: 'ACP-240',
      description: 'Object/Data',
      bg: 'bg-amber-100 dark:bg-amber-900',
      text: 'text-amber-800 dark:text-amber-200',
      border: 'border-amber-300 dark:border-amber-700',
    },
    'both': {
      emoji: '🟢',
      label: 'Both',
      fullLabel: 'Shared ABAC',
      description: 'Both Standards',
      bg: 'bg-teal-100 dark:bg-teal-900',
      text: 'text-teal-800 dark:text-teal-200',
      border: 'border-teal-300 dark:border-teal-700',
    },
  };

  const config = configs[standard];

  const sizeClasses = {
    xs: 'text-[10px] px-1.5 py-0.5',
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
  };

  const tooltipText = tooltip || `${config.fullLabel} (${config.description})`;

  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded-full font-medium border
        ${config.bg} ${config.text} ${config.border}
        ${sizeClasses[size]}
      `}
      title={tooltipText}
    >
      {showIcon && <span className="text-sm">{config.emoji}</span>}
      {showLabel && <span>{attribute || config.label}</span>}
    </span>
  );
}

/**
 * Attribute Tag Group
 * 
 * Groups multiple attribute tags with consistent spacing
 */
export function AttributeTagGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {children}
    </div>
  );
}
