"use client";

import { useEffect, useState } from "react";
import { CheckCircle, XCircle, Loader2, User, FileText } from "lucide-react";

interface AttributeDiffProps {
  resourceId?: string;
  userId?: string;
}

interface DiffResult {
  clearanceCheck: { satisfied: boolean; reason: string };
  countryCheck: { satisfied: boolean; reason: string };
  coiCheck: { satisfied: boolean; reason: string };
  decision: "ALLOW" | "DENY";
  reason: string;
}

/**
 * Attribute Inspection UI Component
 * 
 * Side-by-side comparison of:
 * - Left: ADatP-5663 JWT claims (subject attributes)
 * - Right: ACP-240 ZTDF attributes (resource/object attributes)
 * 
 * Features:
 * - Live PDP evaluation via /api/decision-replay
 * - Green checks (✅) for satisfied conditions
 * - Red X (❌) for violations with reason tooltips
 * - Real-time diff highlighting
 * 
 * @see ADatP-5663 §4.4 Minimum Subject Attributes
 * @see ACP-240 §4 Resource Attributes
 */
export function AttributeDiff({ resourceId = "doc-classified-001", userId = "john.doe@mil" }: AttributeDiffProps) {
  const [loading, setLoading] = useState(false);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);

  // Mock data (will be replaced with API call in Epic 3.2)
  const mockSubject = {
    issuer: "dive-v3-usa",
    uniqueID: "john.doe@mil",
    clearance: "SECRET",
    countryOfAffiliation: "USA",
    acpCOI: ["FVEY", "NATO"],
    auth_time: "5m ago",
    acr: "AAL2",
    amr: ["pwd", "otp"],
  };

  const mockResource = {
    classification: "SECRET",
    originalClassification: "SECRET",
    originalCountry: "USA",
    releasabilityTo: ["USA", "GBR", "CAN"],
    COI: ["FVEY"],
    creationDate: "2025-10-26T10:00:00Z",
    encrypted: true,
  };

  // Simulate PDP evaluation
  useEffect(() => {
    setLoading(true);
    
    // Simulate API call delay
    const timer = setTimeout(() => {
      // Mock evaluation logic
      const clearanceCheck = {
        satisfied: mockSubject.clearance >= mockResource.classification,
        reason: `${mockSubject.clearance} >= ${mockResource.classification}`,
      };
      
      const countryCheck = {
        satisfied: mockResource.releasabilityTo.includes(mockSubject.countryOfAffiliation),
        reason: `${mockSubject.countryOfAffiliation} in [${mockResource.releasabilityTo.join(", ")}]`,
      };
      
      const userCOI = new Set(mockSubject.acpCOI);
      const resourceCOI = new Set(mockResource.COI);
      const intersection = [...userCOI].filter(x => resourceCOI.has(x));
      const coiCheck = {
        satisfied: intersection.length > 0,
        reason: intersection.length > 0 
          ? `Intersection: [${intersection.join(", ")}]` 
          : "No COI overlap",
      };

      const allSatisfied = clearanceCheck.satisfied && countryCheck.satisfied && coiCheck.satisfied;
      
      setDiffResult({
        clearanceCheck,
        countryCheck,
        coiCheck,
        decision: allSatisfied ? "ALLOW" : "DENY",
        reason: allSatisfied ? "All conditions satisfied" : "One or more checks failed",
      });
      
      setLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [resourceId, userId]);

  return (
    <section 
      className="w-full py-12 px-4 sm:px-6 lg:px-8"
      aria-labelledby="attribute-diff-title"
    >
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <h2 
          id="attribute-diff-title"
          className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2"
        >
          Attribute Inspection & Comparison
        </h2>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Side-by-side comparison of JWT claims (5663) vs ZTDF attributes (240) with live PDP evaluation
        </p>
      </div>

      {/* Diff Container */}
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-2 gap-6">
          {/* Left Column: JWT Claims (5663) */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-500 to-blue-500 text-white p-4">
              <div className="flex items-center gap-2">
                <User className="w-5 h-5" />
                <h3 className="text-lg font-bold">Subject Attributes</h3>
              </div>
              <p className="text-xs text-indigo-100 mt-1">ADatP-5663 (Federation)</p>
            </div>
            
            <div className="p-6 space-y-3">
              <AttributeRow label="Issuer" value={mockSubject.issuer} />
              <AttributeRow label="Unique ID" value={mockSubject.uniqueID} />
              <AttributeRow label="Clearance" value={mockSubject.clearance} highlight />
              <AttributeRow label="Country" value={mockSubject.countryOfAffiliation} highlight />
              <AttributeRow label="COI" value={mockSubject.acpCOI.join(", ")} highlight />
              <AttributeRow label="Auth Time" value={mockSubject.auth_time} />
              <AttributeRow label="AAL" value={mockSubject.acr} />
              <AttributeRow label="MFA Methods" value={mockSubject.amr.join(" + ")} />
            </div>
          </div>

          {/* Right Column: ZTDF Attributes (240) */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-amber-500 to-red-500 text-white p-4">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                <h3 className="text-lg font-bold">Resource Attributes</h3>
              </div>
              <p className="text-xs text-amber-100 mt-1">ACP-240 (Object)</p>
            </div>
            
            <div className="p-6 space-y-3">
              <AttributeRow label="Classification" value={mockResource.classification} highlight />
              <AttributeRow label="Original" value={`${mockResource.originalClassification} (${mockResource.originalCountry})`} />
              <AttributeRow label="Releasability To" value={mockResource.releasabilityTo.join(", ")} highlight />
              <AttributeRow label="COI" value={mockResource.COI.join(", ")} highlight />
              <AttributeRow label="Created" value={new Date(mockResource.creationDate).toLocaleString()} />
              <AttributeRow label="Encrypted" value={mockResource.encrypted ? "Yes" : "No"} />
            </div>
          </div>
        </div>

        {/* Evaluation Results */}
        {loading ? (
          <div className="mt-6 p-6 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
            <span className="ml-3 text-gray-600 dark:text-gray-400">Evaluating policy...</span>
          </div>
        ) : diffResult && (
          <div className="mt-6 p-6 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
              Policy Evaluation Results
            </h3>
            
            <div className="space-y-3">
              {/* Clearance Check */}
              <div className={`flex items-start gap-3 p-3 rounded-lg border ${
                diffResult.clearanceCheck.satisfied 
                  ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700" 
                  : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700"
              }`}>
                {diffResult.clearanceCheck.satisfied ? (
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Clearance Check</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {diffResult.clearanceCheck.reason}
                  </div>
                </div>
              </div>

              {/* Country Check */}
              <div className={`flex items-start gap-3 p-3 rounded-lg border ${
                diffResult.countryCheck.satisfied 
                  ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700" 
                  : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700"
              }`}>
                {diffResult.countryCheck.satisfied ? (
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Releasability Check</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {diffResult.countryCheck.reason}
                  </div>
                </div>
              </div>

              {/* COI Check */}
              <div className={`flex items-start gap-3 p-3 rounded-lg border ${
                diffResult.coiCheck.satisfied 
                  ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700" 
                  : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700"
              }`}>
                {diffResult.coiCheck.satisfied ? (
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <div className="font-semibold text-gray-900 dark:text-gray-100">COI Intersection</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {diffResult.coiCheck.reason}
                  </div>
                </div>
              </div>
            </div>

            {/* Final Decision */}
            <div className={`mt-6 p-4 rounded-lg border-2 ${
              diffResult.decision === "ALLOW"
                ? "bg-green-100 dark:bg-green-900/30 border-green-500"
                : "bg-red-100 dark:bg-red-900/30 border-red-500"
            }`}>
              <div className="flex items-center gap-3">
                {diffResult.decision === "ALLOW" ? (
                  <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                ) : (
                  <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                )}
                <div>
                  <div className={`text-xl font-bold ${
                    diffResult.decision === "ALLOW" 
                      ? "text-green-900 dark:text-green-100" 
                      : "text-red-900 dark:text-red-100"
                  }`}>
                    {diffResult.decision}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {diffResult.reason}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Attribute Row Helper Component
 */
function AttributeRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex items-start justify-between gap-4 ${highlight ? "bg-yellow-50 dark:bg-yellow-900/10 -mx-2 px-2 py-1 rounded" : ""}`}>
      <span className="text-sm font-medium text-gray-500 dark:text-gray-400 flex-shrink-0">
        {label}:
      </span>
      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 text-right break-all">
        {value}
      </span>
    </div>
  );
}
