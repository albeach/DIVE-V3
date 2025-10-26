"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { User, FileText, GitMerge, Shield, CheckCircle, XCircle, ArrowRight, Lock, Unlock, Eye, EyeOff } from "lucide-react";

/**
 * Fusion Mode Component
 * 
 * Unified ABAC view showing:
 * User + Object → Attribute Merge → PDP Decision → Enforcement (PEP + KAS)
 * 
 * Features:
 * - User card (left) + Object card (right)
 * - Attribute merge animation
 * - PDP decision badge (centered)
 * - Enforcement flow (3-step: PEP → KAS/Content → Result)
 * - Toggle to show/hide protocol-specific branches (OIDC/ZTDF)
 * 
 * @see ADatP-5663 §6.2 ABAC Components
 * @see ACP-240 §3.2 Policy Decision/Enforcement
 */
export function FusionMode() {
  const [showProtocolBranches, setShowProtocolBranches] = useState(false);
  const [mergeComplete, setMergeComplete] = useState(false);

  // Mock data
  const user = {
    name: "John Doe",
    clearance: "SECRET",
    country: "USA",
    coi: ["FVEY", "NATO"],
  };

  const object = {
    title: "Classified Document",
    classification: "SECRET",
    releasability: ["USA", "GBR", "CAN"],
    coi: ["FVEY"],
  };

  const decision = "ALLOW";
  const encrypted = true;

  const handleMerge = () => {
    setMergeComplete(true);
    setTimeout(() => setMergeComplete(false), 5000);
  };

  return (
    <section 
      className="w-full py-12 px-4 sm:px-6 lg:px-8"
      aria-labelledby="fusion-mode-title"
    >
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 
              id="fusion-mode-title"
              className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2"
            >
              Fusion Mode: Unified ABAC View
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              See how identity (5663) and object (240) attributes merge in authorization decisions
            </p>
          </div>
          
          {/* Protocol Branches Toggle */}
          <button
            onClick={() => setShowProtocolBranches(!showProtocolBranches)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 rounded-lg transition-colors"
          >
            {showProtocolBranches ? (
              <>
                <EyeOff className="w-4 h-4" />
                Hide Protocol Details
              </>
            ) : (
              <>
                <Eye className="w-4 h-4" />
                Show Protocol Details
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Flow */}
      <div className="max-w-7xl mx-auto">
        {/* Top Row: User + Object Cards */}
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          {/* User Card */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-gradient-to-br from-indigo-500 to-blue-500 text-white rounded-xl p-6 shadow-xl"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <User className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold">{user.name}</h3>
                <p className="text-sm text-indigo-100">Subject (ADatP-5663)</p>
              </div>
            </div>
            
            <div className="space-y-2">
              <AttributeRow label="Clearance" value={user.clearance} />
              <AttributeRow label="Country" value={user.country} />
              <AttributeRow label="COI" value={user.coi.join(", ")} />
            </div>
          </motion.div>

          {/* Object Card */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-gradient-to-br from-amber-500 to-red-500 text-white rounded-xl p-6 shadow-xl"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold">{object.title}</h3>
                <p className="text-sm text-amber-100">Resource (ACP-240)</p>
              </div>
            </div>
            
            <div className="space-y-2">
              <AttributeRow label="Classification" value={object.classification} />
              <AttributeRow label="Releasability" value={object.releasability.join(", ")} />
              <AttributeRow label="COI" value={object.coi.join(", ")} />
            </div>
          </motion.div>
        </div>

        {/* Middle Row: Attribute Merge */}
        <div className="mb-8">
          <button
            onClick={handleMerge}
            className="w-full p-6 bg-teal-500 hover:bg-teal-600 text-white rounded-xl transition-colors flex items-center justify-center gap-3 shadow-lg"
          >
            <GitMerge className="w-6 h-6" />
            <span className="text-lg font-bold">
              {mergeComplete ? "Attributes Merged ✓" : "Merge Attributes for ABAC"}
            </span>
          </button>
          
          {mergeComplete && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-6 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-700 rounded-xl"
            >
              <h4 className="font-bold text-teal-900 dark:text-teal-100 mb-3">Merged Attributes</h4>
              <div className="grid md:grid-cols-3 gap-4 text-sm">
                <div className={`p-3 rounded-lg ${user.clearance === object.classification ? "bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700" : "bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700"}`}>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Clearance Match</div>
                  <div className="text-gray-700 dark:text-gray-300 mt-1">
                    {user.clearance} {user.clearance >= object.classification ? "≥" : "<"} {object.classification}
                  </div>
                  {user.clearance >= object.classification && (
                    <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 mt-2" />
                  )}
                </div>
                
                <div className={`p-3 rounded-lg ${object.releasability.includes(user.country) ? "bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700" : "bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700"}`}>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Country Match</div>
                  <div className="text-gray-700 dark:text-gray-300 mt-1">
                    {user.country} {object.releasability.includes(user.country) ? "∈" : "∉"} {object.releasability.join(", ")}
                  </div>
                  {object.releasability.includes(user.country) && (
                    <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 mt-2" />
                  )}
                </div>

                <div className={`p-3 rounded-lg ${user.coi.some(c => object.coi.includes(c)) ? "bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700" : "bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700"}`}>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">COI Intersection</div>
                  <div className="text-gray-700 dark:text-gray-300 mt-1">
                    {user.coi.filter(c => object.coi.includes(c)).join(", ") || "None"}
                  </div>
                  {user.coi.some(c => object.coi.includes(c)) && (
                    <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 mt-2" />
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Bottom Row: PDP Decision */}
        {mergeComplete && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-8"
          >
            <div className={`p-8 rounded-2xl shadow-2xl text-center ${
              decision === "ALLOW"
                ? "bg-gradient-to-br from-green-500 to-emerald-500"
                : "bg-gradient-to-br from-red-500 to-rose-500"
            }`}>
              <div className="flex items-center justify-center gap-4 text-white">
                {decision === "ALLOW" ? (
                  <CheckCircle className="w-16 h-16" />
                ) : (
                  <XCircle className="w-16 h-16" />
                )}
                <div>
                  <div className="text-5xl font-bold">{decision}</div>
                  <div className="text-xl opacity-90 mt-2">
                    {decision === "ALLOW" ? "All ABAC conditions satisfied" : "One or more checks failed"}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Enforcement Flow */}
        {mergeComplete && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-lg"
          >
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-6">
              Enforcement Flow
            </h3>
            
            <div className="flex items-center justify-between">
              {/* Step 1: PEP */}
              <div className="flex-1 text-center">
                <div className="w-16 h-16 mx-auto rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center mb-2">
                  <Shield className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">PEP</div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Enforces decision</div>
              </div>

              <ArrowRight className="w-6 h-6 text-gray-400 flex-shrink-0" />

              {/* Step 2: KAS or Content */}
              <div className="flex-1 text-center">
                {decision === "ALLOW" && encrypted ? (
                  <>
                    <div className="w-16 h-16 mx-auto rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center mb-2">
                      <Lock className="w-8 h-8 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">KAS</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Release key</div>
                  </>
                ) : decision === "ALLOW" ? (
                  <>
                    <div className="w-16 h-16 mx-auto rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mb-2">
                      <FileText className="w-8 h-8 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">Content</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Serve directly</div>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 mx-auto rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center mb-2">
                      <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
                    </div>
                    <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">Deny</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">403 Forbidden</div>
                  </>
                )}
              </div>

              <ArrowRight className="w-6 h-6 text-gray-400 flex-shrink-0" />

              {/* Step 3: Result */}
              <div className="flex-1 text-center">
                {decision === "ALLOW" ? (
                  <>
                    <div className="w-16 h-16 mx-auto rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mb-2">
                      <Unlock className="w-8 h-8 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">Access Granted</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      {encrypted ? "Decrypted" : "Content served"}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 mx-auto rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center mb-2">
                      <Lock className="w-8 h-8 text-red-600 dark:text-red-400" />
                    </div>
                    <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">Access Denied</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Reason logged</div>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Protocol-Specific Branches (Optional) */}
        {showProtocolBranches && mergeComplete && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-6 grid md:grid-cols-2 gap-6"
          >
            <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4 opacity-60">
              <h4 className="font-semibold text-indigo-900 dark:text-indigo-100 mb-2">
                Federation Layer (5663) - Handled
              </h4>
              <ul className="space-y-1 text-sm text-indigo-800 dark:text-indigo-200">
                <li>✓ OIDC authentication complete</li>
                <li>✓ JWT signature verified</li>
                <li>✓ Token lifetime valid</li>
                <li>✓ AAL2 MFA satisfied</li>
              </ul>
            </div>
            
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4 opacity-60">
              <h4 className="font-semibold text-amber-900 dark:text-amber-100 mb-2">
                Object Layer (240) - Handled
              </h4>
              <ul className="space-y-1 text-sm text-amber-800 dark:text-amber-200">
                <li>✓ ZTDF signature verified</li>
                <li>✓ Policy hash validated</li>
                <li>✓ KAS policy re-evaluation</li>
                <li>✓ DEK unwrapped successfully</li>
              </ul>
            </div>
          </motion.div>
        )}

        {/* Trigger Merge Button */}
        {!mergeComplete && (
          <div className="text-center mt-8">
            <button
              onClick={handleMerge}
              className="px-8 py-4 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white rounded-xl text-lg font-bold shadow-lg transition-all hover:scale-105"
            >
              Simulate ABAC Evaluation
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Attribute Row Helper
 */
function AttributeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-white/70">{label}:</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}

