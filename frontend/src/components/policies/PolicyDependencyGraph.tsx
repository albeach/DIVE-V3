'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { GitBranch, ZoomIn, ZoomOut, Maximize2, Download, Info } from 'lucide-react';
import type { IPolicyHierarchy, PolicyLayer } from '@/types/policy.types';
import { LAYER_CONFIGS } from '@/types/policy.types';

interface PolicyDependencyGraphProps {
  hierarchy: IPolicyHierarchy;
  className?: string;
}

interface GraphNode {
  id: string;
  label: string;
  layer: PolicyLayer;
  x: number;
  y: number;
}

interface GraphEdge {
  source: string;
  target: string;
}

export default function PolicyDependencyGraph({ hierarchy, className = '' }: PolicyDependencyGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // Build nodes and edges from hierarchy
  const { nodes, edges } = useMemo(() => {
    const nodeMap = new Map<string, GraphNode>();
    const edgeList: GraphEdge[] = [];

    // Layer Y positions (top to bottom)
    const layerY: Record<PolicyLayer, number> = {
      entrypoints: 50,
      org: 150,
      tenant: 250,
      base: 350,
      standalone: 450
    };

    // Build nodes by layer
    const layerOrder: PolicyLayer[] = ['entrypoints', 'org', 'tenant', 'base', 'standalone'];

    for (const layer of layerOrder) {
      const policies = hierarchy.layers[layer];
      const count = policies.length;
      const startX = 400 - (count * 80) / 2;

      policies.forEach((policy, index) => {
        nodeMap.set(policy.package, {
          id: policy.package,
          label: policy.name,
          layer,
          x: startX + index * 80,
          y: layerY[layer] + (index % 2) * 20  // Slight stagger for readability
        });
      });
    }

    // Build edges from dependency graph
    for (const edge of hierarchy.dependencyGraph) {
      if (nodeMap.has(edge.source) && nodeMap.has(edge.target)) {
        edgeList.push({
          source: edge.source,
          target: edge.target
        });
      }
    }

    return {
      nodes: Array.from(nodeMap.values()),
      edges: edgeList
    };
  }, [hierarchy]);

  // Get highlighted edges (connected to selected/hovered node)
  const highlightedEdges = useMemo(() => {
    const activeNode = selectedNode || hoveredNode;
    if (!activeNode) return new Set<string>();

    const highlighted = new Set<string>();
    for (const edge of edges) {
      if (edge.source === activeNode || edge.target === activeNode) {
        highlighted.add(`${edge.source}->${edge.target}`);
      }
    }
    return highlighted;
  }, [edges, hoveredNode, selectedNode]);

  // Handle pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Generate mermaid-style graph code for download
  const generateMermaidCode = () => {
    let code = 'graph TD\n';

    // Add subgraphs for layers
    const layerOrder: PolicyLayer[] = ['entrypoints', 'org', 'tenant', 'base', 'standalone'];
    for (const layer of layerOrder) {
      const layerNodes = nodes.filter(n => n.layer === layer);
      if (layerNodes.length === 0) continue;

      code += `  subgraph ${layer} [${LAYER_CONFIGS[layer].name}]\n`;
      for (const node of layerNodes) {
        const safeId = node.id.replace(/\./g, '_');
        code += `    ${safeId}["${node.label}"]\n`;
      }
      code += '  end\n';
    }

    // Add edges
    code += '\n';
    for (const edge of edges) {
      const sourceId = edge.source.replace(/\./g, '_');
      const targetId = edge.target.replace(/\./g, '_');
      code += `  ${sourceId} --> ${targetId}\n`;
    }

    return code;
  };

  const downloadMermaid = () => {
    const code = generateMermaidCode();
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'policy-dependencies.mmd';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`bg-slate-900/50 rounded-xl border border-slate-700/50 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700/50 bg-slate-800/30 flex items-center justify-between">
        <h3 className="font-semibold text-gray-200 flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-teal-400" />
          Dependency Graph
        </h3>

        <div className="flex items-center gap-2">
          {/* Zoom Controls */}
          <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-1">
            <button
              onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}
              className="p-1 rounded hover:bg-slate-700/50 text-gray-400 hover:text-gray-200"
              title="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs text-gray-500 w-12 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(z => Math.min(2, z + 0.1))}
              className="p-1 rounded hover:bg-slate-700/50 text-gray-400 hover:text-gray-200"
              title="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
              className="p-1 rounded hover:bg-slate-700/50 text-gray-400 hover:text-gray-200"
              title="Reset view"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={downloadMermaid}
            className="p-1.5 rounded-lg hover:bg-slate-700/50 text-gray-400 hover:text-gray-200"
            title="Download Mermaid diagram"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Graph Container */}
      <div
        ref={containerRef}
        className="relative h-[400px] overflow-hidden cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          ref={svgRef}
          className="w-full h-full"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center'
          }}
        >
          <defs>
            {/* Arrow marker */}
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon
                points="0 0, 10 3.5, 0 7"
                fill="#64748b"
              />
            </marker>
            <marker
              id="arrowhead-highlight"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon
                points="0 0, 10 3.5, 0 7"
                fill="#2dd4bf"
              />
            </marker>
          </defs>

          {/* Edges */}
          <g>
            {edges.map((edge, i) => {
              const sourceNode = nodes.find(n => n.id === edge.source);
              const targetNode = nodes.find(n => n.id === edge.target);
              if (!sourceNode || !targetNode) return null;

              const isHighlighted = highlightedEdges.has(`${edge.source}->${edge.target}`);

              // Calculate curved path
              const midY = (sourceNode.y + targetNode.y) / 2;
              const dx = targetNode.x - sourceNode.x;
              const curvature = Math.min(Math.abs(dx) * 0.3, 50);

              const path = `
                M ${sourceNode.x} ${sourceNode.y + 15}
                C ${sourceNode.x} ${midY - curvature},
                  ${targetNode.x} ${midY + curvature},
                  ${targetNode.x} ${targetNode.y - 15}
              `;

              return (
                <motion.path
                  key={i}
                  d={path}
                  fill="none"
                  stroke={isHighlighted ? '#2dd4bf' : '#475569'}
                  strokeWidth={isHighlighted ? 2 : 1}
                  strokeOpacity={isHighlighted ? 1 : 0.5}
                  markerEnd={isHighlighted ? 'url(#arrowhead-highlight)' : 'url(#arrowhead)'}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.5, delay: i * 0.02 }}
                />
              );
            })}
          </g>

          {/* Nodes */}
          <g>
            {nodes.map((node, i) => {
              const config = LAYER_CONFIGS[node.layer];
              const isActive = node.id === selectedNode || node.id === hoveredNode;
              const isConnected = highlightedEdges.size > 0 &&
                Array.from(highlightedEdges).some(e => e.includes(node.id));

              return (
                <motion.g
                  key={node.id}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.03 }}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Node circle */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={isActive ? 14 : 12}
                    fill={isActive ? '#2dd4bf' : '#1e293b'}
                    stroke={isActive ? '#14b8a6' : isConnected ? '#2dd4bf' : '#475569'}
                    strokeWidth={isActive ? 3 : isConnected ? 2 : 1}
                    className="transition-all duration-200"
                  />

                  {/* Layer icon (emoji as text) */}
                  <text
                    x={node.x}
                    y={node.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="10"
                    className="pointer-events-none"
                  >
                    {config.icon}
                  </text>

                  {/* Label */}
                  <text
                    x={node.x}
                    y={node.y + 25}
                    textAnchor="middle"
                    fontSize="10"
                    fill={isActive ? '#2dd4bf' : '#94a3b8'}
                    className="pointer-events-none"
                  >
                    {node.label.length > 15 ? node.label.slice(0, 12) + '...' : node.label}
                  </text>
                </motion.g>
              );
            })}
          </g>
        </svg>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 bg-slate-900/90 rounded-lg p-2 border border-slate-700/50">
          <div className="flex flex-wrap gap-3 text-[10px]">
            {Object.values(LAYER_CONFIGS).map(config => (
              <div key={config.id} className="flex items-center gap-1">
                <span>{config.icon}</span>
                <span className={config.color}>{config.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Selected Node Info */}
        {selectedNode && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-3 right-3 bg-slate-900/95 rounded-lg p-3 border border-teal-500/30 max-w-[200px]"
          >
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-teal-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-gray-200">
                  {nodes.find(n => n.id === selectedNode)?.label}
                </p>
                <p className="text-[10px] text-gray-500 font-mono mt-1 break-all">
                  {selectedNode}
                </p>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-[10px] text-teal-400 hover:text-teal-300 mt-2"
                >
                  Clear selection
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-slate-700/30 bg-slate-800/20">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{nodes.length} nodes • {edges.length} dependencies</span>
          <span>Click node to highlight connections</span>
        </div>
      </div>
    </div>
  );
}

