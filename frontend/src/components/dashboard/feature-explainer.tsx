/**
 * Feature Explainer Component
 *
 * Expandable sections explaining how DIVE V3 features work.
 * Includes step-by-step diagrams and educational content.
 */

'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Globe,
  Key,
  Users,
  FileText,
  Lock,
  Unlock,
  ArrowRight,
  CheckCircle2,
  Server,
  Database,
} from 'lucide-react';

interface ExplainerStep {
  icon: React.ReactNode;
  title: string;
  description: string;
}

interface FeatureExplainerProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  steps: ExplainerStep[];
  gradient: string;
  defaultOpen?: boolean;
}

export function FeatureExplainer({
  title,
  subtitle,
  icon,
  steps,
  gradient,
  defaultOpen = false,
}: FeatureExplainerProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-lg overflow-hidden">
      {/* Header - clickable */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between p-6 text-left transition-colors ${
          isOpen ? 'bg-gradient-to-r ' + gradient : 'hover:bg-slate-50'
        }`}
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl ${
            isOpen ? 'bg-white/20' : 'bg-gradient-to-br ' + gradient
          } flex items-center justify-center shadow-lg`}>
            <div className={isOpen ? 'text-white' : 'text-white'}>
              {icon}
            </div>
          </div>
          <div>
            <h3 className={`text-lg font-bold ${isOpen ? 'text-white' : 'text-slate-900'}`}>
              {title}
            </h3>
            <p className={`text-sm ${isOpen ? 'text-white/80' : 'text-slate-600'}`}>
              {subtitle}
            </p>
          </div>
        </div>

        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className={`w-5 h-5 ${isOpen ? 'text-white' : 'text-slate-400'}`} />
        </motion.div>
      </button>

      {/* Content */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="p-6 pt-0">
              <div className="mt-4 space-y-4">
                {steps.map((step, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="flex items-start gap-4"
                  >
                    {/* Step number and connector */}
                    <div className="flex flex-col items-center">
                      <div className="w-10 h-10 rounded-full bg-slate-100 border-2 border-slate-300 flex items-center justify-center text-slate-600">
                        {step.icon}
                      </div>
                      {idx < steps.length - 1 && (
                        <div className="w-0.5 h-8 bg-slate-200 mt-2" />
                      )}
                    </div>

                    {/* Step content */}
                    <div className="flex-1 pb-2">
                      <h4 className="text-sm font-semibold text-slate-900 mb-1">
                        Step {idx + 1}: {step.title}
                      </h4>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        {step.description}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Pre-configured explainers for common DIVE V3 concepts
export function AuthorizationFlowExplainer() {
  return (
    <FeatureExplainer
      title="How Authorization Works"
      subtitle="The PEP/PDP pattern in action"
      icon={<ShieldCheck className="w-6 h-6" />}
      gradient="from-purple-500 to-pink-600"
      steps={[
        {
          icon: <Users className="w-5 h-5" />,
          title: "Request Initiated",
          description: "User requests access to a resource. The request includes their JWT token with identity attributes (clearance, country, COI).",
        },
        {
          icon: <Server className="w-5 h-5" />,
          title: "PEP Intercepts",
          description: "The Policy Enforcement Point (PEP) in the backend API intercepts the request and extracts user attributes and resource metadata.",
        },
        {
          icon: <Database className="w-5 h-5" />,
          title: "OPA Evaluation",
          description: "PEP sends the authorization query to OPA (Policy Decision Point). OPA evaluates Rego policies against the input.",
        },
        {
          icon: <CheckCircle2 className="w-5 h-5" />,
          title: "Decision Returned",
          description: "OPA returns allow/deny decision with reason. PEP enforces the decision and logs it for audit compliance.",
        },
      ]}
    />
  );
}

export function FederationFlowExplainer() {
  return (
    <FeatureExplainer
      title="Identity Federation"
      subtitle="Cross-partner authentication"
      icon={<Globe className="w-6 h-6" />}
      gradient="from-blue-500 to-indigo-600"
      steps={[
        {
          icon: <Users className="w-5 h-5" />,
          title: "IdP Selection",
          description: "User selects their home Identity Provider (IdP) from the federation partners list (e.g., USA, France, Canada).",
        },
        {
          icon: <Unlock className="w-5 h-5" />,
          title: "Home Authentication",
          description: "User authenticates with their home IdP using their organization's credentials. OIDC or SAML protocol is used.",
        },
        {
          icon: <ArrowRight className="w-5 h-5" />,
          title: "Claim Exchange",
          description: "Keycloak broker receives identity claims and normalizes them. Attribute mappers convert IdP-specific claims to DIVE V3 format.",
        },
        {
          icon: <CheckCircle2 className="w-5 h-5" />,
          title: "Session Established",
          description: "User receives a JWT token with normalized attributes. They can now access resources across the federation.",
        },
      ]}
    />
  );
}

export function EncryptionFlowExplainer() {
  return (
    <FeatureExplainer
      title="KAS Encryption Flow"
      subtitle="Policy-bound key release"
      icon={<Key className="w-6 h-6" />}
      gradient="from-amber-500 to-orange-600"
      steps={[
        {
          icon: <FileText className="w-5 h-5" />,
          title: "Encrypted Resource",
          description: "Resource is encrypted using ZTDF format. The encryption key is wrapped and stored in KAS with policy binding.",
        },
        {
          icon: <Users className="w-5 h-5" />,
          title: "Access Request",
          description: "User requests access to encrypted content. Their attributes are sent along with the key request.",
        },
        {
          icon: <ShieldCheck className="w-5 h-5" />,
          title: "KAS Policy Check",
          description: "KAS re-evaluates authorization using OPA. This ensures policy is always checked at decryption time, not just access time.",
        },
        {
          icon: <Unlock className="w-5 h-5" />,
          title: "Key Release",
          description: "If authorized, KAS releases the decryption key. Client decrypts the content locally. Denied requests are logged for audit.",
        },
      ]}
    />
  );
}

export default FeatureExplainer;
