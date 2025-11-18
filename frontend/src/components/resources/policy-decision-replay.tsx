"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, XCircle, Lock, Unlock, Shield, Database } from "lucide-react";
import Confetti from "react-confetti";

interface ReplayStep {
  rule: string;
  result: "PASS" | "FAIL";
  reason: string;
  attributes: string[];
}

interface PolicyDecisionReplayProps {
  decision: "ALLOW" | "DENY";
  steps: ReplayStep[];
  isEncrypted?: boolean;
  subjectAttributes?: {
    clearance?: string;
    countryOfAffiliation?: string;
    acpCOI?: string[];
  };
  resourceAttributes?: {
    classification?: string;
    releasabilityTo?: string[];
    COI?: string[];
  };
}

/**
 * Policy Decision Replay Component for Resource Pages
 *
 * Dynamic visualization of OPA policy evaluation for individual resource access:
 * - Step-by-step animation of policy checks
 * - Animated decision feedback (confetti/shake)
 * - Glassmorphism subject vs resource comparison
 * - KAS unlock animation for encrypted content
 *
 * @param decision - Final ALLOW/DENY decision
 * @param steps - Array of policy evaluation steps
 * @param isEncrypted - Whether resource requires KAS
 * @param subjectAttributes - User attributes from JWT
 * @param resourceAttributes - Resource security attributes
 */
export function PolicyDecisionReplay({
  decision,
  steps,
  isEncrypted = false,
  subjectAttributes,
  resourceAttributes
}: PolicyDecisionReplayProps) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentStep, setCurrentStep] = useState(-1);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showKASUnlock, setShowKASUnlock] = useState(false);

  // Auto-start the evaluation animation
  useEffect(() => {
    setCurrentStep(0);
  }, []);

  // Auto-advance steps
  useEffect(() => {
    if (isPlaying && currentStep >= 0 && currentStep < steps.length) {
      const timer = setTimeout(() => {
        setCurrentStep(prev => prev + 1);
      }, 800);
      return () => clearTimeout(timer);
    } else if (isPlaying && currentStep === steps.length) {
      // All steps complete
      setIsPlaying(false);
      if (decision === "ALLOW") {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 5000);

        if (isEncrypted) {
          setTimeout(() => setShowKASUnlock(true), 1000);
          setTimeout(() => setShowKASUnlock(false), 4000);
        }
      }
    }
  }, [isPlaying, currentStep, steps.length, decision, isEncrypted]);

  return (
    <section
      className="w-full py-6 px-4 sm:px-6 lg:px-8 h-full"
      aria-labelledby="policy-replay-title"
    >
      {/* Confetti Effect */}
      {showConfetti && <Confetti recycle={false} numberOfPieces={200} />}

      {/* Header */}
      <div className="max-w-4xl mx-auto mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2
              id="policy-replay-title"
              className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1"
            >
              Policy Evaluation
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Real-time authorization decision replay
            </p>
          </div>

        </div>
      </div>

      {/* Glassmorphism Subject vs Resource Comparison */}
      {subjectAttributes && resourceAttributes && (
        <div className="max-w-4xl mx-auto mb-6">
          {/* Mobile: Stack vertically, Desktop: Side by side */}
          <div className="block md:hidden space-y-4">
            {/* Mobile Layout: Two separate cards */}
            <motion.div
              className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-2xl p-4 border border-blue-200 dark:border-blue-700 shadow-lg"
              animate={{
                x: decision === "ALLOW" ? 0 : -10,
                opacity: decision === "ALLOW" ? 1 : 0.8
              }}
              transition={{ type: "spring", stiffness: 200, damping: 25 }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-bold text-blue-900 dark:text-blue-100">Subject</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Clearance:</span>
                  <span className="font-mono font-semibold">{subjectAttributes.clearance || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Country:</span>
                  <span className="font-mono font-semibold">{subjectAttributes.countryOfAffiliation || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">COI:</span>
                  <span className="font-mono font-semibold text-xs">
                    {subjectAttributes.acpCOI?.join(', ') || 'None'}
                  </span>
                </div>
              </div>
            </motion.div>

            <motion.div
              className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-2xl p-4 border border-purple-200 dark:border-purple-700 shadow-lg"
              animate={{
                x: decision === "ALLOW" ? 0 : 10,
                opacity: decision === "ALLOW" ? 1 : 0.8
              }}
              transition={{ type: "spring", stiffness: 200, damping: 25 }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Database className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <span className="text-sm font-bold text-purple-900 dark:text-purple-100">Resource</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Class:</span>
                  <span className="font-mono font-semibold">{resourceAttributes.classification || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Release:</span>
                  <span className="font-mono font-semibold text-xs">
                    {resourceAttributes.releasabilityTo?.join(', ') || 'None'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">COI:</span>
                  <span className="font-mono font-semibold text-xs">
                    {resourceAttributes.COI?.join(', ') || 'None'}
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Decision Indicator for Mobile */}
            {currentStep >= steps.length && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
                className="text-center"
              >
                <div className={`
                  inline-flex items-center gap-2 px-6 py-3 rounded-2xl shadow-2xl backdrop-blur-xl border-2 mx-auto
                  ${decision === "ALLOW"
                    ? "bg-green-500/90 border-green-300"
                    : "bg-red-500/90 border-red-300"
                  }
                `}>
                  {decision === "ALLOW" ? (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      <span className="font-bold text-white">ACCESS GRANTED</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5" />
                      <span className="font-bold text-white">ACCESS DENIED</span>
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </div>

          {/* Desktop Layout: Side by side */}
          <div className="hidden md:block relative h-32 bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-xl">
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-20">
              <div className="absolute inset-0" style={{
                backgroundImage: `radial-gradient(circle at 2px 2px, rgba(0,0,0,0.05) 1px, transparent 0)`,
                backgroundSize: '30px 30px'
              }} />
            </div>

            {/* Subject Glass (Left) */}
            <motion.div
              className="absolute left-4 top-4 bottom-4 w-44 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md border border-blue-200 dark:border-blue-700 rounded-xl p-3 shadow-lg"
              animate={{
                x: decision === "ALLOW" ? 0 : -20,
                opacity: decision === "ALLOW" ? 1 : 0.8
              }}
              transition={{ type: "spring", stiffness: 200, damping: 25 }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-bold text-blue-900 dark:text-blue-100">Subject</span>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Clearance:</span>
                  <span className="font-mono font-semibold">{subjectAttributes.clearance || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Country:</span>
                  <span className="font-mono font-semibold">{subjectAttributes.countryOfAffiliation || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">COI:</span>
                  <span className="font-mono font-semibold text-xs">
                    {subjectAttributes.acpCOI?.join(',') || 'None'}
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Resource Glass (Right) */}
            <motion.div
              className="absolute right-4 top-4 bottom-4 w-44 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md border border-purple-200 dark:border-purple-700 rounded-xl p-3 shadow-lg"
              animate={{
                x: decision === "ALLOW" ? 0 : 20,
                opacity: decision === "ALLOW" ? 1 : 0.8
              }}
              transition={{ type: "spring", stiffness: 200, damping: 25 }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Database className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span className="text-xs font-bold text-purple-900 dark:text-purple-100">Resource</span>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Class:</span>
                  <span className="font-mono font-semibold">{resourceAttributes.classification || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Release:</span>
                  <span className="font-mono font-semibold text-xs">
                    {resourceAttributes.releasabilityTo?.join(',') || 'None'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">COI:</span>
                  <span className="font-mono font-semibold text-xs">
                    {resourceAttributes.COI?.join(',') || 'None'}
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Decision Indicator */}
            {currentStep >= steps.length && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
                className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10"
              >
                <div className={`
                  px-6 py-3 rounded-2xl shadow-2xl backdrop-blur-xl border-2
                  ${decision === "ALLOW"
                    ? "bg-green-500/90 border-green-300"
                    : "bg-red-500/90 border-red-300"
                  }
                `}>
                  <div className="flex items-center gap-2 text-white">
                    {decision === "ALLOW" ? (
                      <>
                        <CheckCircle className="w-5 h-5" />
                        <span className="font-bold">ACCESS GRANTED</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-5 h-5" />
                        <span className="font-bold">ACCESS DENIED</span>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      )}

      {/* Policy Steps */}
      <div className="max-w-4xl mx-auto space-y-3 min-h-[200px] px-2 sm:px-0">
        <AnimatePresence mode="popLayout">
          {steps.map((step, index) => (
            currentStep >= index && (
              <motion.div
                key={step.rule}
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 30 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className={`
                  p-3 sm:p-4 rounded-lg border-2 shadow-md
                  ${step.result === "PASS"
                    ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700"
                    : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700"
                  }
                  ${currentStep === index ? "ring-2 ring-blue-300/50" : ""}
                `}
              >
                <div className="flex items-start gap-2 sm:gap-3">
                  {/* Step Icon */}
                  <div className="flex-shrink-0 mt-0.5">
                    {step.result === "PASS" ? (
                      <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 dark:text-green-400" />
                    ) : (
                      <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 dark:text-red-400" />
                    )}
                  </div>

                  {/* Step Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1 sm:gap-2 mb-1">
                      <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                        Step {index + 1}
                      </span>
                      <code className="text-xs font-mono text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                        {step.rule}
                      </code>
                      <span className={`
                        text-xs font-bold px-2 py-0.5 rounded
                        ${step.result === "PASS"
                          ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200"
                          : "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200"
                        }
                      `}>
                        {step.result}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2 leading-relaxed">
                      {step.reason}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {step.attributes.map((attr) => (
                        <span
                          key={attr}
                          className={`
                            text-xs px-2 py-0.5 rounded font-medium
                            ${currentStep === index
                              ? "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 ring-1 ring-blue-300"
                              : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                            }
                          `}
                        >
                          {attr}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          ))}
        </AnimatePresence>

        {/* KAS Unlock Animation */}
        <AnimatePresence>
          {showKASUnlock && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl shadow-lg"
            >
              <div className="flex items-center gap-3">
                <motion.div
                  animate={{ rotate: [0, -5, 5, -5, 0] }}
                  transition={{ duration: 0.8, repeat: 3 }}
                >
                  <Lock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </motion.div>
                <div className="flex-1">
                  <div className="font-semibold text-blue-900 dark:text-blue-100 text-sm">
                    Requesting decryption key from KAS...
                  </div>
                  <div className="text-xs text-blue-700 dark:text-blue-300">
                    Policy re-evaluation completed • Key access service activated
                  </div>
                </div>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 1.2 }}
                >
                  <Unlock className="w-5 h-5 text-green-600 dark:text-green-400" />
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
