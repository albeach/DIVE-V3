"use client";

import { LockKeyhole, Users, FileCheck, Shield, CheckCircle } from "lucide-react";
import { motion } from "framer-motion";

/**
 * Federation Panel Component
 * 
 * Displays the ADatP-5663 federated identity/authentication flow:
 * User → IdP → Token → PEP → PDP → Permit
 * 
 * Features:
 * - 5-step flow with icons
 * - Indigo→Blue→Cyan gradient color scheme
 * - Tooltips linking to ADatP-5663 spec sections
 * - Sequential fade-in animations
 * 
 * @see ADatP-5663 §2.4 Federated Authentication
 * @see ADatP-5663 §4.4 Minimum Subject Attributes
 * @see ADatP-5663 §6.2 ABAC Components
 */
export function FederationPanel() {
  const steps = [
    {
      icon: Users,
      title: "User Authentication",
      description: "User authenticates with their national IdP (e.g., U.S., France, Canada)",
      color: "indigo",
      specRef: "§3.9 IdP Authentication",
      details: [
        "Multi-factor authentication (AAL2)",
        "auth_time recorded (NIST SP 800-63C)",
        "Clearance and COI attributes asserted"
      ]
    },
    {
      icon: LockKeyhole,
      title: "Token Issuance",
      description: "IdP issues signed JWT/SAML token with subject attributes",
      color: "blue",
      specRef: "§5.1.3 Token Issuance and Claims",
      details: [
        "Issuer, uniqueID, clearance, country",
        "auth_time, AAL, amr (MFA factors)",
        "Token lifetime ≤ 60 minutes"
      ]
    },
    {
      icon: FileCheck,
      title: "PEP Validation",
      description: "Policy Enforcement Point validates token signature and claims",
      color: "cyan",
      specRef: "§5.2.2 Token Validation",
      details: [
        "Verify JWKS signature (RS256)",
        "Check issuer, audience, expiration",
        "Clock skew tolerance ±5 minutes"
      ]
    },
    {
      icon: Shield,
      title: "PDP Evaluation",
      description: "Policy Decision Point evaluates ABAC rules against token claims",
      color: "blue",
      specRef: "§6.2 ABAC Components (PDP)",
      details: [
        "Subject: clearance, country, COI",
        "Resource: classification, releasability",
        "Environment: time, location, device"
      ]
    },
    {
      icon: CheckCircle,
      title: "Access Granted",
      description: "If all policy rules pass, access is granted with audit logging",
      color: "indigo",
      specRef: "§6.3 Federated Authorization and Accounting",
      details: [
        "Decision logged (subject, resource, decision)",
        "Obligations enforced (KAS key release)",
        "Session established with token lifetime"
      ]
    }
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15
      }
    }
  };

  const stepVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 30
      }
    }
  };

  const colorClasses = {
    indigo: {
      bg: "bg-indigo-500/10 dark:bg-indigo-500/20",
      border: "border-indigo-300/30 dark:border-indigo-500/30",
      icon: "text-indigo-600 dark:text-indigo-400",
      title: "text-indigo-900 dark:text-indigo-100"
    },
    blue: {
      bg: "bg-blue-500/10 dark:bg-blue-500/20",
      border: "border-blue-300/30 dark:border-blue-500/30",
      icon: "text-blue-600 dark:text-blue-400",
      title: "text-blue-900 dark:text-blue-100"
    },
    cyan: {
      bg: "bg-cyan-500/10 dark:bg-cyan-500/20",
      border: "border-cyan-300/30 dark:border-cyan-500/30",
      icon: "text-cyan-600 dark:text-cyan-400",
      title: "text-cyan-900 dark:text-cyan-100"
    }
  };

  return (
    <div className="py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-indigo-500 via-blue-500 to-cyan-500 flex items-center justify-center">
            <LockKeyhole className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Federation Model (ADatP-5663)
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Identity, Credential and Access Management
            </p>
          </div>
        </div>
        <p className="text-gray-700 dark:text-gray-300">
          Federated authentication enables users from different domains (nations, organizations) to 
          access resources across trust boundaries using standardized protocols (OIDC, OAuth, SAML).
        </p>
      </div>

      {/* Steps */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-4"
      >
        {steps.map((step, index) => {
          const Icon = step.icon;
          const colors = colorClasses[step.color as keyof typeof colorClasses];

          return (
            <motion.div
              key={step.title}
              variants={stepVariants}
              className={`
                relative p-6 rounded-xl border backdrop-blur-sm
                ${colors.bg} ${colors.border}
                transition-all duration-200
                hover:shadow-lg hover:scale-[1.02]
              `}
            >
              {/* Step Number + Icon */}
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <div className={`
                    w-14 h-14 rounded-lg flex items-center justify-center
                    bg-white dark:bg-gray-800 shadow-md
                  `}>
                    <Icon className={`w-7 h-7 ${colors.icon}`} />
                  </div>
                  <div className="mt-2 text-center">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 text-xs font-bold text-gray-600 dark:text-gray-400">
                      {index + 1}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h4 className={`text-lg font-semibold mb-1 ${colors.title}`}>
                    {step.title}
                  </h4>
                  <p className="text-gray-700 dark:text-gray-300 mb-3">
                    {step.description}
                  </p>

                  {/* Details */}
                  <ul className="space-y-1 mb-3">
                    {step.details.map((detail, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <span className={`mt-1 flex-shrink-0 ${colors.icon}`}>•</span>
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Spec Reference */}
                  <div className="group inline-flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-help">
                    <FileCheck className="w-3.5 h-3.5" />
                    <span>ADatP-5663 {step.specRef}</span>
                    {/* Tooltip would appear here */}
                  </div>
                </div>
              </div>

              {/* Arrow to next step */}
              {index < steps.length - 1 && (
                <div className="absolute -bottom-3 left-1/2 transform -translate-x-1/2 z-10">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center shadow-md">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </motion.div>

      {/* Summary Box */}
      <div className="mt-8 p-6 bg-gradient-to-br from-indigo-500/10 via-blue-500/10 to-cyan-500/10 dark:from-indigo-500/20 dark:via-blue-500/20 dark:to-cyan-500/20 rounded-xl border border-indigo-300/30 dark:border-indigo-500/30">
        <h4 className="text-lg font-semibold text-indigo-900 dark:text-indigo-100 mb-2">
          Key Characteristics
        </h4>
        <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mt-0.5 flex-shrink-0" />
            <span><strong>Trust Model:</strong> IdP-to-SP federation (bilateral trust agreements)</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <span><strong>Token Lifetime:</strong> Ephemeral (≤ 60 minutes for ID token, 8 hours for refresh)</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-cyan-600 dark:text-cyan-400 mt-0.5 flex-shrink-0" />
            <span><strong>Focus:</strong> Subject identity assertion, authentication strength (AAL), attribute exchange</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
