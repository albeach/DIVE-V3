'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  ChevronDown,
  ChevronRight,
  FileCode,
  Folder,
  FolderOpen,
  Search,
  Filter,
  X
} from 'lucide-react';
import type { IPolicyHierarchy, PolicyLayer, TenantCode } from '@/types/policy.types';
import { LAYER_CONFIGS, TENANT_CONFIGS } from '@/types/policy.types';

interface PolicyHierarchyTreeProps {
  hierarchy: IPolicyHierarchy;
  onPolicySelect?: (policyId: string) => void;
}

interface TreeNode {
  id: string;
  name: string;
  type: 'layer' | 'tenant' | 'policy';
  layer?: PolicyLayer;
  tenant?: TenantCode;
  policyId?: string;
  package?: string;
  ruleCount?: number;
  children?: TreeNode[];
}

export default function PolicyHierarchyTree({ hierarchy, onPolicySelect }: PolicyHierarchyTreeProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['entrypoints', 'org']));
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLayer, setSelectedLayer] = useState<PolicyLayer | 'all'>('all');
  const [selectedTenant, setSelectedTenant] = useState<TenantCode | 'all'>('all');

  // Build tree structure from hierarchy
  const treeData = useMemo(() => {
    const nodes: TreeNode[] = [];
    const layerOrder: PolicyLayer[] = ['entrypoints', 'org', 'tenant', 'base', 'standalone'];

    for (const layer of layerOrder) {
      const policies = hierarchy.layers[layer];
      if (policies.length === 0) continue;

      if (selectedLayer !== 'all' && selectedLayer !== layer) continue;

      const layerNode: TreeNode = {
        id: layer,
        name: LAYER_CONFIGS[layer].name,
        type: 'layer',
        layer,
        children: []
      };

      if (layer === 'tenant') {
        // Group by tenant
        const byTenant: Record<string, typeof policies> = {};
        for (const policy of policies) {
          const key = policy.tenant || 'common';
          if (selectedTenant !== 'all' && policy.tenant && policy.tenant !== selectedTenant) continue;
          if (!byTenant[key]) byTenant[key] = [];
          byTenant[key].push(policy);
        }

        for (const [tenantCode, tenantPolicies] of Object.entries(byTenant)) {
          if (tenantPolicies.length === 0) continue;

          const tenantNode: TreeNode = {
            id: `tenant-${tenantCode}`,
            name: tenantCode === 'common' ? 'Common' : TENANT_CONFIGS[tenantCode as TenantCode]?.name || tenantCode,
            type: 'tenant',
            tenant: tenantCode !== 'common' ? tenantCode as TenantCode : undefined,
            children: tenantPolicies
              .filter(p => !searchTerm ||
                p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.package.toLowerCase().includes(searchTerm.toLowerCase())
              )
              .map(p => ({
                id: p.policyId,
                name: p.name,
                type: 'policy' as const,
                policyId: p.policyId,
                package: p.package,
                ruleCount: p.ruleCount
              }))
          };

          if (tenantNode.children && tenantNode.children.length > 0) {
            layerNode.children?.push(tenantNode);
          }
        }
      } else {
        // Direct policies
        layerNode.children = policies
          .filter(p => {
            if (selectedTenant !== 'all' && p.tenant && p.tenant !== selectedTenant) return false;
            if (searchTerm &&
                !p.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
                !p.package.toLowerCase().includes(searchTerm.toLowerCase())) {
              return false;
            }
            return true;
          })
          .map(p => ({
            id: p.policyId,
            name: p.name,
            type: 'policy' as const,
            policyId: p.policyId,
            package: p.package,
            ruleCount: p.ruleCount
          }));
      }

      if (layerNode.children && layerNode.children.length > 0) {
        nodes.push(layerNode);
      }
    }

    return nodes;
  }, [hierarchy, searchTerm, selectedLayer, selectedTenant]);

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const activeTenants = useMemo(() => {
    const tenants = new Set<TenantCode>();
    for (const policies of Object.values(hierarchy.layers)) {
      for (const p of policies) {
        if (p.tenant) tenants.add(p.tenant);
      }
    }
    return Array.from(tenants);
  }, [hierarchy]);

  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700/50 bg-slate-800/30">
        <h3 className="font-semibold text-gray-200 flex items-center gap-2">
          <Folder className="w-4 h-4 text-teal-400" />
          Policy Hierarchy
        </h3>
      </div>

      {/* Search and Filters */}
      <div className="p-3 space-y-2 border-b border-slate-700/30">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search policies..."
            className="
              w-full pl-9 pr-8 py-2 rounded-lg
              bg-slate-800/50 border border-slate-700/50
              text-sm text-gray-200 placeholder-gray-500
              focus:outline-none focus:ring-1 focus:ring-teal-500/50
            "
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap gap-2">
          {/* Layer Filter */}
          <div className="flex items-center gap-1">
            <Filter className="w-3 h-3 text-gray-500" />
            <select
              value={selectedLayer}
              onChange={(e) => setSelectedLayer(e.target.value as PolicyLayer | 'all')}
              className="
                px-2 py-1 rounded text-xs
                bg-slate-800 border border-slate-700
                text-gray-300 focus:outline-none focus:ring-1 focus:ring-teal-500/50
              "
            >
              <option value="all">All Layers</option>
              {Object.values(LAYER_CONFIGS).map(config => (
                <option key={config.id} value={config.id}>
                  {config.icon} {config.name}
                </option>
              ))}
            </select>
          </div>

          {/* Tenant Filter */}
          {activeTenants.length > 0 && (
            <select
              value={selectedTenant}
              onChange={(e) => setSelectedTenant(e.target.value as TenantCode | 'all')}
              className="
                px-2 py-1 rounded text-xs
                bg-slate-800 border border-slate-700
                text-gray-300 focus:outline-none focus:ring-1 focus:ring-teal-500/50
              "
            >
              <option value="all">All Nations</option>
              {activeTenants.map(tenant => (
                <option key={tenant} value={tenant}>
                  {TENANT_CONFIGS[tenant]?.flag} {TENANT_CONFIGS[tenant]?.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Tree */}
      <div className="p-2 max-h-[500px] overflow-y-auto">
        {treeData.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <FileCode className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No policies match your filters</p>
          </div>
        ) : (
          <div className="space-y-1">
            {treeData.map((node, index) => (
              <TreeNodeComponent
                key={node.id}
                node={node}
                depth={0}
                index={index}
                expandedNodes={expandedNodes}
                onToggle={toggleNode}
                onPolicySelect={onPolicySelect}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="px-4 py-2 border-t border-slate-700/30 bg-slate-800/20">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            {hierarchy.stats.totalPolicies} policies • {hierarchy.stats.totalRules} rules
          </span>
          <span className="font-mono">
            v{hierarchy.version.version}
          </span>
        </div>
      </div>
    </div>
  );
}

interface TreeNodeComponentProps {
  node: TreeNode;
  depth: number;
  index: number;
  expandedNodes: Set<string>;
  onToggle: (id: string) => void;
  onPolicySelect?: (policyId: string) => void;
}

function TreeNodeComponent({
  node,
  depth,
  index,
  expandedNodes,
  onToggle,
  onPolicySelect
}: TreeNodeComponentProps) {
  const isExpanded = expandedNodes.has(node.id);
  const hasChildren = node.children && node.children.length > 0;
  const config = node.layer ? LAYER_CONFIGS[node.layer] : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.02 }}
    >
      {node.type === 'policy' ? (
        // Policy Node - Clickable link
        <Link
          href={`/policies/${node.policyId}`}
          onClick={() => onPolicySelect?.(node.policyId!)}
          className={`
            flex items-center gap-2 px-3 py-1.5 rounded-md
            hover:bg-slate-700/30 transition-colors group
          `}
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
        >
          <FileCode className="w-3.5 h-3.5 text-gray-500 group-hover:text-teal-400 transition-colors" />
          <span className="text-sm text-gray-300 group-hover:text-gray-100 truncate flex-1">
            {node.name}
          </span>
          {node.ruleCount && (
            <span className="text-[10px] text-gray-600 font-mono">
              {node.ruleCount}r
            </span>
          )}
        </Link>
      ) : (
        // Layer or Tenant Node - Expandable
        <>
          <button
            onClick={() => onToggle(node.id)}
            className={`
              w-full flex items-center gap-2 px-3 py-2 rounded-md
              hover:bg-slate-700/30 transition-colors
              ${config ? config.color : 'text-gray-300'}
            `}
            style={{ paddingLeft: `${depth * 16 + 12}px` }}
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )
            ) : (
              <span className="w-4" />
            )}

            {node.type === 'layer' ? (
              <>
                {isExpanded ? (
                  <FolderOpen className="w-4 h-4" />
                ) : (
                  <Folder className="w-4 h-4" />
                )}
                <span className="font-medium">{node.name}</span>
                {config && (
                  <span className="text-xs opacity-60">{config.icon}</span>
                )}
              </>
            ) : (
              <>
                {node.tenant && (
                  <span className="text-sm">
                    {TENANT_CONFIGS[node.tenant]?.flag}
                  </span>
                )}
                <span className="text-sm">{node.name}</span>
              </>
            )}

            {hasChildren && (
              <span className="ml-auto text-xs text-gray-600">
                {node.children!.length}
              </span>
            )}
          </button>

          {isExpanded && hasChildren && (
            <div className="mt-0.5">
              {node.children!.map((child, i) => (
                <TreeNodeComponent
                  key={child.id}
                  node={child}
                  depth={depth + 1}
                  index={i}
                  expandedNodes={expandedNodes}
                  onToggle={onToggle}
                  onPolicySelect={onPolicySelect}
                />
              ))}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}

