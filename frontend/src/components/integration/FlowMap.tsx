"use client";

import { useCallback, useState } from "react";
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  ConnectionMode,
} from "reactflow";
import "reactflow/dist/style.css";
import { FederationNode } from "./FlowNode";
import { ObjectNode } from "./FlowNode";
import { SharedNode } from "./FlowNode";
import { SpecReferenceModal } from "./SpecReferenceModal";

const nodeTypes = {
  federation: FederationNode,
  object: ObjectNode,
  shared: SharedNode,
};

interface NodeData {
  label: string;
  standard: "5663" | "240" | "Both";
  specRef: string;
  description: string;
}

const initialNodes: Node<NodeData>[] = [
  {
    id: "user",
    type: "federation",
    position: { x: 50, y: 150 },
    data: {
      label: "User",
      standard: "5663",
      specRef: "§2.3 Federated Identity",
      description: "End user authenticating to access a resource across federation boundaries.",
    },
  },
  {
    id: "idp",
    type: "federation",
    position: { x: 250, y: 150 },
    data: {
      label: "IdP",
      standard: "5663",
      specRef: "§4.2 Identity Provider Responsibilities",
      description: "Identity Provider that authenticates users and issues security tokens (JWT/SAML).",
    },
  },
  {
    id: "pep",
    type: "federation",
    position: { x: 450, y: 150 },
    data: {
      label: "PEP",
      standard: "Both",
      specRef: "§6.2 ABAC Components (PEP)",
      description: "Policy Enforcement Point that intercepts access requests and enforces PDP decisions.",
    },
  },
  {
    id: "pdp",
    type: "shared",
    position: { x: 650, y: 150 },
    data: {
      label: "PDP (OPA)",
      standard: "Both",
      specRef: "§6.2 ABAC Components (PDP)",
      description: "Policy Decision Point that evaluates ABAC rules using subject, resource, environment, and action attributes.",
    },
  },
  {
    id: "kas",
    type: "object",
    position: { x: 850, y: 50 },
    data: {
      label: "KAS",
      standard: "240",
      specRef: "ACP-240 §5.2 Key Access Service",
      description: "Key Access Service that mediates access to wrapped DEKs based on policy evaluation.",
    },
  },
  {
    id: "ztdf",
    type: "object",
    position: { x: 1050, y: 150 },
    data: {
      label: "ZTDF Object",
      standard: "240",
      specRef: "ACP-240 §5.1 ZTDF Structure",
      description: "Zero Trust Data Format object with policy-bound encryption (metadata + payload + KAOs).",
    },
  },
  {
    id: "mongo",
    type: "object",
    position: { x: 850, y: 250 },
    data: {
      label: "MongoDB",
      standard: "240",
      specRef: "ACP-240 §4 Resource Attributes",
      description: "Resource metadata store containing classification, releasabilityTo, COI, and creation date.",
    },
  },
];

const initialEdges: Edge[] = [
  {
    id: "e-user-idp",
    source: "user",
    target: "idp",
    animated: true,
    style: { stroke: "#6366f1", strokeWidth: 2 },
    label: "Authenticate",
  },
  {
    id: "e-idp-pep",
    source: "idp",
    target: "pep",
    animated: true,
    style: { stroke: "#3b82f6", strokeWidth: 2 },
    label: "JWT Token",
  },
  {
    id: "e-pep-pdp",
    source: "pep",
    target: "pdp",
    animated: true,
    style: { stroke: "#14b8a6", strokeWidth: 2 },
    label: "Authz Request",
  },
  {
    id: "e-pdp-kas",
    source: "pdp",
    target: "kas",
    animated: true,
    style: { stroke: "#f59e0b", strokeWidth: 2, strokeDasharray: "5,5" },
    label: "KAS Obligation",
  },
  {
    id: "e-pdp-mongo",
    source: "pdp",
    target: "mongo",
    animated: true,
    style: { stroke: "#f59e0b", strokeWidth: 2, strokeDasharray: "5,5" },
    label: "Fetch Metadata",
  },
  {
    id: "e-kas-ztdf",
    source: "kas",
    target: "ztdf",
    animated: true,
    style: { stroke: "#ef4444", strokeWidth: 2 },
    label: "Unwrap DEK",
  },
  {
    id: "e-mongo-ztdf",
    source: "mongo",
    target: "ztdf",
    style: { stroke: "#9ca3af", strokeWidth: 1, strokeDasharray: "2,2" },
    label: "Resource",
  },
];

/**
 * Interactive Flow Map Component
 * 
 * Visualizes the Zero-Trust Journey from User to ZTDF Object:
 * User → IdP (5663) → PEP (Both) → PDP (Both) → KAS (240) → ZTDF (240)
 * 
 * Features:
 * - Custom node types (rounded rect for 5663, hexagon for 240, circle for shared)
 * - Click node → spec reference modal
 * - Hover → tooltip showing which standard governs
 * - Animated edges (solid for 5663 tokens, dashed for 240 crypto)
 * - Interactive zoom/pan controls
 * 
 * @see ADatP-5663 §2.4 Federated Authentication
 * @see ACP-240 §5.2 Key Access Service
 */
export function FlowMap() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node<NodeData> | null>(null);

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node<NodeData>) => {
    setSelectedNode(node);
  }, []);

  const closeModal = useCallback(() => {
    setSelectedNode(null);
  }, []);

  return (
    <section 
      className="w-full py-12 px-4 sm:px-6 lg:px-8"
      aria-labelledby="flow-map-title"
    >
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <h2 
          id="flow-map-title"
          className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2"
        >
          Zero-Trust Journey Flow Map
        </h2>
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">
          Interactive visualization of the complete authorization flow from user authentication 
          to object access, showing integration points between ADatP-5663 and ACP-240.
        </p>
        
        {/* Legend */}
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-gradient-to-r from-indigo-500 to-blue-500" />
            <span className="text-gray-700 dark:text-gray-300">Federation (5663)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-gradient-to-r from-amber-500 to-red-500" />
            <span className="text-gray-700 dark:text-gray-300">Object (240)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-teal-500" />
            <span className="text-gray-700 dark:text-gray-300">Shared (Both)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 bg-gray-400" />
            <span className="text-gray-700 dark:text-gray-300">Token Flow</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 bg-gray-400" style={{ backgroundImage: "repeating-linear-gradient(to right, currentColor 0, currentColor 4px, transparent 4px, transparent 8px)" }} />
            <span className="text-gray-700 dark:text-gray-300">Crypto Flow</span>
          </div>
        </div>
      </div>

      {/* Flow Graph */}
      <div className="max-w-7xl mx-auto">
        <div 
          className="h-[500px] bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-lg"
          role="img"
          aria-label="Interactive flow diagram showing user authentication through to object access"
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            connectionMode={ConnectionMode.Loose}
            minZoom={0.5}
            maxZoom={2}
            defaultEdgeOptions={{
              animated: true,
            }}
          >
            <Background 
              variant={BackgroundVariant.Dots} 
              gap={20} 
              size={1}
              color="#9ca3af20"
            />
            <Controls 
              showZoom 
              showFitView 
              showInteractive={false}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-md"
            />
          </ReactFlow>
        </div>

        {/* Instructions */}
        <div className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>
            <strong>Click</strong> any node to view spec reference • 
            <strong className="ml-1">Drag</strong> to pan • 
            <strong className="ml-1">Scroll</strong> to zoom • 
            <strong className="ml-1">Double-click</strong> to fit view
          </p>
        </div>
      </div>

      {/* Spec Reference Modal */}
      {selectedNode && (
        <SpecReferenceModal
          node={selectedNode}
          onClose={closeModal}
        />
      )}

      {/* Flow Description */}
      <div className="max-w-7xl mx-auto mt-8 grid md:grid-cols-2 gap-6">
        <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-indigo-900 dark:text-indigo-100 mb-3">
            Federation Flow (5663)
          </h3>
          <ol className="space-y-2 text-sm text-indigo-800 dark:text-indigo-200">
            <li><strong>1. User</strong> → Initiates access request</li>
            <li><strong>2. IdP</strong> → Authenticates user, issues JWT token</li>
            <li><strong>3. PEP</strong> → Validates token signature and claims</li>
            <li><strong>4. PDP</strong> → Evaluates ABAC policy (subject attributes)</li>
          </ol>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-100 mb-3">
            Object Flow (240)
          </h3>
          <ol className="space-y-2 text-sm text-amber-800 dark:text-amber-200">
            <li><strong>1. MongoDB</strong> → PDP fetches resource metadata</li>
            <li><strong>2. PDP</strong> → Evaluates policy (resource attributes)</li>
            <li><strong>3. KAS</strong> → If allowed, releases wrapped DEK</li>
            <li><strong>4. ZTDF</strong> → Client decrypts object with DEK</li>
          </ol>
        </div>
      </div>
    </section>
  );
}
