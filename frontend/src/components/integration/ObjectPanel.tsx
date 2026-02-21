"use client";

import { Database, Lock, Key, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";

/**
 * Object Panel Component
 * 
 * Displays the ACP-240 data-centric security flow:
 * Object → Label → KAS → Decrypt
 * 
 * Features:
 * - 4-step flow with icons
 * - Amber→Orange→Red gradient color scheme
 * - Tooltips linking to ACP-240 spec sections
 * - Sequential fade-in animations
 * 
 * @see ACP-240 §4 Data Markings (STANAG 4774/4778)
 * @see ACP-240 §5 ZTDF & Cryptography
 * @see ACP-240 §5.2 Key Access Service (KAS)
 */
export function ObjectPanel() {
  const steps = [
    {
      icon: Database,
      title: "ZTDF Object Creation",
      description: "Data object bound with security policy metadata and encrypted at rest",
      color: "amber",
      specRef: "§5.1 ZTDF Structure",
      details: [
        "Policy section: classification, releasabilityTo, COI",
        "Payload section: encrypted data (DEK-based)",
        "Encryption info: DEK wrapped in KAOs (Key Access Objects)"
      ]
    },
    {
      icon: ShieldCheck,
      title: "Policy Binding",
      description: "Security labels cryptographically bound to prevent tampering (STANAG 4778)",
      color: "orange",
      specRef: "§5.4 Cryptographic Binding & Integrity",
      details: [
        "SHA-384 hash of policy metadata",
        "X.509 digital signature over policy + hash",
        "Verify signature BEFORE decryption (fail-secure)"
      ]
    },
    {
      icon: Key,
      title: "KAS Mediation",
      description: "Key Access Service evaluates policy before releasing wrapped DEK",
      color: "red",
      specRef: "§5.2 Key Access Service (KAS)",
      details: [
        "Re-evaluate ABAC policy (subject, resource, context)",
        "Check clearance, releasability, COI intersection",
        "Audit decision (allow/deny, reason, timestamp)"
      ]
    },
    {
      icon: Lock,
      title: "Object Access",
      description: "If authorized, KAS releases key; client decrypts payload with DEK",
      color: "orange",
      specRef: "§5.3 Multi-KAS & Community Keys",
      details: [
        "KAS unwraps DEK using private key",
        "Client decrypts payload (AES-256-GCM)",
        "All actions logged (Encrypt, Decrypt, Access Denied)"
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
    amber: {
      bg: "bg-amber-500/10 dark:bg-amber-500/20",
      border: "border-amber-300/30 dark:border-amber-500/30",
      icon: "text-amber-600 dark:text-amber-400",
      title: "text-amber-900 dark:text-amber-100"
    },
    orange: {
      bg: "bg-orange-500/10 dark:bg-orange-500/20",
      border: "border-orange-300/30 dark:border-orange-500/30",
      icon: "text-orange-600 dark:text-orange-400",
      title: "text-orange-900 dark:text-orange-100"
    },
    red: {
      bg: "bg-red-500/10 dark:bg-red-500/20",
      border: "border-red-300/30 dark:border-red-500/30",
      icon: "text-red-600 dark:text-red-400",
      title: "text-red-900 dark:text-red-100"
    }
  };

  return (
    <div className="py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-amber-500 via-orange-500 to-red-500 flex items-center justify-center">
            <Database className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Object Model (ACP-240)
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Data-Centric Security
            </p>
          </div>
        </div>
        <p className="text-gray-700 dark:text-gray-300">
          Data-centric security protects objects themselves (metadata + encryption) rather than 
          network perimeters, enabling secure sharing across untrusted networks.
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
                  <div className="group inline-flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-help">
                    <Database className="w-3.5 h-3.5" />
                    <span>ACP-240 {step.specRef}</span>
                    {/* Tooltip would appear here */}
                  </div>
                </div>
              </div>

              {/* Arrow to next step */}
              {index < steps.length - 1 && (
                <div className="absolute -bottom-3 left-1/2 transform -translate-x-1/2 z-10">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-md">
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
      <div className="mt-8 p-6 bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-red-500/10 dark:from-amber-500/20 dark:via-orange-500/20 dark:to-red-500/20 rounded-xl border border-amber-300/30 dark:border-amber-500/30">
        <h4 className="text-lg font-semibold text-amber-900 dark:text-amber-100 mb-2">
          Key Characteristics
        </h4>
        <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
          <li className="flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <span><strong>Trust Model:</strong> Object-to-consumer cryptographic trust (STANAG 4778 binding)</span>
          </li>
          <li className="flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
            <span><strong>Data Lifetime:</strong> Persistent encryption (data remains encrypted at rest and in transit)</span>
          </li>
          <li className="flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <span><strong>Focus:</strong> Policy-bound encryption, KAS mediation, cryptographic integrity</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
