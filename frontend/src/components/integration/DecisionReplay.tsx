"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, RotateCcw, CheckCircle, XCircle, Lock, Unlock } from "lucide-react";
import Confetti from "react-confetti";

interface ReplayStep {
  rule: string;
  result: "PASS" | "FAIL";
  reason: string;
  attributes: string[];
}

/**
 * Decision Replay Component
 * 
 * Step-by-step animator showing OPA policy evaluation:
 * - Highlights which rules passed/failed
 * - Shows attributes influencing each step
 * - Final decision badge (ALLOW/DENY)
 * - Confetti on Permit, shake on Deny
 * - KAS unlock animation if encrypted + ALLOW
 * 
 * @see ADatP-5663 §6.2 ABAC Components (PDP)
 * @see ACP-240 §5.2 Key Access Service
 */
export function DecisionReplay() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showKASUnlock, setShowKASUnlock] = useState(false);

  // Mock evaluation steps (will be replaced with API call in Epic 3.2)
  const steps: ReplayStep[] = [
    {
      rule: "is_not_authenticated",
      result: "PASS",
      reason: "Subject is authenticated",
      attributes: ["subject.authenticated"],
    },
    {
      rule: "is_insufficient_clearance",
      result: "PASS",
      reason: "User clearance (SECRET) >= resource classification (SECRET)",
      attributes: ["subject.clearance", "resource.classification"],
    },
    {
      rule: "is_not_releasable_to_country",
      result: "PASS",
      reason: "User country (USA) in resource releasabilityTo ([USA, GBR, CAN])",
      attributes: ["subject.countryOfAffiliation", "resource.releasabilityTo"],
    },
    {
      rule: "is_coi_violation",
      result: "PASS",
      reason: "User COI intersects resource COI: [FVEY]",
      attributes: ["subject.acpCOI", "resource.COI"],
    },
    {
      rule: "is_under_embargo",
      result: "PASS",
      reason: "Current time > creation date (embargo lifted)",
      attributes: ["context.currentTime", "resource.creationDate"],
    },
    {
      rule: "is_ztdf_integrity_violation",
      result: "PASS",
      reason: "ZTDF signature valid (STANAG 4778)",
      attributes: ["resource.signatureValid"],
    },
  ];

  const finalDecision = steps.every(s => s.result === "PASS") ? "ALLOW" : "DENY";
  const encrypted = true; // Mock resource encrypted status

  const handlePlay = () => {
    setIsPlaying(true);
    setCurrentStep(0);
    setShowConfetti(false);
    setShowKASUnlock(false);
  };

  const handlePause = () => {
    setIsPlaying(false);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentStep(-1);
    setShowConfetti(false);
    setShowKASUnlock(false);
  };

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
      if (finalDecision === "ALLOW") {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 5000);
        
        if (encrypted) {
          setTimeout(() => setShowKASUnlock(true), 1000);
          setTimeout(() => setShowKASUnlock(false), 4000);
        }
      }
    }
  }, [isPlaying, currentStep, steps.length, finalDecision, encrypted]);

  return (
    <section 
      className="w-full py-12 px-4 sm:px-6 lg:px-8"
      aria-labelledby="decision-replay-title"
    >
      {/* Confetti Effect */}
      {showConfetti && <Confetti recycle={false} numberOfPieces={200} />}

      {/* Header */}
      <div className="max-w-5xl mx-auto mb-8">
        <h2 
          id="decision-replay-title"
          className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2"
        >
          Decision Replay
        </h2>
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">
          Step-by-step visualization of OPA policy evaluation
        </p>

        {/* Playback Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={handlePlay}
            disabled={isPlaying}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <Play className="w-4 h-4" />
            Play
          </button>
          <button
            onClick={handlePause}
            disabled={!isPlaying}
            className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-400 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-500"
          >
            <Pause className="w-4 h-4" />
            Pause
          </button>
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
        </div>
      </div>

      {/* Steps */}
      <div className="max-w-5xl mx-auto space-y-4">
        <AnimatePresence mode="popLayout">
          {steps.map((step, index) => (
            currentStep >= index && (
              <motion.div
                key={step.rule}
                initial={{ opacity: 0, x: -50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 50 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className={`
                  p-4 rounded-lg border-2
                  ${step.result === "PASS"
                    ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700"
                    : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700"
                  }
                  ${currentStep === index ? "ring-4 ring-blue-300/50" : ""}
                `}
              >
                <div className="flex items-start gap-4">
                  {/* Step Icon */}
                  <div className="flex-shrink-0 mt-1">
                    {step.result === "PASS" ? (
                      <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                    ) : (
                      <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                    )}
                  </div>

                  {/* Step Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                        Step {index + 1}
                      </span>
                      <code className="text-sm font-mono text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                        {step.rule}
                      </code>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                      {step.reason}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {step.attributes.map((attr) => (
                        <span
                          key={attr}
                          className={`
                            text-xs px-2 py-0.5 rounded font-medium
                            ${currentStep === index
                              ? "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 ring-2 ring-blue-300"
                              : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                            }
                          `}
                        >
                          {attr}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Step Number Badge */}
                  <div className="flex-shrink-0">
                    <div className={`
                      w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                      ${step.result === "PASS"
                        ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                        : "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300"
                      }
                    `}>
                      {index + 1}
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          ))}
        </AnimatePresence>

        {/* Final Decision */}
        {currentStep >= steps.length && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className={`
              p-8 rounded-2xl border-4 shadow-2xl
              ${finalDecision === "ALLOW"
                ? "bg-gradient-to-br from-green-500 to-emerald-500 border-green-300"
                : "bg-gradient-to-br from-red-500 to-rose-500 border-red-300 animate-shake"
              }
            `}
          >
            <div className="flex items-center justify-center gap-4 text-white">
              {finalDecision === "ALLOW" ? (
                <>
                  <CheckCircle className="w-12 h-12" />
                  <div>
                    <div className="text-4xl font-bold">ALLOW</div>
                    <div className="text-lg opacity-90">All conditions satisfied</div>
                  </div>
                </>
              ) : (
                <>
                  <XCircle className="w-12 h-12" />
                  <div>
                    <div className="text-4xl font-bold">DENY</div>
                    <div className="text-lg opacity-90">One or more checks failed</div>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}

        {/* KAS Unlock Animation */}
        <AnimatePresence>
          {showKASUnlock && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="p-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl"
            >
              <div className="flex items-center gap-4">
                <motion.div
                  animate={{ rotate: [0, -10, 10, -10, 0] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                >
                  <Lock className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                </motion.div>
                <div className="flex-1">
                  <div className="font-bold text-blue-900 dark:text-blue-100">
                    Requesting key from KAS...
                  </div>
                  <div className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    Policy re-evaluation in progress
                  </div>
                </div>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 1.5 }}
                >
                  <Unlock className="w-8 h-8 text-green-600 dark:text-green-400" />
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
