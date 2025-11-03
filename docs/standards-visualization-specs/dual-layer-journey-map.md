# Dual-Layer Journey Map Specification

## Overview

The Dual-Layer Journey Map visualizes how ADatP-5663 (Federation/Identity) and ACP-240 (Data-Centric Security) operate at different architectural layers while sharing common ABAC principles. This component provides an intuitive "subway map" visualization showing parallel flows that occasionally intersect at shared decision points.

## Visual Design

### Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  Federation Layer (ADatP-5663)          🔵 Blue Theme           │
│  ┌───┐    ┌───┐    ┌───┐    ┌───┐    ┌───┐    ┌───┐         │
│  │User├────┤IdP├────┤Token├──┤ PDP ├──┤ PEP ├──┤Access│       │
│  └───┘    └───┘    └───┘    └─┬─┘    └───┘    └───┘         │
│                                 │                                │
│                                 │ ABAC Decision                  │
│                                 │ (Shared Logic)                 │
│                                 │                                │
│  Object Layer (ACP-240)         🟠 Amber Theme                  │
│  ┌───┐    ┌───┐    ┌───┐    ┌─┴─┐    ┌───┐    ┌───┐         │
│  │Data├────┤Label├──┤ PDP ├──┤ KAS ├──┤Decrypt├─┤Audit│       │
│  └───┘    └───┘    └───┘    └───┘    └───┘    └───┘         │
└─────────────────────────────────────────────────────────────────┘
```

### Component Structure

```typescript
interface DualLayerJourneyMapProps {
  // Display configuration
  mode: 'split' | 'overlay' | 'unified';
  orientation: 'horizontal' | 'vertical';
  
  // Data
  federationFlow: JourneyNode[];
  objectFlow: JourneyNode[];
  sharedDecisionPoints: DecisionPoint[];
  
  // Interaction
  activeNode?: string;
  onNodeClick?: (node: JourneyNode) => void;
  onConnectionHover?: (connection: Connection) => void;
  
  // Animation
  animateOnMount?: boolean;
  animationSpeed?: number; // ms between node reveals
  pulseActiveConnections?: boolean;
  
  // Styling
  theme?: 'light' | 'dark';
  compactMode?: boolean;
}

interface JourneyNode {
  id: string;
  label: string;
  description: string;
  type: 'start' | 'process' | 'decision' | 'end';
  standard: 'adatp-5663' | 'acp-240' | 'shared';
  icon: string; // Lucide icon name
  metadata?: {
    stanag?: string;
    attributes?: string[];
    duration?: string;
  };
}

interface Connection {
  from: string;
  to: string;
  type: 'sequential' | 'conditional' | 'bidirectional';
  label?: string;
  animated?: boolean;
  condition?: string;
}

interface DecisionPoint {
  id: string;
  federationNodeId: string;
  objectNodeId: string;
  sharedAttributes: string[];
  description: string;
}
```

## Implementation Details

### 1. React Component Structure

```typescript
// components/standards/DualLayerJourney/index.tsx
export const DualLayerJourneyMap: React.FC<DualLayerJourneyMapProps> = ({
  mode = 'split',
  federationFlow,
  objectFlow,
  sharedDecisionPoints,
  ...props
}) => {
  // State management
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<'federation' | 'object' | null>(null);
  const [animationProgress, setAnimationProgress] = useState(0);
  
  // Animation controls
  const { play, pause, reset } = useJourneyAnimation({
    nodeCount: federationFlow.length + objectFlow.length,
    speed: props.animationSpeed || 500
  });
  
  return (
    <div className="journey-map-container">
      <JourneyControls 
        onPlay={play}
        onPause={pause}
        onReset={reset}
        onModeChange={setMode}
      />
      
      <div className="journey-layers">
        <FederationLayer 
          nodes={federationFlow}
          hoveredNode={hoveredNode}
          animationProgress={animationProgress}
          onNodeHover={setHoveredNode}
        />
        
        <SharedDecisionLayer 
          decisionPoints={sharedDecisionPoints}
          federationNodes={federationFlow}
          objectNodes={objectFlow}
        />
        
        <ObjectLayer 
          nodes={objectFlow}
          hoveredNode={hoveredNode}
          animationProgress={animationProgress}
          onNodeHover={setHoveredNode}
        />
      </div>
      
      <JourneyLegend />
    </div>
  );
};
```

### 2. Node Component with Hover Details

```typescript
// components/standards/DualLayerJourney/JourneyNode.tsx
interface JourneyNodeProps {
  node: JourneyNode;
  isHovered: boolean;
  isActive: boolean;
  animationDelay: number;
  onHover: (nodeId: string | null) => void;
  onClick: (node: JourneyNode) => void;
}

export const JourneyNodeComponent: React.FC<JourneyNodeProps> = ({
  node,
  isHovered,
  isActive,
  animationDelay,
  onHover,
  onClick
}) => {
  const Icon = LucideIcons[node.icon];
  
  return (
    <motion.div
      className={cn(
        "journey-node",
        `journey-node--${node.type}`,
        `journey-node--${node.standard}`,
        {
          "journey-node--hovered": isHovered,
          "journey-node--active": isActive
        }
      )}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: animationDelay, duration: 0.3 }}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(node)}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <div className="node-icon">
        <Icon size={24} />
      </div>
      <div className="node-label">{node.label}</div>
      
      {/* Hover tooltip */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            className="node-tooltip"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <h4>{node.label}</h4>
            <p>{node.description}</p>
            {node.metadata?.stanag && (
              <div className="tooltip-metadata">
                <span className="label">Standard:</span>
                <span className="value">{node.metadata.stanag}</span>
              </div>
            )}
            {node.metadata?.attributes && (
              <div className="tooltip-attributes">
                <span className="label">Attributes:</span>
                <div className="attribute-chips">
                  {node.metadata.attributes.map(attr => (
                    <span key={attr} className="attribute-chip">{attr}</span>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
```

### 3. Animated Connection Lines

```typescript
// components/standards/DualLayerJourney/ConnectionLine.tsx
export const ConnectionLine: React.FC<{
  from: Point;
  to: Point;
  type: Connection['type'];
  animated?: boolean;
  isActive?: boolean;
}> = ({ from, to, type, animated, isActive }) => {
  const pathData = useMemo(() => {
    if (type === 'sequential') {
      return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    } else if (type === 'conditional') {
      // Curved path for conditional connections
      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2 - 20;
      return `M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`;
    }
    // bidirectional - double line
    return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  }, [from, to, type]);
  
  return (
    <g className="connection-line">
      <path
        d={pathData}
        fill="none"
        stroke={isActive ? "var(--color-active)" : "var(--color-connection)"}
        strokeWidth={isActive ? 3 : 2}
        strokeDasharray={type === 'conditional' ? "5,5" : undefined}
      />
      
      {animated && (
        <circle r="4" fill="var(--color-pulse)">
          <animateMotion
            dur="2s"
            repeatCount="indefinite"
            path={pathData}
          />
        </circle>
      )}
      
      {type === 'bidirectional' && (
        <>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" 
                  refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="var(--color-connection)" />
          </marker>
          <path
            d={pathData}
            fill="none"
            stroke="var(--color-connection)"
            strokeWidth="2"
            markerEnd="url(#arrowhead)"
            markerStart="url(#arrowhead)"
          />
        </>
      )}
    </g>
  );
};
```

### 4. Shared ABAC Decision Bridge

```typescript
// components/standards/DualLayerJourney/SharedDecisionBridge.tsx
export const SharedDecisionBridge: React.FC<{
  decisionPoint: DecisionPoint;
  federationNode: JourneyNode;
  objectNode: JourneyNode;
}> = ({ decisionPoint, federationNode, objectNode }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <motion.div
      className="shared-decision-bridge"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.5 }}
    >
      <motion.div
        className="bridge-connector"
        animate={{
          background: [
            'linear-gradient(90deg, #4497ac 0%, #00a5a8 50%, #d4a574 100%)',
            'linear-gradient(90deg, #d4a574 0%, #00a5a8 50%, #4497ac 100%)'
          ]
        }}
        transition={{ duration: 3, repeat: Infinity, repeatType: 'reverse' }}
      />
      
      <motion.button
        className="decision-point-indicator"
        onClick={() => setIsExpanded(!isExpanded)}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        <GitMerge size={20} />
        <span>ABAC Decision</span>
      </motion.button>
      
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            className="shared-attributes-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <h5>Shared Attributes</h5>
            <div className="attribute-comparison">
              {decisionPoint.sharedAttributes.map(attr => (
                <div key={attr} className="shared-attribute">
                  <span className="federation-value">{attr} (5663)</span>
                  <span className="equals">=</span>
                  <span className="object-value">{attr} (240)</span>
                </div>
              ))}
            </div>
            <p className="decision-description">{decisionPoint.description}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
```

### 5. Interactive Controls

```typescript
// components/standards/DualLayerJourney/JourneyControls.tsx
export const JourneyControls: React.FC<{
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  onModeChange: (mode: 'split' | 'overlay' | 'unified') => void;
  currentMode: string;
}> = ({ onPlay, onPause, onReset, onModeChange, currentMode }) => {
  return (
    <div className="journey-controls">
      <div className="playback-controls">
        <button onClick={onPlay} className="control-btn">
          <Play size={16} /> Play Journey
        </button>
        <button onClick={onPause} className="control-btn">
          <Pause size={16} /> Pause
        </button>
        <button onClick={onReset} className="control-btn">
          <RotateCcw size={16} /> Reset
        </button>
      </div>
      
      <div className="view-controls">
        <ToggleGroup
          type="single"
          value={currentMode}
          onValueChange={onModeChange}
        >
          <ToggleGroupItem value="split">
            <Layers size={16} /> Split View
          </ToggleGroupItem>
          <ToggleGroupItem value="overlay">
            <Copy size={16} /> Overlay
          </ToggleGroupItem>
          <ToggleGroupItem value="unified">
            <Merge size={16} /> Unified
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  );
};
```

## Styling (CSS/Tailwind)

```scss
// styles/journey-map.scss
.journey-map-container {
  @apply relative w-full bg-white rounded-2xl shadow-xl p-6;
  min-height: 400px;
  
  .journey-layers {
    @apply relative;
    display: grid;
    grid-template-rows: 1fr auto 1fr;
    gap: 2rem;
    
    &--overlay {
      grid-template-rows: 1fr;
      
      .federation-layer,
      .object-layer {
        grid-row: 1;
        grid-column: 1;
      }
    }
  }
  
  .journey-node {
    @apply relative flex flex-col items-center gap-2 p-3 rounded-xl;
    @apply transition-all duration-200 cursor-pointer;
    
    &--adatp-5663 {
      @apply bg-blue-50 border-2 border-blue-200;
      
      .node-icon { @apply text-blue-600; }
      
      &:hover { @apply bg-blue-100 border-blue-300 shadow-lg; }
    }
    
    &--acp-240 {
      @apply bg-amber-50 border-2 border-amber-200;
      
      .node-icon { @apply text-amber-600; }
      
      &:hover { @apply bg-amber-100 border-amber-300 shadow-lg; }
    }
    
    &--shared {
      @apply bg-teal-50 border-2 border-teal-200;
      background: linear-gradient(135deg, #4497ac20 0%, #d4a57420 100%);
      
      .node-icon { @apply text-teal-600; }
    }
  }
  
  .connection-line {
    --color-connection: #94a3b8;
    --color-active: #00a5a8;
    --color-pulse: #90d56a;
  }
  
  .shared-decision-bridge {
    @apply relative flex flex-col items-center gap-3;
    
    .bridge-connector {
      @apply absolute top-0 w-1 h-full;
      transform: translateX(-50%);
    }
    
    .decision-point-indicator {
      @apply relative z-10 flex items-center gap-2 px-4 py-2;
      @apply bg-gradient-to-r from-teal-500 to-cyan-500;
      @apply text-white font-semibold rounded-full shadow-lg;
      @apply hover:shadow-xl transform transition-all duration-200;
    }
  }
  
  .node-tooltip {
    @apply absolute z-50 p-4 bg-gray-900 text-white rounded-lg shadow-2xl;
    @apply text-sm max-w-xs;
    bottom: calc(100% + 1rem);
    left: 50%;
    transform: translateX(-50%);
    
    &::after {
      content: '';
      @apply absolute top-full left-1/2 transform -translate-x-1/2;
      @apply w-0 h-0 border-8 border-transparent border-t-gray-900;
    }
    
    .attribute-chips {
      @apply flex flex-wrap gap-1 mt-1;
      
      .attribute-chip {
        @apply px-2 py-0.5 bg-gray-800 rounded text-xs;
      }
    }
  }
}

// Dark mode support
.dark .journey-map-container {
  @apply bg-gray-900 text-white;
  
  .journey-node {
    &--adatp-5663 {
      @apply bg-blue-900/30 border-blue-700;
      &:hover { @apply bg-blue-900/50; }
    }
    
    &--acp-240 {
      @apply bg-amber-900/30 border-amber-700;
      &:hover { @apply bg-amber-900/50; }
    }
  }
}
```

## Data Structure Examples

```typescript
// Example federation flow (ADatP-5663)
const federationFlow: JourneyNode[] = [
  {
    id: 'user-auth',
    label: 'User Authentication',
    description: 'User initiates login through IdP selection',
    type: 'start',
    standard: 'adatp-5663',
    icon: 'User',
    metadata: {
      stanag: 'STANAG 4778',
      attributes: ['username', 'authentication_method']
    }
  },
  {
    id: 'idp-validation',
    label: 'IdP Validation',
    description: 'Identity Provider validates credentials',
    type: 'process',
    standard: 'adatp-5663',
    icon: 'Shield',
    metadata: {
      attributes: ['clearance', 'countryOfAffiliation', 'acpCOI'],
      duration: '~2s'
    }
  },
  {
    id: 'token-generation',
    label: 'Token Generation',
    description: 'JWT token created with user attributes',
    type: 'process',
    standard: 'adatp-5663',
    icon: 'Key',
    metadata: {
      attributes: ['uniqueID', 'clearance', 'countryOfAffiliation', 'acpCOI', 'aal']
    }
  },
  {
    id: 'pdp-evaluation',
    label: 'PDP Evaluation',
    description: 'Policy Decision Point evaluates access',
    type: 'decision',
    standard: 'shared',
    icon: 'GitMerge',
    metadata: {
      attributes: ['subject', 'resource', 'action', 'environment']
    }
  },
  {
    id: 'pep-enforcement',
    label: 'PEP Enforcement',
    description: 'Policy Enforcement Point grants/denies access',
    type: 'process',
    standard: 'adatp-5663',
    icon: 'ShieldCheck'
  },
  {
    id: 'access-granted',
    label: 'Access Granted',
    description: 'User can access requested resources',
    type: 'end',
    standard: 'adatp-5663',
    icon: 'CheckCircle'
  }
];

// Example object flow (ACP-240)
const objectFlow: JourneyNode[] = [
  {
    id: 'data-object',
    label: 'Data Object',
    description: 'Classified document with ZTDF encryption',
    type: 'start',
    standard: 'acp-240',
    icon: 'FileText',
    metadata: {
      stanag: 'STANAG 4774/4778',
      attributes: ['classification', 'releasabilityTo', 'COI']
    }
  },
  {
    id: 'label-parsing',
    label: 'Label Parsing',
    description: 'Extract security labels from ZTDF header',
    type: 'process',
    standard: 'acp-240',
    icon: 'Tag',
    metadata: {
      attributes: ['classification', 'releasabilityTo', 'COI', 'creationDate']
    }
  },
  {
    id: 'pdp-object-eval',
    label: 'PDP Evaluation',
    description: 'Evaluate object access based on labels',
    type: 'decision',
    standard: 'shared',
    icon: 'GitMerge',
    metadata: {
      attributes: ['subject', 'resource', 'action', 'environment']
    }
  },
  {
    id: 'kas-request',
    label: 'KAS Request',
    description: 'Request decryption key from Key Access Service',
    type: 'process',
    standard: 'acp-240',
    icon: 'Key',
    metadata: {
      duration: '~100ms'
    }
  },
  {
    id: 'decrypt-content',
    label: 'Decrypt Content',
    description: 'Decrypt ZTDF payload with retrieved key',
    type: 'process',
    standard: 'acp-240',
    icon: 'Unlock'
  },
  {
    id: 'audit-log',
    label: 'Audit Log',
    description: 'Record access event for compliance',
    type: 'end',
    standard: 'acp-240',
    icon: 'ScrollText'
  }
];

// Shared decision points
const sharedDecisionPoints: DecisionPoint[] = [
  {
    id: 'abac-decision',
    federationNodeId: 'pdp-evaluation',
    objectNodeId: 'pdp-object-eval',
    sharedAttributes: ['clearance/classification', 'countryOfAffiliation/releasabilityTo', 'acpCOI/COI'],
    description: 'Both standards use ABAC logic to evaluate access based on matching attributes'
  }
];
```

## Animation Sequences

```typescript
// hooks/useJourneyAnimation.ts
export const useJourneyAnimation = ({ nodeCount, speed }: AnimationConfig) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout>();
  
  const play = useCallback(() => {
    setIsPlaying(true);
    intervalRef.current = setInterval(() => {
      setCurrentStep(prev => {
        if (prev >= nodeCount - 1) {
          pause();
          return prev;
        }
        return prev + 1;
      });
    }, speed);
  }, [nodeCount, speed]);
  
  const pause = useCallback(() => {
    setIsPlaying(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
  }, []);
  
  const reset = useCallback(() => {
    pause();
    setCurrentStep(0);
  }, [pause]);
  
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);
  
  return {
    isPlaying,
    currentStep,
    play,
    pause,
    reset
  };
};
```

## Integration Points

### 1. Dashboard Integration
```typescript
// app/dashboard/page.tsx
<div className="dashboard-standards-section">
  <h2>Standards Alignment Overview</h2>
  <DualLayerJourneyMap
    mode="split"
    federationFlow={federationFlow}
    objectFlow={objectFlow}
    sharedDecisionPoints={sharedDecisionPoints}
    animateOnMount={true}
    animationSpeed={800}
  />
</div>
```

### 2. Standards Lens Page
```typescript
// app/standards-lens/page.tsx
<StandardsLensLayout>
  <StandardsLensToggle />
  <DualLayerJourneyMap
    mode={selectedMode}
    // ... props
  />
  <AttributeDiffViewer />
  <ComparisonMatrix />
</StandardsLensLayout>
```

### 3. Resource Detail Integration
```typescript
// app/resources/[id]/page.tsx
{showStandardsView && (
  <DualLayerJourneyMap
    mode="overlay"
    compactMode={true}
    activeNode={currentResourceState}
    // Highlight current position in flow
  />
)}
```

## Accessibility Considerations

1. **Keyboard Navigation**
   - Tab through nodes in logical order
   - Enter/Space to expand node details
   - Arrow keys to navigate between layers
   - Escape to close tooltips

2. **Screen Reader Support**
   - Descriptive ARIA labels for all nodes
   - Announce flow progression
   - Alternative text view available

3. **Color Blind Mode**
   - Pattern fills for different standards
   - Shape differentiation (circle/square/diamond)
   - High contrast borders

4. **Reduced Motion**
   - Respect `prefers-reduced-motion`
   - Static view option
   - Instant transitions

## Performance Optimizations

1. **Lazy Loading**
   ```typescript
   const DualLayerJourneyMap = dynamic(
     () => import('@/components/standards/DualLayerJourney'),
     { 
       loading: () => <JourneyMapSkeleton />,
       ssr: false 
     }
   );
   ```

2. **SVG Optimization**
   - Use CSS transforms for animations
   - Batch DOM updates
   - Virtualize off-screen nodes

3. **State Management**
   - Local state for UI interactions
   - Global state only for cross-component needs
   - Memoize expensive calculations

This specification provides a comprehensive foundation for implementing the Dual-Layer Journey Map visualization, making the relationship between ADatP-5663 and ACP-240 immediately understandable through interactive visual storytelling.
