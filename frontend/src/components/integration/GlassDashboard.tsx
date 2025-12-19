"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { FrontGlass } from "./FrontGlass";
import { RearGlass } from "./RearGlass";
import { Shield, Database, AlertCircle, CheckCircle } from "lucide-react";

type DecisionState = "idle" | "permit" | "deny";

/**
 * Two-Layer Glass Dashboard Component
 * 
 * Demonstrates the integration of identity (front) and object (rear) security:
 * - Front glass: JWT claims, subject attributes, AAL badge (ADatP-5663)
 * - Rear glass: ZTDF policy, classification, KAO status (ACP-240)
 * 
 * Animations:
 * - PERMIT: Layers slide together (translateX: 0), both sharp focus
 * - DENY: Layers drift apart (front -100px, rear +100px), rear blurs
 * 
 * Features:
 * - Glassmorphism design (backdrop-blur, semi-transparent backgrounds)
 * - Smooth spring animations (< 300ms)
 * - Interactive decision simulator
 * - Dark mode optimized
 * 
 * @see ADatP-5663 §5.1.3 Token Issuance, §6.2 ABAC Components
 * @see ACP-240 §5.1 ZTDF Structure
 */
export function GlassDashboard() {
  const [decision, setDecision] = useState<DecisionState>("idle");

  // Mock data for demonstration
  const mockSubject = {
    issuer: "https://keycloak:8080/realms/dive-v3-usa",
    sub: "john.doe@mil",
    uniqueID: "john.doe@mil",
    clearance: "SECRET",
    countryOfAffiliation: "USA",
    acpCOI: ["FVEY", "NATO"],
    auth_time: Math.floor(Date.now() / 1000) - 300, // 5 minutes ago
    acr: "aal2",
    amr: ["pwd", "otp"],
  };

  const mockResource = {
    resourceId: "doc-classified-001",
    classification: "SECRET",
    originalClassification: "SECRET",
    originalCountry: "USA",
    releasabilityTo: ["USA", "GBR", "CAN"],
    COI: ["FVEY"],
    creationDate: "2025-10-26T10:00:00Z",
    encrypted: true,
    kaoCount: 3,
    signatureValid: true,
  };

  // Animation variants
  const frontGlassVariants = {
    idle: { x: -50, opacity: 0.9 },
    permit: { x: 0, opacity: 1, filter: "blur(0px)" },
    deny: { x: -100, opacity: 1, filter: "blur(0px)" },
  };

  const rearGlassVariants = {
    idle: { x: 50, opacity: 0.7 },
    permit: { x: 0, opacity: 1, filter: "blur(0px)" },
    deny: { x: 100, opacity: 0.7, filter: "blur(3px)" },
  };

  const handleSimulatePermit = () => {
    setDecision("permit");
    setTimeout(() => setDecision("idle"), 3000);
  };

  const handleSimulateDeny = () => {
    setDecision("deny");
    setTimeout(() => setDecision("idle"), 3000);
  };

  return (
    <section 
      className="w-full py-12 px-4 sm:px-6 lg:px-8"
      aria-labelledby="glass-dashboard-title"
    >
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <h2 
          id="glass-dashboard-title"
          className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2"
        >
          Two-Layer Glass Dashboard
        </h2>
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">
          Identity (front) and Object (rear) layers merge on Permit, separate on Deny
        </p>

        {/* Decision Simulator */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleSimulatePermit}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            disabled={decision !== "idle"}
          >
            <CheckCircle className="w-4 h-4" />
            Simulate PERMIT
          </button>
          <button
            onClick={handleSimulateDeny}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            disabled={decision !== "idle"}
          >
            <AlertCircle className="w-4 h-4" />
            Simulate DENY
          </button>
          {decision !== "idle" && (
            <span className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              {decision === "permit" ? "✅ Layers merging..." : "❌ Layers separating..."}
            </span>
          )}
        </div>
      </div>

      {/* Glass Layers Container */}
      <div className="max-w-7xl mx-auto">
        <div className="relative h-[600px] bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-2xl">
          {/* Background Pattern */}
          <div className="absolute inset-0 opacity-30">
            <div className="absolute inset-0" style={{
              backgroundImage: `radial-gradient(circle at 2px 2px, rgba(0,0,0,0.05) 1px, transparent 0)`,
              backgroundSize: '40px 40px'
            }} />
          </div>

          {/* Rear Glass (Object/Data) */}
          <motion.div
            variants={rearGlassVariants}
            animate={decision}
            transition={{ type: "spring", stiffness: 200, damping: 25 }}
            className="absolute inset-y-8 right-8 w-[450px]"
            style={{ zIndex: 5 }}
          >
            <RearGlass resource={mockResource} />
          </motion.div>

          {/* Front Glass (Identity/Token) */}
          <motion.div
            variants={frontGlassVariants}
            animate={decision}
            transition={{ type: "spring", stiffness: 200, damping: 25 }}
            className="absolute inset-y-8 left-8 w-[450px]"
            style={{ zIndex: 10 }}
          >
            <FrontGlass subject={mockSubject} />
          </motion.div>

          {/* Decision Indicator */}
          {decision !== "idle" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
              className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20"
            >
              <div className={`
                px-8 py-6 rounded-2xl shadow-2xl backdrop-blur-xl border-2
                ${decision === "permit" 
                  ? "bg-green-500/90 border-green-300" 
                  : "bg-red-500/90 border-red-300"
                }
              `}>
                {decision === "permit" ? (
                  <div className="flex items-center gap-3 text-white">
                    <CheckCircle className="w-8 h-8" />
                    <div>
                      <div className="text-2xl font-bold">ALLOW</div>
                      <div className="text-sm opacity-90">All conditions satisfied</div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-white">
                    <AlertCircle className="w-8 h-8" />
                    <div>
                      <div className="text-2xl font-bold">DENY</div>
                      <div className="text-sm opacity-90">Insufficient clearance</div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </div>

        {/* Explanation */}
        <div className="mt-6 grid md:grid-cols-2 gap-4">
          <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <h4 className="font-semibold text-indigo-900 dark:text-indigo-100">
                Front Glass (Identity)
              </h4>
            </div>
            <p className="text-sm text-indigo-800 dark:text-indigo-200">
              Shows JWT claims and subject attributes from ADatP-5663: issuer, clearance, 
              country, COI, AAL level, and authentication methods.
            </p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              <h4 className="font-semibold text-amber-900 dark:text-amber-100">
                Rear Glass (Object)
              </h4>
            </div>
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Shows ZTDF structure and policy from ACP-240: classification, 
              releasabilityTo, COI, encryption status, and signature verification.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
