# Attribute Diff Viewer Specification

## Overview

The Attribute Diff Viewer reveals how ADatP-5663 and ACP-240 use the same ABAC vocabulary but at different enforcement scopes. This component provides a visual comparison tool that highlights shared semantics (green), divergent concepts (red), and transformation mappings between the two standards.

## Core Concept

Both standards rely on attributes for access control decisions, but they organize and name them differently:
- **ADatP-5663**: Identity-focused attributes in JWT tokens
- **ACP-240**: Data-focused attributes in object labels
- **Shared Logic**: Both evaluate the same ABAC rules in OPA

## Component Architecture

```typescript
interface AttributeDiffViewerProps {
  // Data sources
  federationAttributes?: TokenAttributes;
  objectAttributes?: ObjectLabel;
  
  // Display options
  mode: 'side-by-side' | 'unified' | 'mapping';
  showMappings?: boolean;
  highlightMode?: 'all' | 'shared' | 'different';
  
  // Interactions
  onAttributeClick?: (attr: AttributeDetail) => void;
  onExport?: (format: 'json' | 'csv' | 'pdf') => void;
  
  // Customization
  theme?: 'light' | 'dark';
  compactView?: boolean;
}

interface TokenAttributes {
  // ADatP-5663 identity attributes
  uniqueID: string;
  clearance: string;
  countryOfAffiliation: string;
  acpCOI?: string[];
  aal?: string;
  amr?: string[];
  roles?: string[];
  iat?: number;
  exp?: number;
}

interface ObjectLabel {
  // ACP-240 data attributes
  classification: string;
  releasabilityTo: string[];
  COI?: string[];
  creationDate?: string;
  policyId?: string;
  encryptionAlgorithm?: string;
  disseminationControls?: string[];
}

interface AttributeMapping {
  federationAttr: string;
  objectAttr: string;
  relationship: 'equivalent' | 'related' | 'transforms';
  description: string;
  example?: {
    federation: any;
    object: any;
  };
}
```

## Visual Design

### Side-by-Side View

```
┌─────────────────────────────────────────────────────────────────┐
│                    Attribute Comparison                          │
├─────────────────────────────┬───────────────────────────────────┤
│  ADatP-5663 (Identity)  🔵  │  ACP-240 (Object)  🟠            │
├─────────────────────────────┼───────────────────────────────────┤
│ clearance: SECRET       ✓   │ classification: SECRET       ✓   │
│ countryOfAffiliation: USA ✓ │ releasabilityTo: ["USA","GBR"] ✓│
│ acpCOI: ["FVEY"]       ✓   │ COI: ["FVEY"]                ✓   │
│ uniqueID: john.doe     ✗   │ [no equivalent]              -   │
│ aal: AAL2              ✗   │ [no equivalent]              -   │
│ [no equivalent]        -   │ creationDate: 2025-01-01    ✗   │
│ [no equivalent]        -   │ encryptionAlgorithm: AES256  ✗   │
└─────────────────────────────┴───────────────────────────────────┘
Legend: ✓ Shared/Mapped | ✗ Unique | - Not Applicable
```

### Mapping View

```
┌─────────────────────────────────────────────────────────────────┐
│                    Attribute Mappings                            │
├─────────────────────────────────────────────────────────────────┤
│  Federation ←→ Object Mappings                                   │
│                                                                  │
│  clearance ═══════════════════ classification                   │
│            "Maps clearance levels between standards"             │
│                                                                  │
│  countryOfAffiliation ∈ releasabilityTo[]                      │
│            "User's country must be in release list"             │
│                                                                  │
│  acpCOI[] ∩ COI[] ≠ ∅                                          │
│            "At least one COI must match"                         │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation

### 1. Main Component

```typescript
// components/standards/AttributeDiff/AttributeDiffViewer.tsx
'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  GitBranch, 
  Check, 
  X, 
  Minus, 
  ArrowLeftRight,
  Download,
  Filter,
  Info
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AttributeRow } from './AttributeRow';
import { MappingDiagram } from './MappingDiagram';
import { DiffLegend } from './DiffLegend';

// Predefined attribute mappings
const ATTRIBUTE_MAPPINGS: AttributeMapping[] = [
  {
    federationAttr: 'clearance',
    objectAttr: 'classification',
    relationship: 'equivalent',
    description: 'Security clearance level maps directly to data classification',
    example: {
      federation: 'SECRET',
      object: 'SECRET'
    }
  },
  {
    federationAttr: 'countryOfAffiliation',
    objectAttr: 'releasabilityTo',
    relationship: 'related',
    description: 'User country must be in the releasability list',
    example: {
      federation: 'USA',
      object: ['USA', 'GBR', 'CAN', 'AUS', 'NZL']
    }
  },
  {
    federationAttr: 'acpCOI',
    objectAttr: 'COI',
    relationship: 'equivalent',
    description: 'Community of Interest tags must intersect',
    example: {
      federation: ['FVEY', 'NATO'],
      object: ['FVEY']
    }
  }
];

export function AttributeDiffViewer({
  federationAttributes,
  objectAttributes,
  mode = 'side-by-side',
  showMappings = true,
  highlightMode = 'all',
  onAttributeClick,
  onExport,
  theme = 'light',
  compactView = false
}: AttributeDiffViewerProps) {
  const [selectedAttribute, setSelectedAttribute] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  
  // Process attributes and determine relationships
  const processedAttributes = useMemo(() => {
    const fedAttrs = federationAttributes ? Object.entries(federationAttributes) : [];
    const objAttrs = objectAttributes ? Object.entries(objectAttributes) : [];
    
    // Create attribute comparison data
    const comparisonData: any[] = [];
    
    // Process federation attributes
    fedAttrs.forEach(([key, value]) => {
      const mapping = ATTRIBUTE_MAPPINGS.find(m => m.federationAttr === key);
      const objEquivalent = mapping ? objAttrs.find(([k]) => k === mapping.objectAttr) : null;
      
      comparisonData.push({
        federationKey: key,
        federationValue: value,
        objectKey: objEquivalent?.[0] || null,
        objectValue: objEquivalent?.[1] || null,
        mapping,
        status: objEquivalent ? 'shared' : 'federation-only'
      });
    });
    
    // Process object-only attributes
    objAttrs.forEach(([key, value]) => {
      const alreadyProcessed = comparisonData.some(item => item.objectKey === key);
      if (!alreadyProcessed) {
        comparisonData.push({
          federationKey: null,
          federationValue: null,
          objectKey: key,
          objectValue: value,
          mapping: null,
          status: 'object-only'
        });
      }
    });
    
    // Apply filters
    return comparisonData.filter(item => {
      if (highlightMode === 'shared' && item.status !== 'shared') return false;
      if (highlightMode === 'different' && item.status === 'shared') return false;
      
      if (filterText) {
        const searchStr = filterText.toLowerCase();
        return (
          item.federationKey?.toLowerCase().includes(searchStr) ||
          item.objectKey?.toLowerCase().includes(searchStr) ||
          JSON.stringify(item.federationValue).toLowerCase().includes(searchStr) ||
          JSON.stringify(item.objectValue).toLowerCase().includes(searchStr)
        );
      }
      
      return true;
    });
  }, [federationAttributes, objectAttributes, highlightMode, filterText]);
  
  return (
    <div className={cn(
      "attribute-diff-viewer",
      theme === 'dark' && "dark",
      compactView && "compact"
    )}>
      {/* Header with Controls */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold flex items-center gap-2">
          <GitBranch className="w-6 h-6 text-teal-600" />
          Attribute Comparison
        </h3>
        
        <div className="flex items-center gap-3">
          {/* Filter Input */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Filter attributes..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          
          {/* View Mode Toggle */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => mode = 'side-by-side'}
              className={cn(
                "px-3 py-1 rounded text-sm font-medium transition-colors",
                mode === 'side-by-side' 
                  ? "bg-white text-gray-900 shadow-sm" 
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              Side by Side
            </button>
            <button
              onClick={() => mode = 'unified'}
              className={cn(
                "px-3 py-1 rounded text-sm font-medium transition-colors",
                mode === 'unified' 
                  ? "bg-white text-gray-900 shadow-sm" 
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              Unified
            </button>
            <button
              onClick={() => mode = 'mapping'}
              className={cn(
                "px-3 py-1 rounded text-sm font-medium transition-colors",
                mode === 'mapping' 
                  ? "bg-white text-gray-900 shadow-sm" 
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              Mappings
            </button>
          </div>
          
          {/* Export Button */}
          {onExport && (
            <button
              onClick={() => onExport('json')}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              title="Export comparison"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      
      {/* Main Content Area */}
      {mode === 'side-by-side' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Column Headers */}
          <div className="grid grid-cols-2 bg-gray-50 border-b border-gray-200">
            <div className="px-6 py-4 border-r border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-blue-500 rounded-full" />
                <h4 className="font-semibold text-gray-900">ADatP-5663 (Identity Token)</h4>
              </div>
              <p className="text-xs text-gray-600 mt-1">Federation & session attributes</p>
            </div>
            <div className="px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-amber-500 rounded-full" />
                <h4 className="font-semibold text-gray-900">ACP-240 (Object Label)</h4>
              </div>
              <p className="text-xs text-gray-600 mt-1">Data-centric security attributes</p>
            </div>
          </div>
          
          {/* Attribute Rows */}
          <div className="divide-y divide-gray-100">
            <AnimatePresence mode="popLayout">
              {processedAttributes.map((attr, index) => (
                <AttributeRow
                  key={`${attr.federationKey || attr.objectKey}`}
                  {...attr}
                  isSelected={selectedAttribute === (attr.federationKey || attr.objectKey)}
                  onSelect={() => setSelectedAttribute(attr.federationKey || attr.objectKey)}
                  onAttributeClick={onAttributeClick}
                  index={index}
                />
              ))}
            </AnimatePresence>
          </div>
          
          {/* Summary Stats */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-6">
                <span className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="font-medium">{processedAttributes.filter(a => a.status === 'shared').length} Shared</span>
                </span>
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-500 rounded" />
                  <span className="font-medium">{processedAttributes.filter(a => a.status === 'federation-only').length} Federation Only</span>
                </span>
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-amber-500 rounded" />
                  <span className="font-medium">{processedAttributes.filter(a => a.status === 'object-only').length} Object Only</span>
                </span>
              </div>
              <DiffLegend />
            </div>
          </div>
        </div>
      )}
      
      {mode === 'mapping' && showMappings && (
        <MappingDiagram 
          mappings={ATTRIBUTE_MAPPINGS}
          federationAttributes={federationAttributes}
          objectAttributes={objectAttributes}
        />
      )}
      
      {mode === 'unified' && (
        <UnifiedView 
          attributes={processedAttributes}
          onAttributeClick={onAttributeClick}
        />
      )}
    </div>
  );
}
```

### 2. Attribute Row Component

```typescript
// components/standards/AttributeDiff/AttributeRow.tsx
import React from 'react';
import { motion } from 'framer-motion';
import { Check, X, Minus, ArrowRight, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AttributeRowProps {
  federationKey: string | null;
  federationValue: any;
  objectKey: string | null;
  objectValue: any;
  mapping: AttributeMapping | null;
  status: 'shared' | 'federation-only' | 'object-only';
  isSelected: boolean;
  onSelect: () => void;
  onAttributeClick?: (attr: any) => void;
  index: number;
}

export function AttributeRow({
  federationKey,
  federationValue,
  objectKey,
  objectValue,
  mapping,
  status,
  isSelected,
  onSelect,
  onAttributeClick,
  index
}: AttributeRowProps) {
  const formatValue = (value: any): string => {
    if (Array.isArray(value)) return `[${value.join(', ')}]`;
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };
  
  const getStatusIcon = () => {
    switch (status) {
      case 'shared':
        return <Check className="w-4 h-4 text-green-600" />;
      case 'federation-only':
        return <div className="w-4 h-4 bg-blue-500 rounded" />;
      case 'object-only':
        return <div className="w-4 h-4 bg-amber-500 rounded" />;
    }
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ delay: index * 0.05 }}
      className={cn(
        "grid grid-cols-2 hover:bg-gray-50 transition-colors cursor-pointer",
        isSelected && "bg-blue-50 hover:bg-blue-50"
      )}
      onClick={onSelect}
    >
      {/* Federation Side */}
      <div className="px-6 py-4 border-r border-gray-200">
        {federationKey ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-medium text-gray-900">
                {federationKey}
              </span>
              {status === 'shared' && (
                <ArrowRight className="w-4 h-4 text-gray-400" />
              )}
              {status === 'federation-only' && (
                <X className="w-4 h-4 text-gray-400" />
              )}
            </div>
            <div className="font-mono text-sm text-gray-600">
              {formatValue(federationValue)}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center text-gray-400">
            <Minus className="w-4 h-4" />
            <span className="ml-2 text-sm">No equivalent</span>
          </div>
        )}
      </div>
      
      {/* Object Side */}
      <div className="px-6 py-4">
        {objectKey ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-medium text-gray-900">
                {objectKey}
              </span>
              {getStatusIcon()}
            </div>
            <div className="font-mono text-sm text-gray-600">
              {formatValue(objectValue)}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center text-gray-400">
            <Minus className="w-4 h-4" />
            <span className="ml-2 text-sm">No equivalent</span>
          </div>
        )}
      </div>
      
      {/* Mapping Info Tooltip */}
      {mapping && isSelected && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="col-span-2 px-6 py-3 bg-blue-50 border-t border-blue-100"
        >
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-600 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-900">{mapping.description}</p>
              {mapping.example && (
                <div className="mt-2 font-mono text-xs text-blue-700">
                  <span>{mapping.federationAttr}: {JSON.stringify(mapping.example.federation)}</span>
                  <span className="mx-2">→</span>
                  <span>{mapping.objectAttr}: {JSON.stringify(mapping.example.object)}</span>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
```

### 3. Mapping Diagram Component

```typescript
// components/standards/AttributeDiff/MappingDiagram.tsx
import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, ArrowLeftRight, GitMerge } from 'lucide-react';

export function MappingDiagram({ mappings, federationAttributes, objectAttributes }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
      <h4 className="text-lg font-semibold mb-6 flex items-center gap-2">
        <GitMerge className="w-5 h-5 text-teal-600" />
        Attribute Transformation Rules
      </h4>
      
      <div className="space-y-8">
        {mappings.map((mapping, index) => (
          <motion.div
            key={mapping.federationAttr}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="relative"
          >
            {/* Mapping Line */}
            <div className="flex items-center gap-4">
              {/* Federation Attribute */}
              <div className="flex-1 bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                <div className="font-mono font-semibold text-blue-900">
                  {mapping.federationAttr}
                </div>
                {federationAttributes?.[mapping.federationAttr] && (
                  <div className="mt-1 text-sm text-blue-700">
                    {JSON.stringify(federationAttributes[mapping.federationAttr])}
                  </div>
                )}
              </div>
              
              {/* Relationship Arrow */}
              <div className="flex flex-col items-center">
                <div className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium",
                  mapping.relationship === 'equivalent' 
                    ? "bg-green-100 text-green-800"
                    : mapping.relationship === 'related'
                    ? "bg-yellow-100 text-yellow-800"
                    : "bg-purple-100 text-purple-800"
                )}>
                  {mapping.relationship}
                </div>
                <motion.div
                  animate={{ x: [0, 10, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="mt-2"
                >
                  {mapping.relationship === 'equivalent' ? (
                    <ArrowLeftRight className="w-6 h-6 text-gray-600" />
                  ) : (
                    <ArrowRight className="w-6 h-6 text-gray-600" />
                  )}
                </motion.div>
              </div>
              
              {/* Object Attribute */}
              <div className="flex-1 bg-amber-50 border-2 border-amber-200 rounded-lg p-4">
                <div className="font-mono font-semibold text-amber-900">
                  {mapping.objectAttr}
                </div>
                {objectAttributes?.[mapping.objectAttr] && (
                  <div className="mt-1 text-sm text-amber-700">
                    {JSON.stringify(objectAttributes[mapping.objectAttr])}
                  </div>
                )}
              </div>
            </div>
            
            {/* Description */}
            <p className="mt-3 text-sm text-gray-600 text-center italic">
              {mapping.description}
            </p>
          </motion.div>
        ))}
      </div>
      
      {/* Transformation Rules */}
      <div className="mt-8 p-4 bg-gray-50 rounded-lg">
        <h5 className="font-medium text-gray-900 mb-3">Transformation Rules</h5>
        <ul className="space-y-2 text-sm text-gray-700">
          <li className="flex items-start gap-2">
            <span className="text-green-600 mt-0.5">•</span>
            <span><strong>Equivalent:</strong> Direct 1:1 mapping with same semantics</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-yellow-600 mt-0.5">•</span>
            <span><strong>Related:</strong> Conceptually similar but requires logic (e.g., country ∈ releasability list)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-purple-600 mt-0.5">•</span>
            <span><strong>Transforms:</strong> Complex mapping requiring data transformation</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
```

### 4. Real-World Example Data

```typescript
// Example token and label for demonstration
const exampleTokenAttributes: TokenAttributes = {
  uniqueID: "john.doe.mil",
  clearance: "SECRET",
  countryOfAffiliation: "USA",
  acpCOI: ["FVEY", "NATO-COSMIC"],
  aal: "AAL2",
  amr: ["piv", "mfa"],
  roles: ["analyst", "reviewer"],
  iat: 1698784800,
  exp: 1698788400
};

const exampleObjectLabel: ObjectLabel = {
  classification: "SECRET",
  releasabilityTo: ["USA", "GBR", "CAN", "AUS", "NZL"],
  COI: ["FVEY"],
  creationDate: "2025-01-15T10:30:00Z",
  policyId: "spif://nato/policy/2025/fuel-ops-v2",
  encryptionAlgorithm: "AES-256-GCM",
  disseminationControls: ["NOFORN", "REL TO FVEY"]
};
```

## Styling

```scss
// styles/attribute-diff.scss
.attribute-diff-viewer {
  @apply w-full;
  
  // Status indicators
  .status-shared {
    @apply bg-green-50 border-green-200;
    
    .icon { @apply text-green-600; }
  }
  
  .status-federation-only {
    @apply bg-blue-50 border-blue-200;
    
    .icon { @apply text-blue-600; }
  }
  
  .status-object-only {
    @apply bg-amber-50 border-amber-200;
    
    .icon { @apply text-amber-600; }
  }
  
  // Compact mode
  &.compact {
    .attribute-row {
      @apply py-2 text-sm;
    }
  }
  
  // Dark mode
  &.dark {
    @apply bg-gray-900;
    
    .attribute-row {
      @apply bg-gray-800 hover:bg-gray-700;
    }
  }
}

// Animation for mapping lines
@keyframes pulse-flow {
  0% { transform: translateX(0); opacity: 0; }
  50% { opacity: 1; }
  100% { transform: translateX(100%); opacity: 0; }
}

.mapping-pulse {
  position: relative;
  overflow: hidden;
  
  &::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 0;
    width: 20px;
    height: 2px;
    background: linear-gradient(90deg, transparent, #10b981, transparent);
    animation: pulse-flow 2s infinite;
  }
}
```

## Use Cases

### 1. Policy Development
Developers can see exactly which attributes are available in each context and how they map between standards.

### 2. Debugging Access Decisions
When troubleshooting why access was denied, the diff viewer shows which attributes were present/missing.

### 3. Training & Documentation
Visual representation helps new team members understand the relationship between federation and object security.

### 4. Compliance Auditing
Export functionality allows auditors to verify attribute mappings meet requirements.

## Integration Examples

### In Policy Lab
```typescript
// app/policies/lab/page.tsx
<AttributeDiffViewer
  federationAttributes={currentToken}
  objectAttributes={selectedResource.labels}
  mode="side-by-side"
  onExport={(format) => exportComparison(format)}
/>
```

### In Resource Detail
```typescript
// app/resources/[id]/page.tsx
{showAttributeComparison && (
  <AttributeDiffViewer
    federationAttributes={session.token}
    objectAttributes={resource.securityLabels}
    compactView={true}
    highlightMode="shared"
  />
)}
```

### In Standards Lens Dashboard
```typescript
// app/standards/page.tsx
<TabsContent value="attributes">
  <AttributeDiffViewer
    mode={viewMode}
    showMappings={true}
    onAttributeClick={(attr) => showAttributeDetails(attr)}
  />
</TabsContent>
```

This component makes the abstract concept of "shared ABAC semantics" concrete and visual, helping users understand how the two standards work together while maintaining their distinct enforcement domains.
