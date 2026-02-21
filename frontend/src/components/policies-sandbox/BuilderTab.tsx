'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Save,
  Download,
  Upload,
  Play,
  Copy,
  Check,
  X,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  FileCode,
  Wand2,
  BookOpen,
  Lightbulb,
  Code2,
  Layers,
  Settings2,
  Info,
  Zap,
  ExternalLink,
  Terminal,
  FlaskConical,
  Shield,
  Globe,
  Lock,
  Clock,
  Users,
  Key
} from 'lucide-react';
import RegoCodeEditor from '@/components/policies/RegoCodeEditor';
import PolicyValidationPanel from '@/components/policies/PolicyValidationPanel';
import PolicyEditorTestPanel from '@/components/policies/PolicyEditorTestPanel';
import type { StandardsLens, VisualPolicyArtifacts } from '@/types/policy-builder.types';

// =============================================================================
// TYPES
// =============================================================================

type EditorMode = 'code' | 'visual';
type ValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid';

interface LintMessage {
  type: 'error' | 'warning' | 'info';
  message: string;
  line?: number;
}

interface Template {
  id: string;
  name: string;
  description: string;
  category: 'abac' | 'rbac' | 'coalition' | 'ztdf';
  icon: React.ComponentType<{ className?: string }>;
  code: string;
  standardsLens: StandardsLens;
}

interface Snippet {
  id: string;
  label: string;
  description: string;
  code: string;
}

interface BuilderTabProps {
  onPushSuccess?: () => void;
}

// =============================================================================
// TEMPLATES & SNIPPETS DATA
// =============================================================================

const TEMPLATES: Template[] = [
  {
    id: 'coalition-abac',
    name: 'Coalition ABAC Kernel',
    description: 'Fail-secure ABAC core for NATO/FVEY coalition access control',
    category: 'coalition',
    icon: Shield,
    standardsLens: 'unified',
    code: `package dive.authorization

import rego.v1

default allow := false

# Clearance level hierarchy
clearance_levels := {
  "UNCLASSIFIED": 0,
  "CONFIDENTIAL": 1,
  "SECRET": 2,
  "TOP_SECRET": 3
}

# Violation: Not authenticated
is_not_authenticated := msg if {
  not input.subject.authenticated
  msg := "Subject is not authenticated"
}

# Violation: Missing required attributes
is_missing_required_attributes := msg if {
  not input.subject.uniqueID
  not input.subject.clearance
  not input.subject.countryOfAffiliation
  msg := "Missing required subject attributes"
}

# Violation: Insufficient clearance
is_insufficient_clearance := msg if {
  clearance_levels[input.subject.clearance] < clearance_levels[input.resource.classification]
  msg := sprintf("Insufficient clearance: %s < %s", [input.subject.clearance, input.resource.classification])
}

# Violation: Country not in releasability list
is_not_releasable_to_country := msg if {
  not input.resource.releasabilityTo[_] == input.subject.countryOfAffiliation
  msg := sprintf("Country %s not in releasability list %v", [input.subject.countryOfAffiliation, input.resource.releasabilityTo])
}

# Main allow rule - fail-secure pattern
allow if {
  not is_not_authenticated
  not is_missing_required_attributes
  not is_insufficient_clearance
  not is_not_releasable_to_country
}

# Decision reason
reason := msg if {
  allow
  msg := "All ACP-240 checks satisfied"
}

reason := msg if {
  not allow
  reasons := [is_not_authenticated, is_missing_required_attributes, is_insufficient_clearance, is_not_releasable_to_country]
  msg := [r | r := reasons[_]; r != ""][0]
}

# Audit obligations
obligations := [{
  "type": "LOG_ACCESS",
  "params": {
    "resourceId": input.resource.resourceId,
    "requestId": input.context.requestId
  }
}] if { allow }
`
  },
  {
    id: 'federation-5663',
    name: 'Federation (ADatP-5663)',
    description: 'IdP trust, AAL verification, and token lifetime enforcement',
    category: 'coalition',
    icon: Globe,
    standardsLens: '5663',
    code: `package dive.federation

import rego.v1

default allow := false

# Trusted identity providers
trusted_idps := {
  "us-idp": true,
  "france-idp": true,
  "canada-idp": true,
  "industry-idp": true
}

# AAL priority levels (NIST 800-63B)
aal_priority := {
  "AAL1": 1,
  "AAL2": 2,
  "AAL3": 3
}

# Violation: Untrusted IdP
is_idp_not_trusted := msg if {
  not trusted_idps[input.subject.idp]
  msg := sprintf("IdP %s not trusted", [input.subject.idp])
}

# Violation: Insufficient authentication assurance
is_insufficient_aal := msg if {
  aal_priority[input.subject.aal] < 2
  msg := sprintf("AAL %s is below coalition requirement (AAL2)", [input.subject.aal])
}

# Violation: Token expired
is_token_expired := msg if {
  input.context.currentTime > input.subject.tokenExpiresAt
  msg := "Token has expired"
}

allow if {
  not is_idp_not_trusted
  not is_insufficient_aal
  not is_token_expired
}

reason := "Federation controls satisfied (trusted IdP, AAL≥2, token valid)" if { allow }
`
  },
  {
    id: 'object-240',
    name: 'Object Security (ACP-240)',
    description: 'ZTDF integrity, COI gating, and embargo enforcement',
    category: 'ztdf',
    icon: Key,
    standardsLens: '240',
    code: `package dive.object

import rego.v1

default allow := false

# Five minute tolerance for clock skew
five_min_ns := 300 * 1000000000

# Violation: Resource under embargo
is_under_embargo := msg if {
  input.resource.creationDate
  parsed := time.parse_rfc3339_ns(input.resource.creationDate)
  now := time.now_ns()
  parsed + five_min_ns > now
  msg := "Resource is still under embargo period"
}

# Violation: COI mismatch
is_coi_violation := msg if {
  input.resource.COI
  count(input.resource.COI) > 0
  user_coi := {c | c := input.subject.acpCOI[_]}
  resource_coi := {c | c := input.resource.COI[_]}
  count(user_coi & resource_coi) == 0
  msg := "No Community of Interest intersection"
}

# Violation: ZTDF integrity failure
is_ztdf_integrity_violation := msg if {
  input.resource.ztdfEnabled
  not input.resource.ztdfIntegrity.valid
  msg := "ZTDF cryptographic integrity check failed"
}

allow if {
  not is_under_embargo
  not is_coi_violation
  not is_ztdf_integrity_violation
}

# KAS key request obligation for encrypted resources
obligations := [{
  "type": "REQUEST_KAS_KEY",
  "params": { "resourceId": input.resource.resourceId }
}] if {
  allow
  input.resource.encrypted
}

reason := "Object security controls satisfied" if { allow }
`
  },
  {
    id: 'simple-rbac',
    name: 'Simple RBAC',
    description: 'Basic role-based access control for getting started',
    category: 'rbac',
    icon: Users,
    standardsLens: 'unified',
    code: `package dive.rbac

import rego.v1

default allow := false

# Define role permissions
role_permissions := {
  "admin": ["read", "write", "delete", "admin"],
  "editor": ["read", "write"],
  "viewer": ["read"]
}

# Get user's permissions based on role
user_permissions[perm] if {
  role := input.subject.role
  perm := role_permissions[role][_]
}

# Check if user has required permission
has_permission if {
  required := input.action.operation
  user_permissions[required]
}

allow if {
  input.subject.authenticated
  has_permission
}

reason := sprintf("Role %s has permission for %s", [input.subject.role, input.action.operation]) if { allow }
reason := sprintf("Role %s lacks permission for %s", [input.subject.role, input.action.operation]) if { not allow }
`
  }
];

const SNIPPETS: Snippet[] = [
  {
    id: 'clearance-hierarchy',
    label: 'Clearance Hierarchy',
    description: 'Define NATO clearance levels',
    code: `clearance_levels := {
  "UNCLASSIFIED": 0,
  "CONFIDENTIAL": 1,
  "SECRET": 2,
  "TOP_SECRET": 3
}`
  },
  {
    id: 'coi-check',
    label: 'COI Intersection',
    description: 'Check community of interest overlap',
    code: `is_coi_violation := msg if {
  input.resource.COI
  count({coi |
    coi := input.resource.COI[_]
    coi == input.subject.acpCOI[_]
  }) == 0
  msg := "Required COI membership missing"
}`
  },
  {
    id: 'decision-envelope',
    label: 'Decision Envelope',
    description: 'Structured decision response',
    code: `decision := {
  "allow": allow,
  "reason": reason,
  "obligations": obligations,
  "evaluation_details": {
    "policy_version": "1.0.0",
    "timestamp": time.now_ns()
  }
}`
  },
  {
    id: 'embargo-check',
    label: 'Embargo Check',
    description: 'Time-based access control',
    code: `is_under_embargo := msg if {
  input.resource.creationDate
  embargo_end := time.parse_rfc3339_ns(input.resource.creationDate)
  now := time.now_ns()
  embargo_end > now
  msg := "Resource is under embargo"
}`
  },
  {
    id: 'kas-obligation',
    label: 'KAS Obligation',
    description: 'Request key from Key Access Service',
    code: `obligations := [{
  "type": "REQUEST_KAS_KEY",
  "params": {
    "resourceId": input.resource.resourceId,
    "kasUrl": "https://kas.dive.local"
  }
}] if {
  allow
  input.resource.encrypted
}`
  }
];

// Rego syntax help
const REGO_KEYWORDS = [
  { keyword: 'package', description: 'Declares the policy package namespace' },
  { keyword: 'import', description: 'Imports modules or enables features (e.g., rego.v1)' },
  { keyword: 'default', description: 'Sets a default value for a rule' },
  { keyword: 'if', description: 'Defines conditions for a rule' },
  { keyword: 'not', description: 'Negates a condition' }
];

const OPA_BUILTINS = [
  { name: 'count', description: 'Returns the number of elements in a collection' },
  { name: 'sprintf', description: 'Formats a string with placeholders' },
  { name: 'time.now_ns', description: 'Returns current time in nanoseconds' },
  { name: 'time.parse_rfc3339_ns', description: 'Parses RFC3339 timestamp' }
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 64) || 'opa-policy';
}

function lintPolicy(source: string): LintMessage[] {
  const issues: LintMessage[] = [];

  if (!source.includes('package ')) {
    issues.push({ type: 'error', message: 'Missing package declaration', line: 1 });
  }

  if (!source.match(/default\s+allow\s*:=\s*false/i)) {
    issues.push({ type: 'warning', message: 'Missing "default allow := false" (fail-secure pattern)' });
  }

  if (!source.match(/import\s+rego\.v1/)) {
    issues.push({ type: 'info', message: 'Consider adding "import rego.v1" for latest Rego syntax' });
  }

  const lines = source.split('\n');
  lines.forEach((line, idx) => {
    if (line.length > 120) {
      issues.push({ type: 'info', message: `Line ${idx + 1} exceeds 120 characters`, line: idx + 1 });
    }
  });

  return issues;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function BuilderTab({ onPushSuccess }: BuilderTabProps) {
  // Editor state
  const [editorMode, setEditorMode] = useState<EditorMode>('code');
  const [source, setSource] = useState(TEMPLATES[0].code);
  const [policyName, setPolicyName] = useState('My Coalition Policy');
  const [description, setDescription] = useState('Custom policy for coalition access control');
  const [standardsLens, setStandardsLens] = useState<StandardsLens>('unified');

  // UI state
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSnippets, setShowSnippets] = useState(false);
  const [showSyntaxHelp, setShowSyntaxHelp] = useState(false);

  // Validation state
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>('idle');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [lintMessages, setLintMessages] = useState<LintMessage[]>([]);

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [uploadedPolicyId, setUploadedPolicyId] = useState<string | null>(null);

  // Copy state
  const [copied, setCopied] = useState(false);

  // Refs
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // Lint on source change
  useEffect(() => {
    const messages = lintPolicy(source);
    setLintMessages(messages);
  }, [source]);

  // Handlers
  const handleSelectTemplate = (template: Template) => {
    setSource(template.code);
    setPolicyName(template.name);
    setDescription(template.description);
    setStandardsLens(template.standardsLens);
    setShowTemplates(false);
    setValidationStatus('idle');
    setUploadMessage(null);
    setUploadedPolicyId(null);
  };

  const handleInsertSnippet = (snippet: Snippet) => {
    setSource(prev => prev.trimEnd() + '\n\n' + snippet.code + '\n');
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(source);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([source], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slugify(policyName)}.rego`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleValidate = async () => {
    setValidationStatus('validating');
    setValidationErrors([]);

    const lint = lintPolicy(source);
    const errors = lint.filter(m => m.type === 'error');

    if (errors.length > 0) {
      setValidationStatus('invalid');
      setValidationErrors(errors.map(e => e.message));
      return;
    }

    await new Promise(r => setTimeout(r, 500));
    setValidationStatus('valid');
  };

  const handlePushToSandbox = async () => {
    if (!policyName.trim()) {
      setUploadMessage({ type: 'error', text: 'Policy name is required' });
      return;
    }

    setIsUploading(true);
    setUploadMessage(null);
    setValidationErrors([]);
    setUploadedPolicyId(null);

    try {
      const filename = `${slugify(policyName)}.rego`;
      const file = new File([source], filename, { type: 'text/plain' });
      const formData = new FormData();
      formData.append('file', file);
      formData.append('metadata', JSON.stringify({
        name: policyName,
        description,
        standardsLens
      }));

      const response = await fetch('/api/policies-lab/upload', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (!response.ok || !data.validated) {
        setUploadMessage({ type: 'error', text: data.message || 'Validation failed' });
        setValidationErrors(data.validationErrors || []);
        return;
      }

      setUploadMessage({ type: 'success', text: `Policy saved! ID: ${data.policyId}` });
      setUploadedPolicyId(data.policyId);

      if (onPushSuccess) {
        setTimeout(() => onPushSuccess(), 1500);
      }
    } catch (error) {
      setUploadMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Unexpected upload error'
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Mode Toggle */}
        <div className="flex items-center gap-2 p-1 bg-slate-800/50 rounded-lg border border-slate-700/50">
          <button
            onClick={() => setEditorMode('code')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              editorMode === 'code'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'text-gray-400 hover:text-gray-200 hover:bg-slate-700/50'
            }`}
          >
            <FileCode className="w-4 h-4" />
            Code Editor
          </button>
          <button
            onClick={() => setEditorMode('visual')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              editorMode === 'visual'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                : 'text-gray-400 hover:text-gray-200 hover:bg-slate-700/50'
            }`}
          >
            <Wand2 className="w-4 h-4" />
            Visual Builder
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleValidate}
            disabled={validationStatus === 'validating'}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-slate-800/50 border border-slate-700/50 text-gray-300 hover:bg-slate-700/50 transition-colors disabled:opacity-50"
          >
            {validationStatus === 'validating' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : validationStatus === 'valid' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : validationStatus === 'invalid' ? (
              <XCircle className="w-4 h-4 text-red-400" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Validate
          </button>

          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-slate-800/50 border border-slate-700/50 text-gray-300 hover:bg-slate-700/50 transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>

          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-slate-800/50 border border-slate-700/50 text-gray-300 hover:bg-slate-700/50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>

          <button
            onClick={handlePushToSandbox}
            disabled={isUploading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 transition-all shadow-lg shadow-cyan-500/25 disabled:opacity-50"
          >
            {isUploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Save Policy
          </button>
        </div>
      </div>

      {/* Status Messages */}
      <AnimatePresence>
        {uploadMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`p-4 rounded-xl border flex items-start gap-3 ${
              uploadMessage.type === 'success'
                ? 'bg-emerald-900/20 border-emerald-500/30'
                : 'bg-red-900/20 border-red-500/30'
            }`}
          >
            {uploadMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
            )}
            <div className="flex-1">
              <p className={`text-sm font-medium ${
                uploadMessage.type === 'success' ? 'text-emerald-300' : 'text-red-300'
              }`}>
                {uploadMessage.text}
              </p>
            </div>
            <button
              onClick={() => setUploadMessage(null)}
              className="text-gray-500 hover:text-gray-300"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Layout */}
      {editorMode === 'code' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">
          {/* Left Sidebar - Templates & Metadata */}
          <div className="lg:col-span-3 space-y-4 lg:space-y-6">
            {/* Policy Metadata */}
            <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4 space-y-4">
              <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-cyan-400" />
                Policy Metadata
              </h3>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Name</label>
                <input
                  type="text"
                  value={policyName}
                  onChange={(e) => setPolicyName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                  placeholder="My Policy"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 resize-none"
                  placeholder="Describe your policy..."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Standards Lens</label>
                <div className="grid grid-cols-3 gap-1">
                  {(['5663', 'unified', '240'] as StandardsLens[]).map((lens) => (
                    <button
                      key={lens}
                      onClick={() => setStandardsLens(lens)}
                      className={`px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
                        standardsLens === lens
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          : 'bg-slate-800/50 text-gray-400 border border-slate-700/50 hover:border-slate-600'
                      }`}
                    >
                      {lens === '5663' ? 'Federation' : lens === '240' ? 'Object' : 'Unified'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Templates */}
            <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4 space-y-3">
              <button
                onClick={() => setShowTemplates(!showTemplates)}
                className="flex items-center justify-between w-full text-sm font-semibold text-gray-300 hover:text-white transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-400" />
                  Templates
                </span>
                {showTemplates ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>

              <AnimatePresence>
                {showTemplates && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="space-y-2 overflow-hidden"
                  >
                    {TEMPLATES.map((template) => {
                      const Icon = template.icon;
                      return (
                        <button
                          key={template.id}
                          onClick={() => handleSelectTemplate(template)}
                          className="w-full p-3 rounded-lg bg-slate-800/30 border border-slate-700/50 hover:border-purple-500/30 hover:bg-slate-800/50 transition-all text-left group"
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                              <Icon className="w-4 h-4 text-purple-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-200 group-hover:text-white truncate">
                                {template.name}
                              </p>
                              <p className="text-[11px] text-gray-500 line-clamp-2 mt-0.5">
                                {template.description}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Snippets */}
            <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4 space-y-3">
              <button
                onClick={() => setShowSnippets(!showSnippets)}
                className="flex items-center justify-between w-full text-sm font-semibold text-gray-300 hover:text-white transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  Code Snippets
                </span>
                {showSnippets ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>

              <AnimatePresence>
                {showSnippets && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="space-y-2 overflow-hidden"
                  >
                    {SNIPPETS.map((snippet) => (
                      <button
                        key={snippet.id}
                        onClick={() => handleInsertSnippet(snippet)}
                        className="w-full p-2.5 rounded-lg bg-slate-800/30 border border-dashed border-slate-700/50 hover:border-amber-500/30 hover:bg-slate-800/50 transition-all text-left group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-300 group-hover:text-amber-300">
                            {snippet.label}
                          </span>
                          <span className="text-[10px] text-gray-600 font-mono">+ Insert</span>
                        </div>
                        <p className="text-[10px] text-gray-500 mt-0.5">{snippet.description}</p>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Main Editor Area */}
          <div className="lg:col-span-9 space-y-4">
            {/* Lint Warnings */}
            {lintMessages.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {lintMessages.map((msg, idx) => (
                  <span
                    key={idx}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${
                      msg.type === 'error'
                        ? 'bg-red-900/20 text-red-300 border border-red-500/30'
                        : msg.type === 'warning'
                        ? 'bg-amber-900/20 text-amber-300 border border-amber-500/30'
                        : 'bg-blue-900/20 text-blue-300 border border-blue-500/30'
                    }`}
                  >
                    {msg.type === 'error' ? (
                      <XCircle className="w-3 h-3" />
                    ) : msg.type === 'warning' ? (
                      <AlertTriangle className="w-3 h-3" />
                    ) : (
                      <Info className="w-3 h-3" />
                    )}
                    {msg.message}
                  </span>
                ))}
              </div>
            )}

            {/* Editor */}
            <RegoCodeEditor
              source={source}
              onChange={setSource}
              filename={`${slugify(policyName)}.rego`}
              minHeight="400px"
              maxHeight="calc(100vh - 400px)"
              showHeader={true}
              showLineNumbers={true}
            />

            {/* Policy Validation Panel */}
            <PolicyValidationPanel
              source={source}
              onValidate={(result) => {
                if (result.valid) {
                  setValidationStatus('valid');
                  setValidationErrors([]);
                } else {
                  setValidationStatus('invalid');
                  setValidationErrors(result.issues.filter(i => i.severity === 'error').map(i => i.message));
                }
              }}
              autoValidate={true}
              debounceMs={500}
            />

            {/* Inline Policy Tester */}
            <PolicyEditorTestPanel
              source={source}
              policyName={policyName}
            />
          </div>
        </div>
      ) : (
        /* Visual Builder Mode - Coming Soon */
        <div className="rounded-2xl bg-slate-900/50 border border-slate-700/50 p-8">
          <div className="text-center max-w-lg mx-auto">
            <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 flex items-center justify-center">
              <Wand2 className="w-10 h-10 text-purple-400" />
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-medium mb-4">
              <Clock className="w-3.5 h-3.5" />
              Coming Soon
            </div>
            <h2 className="text-2xl font-bold text-gray-100 mb-3">Visual Policy Builder</h2>
            <p className="text-gray-400 leading-relaxed mb-6">
              The Visual Builder will allow you to configure policies using a guided, no-code interface.
              It will automatically generate valid Rego code based on your selections.
            </p>
            <button
              onClick={() => setEditorMode('code')}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold hover:from-cyan-400 hover:to-blue-500 transition-all shadow-lg shadow-cyan-500/20 mx-auto"
            >
              <FileCode className="w-5 h-5" />
              Use Code Editor Instead
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

