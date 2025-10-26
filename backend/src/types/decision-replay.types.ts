/**
 * Decision Replay Types
 * 
 * Type definitions for the Decision Replay API (/api/decision-replay)
 * that returns full OPA evaluation details for UI visualization.
 */

/**
 * Decision Replay Request
 */
export interface IDecisionReplayRequest {
    resourceId: string;
    userId?: string;  // Optional: replay for different user
    context?: {       // Optional: override context
        currentTime?: string;
        sourceIP?: string;
        deviceCompliant?: boolean;
    };
}

/**
 * Policy Evaluation Step
 */
export interface IReplayStep {
    rule: string;            // e.g., "is_insufficient_clearance"
    result: "PASS" | "FAIL";
    reason: string;          // Human-readable explanation
    attributes: string[];    // Attributes used in this rule
    comparison?: {           // For numeric/string comparisons
        user: string;
        resource: string;
        operator: string;      // e.g., ">=", "in", "∩"
    };
}

/**
 * Attribute Provenance
 */
export interface IAttributeProvenance {
    source: "IdP" | "Attribute Authority" | "Derived (email domain)" | "Derived";
    claim: string;           // e.g., "clearance", "iss", "acr"
    value: string | string[] | number;
}

/**
 * Decision Replay Response
 */
export interface IDecisionReplayResponse {
    decision: "ALLOW" | "DENY";
    reason: string;
    steps: IReplayStep[];
    obligations?: Array<{
        type: string;
        resourceId?: string;
        status: "pending" | "fulfilled" | "failed";
    }>;
    evaluation_details: {
        latency_ms: number;
        policy_version: string;
        opa_decision_id?: string;
    };
    provenance: {
        subject: Record<string, IAttributeProvenance>;
        resource?: Record<string, any>;
    };
}

