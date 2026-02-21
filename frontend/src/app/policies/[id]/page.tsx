'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import PageLayout from '@/components/layout/page-layout';
import PolicyTester from '@/components/policy/policy-tester';
import {
  ChevronDown,
  ChevronRight,
  FileCode,
  Copy,
  Check,
  Play,
  ArrowLeft,
  Shield,
  GitBranch,
  Clock,
  BookOpen,
  Lightbulb,
  AlertTriangle,
  Lock,
  Globe,
  Users,
  Calendar,
  Key,
  Layers,
  ExternalLink,
  Info,
  Search,
  X
} from 'lucide-react';
import type { PolicyLayer, NATOCompliance, TenantCode } from '@/types/policy.types';
import { LAYER_CONFIGS, COMPLIANCE_CONFIGS, TENANT_CONFIGS } from '@/types/policy.types';

// Extended policy content interface with new fields
interface IPolicyContent {
  policyId: string;
  name: string;
  content: string;
  syntax: 'rego';
  lines: number;
  rules: string[];
  metadata: {
    version: string;
    package: string;
    testCount: number;
    lastModified: string;
  };
  // New enhanced fields (may not exist on old API responses)
  layer?: PolicyLayer;
  imports?: string[];
  natoCompliance?: NATOCompliance[];
  tenant?: TenantCode;
  relativePath?: string;
}

interface RuleLocation {
  ruleName: string;
  lineNumber: number;
  lineText: string;
}

// Rule categories with educational descriptions
const RULE_CATEGORIES: Record<string, { icon: React.ComponentType<any>; description: string; rules: string[] }> = {
  'Core Authorization': {
    icon: Shield,
    description: 'Primary decision rules that determine access',
    rules: ['allow', 'decision', 'reason', 'obligations', 'evaluation_details', 'permit', 'deny']
  },
  'Identity Checks': {
    icon: Users,
    description: 'Validates user authentication and identity attributes',
    rules: ['is_not_authenticated', 'is_missing_required_attributes', 'check_authenticated', 'check_required_attributes']
  },
  'Clearance Verification': {
    icon: Lock,
    description: 'Ensures user clearance meets resource classification',
    rules: ['is_insufficient_clearance', 'check_clearance_sufficient', 'clearance_levels', 'clearance_rank']
  },
  'Releasability Controls': {
    icon: Globe,
    description: 'Coalition sharing and country-based access rules',
    rules: ['is_not_releasable_to_country', 'check_country_releasable', 'valid_country_codes', 'is_upload_not_releasable_to_uploader']
  },
  'Community of Interest': {
    icon: Users,
    description: 'COI membership and compartmentalization',
    rules: ['is_coi_violation', 'check_coi_satisfied', 'coi_registry', 'coi_valid']
  },
  'Time Controls': {
    icon: Calendar,
    description: 'Embargo dates and time-based access',
    rules: ['is_under_embargo', 'check_embargo_passed', 'parse_time', 'time_utils']
  },
  'Encryption & ZTDF': {
    icon: Key,
    description: 'Zero Trust Data Format integrity and encryption',
    rules: ['is_ztdf_integrity_violation', 'check_ztdf_integrity_valid', 'ztdf_enabled', 'kas_obligation']
  }
};

// Comprehensive rule explanations for education
const RULE_EXPLANATIONS: Record<string, {
  short: string;
  detailed: string;
  standard?: string;
  example?: string;
}> = {
  'allow': {
    short: 'Main authorization decision',
    detailed: 'The primary boolean decision rule. Returns true only when ALL violation checks pass. Follows the "fail-secure" pattern: default deny unless explicitly permitted.',
    standard: 'ACP-240 §4.2',
    example: 'allow if { not is_not_authenticated; not is_insufficient_clearance; ... }'
  },
  'decision': {
    short: 'Complete decision object',
    detailed: 'Returns a structured decision object containing: allow (boolean), reason (string), obligations (array), and evaluation_details (object). This enables rich audit logging.',
    standard: 'ACP-240 §5.1'
  },
  'is_not_authenticated': {
    short: 'Authentication validation',
    detailed: 'Checks if the subject has provided valid authentication credentials. Returns a violation message if input.subject.authenticated is false or missing.',
    standard: 'ADatP-5663',
    example: 'is_not_authenticated := msg if { not input.subject.authenticated; msg := "Subject is not authenticated" }'
  },
  'is_insufficient_clearance': {
    short: 'Clearance level comparison',
    detailed: 'Compares the user\'s clearance level against the resource\'s classification. Uses a hierarchical ranking: UNCLASSIFIED < CONFIDENTIAL < SECRET < TOP_SECRET.',
    standard: 'ACP-240 §6.1',
    example: 'clearance_rank["UNCLASSIFIED"] := 0; clearance_rank["TOP_SECRET"] := 3'
  },
  'is_not_releasable_to_country': {
    short: 'Country releasability check',
    detailed: 'Validates that the user\'s countryOfAffiliation is in the resource\'s releasabilityTo array. Uses ISO 3166-1 alpha-3 country codes (USA, GBR, FRA, DEU).',
    standard: 'STANAG 4774/5636'
  },
  'is_coi_violation': {
    short: 'Community of Interest validation',
    detailed: 'Checks if the user has ANY matching COI with the resource. If the resource has no COI requirements, this check passes. Uses set intersection.',
    standard: 'ACP-240 §7.3'
  },
  'is_under_embargo': {
    short: 'Embargo date enforcement',
    detailed: 'Prevents access to resources before their release date. Compares context.currentTime against resource.creationDate. Includes ±5 minute clock skew tolerance.',
    standard: 'STANAG 5636'
  },
  'is_ztdf_integrity_violation': {
    short: 'ZTDF cryptographic verification',
    detailed: 'For encrypted resources, validates the Zero Trust Data Format cryptographic binding. Checks that ztdf.integrityValidated is true and policy/payload hashes are present.',
    standard: 'STANAG 4778'
  },
  'obligations': {
    short: 'Post-decision requirements',
    detailed: 'Array of actions that must be taken after a decision. Common obligation: "request_kas_key" for encrypted content - requires obtaining decryption key from Key Access Service.',
    standard: 'ACP-240 §8.2'
  },
  'reason': {
    short: 'Human-readable explanation',
    detailed: 'Provides a clear text explanation for audit trails. On success: "Access granted - all checks passed". On failure: describes which specific check failed.',
  },
  'evaluation_details': {
    short: 'Detailed check results',
    detailed: 'Contains the result of each individual check (authenticated, clearance_sufficient, country_releasable, etc.) for debugging and audit purposes.',
  }
};

// Educational content about policy concepts
const CONCEPT_CARDS = [
  {
    id: 'fail-secure',
    title: 'Fail-Secure Pattern',
    icon: Shield,
    color: 'text-red-400',
    bgColor: 'bg-red-900/20',
    borderColor: 'border-red-500/30',
    content: 'All rules default to DENY. Access is only granted when ALL violation checks return false. This ensures security failures never accidentally permit access.'
  },
  {
    id: 'abac',
    title: 'Attribute-Based Access Control',
    icon: Layers,
    color: 'text-purple-400',
    bgColor: 'bg-purple-900/20',
    borderColor: 'border-purple-500/30',
    content: 'Decisions based on subject, resource, action, and context attributes. More flexible than role-based access control (RBAC).'
  },
  {
    id: 'obligations',
    title: 'Post-Decision Obligations',
    icon: Key,
    color: 'text-amber-400',
    bgColor: 'bg-amber-900/20',
    borderColor: 'border-amber-500/30',
    content: 'Even when ALLOW is returned, additional actions may be required. For encrypted content, the client must request decryption keys from KAS.'
  }
];

export default function PolicyDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const policyId = params?.id as string;

  const [policy, setPolicy] = useState<IPolicyContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTester, setShowTester] = useState(false);
  const [highlightedLine, setHighlightedLine] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [copied, setCopied] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Core Authorization']));
  const [selectedRule, setSelectedRule] = useState<string | null>(null);
  const [showEducation, setShowEducation] = useState(true);

  // Find rule locations in source code
  const ruleLocations = useMemo(() => {
    if (!policy) return [];

    const locations: RuleLocation[] = [];
    const lines = policy.content.split('\n');

    lines.forEach((line, index) => {
      // Match rule definitions: "ruleName := " or "ruleName if {"
      const match = line.match(/^(\w+)\s*(:=|if\s*\{|if\s+\{|contains)/);
      if (match) {
        locations.push({
          ruleName: match[1],
          lineNumber: index + 1,
          lineText: line.trim()
        });
      }
    });

    return locations;
  }, [policy]);

  // Extract imports from content
  const imports = useMemo(() => {
    if (!policy) return [];
    const importRegex = /^import\s+(?:data\.)?(\S+)/gm;
    const found: string[] = [];
    let match;
    while ((match = importRegex.exec(policy.content)) !== null) {
      let imp = match[1].split(/\s+as\s+/)[0];
      if (imp !== 'rego.v1' && !found.includes(imp)) {
        found.push(imp);
      }
    }
    return found;
  }, [policy]);

  // Jump to specific rule in code
  const jumpToRule = useCallback((ruleName: string) => {
    const location = ruleLocations.find(loc => loc.ruleName === ruleName);
    if (location) {
      setHighlightedLine(location.lineNumber);
      setSelectedRule(ruleName);
      const element = document.getElementById(`line-${location.lineNumber}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => setHighlightedLine(null), 4000);
      }
    }
  }, [ruleLocations]);

  // Filter rules by search term
  const filteredRules = useMemo(() => {
    if (!policy) return [];
    if (!searchTerm) return policy.rules;

    const term = searchTerm.toLowerCase();
    return policy.rules.filter(rule => {
      const explanation = RULE_EXPLANATIONS[rule];
      return rule.toLowerCase().includes(term) ||
             explanation?.short.toLowerCase().includes(term) ||
             explanation?.detailed.toLowerCase().includes(term);
    });
  }, [policy, searchTerm]);

  // Group rules by category
  const groupedRules = useMemo(() => {
    if (!policy) return {};

    const groups: Record<string, string[]> = {};

    Object.entries(RULE_CATEGORIES).forEach(([category, config]) => {
      const matchingRules = policy.rules.filter(rule => config.rules.includes(rule));
      if (matchingRules.length > 0) {
        groups[category] = matchingRules;
      }
    });

    // Add uncategorized rules
    const categorizedRules = Object.values(RULE_CATEGORIES).flatMap(c => c.rules);
    const uncategorized = policy.rules.filter(rule => !categorizedRules.includes(rule));
    if (uncategorized.length > 0) {
      groups['Other'] = uncategorized;
    }

    return groups;
  }, [policy]);

  // Toggle category expansion
  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  // Copy code to clipboard
  const copyCode = async () => {
    if (policy) {
      await navigator.clipboard.writeText(policy.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status !== 'loading' && !session) {
      router.push('/login');
    }
  }, [status, session, router]);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) return;

    async function fetchPolicy() {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';

      try {
        const response = await fetch(`${backendUrl}/api/policies/${policyId}`, {
          cache: 'no-store',
        });

        if (!response.ok) {
          const errorData = await response.json();
          setError(errorData.message || 'Failed to fetch policy');
          setPolicy(null);
        } else {
          const data: IPolicyContent = await response.json();
          setPolicy(data);
          setError(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setPolicy(null);
      } finally {
        setLoading(false);
      }
    }

    fetchPolicy();
  }, [session, status, policyId, router]);

  // Determine layer from policy ID or metadata
  const policyLayer = useMemo((): PolicyLayer => {
    if (policy?.layer) return policy.layer;
    if (policyId.startsWith('entrypoints')) return 'entrypoints';
    if (policyId.startsWith('org_')) return 'org';
    if (policyId.startsWith('tenant_')) return 'tenant';
    if (policyId.startsWith('base_')) return 'base';
    return 'standalone';
  }, [policy, policyId]);

  const layerConfig = LAYER_CONFIGS[policyLayer];

  // Loading state
  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="w-16 h-16 mx-auto mb-4 relative">
            <div className="absolute inset-0 rounded-full border-2 border-teal-500/20" />
            <div className="absolute inset-0 rounded-full border-2 border-teal-400 border-t-transparent animate-spin" />
          </div>
          <p className="text-gray-400">Loading policy...</p>
        </motion.div>
      </div>
    );
  }

  if (!session?.user) {
    return null;
  }

  return (
    <PageLayout
      user={session.user}
      breadcrumbs={[
        { label: 'Policies', href: '/policies' },
        { label: policy?.name || policyId, href: null }
      ]}
      noPadding
    >
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        {/* Ambient Background */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 right-1/4 w-96 h-96 bg-teal-500/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 left-0 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 py-8">
          {/* Back Link */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="mb-6"
          >
            <Link
              href="/policies"
              className="inline-flex items-center gap-2 text-gray-400 hover:text-teal-400 transition-colors group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <span className="text-sm">Back to Policies</span>
            </Link>
          </motion.div>

          {error ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-900/20 border border-red-500/30 rounded-xl p-6"
            >
              <div className="flex items-start gap-4">
                <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0" />
                <div>
                  <h2 className="text-xl font-semibold text-red-300 mb-2">Error Loading Policy</h2>
                  <p className="text-red-200/80">{error}</p>
                </div>
              </div>
            </motion.div>
          ) : policy ? (
            <div className="space-y-6">
              {/* Policy Header */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700/50"
              >
                {/* Background Pattern */}
                <div className="absolute inset-0 opacity-5">
                  <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <pattern id="policy-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                        <path d="M 24 0 L 0 0 0 24" fill="none" stroke="currentColor" strokeWidth="0.5" />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#policy-grid)" />
                  </svg>
                </div>

                <div className="relative p-6 lg:p-8">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                    {/* Title Section */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-4">
                        {/* Layer Badge */}
                        <div className={`px-3 py-1.5 rounded-lg ${layerConfig.bgColor} ${layerConfig.borderColor} border flex items-center gap-2`}>
                          <span className="text-lg">{layerConfig.icon}</span>
                          <span className={`text-sm font-medium ${layerConfig.color}`}>
                            {layerConfig.name}
                          </span>
                        </div>

                        {/* Version Badge */}
                        <span className="px-2.5 py-1 rounded-md bg-slate-700/50 text-sm font-mono text-teal-300">
                          v{policy.metadata.version}
                        </span>
                      </div>

                      <h1 className="text-3xl lg:text-4xl font-bold text-gray-100 mb-3">
                        {policy.name}
                      </h1>

                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                        <code className="font-mono text-teal-400/80 bg-teal-900/20 px-2 py-0.5 rounded">
                          {policy.metadata.package}
                        </code>
                        <span className="flex items-center gap-1">
                          <FileCode className="w-4 h-4" />
                          {policy.lines} lines
                        </span>
                        <span className="flex items-center gap-1">
                          <Shield className="w-4 h-4" />
                          {policy.rules.length} rules
                        </span>
                        <span className="flex items-center gap-1">
                          <Check className="w-4 h-4" />
                          {policy.metadata.testCount} tests
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {new Date(policy.metadata.lastModified).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={() => setShowTester(!showTester)}
                      className={`
                        flex items-center gap-2 px-5 py-3 rounded-xl font-medium
                        transition-all duration-200
                        ${showTester
                          ? 'bg-slate-700/50 text-gray-300 border border-slate-600'
                          : 'bg-teal-500/20 text-teal-300 border border-teal-500/30 hover:bg-teal-500/30'
                        }
                      `}
                    >
                      <Play className="w-5 h-5" />
                      {showTester ? 'Hide Tester' : 'Test Policy'}
                    </button>
                  </div>

                  {/* Compliance & Imports Row */}
                  <div className="mt-6 pt-6 border-t border-slate-700/50 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    {/* NATO Compliance Badges */}
                    {policy.natoCompliance && policy.natoCompliance.length > 0 && (
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 uppercase tracking-wide">Compliance</span>
                        <div className="flex flex-wrap gap-2">
                          {policy.natoCompliance.map(c => {
                            const config = COMPLIANCE_CONFIGS[c];
                            return (
                              <span
                                key={c}
                                className={`px-2.5 py-1 rounded-md text-xs font-medium ${config.bgColor} ${config.color} border border-white/10`}
                                title={config.fullName}
                              >
                                {config.shortName}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Imports */}
                    {imports.length > 0 && (
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1">
                          <GitBranch className="w-3 h-3" />
                          Imports
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {imports.slice(0, 4).map(imp => (
                            <code
                              key={imp}
                              className="px-2 py-0.5 rounded bg-slate-800 text-xs font-mono text-gray-400"
                            >
                              {imp.split('.').pop()}
                            </code>
                          ))}
                          {imports.length > 4 && (
                            <span className="text-xs text-gray-500">+{imports.length - 4} more</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>

              {/* Policy Tester (conditional) */}
              <AnimatePresence>
                {showTester && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <PolicyTester policyId={policy.policyId} />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Educational Concept Cards */}
              <AnimatePresence>
                {showEducation && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-semibold text-gray-200 flex items-center gap-2">
                        <Lightbulb className="w-5 h-5 text-amber-400" />
                        Key Concepts
                      </h2>
                      <button
                        onClick={() => setShowEducation(false)}
                        className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
                      >
                        <X className="w-3 h-3" />
                        Hide
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {CONCEPT_CARDS.map((card, index) => {
                        const Icon = card.icon;
                        return (
                          <motion.div
                            key={card.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                            className={`p-4 rounded-xl ${card.bgColor} ${card.borderColor} border`}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <Icon className={`w-4 h-4 ${card.color}`} />
                              <h3 className={`text-sm font-semibold ${card.color}`}>
                                {card.title}
                              </h3>
                            </div>
                            <p className="text-xs text-gray-400 leading-relaxed">
                              {card.content}
                            </p>
                          </motion.div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Main Content: Rules Navigator + Code Viewer */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="grid grid-cols-1 lg:grid-cols-3 gap-6"
              >
                {/* Left Column: Rules Navigator */}
                <div className="lg:col-span-1 space-y-4">
                  {/* Search Box */}
                  <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search rules..."
                        className="
                          w-full pl-10 pr-4 py-2.5 rounded-lg
                          bg-slate-800/50 border border-slate-700/50
                          text-sm text-gray-200 placeholder-gray-500
                          focus:outline-none focus:ring-2 focus:ring-teal-500/30
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
                    {searchTerm && (
                      <p className="mt-2 text-xs text-gray-500">
                        Found {filteredRules.length} of {policy.rules.length} rules
                      </p>
                    )}
                  </div>

                  {/* Rules by Category */}
                  <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 overflow-hidden">
                    <div className="px-4 py-3 bg-slate-800/30 border-b border-slate-700/50">
                      <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-teal-400" />
                        Policy Rules ({filteredRules.length})
                      </h3>
                    </div>

                    <div className="max-h-[500px] overflow-y-auto">
                      {searchTerm ? (
                        // Flat filtered list when searching
                        <div className="p-2">
                          {filteredRules.map((rule, index) => (
                            <RuleItem
                              key={rule}
                              rule={rule}
                              location={ruleLocations.find(loc => loc.ruleName === rule)}
                              isSelected={selectedRule === rule}
                              onClick={() => jumpToRule(rule)}
                              delay={index * 0.02}
                            />
                          ))}
                        </div>
                      ) : (
                        // Categorized accordion
                        <div className="p-2 space-y-1">
                          {Object.entries(groupedRules).map(([category, rules]) => {
                            const config = RULE_CATEGORIES[category];
                            const Icon = config?.icon || FileCode;
                            const isExpanded = expandedCategories.has(category);

                            return (
                              <div key={category} className="rounded-lg overflow-hidden">
                                <button
                                  onClick={() => toggleCategory(category)}
                                  className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-slate-800/50 transition-colors rounded-lg"
                                >
                                  <div className="flex items-center gap-2">
                                    <Icon className="w-4 h-4 text-teal-400" />
                                    <span className="text-sm font-medium text-gray-200">
                                      {category}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                      ({rules.length})
                                    </span>
                                  </div>
                                  {isExpanded ? (
                                    <ChevronDown className="w-4 h-4 text-gray-500" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 text-gray-500" />
                                  )}
                                </button>

                                <AnimatePresence>
                                  {isExpanded && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: 'auto', opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      transition={{ duration: 0.2 }}
                                      className="pl-2"
                                    >
                                      {config?.description && (
                                        <p className="px-3 py-1.5 text-[11px] text-gray-500">
                                          {config.description}
                                        </p>
                                      )}
                                      {rules.map((rule, index) => (
                                        <RuleItem
                                          key={rule}
                                          rule={rule}
                                          location={ruleLocations.find(loc => loc.ruleName === rule)}
                                          isSelected={selectedRule === rule}
                                          onClick={() => jumpToRule(rule)}
                                          delay={index * 0.02}
                                        />
                                      ))}
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Selected Rule Details */}
                  <AnimatePresence>
                    {selectedRule && RULE_EXPLANATIONS[selectedRule] && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="bg-gradient-to-br from-teal-900/20 to-cyan-900/10 rounded-xl border border-teal-500/20 p-4"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-mono text-sm font-semibold text-teal-300">
                            {selectedRule}
                          </h4>
                          <button
                            onClick={() => setSelectedRule(null)}
                            className="text-gray-500 hover:text-gray-300"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-xs text-gray-300 mb-3">
                          {RULE_EXPLANATIONS[selectedRule].detailed}
                        </p>
                        {RULE_EXPLANATIONS[selectedRule].standard && (
                          <div className="flex items-center gap-2 text-xs">
                            <Shield className="w-3 h-3 text-cyan-400" />
                            <span className="text-cyan-400/80">
                              {RULE_EXPLANATIONS[selectedRule].standard}
                            </span>
                          </div>
                        )}
                        {RULE_EXPLANATIONS[selectedRule].example && (
                          <pre className="mt-3 p-2 rounded bg-slate-900/50 text-[10px] font-mono text-gray-400 overflow-x-auto">
                            {RULE_EXPLANATIONS[selectedRule].example}
                          </pre>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Right Column: Source Code Viewer */}
                <div className="lg:col-span-2">
                  <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 overflow-hidden sticky top-4">
                    {/* Code Header */}
                    <div className="px-5 py-4 bg-slate-800/30 border-b border-slate-700/50 flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
                          <FileCode className="w-4 h-4 text-teal-400" />
                          Source Code
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Rego (Open Policy Agent) • Click rules in navigator to jump
                        </p>
                      </div>
                      <button
                        onClick={copyCode}
                        className={`
                          flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium
                          transition-all duration-200
                          ${copied
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-slate-800 text-gray-300 border border-slate-700 hover:border-slate-600'
                          }
                        `}
                      >
                        {copied ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>

                    {/* Code Display */}
                    <div className="bg-[#0d1117] overflow-auto max-h-[700px]">
                      <pre className="text-sm font-mono leading-relaxed">
                        {policy.content.split('\n').map((line, index) => {
                          const lineNum = index + 1;
                          const isHighlighted = lineNum === highlightedLine;
                          const isRuleDefinition = ruleLocations.some(loc => loc.lineNumber === lineNum);

                          return (
                            <div
                              key={index}
                              id={`line-${lineNum}`}
                              className={`
                                flex transition-all duration-300
                                ${isHighlighted
                                  ? 'bg-teal-500/20 border-l-2 border-teal-400'
                                  : isRuleDefinition
                                    ? 'hover:bg-slate-800/50 border-l-2 border-transparent hover:border-teal-500/30'
                                    : 'hover:bg-slate-800/30 border-l-2 border-transparent'
                                }
                              `}
                            >
                              <span className={`
                                inline-block w-14 text-right px-3 py-0.5 select-none text-xs
                                ${isHighlighted ? 'text-teal-400 font-bold' : 'text-gray-600'}
                              `}>
                                {lineNum}
                              </span>
                              <code className={`
                                flex-1 py-0.5 pr-4
                                ${isHighlighted ? 'text-teal-100' : ''}
                              `}>
                                <SyntaxHighlightedLine line={line} />
                              </code>
                            </div>
                          );
                        })}
                      </pre>
                    </div>

                    {/* Code Footer */}
                    <div className="px-5 py-3 bg-slate-800/20 border-t border-slate-700/50 flex items-center justify-between text-xs text-gray-500">
                      <span>{policy.lines} lines • {policy.content.length.toLocaleString()} characters</span>
                      <span className="font-mono">rego v1</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16"
            >
              <FileCode className="w-16 h-16 mx-auto text-gray-600 mb-4" />
              <p className="text-gray-400">Policy not found</p>
            </motion.div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}

// Rule list item component
function RuleItem({
  rule,
  location,
  isSelected,
  onClick,
  delay
}: {
  rule: string;
  location?: RuleLocation;
  isSelected: boolean;
  onClick: () => void;
  delay: number;
}) {
  const explanation = RULE_EXPLANATIONS[rule];

  return (
    <motion.button
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      onClick={onClick}
      className={`
        w-full text-left px-3 py-2 rounded-lg transition-all group
        ${isSelected
          ? 'bg-teal-500/20 border border-teal-500/30'
          : 'hover:bg-slate-800/50 border border-transparent'
        }
      `}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <code className={`text-xs font-mono font-medium block truncate ${isSelected ? 'text-teal-300' : 'text-gray-200'}`}>
            {rule}
          </code>
          {explanation && (
            <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">
              {explanation.short}
            </p>
          )}
        </div>
        {location && (
          <span className="text-[10px] text-gray-600 font-mono flex-shrink-0">
            L{location.lineNumber}
          </span>
        )}
      </div>
    </motion.button>
  );
}

// Simple syntax highlighting for Rego
function SyntaxHighlightedLine({ line }: { line: string }) {
  if (!line.trim()) return <span>&nbsp;</span>;

  // Keywords
  const keywords = ['package', 'import', 'default', 'if', 'else', 'not', 'as', 'with', 'some', 'every', 'in', 'contains'];
  const builtins = ['true', 'false', 'null', 'data', 'input'];

  let result = line;

  // Comments
  if (line.trim().startsWith('#')) {
    return <span className="text-gray-500 italic">{line}</span>;
  }

  // Highlight patterns
  const parts: React.ReactNode[] = [];
  let remaining = line;
  let key = 0;

  // Simple tokenization
  const tokenRegex = /("(?:[^"\\]|\\.)*"|\[|\]|\{|\}|:=|:|\.|,|\(|\)|[\w]+)/g;
  let lastIndex = 0;
  let match;

  while ((match = tokenRegex.exec(line)) !== null) {
    // Add any text before this match
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{line.slice(lastIndex, match.index)}</span>);
    }

    const token = match[0];

    if (token.startsWith('"')) {
      // String
      parts.push(<span key={key++} className="text-emerald-400">{token}</span>);
    } else if (keywords.includes(token)) {
      // Keyword
      parts.push(<span key={key++} className="text-purple-400 font-medium">{token}</span>);
    } else if (builtins.includes(token)) {
      // Builtin
      parts.push(<span key={key++} className="text-cyan-400">{token}</span>);
    } else if (token === ':=' || token === ':') {
      // Operator
      parts.push(<span key={key++} className="text-pink-400">{token}</span>);
    } else if (/^\d+$/.test(token)) {
      // Number
      parts.push(<span key={key++} className="text-amber-400">{token}</span>);
    } else if (/^[A-Z_]+$/.test(token)) {
      // Constant (all caps)
      parts.push(<span key={key++} className="text-amber-300">{token}</span>);
    } else {
      parts.push(<span key={key++} className="text-gray-200">{token}</span>);
    }

    lastIndex = match.index + token.length;
  }

  // Add remaining text
  if (lastIndex < line.length) {
    parts.push(<span key={key++}>{line.slice(lastIndex)}</span>);
  }

  return <>{parts}</>;
}
