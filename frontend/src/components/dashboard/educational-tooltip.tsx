/**
 * Educational Tooltip Component - Enhanced Admin Glossary System
 *
 * Comprehensive glossary system with 30+ DIVE V3 terms
 * Features:
 * - Bilingual support (EN/FR)
 * - Category-based organization
 * - Searchable modal
 * - Keyboard shortcuts (Cmd+Shift+G)
 * - Related terms linking
 *
 * @version 2.0.0
 * @date 2026-01-29
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Info, BookOpen, ExternalLink, Search, X, Filter } from 'lucide-react';

/**
 * Glossary category types for filtering
 */
export type GlossaryCategory =
  | 'authorization'
  | 'federation'
  | 'identity'
  | 'policy'
  | 'security'
  | 'infrastructure'
  | 'compliance'
  | 'monitoring';

/**
 * Glossary entry interface
 */
export interface GlossaryEntry {
  term: string;
  definition: string;
  definitionFr?: string; // French translation
  category: GlossaryCategory;
  link?: string;
  relatedTerms?: string[];
  adminOnly?: boolean; // Show only in admin context
  examples?: string[];
}

/**
 * Comprehensive DIVE V3 Glossary - 35+ Terms
 */
export const GLOSSARY: Record<string, GlossaryEntry> = {
  // ==========================================
  // AUTHORIZATION (7 terms)
  // ==========================================
  ABAC: {
    term: 'Attribute-Based Access Control',
    definition: 'Access control paradigm where authorization decisions are based on attributes of subjects, resources, actions, and environment rather than roles.',
    definitionFr: 'Paradigme de contrôle d\'accès où les décisions d\'autorisation sont basées sur les attributs des sujets, des ressources, des actions et de l\'environnement plutôt que sur les rôles.',
    category: 'authorization',
    link: '/policies',
    relatedTerms: ['PEP', 'PDP', 'OPA'],
    examples: ['User with SECRET clearance + USA affiliation + FVEY COI can access SECRET document releasable to FVEY'],
  },
  PEP: {
    term: 'Policy Enforcement Point',
    definition: 'The component that intercepts access requests and enforces authorization decisions from the PDP. In DIVE V3, the backend API acts as the PEP.',
    definitionFr: 'Le composant qui intercepte les demandes d\'accès et applique les décisions d\'autorisation du PDP.',
    category: 'authorization',
    relatedTerms: ['PDP', 'OPA', 'ABAC'],
  },
  PDP: {
    term: 'Policy Decision Point',
    definition: 'The component that evaluates access requests against policies and returns authorization decisions. DIVE V3 uses OPA as the PDP.',
    definitionFr: 'Le composant qui évalue les demandes d\'accès par rapport aux politiques et renvoie les décisions d\'autorisation.',
    category: 'authorization',
    relatedTerms: ['PEP', 'OPA', 'Rego'],
  },
  OPA: {
    term: 'Open Policy Agent',
    definition: 'A general-purpose policy engine that enables unified policy enforcement. DIVE V3 uses OPA v0.68.0+ with Rego policies for all authorization decisions.',
    definitionFr: 'Un moteur de politique à usage général qui permet une application uniforme des politiques.',
    category: 'policy',
    link: '/admin/opa-policy',
    relatedTerms: ['Rego', 'PDP', 'OPAL'],
    adminOnly: true,
  },
  Rego: {
    term: 'Rego Policy Language',
    definition: 'A high-level declarative language used to write policies in OPA. Designed for querying complex nested data with pattern matching and comprehensions.',
    definitionFr: 'Un langage déclaratif de haut niveau utilisé pour écrire des politiques dans OPA.',
    category: 'policy',
    link: '/admin/opa-policy',
    relatedTerms: ['OPA', 'PDP'],
    adminOnly: true,
  },
  Guardrails: {
    term: 'Federation Guardrails',
    definition: 'Protective policy constraints that prevent spoke instances from creating policies that violate hub security requirements. Enforces minimum standards across the federation.',
    definitionFr: 'Contraintes de politique protectrices qui empêchent les instances spoke de créer des politiques qui violent les exigences de sécurité du hub.',
    category: 'policy',
    link: '/admin/federation/policies',
    relatedTerms: ['Hub', 'Spoke', 'Policy Distribution'],
    adminOnly: true,
  },
  'Bilateral Effective-Min': {
    term: 'Bilateral Effective-Min Policy',
    definition: 'Federation pattern where the effective authorization is the MINIMUM (most restrictive) of hub and spoke policies. Ensures no spoke can lower security standards.',
    definitionFr: 'Modèle de fédération où l\'autorisation effective est le MINIMUM (le plus restrictif) des politiques hub et spoke.',
    category: 'policy',
    link: '/admin/federation/policies',
    relatedTerms: ['Guardrails', 'Hub', 'Spoke'],
    adminOnly: true,
  },

  // ==========================================
  // FEDERATION (8 terms)
  // ==========================================
  Federation: {
    term: 'Identity Federation',
    definition: 'Trust framework enabling users to authenticate with their home identity provider and access resources across partner organizations without separate credentials.',
    definitionFr: 'Cadre de confiance permettant aux utilisateurs de s\'authentifier avec leur fournisseur d\'identité d\'origine.',
    category: 'federation',
    link: '/admin/federation',
    relatedTerms: ['Hub', 'Spoke', 'IdP'],
    adminOnly: true,
  },
  Hub: {
    term: 'Hub Instance',
    definition: 'The central DIVE V3 instance that manages federation, distributes policies via OPAL, and coordinates spoke instances. Typically operated by USA/lead nation.',
    definitionFr: 'L\'instance DIVE V3 centrale qui gère la fédération et distribue les politiques.',
    category: 'federation',
    link: '/admin/federation',
    relatedTerms: ['Spoke', 'OPAL', 'Policy Distribution'],
    adminOnly: true,
  },
  Spoke: {
    term: 'Spoke Instance',
    definition: 'Partner nation DIVE V3 instance that receives policies from the hub, enforces local constraints, and reports audit events. Each NATO partner operates their own spoke.',
    definitionFr: 'Instance DIVE V3 de nation partenaire qui reçoit les politiques du hub.',
    category: 'federation',
    link: '/admin/federation/spokes',
    relatedTerms: ['Hub', 'OPAL', 'Circuit Breaker'],
    adminOnly: true,
  },
  OPAL: {
    term: 'Open Policy Administration Layer',
    definition: 'Real-time policy distribution system that pushes policy bundles from hub to spoke instances. Ensures consistent authorization across the federation.',
    definitionFr: 'Système de distribution de politiques en temps réel du hub vers les instances spoke.',
    category: 'infrastructure',
    link: '/admin/federation/opal',
    relatedTerms: ['Hub', 'Spoke', 'Policy Distribution'],
    adminOnly: true,
  },
  'Policy Distribution': {
    term: 'Policy Distribution',
    definition: 'The process of propagating OPA policy bundles from hub to spokes via OPAL. Includes signing, versioning, and rollback capabilities.',
    definitionFr: 'Le processus de propagation des bundles de politiques OPA du hub vers les spokes.',
    category: 'policy',
    link: '/admin/federation/policies',
    relatedTerms: ['OPAL', 'Hub', 'Spoke', 'Bundle Signing'],
    adminOnly: true,
  },
  'Circuit Breaker': {
    term: 'Circuit Breaker',
    definition: 'Resilience pattern that detects hub failures and automatically switches spokes to local-only mode. Prevents cascading failures in federation.',
    definitionFr: 'Modèle de résilience qui détecte les pannes du hub et bascule automatiquement les spokes en mode local.',
    category: 'infrastructure',
    link: '/admin/spoke/failover',
    relatedTerms: ['Spoke', 'Failover', 'Resilience'],
    adminOnly: true,
  },
  Failover: {
    term: 'Automatic Failover',
    definition: 'Mechanism where spokes detect hub unavailability and switch to backup hub or local-only mode within 30 seconds. Ensures continuous operation.',
    definitionFr: 'Mécanisme où les spokes détectent l\'indisponibilité du hub et basculent vers un hub de secours.',
    category: 'infrastructure',
    link: '/admin/spoke/failover',
    relatedTerms: ['Circuit Breaker', 'Spoke', 'SLA'],
    adminOnly: true,
  },
  'Trust Matrix': {
    term: 'Federation Trust Matrix',
    definition: 'Configuration defining which countries/IdPs trust each other for information sharing. Determines allowed cross-border data access.',
    definitionFr: 'Configuration définissant quels pays/IdPs se font confiance pour le partage d\'informations.',
    category: 'federation',
    link: '/admin/federation',
    relatedTerms: ['Releasability', 'COI', 'Federation'],
    adminOnly: true,
  },

  // ==========================================
  // IDENTITY (6 terms)
  // ==========================================
  IdP: {
    term: 'Identity Provider',
    definition: 'External authentication service (OIDC or SAML) that verifies user identity. DIVE V3 integrates with partner nation IdPs via Keycloak broker.',
    definitionFr: 'Service d\'authentification externe qui vérifie l\'identité de l\'utilisateur.',
    category: 'identity',
    link: '/admin/idp',
    relatedTerms: ['OIDC', 'SAML', 'Keycloak', 'Protocol Mapper'],
    adminOnly: true,
  },
  OIDC: {
    term: 'OpenID Connect',
    definition: 'Modern authentication protocol built on OAuth 2.0. Used for identity federation with JSON Web Tokens (JWT). Preferred for new IdP integrations.',
    definitionFr: 'Protocole d\'authentification moderne construit sur OAuth 2.0.',
    category: 'identity',
    link: '/admin/idp',
    relatedTerms: ['IdP', 'JWT', 'SAML'],
    adminOnly: true,
  },
  SAML: {
    term: 'Security Assertion Markup Language',
    definition: 'XML-based authentication protocol for enterprise SSO. Used for legacy IdP integrations. Requires metadata exchange and certificate management.',
    definitionFr: 'Protocole d\'authentification basé sur XML pour le SSO d\'entreprise.',
    category: 'identity',
    link: '/admin/idp',
    relatedTerms: ['IdP', 'OIDC', 'Metadata'],
    adminOnly: true,
  },
  'Protocol Mapper': {
    term: 'Protocol Mapper',
    definition: 'Keycloak configuration that transforms IdP-specific claims into normalized DIVE V3 attributes (uniqueID, clearance, countryOfAffiliation, acpCOI).',
    definitionFr: 'Configuration Keycloak qui transforme les claims spécifiques d\'IdP en attributs normalisés DIVE V3.',
    category: 'identity',
    link: '/admin/idp',
    relatedTerms: ['IdP', 'Attribute Enrichment', 'Keycloak'],
    adminOnly: true,
  },
  'Attribute Enrichment': {
    term: 'Attribute Enrichment',
    definition: 'Process of augmenting user attributes from IdP tokens with additional data (e.g., inferring countryOfAffiliation from email domain for industry users).',
    definitionFr: 'Processus d\'augmentation des attributs utilisateur à partir des tokens IdP.',
    category: 'identity',
    relatedTerms: ['Protocol Mapper', 'IdP'],
    adminOnly: true,
  },
  Keycloak: {
    term: 'Keycloak Identity Broker',
    definition: 'Open-source identity and access management solution. DIVE V3 uses Keycloak to broker authentication across multiple partner IdPs.',
    definitionFr: 'Solution open-source de gestion d\'identité et d\'accès.',
    category: 'identity',
    link: '/admin/idp',
    relatedTerms: ['IdP', 'OIDC', 'SAML', 'Protocol Mapper'],
    adminOnly: true,
  },

  // ==========================================
  // SECURITY & COMPLIANCE (7 terms)
  // ==========================================
  'ACP-240': {
    term: 'NATO Access Control Policy',
    definition: 'NATO standardized access control policy (ACP-240) defining clearance levels, releasability, and COI requirements for coalition information sharing.',
    definitionFr: 'Politique de contrôle d\'accès standardisée de l\'OTAN.',
    category: 'compliance',
    link: '/compliance',
    relatedTerms: ['STANAG', 'Clearance', 'COI'],
  },
  STANAG: {
    term: 'Standardization Agreement',
    definition: 'NATO standardization agreements (e.g., STANAG 4774, 5636) that define processes, procedures, terms, and conditions for common military practices.',
    definitionFr: 'Accords de standardisation de l\'OTAN.',
    category: 'compliance',
    relatedTerms: ['ACP-240', 'NATO', 'Classification'],
  },
  COI: {
    term: 'Community of Interest',
    definition: 'A group of users with shared information needs. Examples: FVEY (Five Eyes), NATO-COSMIC, CAN-US, US-ONLY. Controls information compartmentalization.',
    definitionFr: 'Un groupe d\'utilisateurs ayant des besoins d\'information partagés.',
    category: 'security',
    relatedTerms: ['Releasability', 'Classification'],
    examples: ['FVEY: USA, GBR, CAN, AUS, NZL', 'NATO-COSMIC: All 32 NATO members'],
  },
  Clearance: {
    term: 'Security Clearance',
    definition: 'Authorization level granted to individuals allowing access to classified information. DIVE V3 levels: UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET.',
    definitionFr: 'Niveau d\'autorisation accordé aux individus permettant l\'accès aux informations classifiées.',
    category: 'security',
    link: '/admin/clearance-management',
    relatedTerms: ['Classification', 'Releasability', 'COI'],
    adminOnly: true,
  },
  Releasability: {
    term: 'Information Releasability',
    definition: 'Countries to which classified information may be released. Determined by resource labels (releasabilityTo) and bilateral agreements. ISO 3166-1 alpha-3 codes.',
    definitionFr: 'Pays auxquels les informations classifiées peuvent être divulguées.',
    category: 'security',
    relatedTerms: ['Clearance', 'COI', 'Classification'],
    examples: ['releasabilityTo: ["USA", "GBR", "CAN"]'],
  },
  Classification: {
    term: 'Information Classification',
    definition: 'Security level assigned to information indicating required protection. Hierarchy: UNCLASSIFIED < CONFIDENTIAL < SECRET < TOP_SECRET.',
    definitionFr: 'Niveau de sécurité assigné aux informations indiquant la protection requise.',
    category: 'security',
    relatedTerms: ['Clearance', 'Releasability'],
  },
  CRL: {
    term: 'Certificate Revocation List',
    definition: 'List of revoked certificates published by Certificate Authority. DIVE V3 checks CRL before trusting IdP SAML assertions and policy bundle signatures.',
    definitionFr: 'Liste des certificats révoqués publiée par l\'autorité de certification.',
    category: 'security',
    link: '/admin/certificates',
    relatedTerms: ['PKI', 'Certificate Rotation', 'Bundle Signing'],
    adminOnly: true,
  },

  // ==========================================
  // INFRASTRUCTURE (4 terms)
  // ==========================================
  KAS: {
    term: 'Key Access Service',
    definition: 'Policy-bound key release service for encrypted content. KAS re-evaluates authorization before releasing decryption keys, ensuring policy enforcement even offline.',
    definitionFr: 'Service de libération de clés lié aux politiques pour le contenu chiffré.',
    category: 'infrastructure',
    link: '/kas',
    relatedTerms: ['ZTDF', 'Encryption'],
  },
  ZTDF: {
    term: 'Zero Trust Data Format',
    definition: 'Encryption format that embeds policy into encrypted payloads. Recipients must satisfy policy (via KAS) to decrypt. Enables persistent protection.',
    definitionFr: 'Format de chiffrement qui intègre la politique dans les charges chiffrées.',
    category: 'infrastructure',
    relatedTerms: ['KAS', 'Encryption'],
  },
  'Certificate Rotation': {
    term: 'Certificate Rotation',
    definition: 'Process of replacing expiring certificates with new ones. DIVE V3 automates rotation for TLS, SAML signing, and policy bundle signing every 90 days.',
    definitionFr: 'Processus de remplacement des certificats arrivant à expiration par de nouveaux.',
    category: 'security',
    link: '/admin/certificates',
    relatedTerms: ['PKI', 'CRL', 'Bundle Signing'],
    adminOnly: true,
  },
  'Bundle Signing': {
    term: 'Policy Bundle Signing',
    definition: 'Cryptographic signing of OPA policy bundles to ensure integrity and authenticity during distribution from hub to spokes. Uses Ed25519 signatures.',
    definitionFr: 'Signature cryptographique des bundles de politiques OPA.',
    category: 'security',
    link: '/admin/federation/policies',
    relatedTerms: ['OPAL', 'PKI', 'Certificate Rotation'],
    adminOnly: true,
  },

  // ==========================================
  // MONITORING & OPERATIONS (3 terms)
  // ==========================================
  SLA: {
    term: 'Service Level Agreement',
    definition: 'Agreed performance targets for system availability and response times. DIVE V3 hub SLA: 99.9% uptime, <200ms p95 authorization latency.',
    definitionFr: 'Objectifs de performance convenus pour la disponibilité du système.',
    category: 'monitoring',
    link: '/admin/analytics',
    relatedTerms: ['Failover', 'Circuit Breaker'],
    adminOnly: true,
  },
  'Audit Queue': {
    term: 'Audit Event Queue',
    definition: 'Buffer for audit logs on spoke instances when hub is unavailable. Automatically syncs when connectivity is restored. Max capacity: 10,000 events.',
    definitionFr: 'Tampon pour les journaux d\'audit sur les instances spoke lorsque le hub est indisponible.',
    category: 'monitoring',
    link: '/admin/spoke/audit',
    relatedTerms: ['Spoke', 'Circuit Breaker', 'Audit Logs'],
    adminOnly: true,
  },
  'Drift Detection': {
    term: 'Policy Drift Detection',
    definition: 'Automated comparison of deployed policies against approved baselines. Alerts admins when unauthorized policy changes are detected.',
    definitionFr: 'Comparaison automatisée des politiques déployées par rapport aux bases approuvées.',
    category: 'compliance',
    link: '/admin/compliance',
    relatedTerms: ['OPAL', 'Policy Distribution', 'Compliance'],
    adminOnly: true,
  },
};

/**
 * Category icon mapping
 */
const CATEGORY_ICONS: Record<GlossaryCategory, string> = {
  authorization: '🔐',
  federation: '🌐',
  identity: '👤',
  policy: '📜',
  security: '🛡️',
  infrastructure: '⚙️',
  compliance: '✅',
  monitoring: '📊',
};

/**
 * Category labels
 */
const CATEGORY_LABELS: Record<GlossaryCategory, string> = {
  authorization: 'Authorization',
  federation: 'Federation',
  identity: 'Identity & Access',
  policy: 'Policy Management',
  security: 'Security',
  infrastructure: 'Infrastructure',
  compliance: 'Compliance',
  monitoring: 'Monitoring',
};

interface EducationalTooltipProps {
  term: keyof typeof GLOSSARY | string;
  children?: React.ReactNode;
  showIcon?: boolean;
  className?: string;
  language?: 'en' | 'fr';
}

export function EducationalTooltip({
  term,
  children,
  showIcon = true,
  className = '',
  language = 'en',
}: EducationalTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<'top' | 'bottom'>('bottom');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const glossaryEntry = GLOSSARY[term];

  // Adjust position based on viewport
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setPosition(spaceBelow < 250 ? 'top' : 'bottom');
    }
  }, [isOpen]);

  if (!glossaryEntry) {
    return <span className={className}>{children || term}</span>;
  }

  // Get definition in selected language
  const definition = language === 'fr' && glossaryEntry.definitionFr
    ? glossaryEntry.definitionFr
    : glossaryEntry.definition;

  return (
    <span className={`relative inline-flex items-center gap-1 ${className}`}>
      {children || (
        <span className="border-b border-dotted border-slate-400 dark:border-slate-600">
          {term}
        </span>
      )}

      {showIcon && (
        <button
          ref={triggerRef}
          className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-100 hover:bg-indigo-100 dark:bg-slate-800 dark:hover:bg-indigo-900/30 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors"
          onMouseEnter={() => setIsOpen(true)}
          onMouseLeave={() => setIsOpen(false)}
          onClick={() => setIsOpen(!isOpen)}
          aria-label={`Learn about ${term}`}
        >
          <Info className="w-3 h-3" />
        </button>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={tooltipRef}
            initial={{ opacity: 0, y: position === 'bottom' ? -5 : 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`
              absolute z-[3000] w-80 p-4 rounded-xl
              bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl
              ${position === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2'}
              left-0
            `}
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                <span className="text-base">{CATEGORY_ICONS[glossaryEntry.category]}</span>
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-0.5">
                  {term}
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                  {glossaryEntry.term}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-2">
                  {definition}
                </p>

                {/* Category Badge */}
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded">
                  {CATEGORY_LABELS[glossaryEntry.category]}
                </span>

                {/* Examples */}
                {glossaryEntry.examples && glossaryEntry.examples.length > 0 && (
                  <div className="mt-2 p-2 bg-slate-50 dark:bg-slate-800/50 rounded text-xs">
                    <div className="font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Example:
                    </div>
                    <code className="text-slate-600 dark:text-slate-400">
                      {glossaryEntry.examples[0]}
                    </code>
                  </div>
                )}

                {/* Related Terms */}
                {glossaryEntry.relatedTerms && glossaryEntry.relatedTerms.length > 0 && (
                  <div className="mt-2">
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Related:
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {glossaryEntry.relatedTerms.map((relatedTerm) => (
                        <span
                          key={relatedTerm}
                          className="px-2 py-0.5 text-xs bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 rounded"
                        >
                          {relatedTerm}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Link */}
                {glossaryEntry.link && (
                  <a
                    href={glossaryEntry.link}
                    className="inline-flex items-center gap-1 mt-3 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium transition-colors"
                  >
                    Learn more
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>

            {/* Arrow */}
            <div
              className={`
                absolute left-6 w-2 h-2 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rotate-45
                ${position === 'bottom'
                  ? '-top-1 border-l border-t'
                  : '-bottom-1 border-r border-b'
                }
              `}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

interface GlossaryPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  filter?: string;
  language?: 'en' | 'fr';
  adminContext?: boolean; // Show admin-only terms
}

export function GlossaryPopover({
  isOpen,
  onClose,
  filter = '',
  language = 'en',
  adminContext = false,
}: GlossaryPopoverProps) {
  const [searchQuery, setSearchQuery] = useState(filter);
  const [selectedCategory, setSelectedCategory] = useState<GlossaryCategory | 'all'>('all');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Reset search when opened
  useEffect(() => {
    if (isOpen) {
      setSearchQuery(filter);
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isOpen, filter]);

  // Filter terms
  const filteredTerms = Object.entries(GLOSSARY).filter(([key, value]) => {
    // Filter admin-only terms
    if (value.adminOnly && !adminContext) return false;

    // Filter by category
    if (selectedCategory !== 'all' && value.category !== selectedCategory) return false;

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const definition = language === 'fr' && value.definitionFr
        ? value.definitionFr
        : value.definition;

      return (
        key.toLowerCase().includes(query) ||
        value.term.toLowerCase().includes(query) ||
        definition.toLowerCase().includes(query) ||
        CATEGORY_LABELS[value.category].toLowerCase().includes(query)
      );
    }

    return true;
  });

  // Group by category
  const groupedTerms = filteredTerms.reduce((acc, [key, value]) => {
    if (!acc[value.category]) {
      acc[value.category] = [];
    }
    acc[value.category].push([key, value]);
    return acc;
  }, {} as Record<GlossaryCategory, Array<[string, GlossaryEntry]>>);

  // Count by category
  const categoryCounts = Object.entries(GLOSSARY).reduce((acc, [_, value]) => {
    if (value.adminOnly && !adminContext) return acc;
    acc[value.category] = (acc[value.category] || 0) + 1;
    return acc;
  }, {} as Record<GlossaryCategory, number>);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-sm z-[2999]"
            onClick={onClose}
          />

          {/* Popover */}
          <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-4xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden pointer-events-auto flex flex-col"
            >
              {/* Header */}
              <div className="flex-shrink-0 p-6 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                      <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                        DIVE V3 Glossary
                      </h2>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {filteredTerms.length} {language === 'fr' ? 'termes' : 'terms'} •{' '}
                        {Object.keys(groupedTerms).length} {language === 'fr' ? 'catégories' : 'categories'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 transition-colors"
                    aria-label="Close glossary"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={language === 'fr' ? 'Rechercher des termes...' : 'Search terms...'}
                    className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent outline-none transition-all"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Category Filters */}
                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    onClick={() => setSelectedCategory('all')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      selectedCategory === 'all'
                        ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    All ({Object.keys(GLOSSARY).length})
                  </button>
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
                    const count = categoryCounts[key as GlossaryCategory] || 0;
                    if (count === 0) return null;

                    return (
                      <button
                        key={key}
                        onClick={() => setSelectedCategory(key as GlossaryCategory)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                          selectedCategory === key
                            ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        {CATEGORY_ICONS[key as GlossaryCategory]} {label} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {filteredTerms.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                      <Search className="w-8 h-8 text-slate-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">
                      {language === 'fr' ? 'Aucun terme trouvé' : 'No terms found'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {language === 'fr'
                        ? 'Essayez une recherche différente ou effacez les filtres'
                        : 'Try a different search or clear filters'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(groupedTerms).map(([category, terms]) => (
                      <div key={category}>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
                          <span className="text-base">{CATEGORY_ICONS[category as GlossaryCategory]}</span>
                          {CATEGORY_LABELS[category as GlossaryCategory]}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {terms.map(([key, value]) => {
                            const definition = language === 'fr' && value.definitionFr
                              ? value.definitionFr
                              : value.definition;

                            return (
                              <motion.div
                                key={key}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors"
                              >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                    {key}
                                  </h4>
                                  {value.link && (
                                    <a
                                      href={value.link}
                                      onClick={onClose}
                                      className="flex-shrink-0 text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                </div>
                                <p className="text-xs text-slate-600 dark:text-slate-400 mb-1.5">
                                  {value.term}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                  {definition}
                                </p>
                                {value.relatedTerms && value.relatedTerms.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-2">
                                    {value.relatedTerms.slice(0, 3).map((relatedTerm) => (
                                      <span
                                        key={relatedTerm}
                                        className="px-2 py-0.5 text-xs bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 rounded"
                                      >
                                        {relatedTerm}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </motion.div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex-shrink-0 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded font-mono">
                        ESC
                      </kbd>
                      {language === 'fr' ? 'fermer' : 'to close'}
                    </span>
                    <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded font-mono">
                        Cmd+Shift+G
                      </kbd>
                      {language === 'fr' ? 'ouvrir' : 'to open'}
                    </span>
                  </div>
                  <span>
                    {adminContext
                      ? language === 'fr'
                        ? 'Contexte administrateur'
                        : 'Admin context'
                      : language === 'fr'
                        ? 'Contexte utilisateur'
                        : 'User context'}
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Hook for managing glossary popover
 */
export function useGlossaryPopover() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+Shift+G or Ctrl+Shift+G to toggle glossary
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }

      // Escape to close
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen((prev) => !prev),
  };
}

/**
 * Get glossary entries by category
 */
export function getGlossaryByCategory(
  category: GlossaryCategory,
  adminContext = false
): Array<[string, GlossaryEntry]> {
  return Object.entries(GLOSSARY).filter(
    ([_, value]) =>
      value.category === category &&
      (!value.adminOnly || adminContext)
  );
}

/**
 * Get all glossary categories
 */
export function getGlossaryCategories(adminContext = false): GlossaryCategory[] {
  const categories = new Set<GlossaryCategory>();
  Object.values(GLOSSARY).forEach((entry) => {
    if (!entry.adminOnly || adminContext) {
      categories.add(entry.category);
    }
  });
  return Array.from(categories);
}

/**
 * Search glossary entries
 */
export function searchGlossary(
  query: string,
  language: 'en' | 'fr' = 'en',
  adminContext = false
): Array<[string, GlossaryEntry]> {
  const lowerQuery = query.toLowerCase();

  return Object.entries(GLOSSARY).filter(([key, value]) => {
    // Filter admin-only terms
    if (value.adminOnly && !adminContext) return false;

    // Get definition in selected language
    const definition = language === 'fr' && value.definitionFr
      ? value.definitionFr
      : value.definition;

    // Search in key, term, definition, category
    return (
      key.toLowerCase().includes(lowerQuery) ||
      value.term.toLowerCase().includes(lowerQuery) ||
      definition.toLowerCase().includes(lowerQuery) ||
      CATEGORY_LABELS[value.category].toLowerCase().includes(lowerQuery) ||
      value.relatedTerms?.some((term) => term.toLowerCase().includes(lowerQuery))
    );
  });
}

export default EducationalTooltip;
