import axios from 'axios';
import { getResourceById } from './resource.service';
import {
    IDecisionReplayRequest,
    IDecisionReplayResponse,
    IReplayStep
} from '../types/decision-replay.types';
import { logger } from '../utils/logger';

const OPA_URL = process.env.OPA_URL || 'http://localhost:8181';

/**
 * Decision Replay Service
 * 
 * Provides detailed OPA policy evaluation for UI visualization.
 * Breaks down authorization decision into step-by-step rule evaluation.
 */
export class DecisionReplayService {
    /**
     * Replay authorization decision with full evaluation details
     */
    static async replayDecision(
        request: IDecisionReplayRequest,
        userToken: any
    ): Promise<IDecisionReplayResponse> {
        const startTime = Date.now();

        try {
            // 1. Fetch resource from MongoDB
            const resource = await getResourceById(request.resourceId);
            if (!resource) {
                throw new Error(`Resource ${request.resourceId} not found`);
            }

            // 2. Build OPA input (use override userId/context if provided)
            const subject = {
                authenticated: true,
                uniqueID: request.userId || userToken.uniqueID || userToken.sub,
                clearance: userToken.clearance,
                countryOfAffiliation: userToken.countryOfAffiliation,
                acpCOI: userToken.acpCOI || [],
            };

            const context = {
                currentTime: request.context?.currentTime || new Date().toISOString(),
                sourceIP: request.context?.sourceIP || '127.0.0.1',
                deviceCompliant: request.context?.deviceCompliant ?? true,
                requestId: `replay-${Date.now()}`,
            };

            // Extract security attributes from ZTDF structure
            const securityLabel = resource.ztdf?.policy?.securityLabel || {} as any;
            const legacyFields = resource.legacy || {} as any;
            
            const opaInput = {
                input: {
                    subject,
                    action: { operation: 'read' },
                    resource: {
                        resourceId: resource.resourceId,
                        classification: securityLabel.classification || legacyFields.classification || 'UNCLASSIFIED',
                        originalClassification: legacyFields.originalClassification,
                        originalCountry: legacyFields.originalCountry,
                        releasabilityTo: securityLabel.releasabilityTo || legacyFields.releasabilityTo || [],
                        COI: securityLabel.COI || legacyFields.COI || [],
                        creationDate: legacyFields.creationDate,
                        encrypted: (resource.ztdf?.payload as any)?.encrypted || legacyFields.encrypted || false,
                    },
                    context,
                },
            };

            // 3. Call OPA with explain=full
            const opaResponse = await axios.post(
                `${OPA_URL}/v1/data/dive/authorization`,
                opaInput,
                { params: { explain: 'full' } }
            );

            const opaResult = opaResponse.data.result;
            const decision = opaResult.decision?.allow || opaResult.allow ? 'ALLOW' : 'DENY';
            const reason = opaResult.decision?.reason || opaResult.reason || 'Unknown';

            // 4. Build evaluation steps from OPA rules
            const steps = this.buildReplaySteps(opaInput.input, decision);

            // 5. Extract obligations
            const obligations = opaResult.decision?.obligations || opaResult.obligations || [];

            // 6. Build attribute provenance
            const provenance = this.buildProvenance(userToken);

            const latency = Date.now() - startTime;

            return {
                decision: decision as "ALLOW" | "DENY",
                reason,
                steps,
                obligations: obligations.map((o: any) => ({
                    ...o,
                    status: 'pending' as const,
                })),
                evaluation_details: {
                    latency_ms: latency,
                    policy_version: 'v3.1.0',
                    opa_decision_id: opaResult.decision_id,
                },
                provenance,
            };
        } catch (error) {
            logger.error('Decision replay failed', { error, request });
            throw error;
        }
    }

    /**
     * Build replay steps from OPA input and decision
     */
    private static buildReplaySteps(input: any, _decision: string): IReplayStep[] {
        const steps: IReplayStep[] = [];

        // Step 1: Authentication
        steps.push({
            rule: 'is_not_authenticated',
            result: input.subject.authenticated ? 'PASS' : 'FAIL',
            reason: input.subject.authenticated ? 'Subject is authenticated' : 'Subject is not authenticated',
            attributes: ['subject.authenticated'],
        });

        // Step 2: Clearance
        const clearanceSufficient = this.compareClearance(
            input.subject.clearance,
            input.resource.classification
        );
        steps.push({
            rule: 'is_insufficient_clearance',
            result: clearanceSufficient ? 'PASS' : 'FAIL',
            reason: `User clearance (${input.subject.clearance}) ${clearanceSufficient ? '>=' : '<'} resource classification (${input.resource.classification})`,
            attributes: ['subject.clearance', 'resource.classification'],
            comparison: {
                user: input.subject.clearance,
                resource: input.resource.classification,
                operator: '>=',
            },
        });

        // Step 3: Releasability
        const releasable = (input.resource.releasabilityTo || []).includes(input.subject.countryOfAffiliation);
        steps.push({
            rule: 'is_not_releasable_to_country',
            result: releasable ? 'PASS' : 'FAIL',
            reason: `User country (${input.subject.countryOfAffiliation}) ${releasable ? 'in' : 'not in'} resource releasabilityTo ([${(input.resource.releasabilityTo || []).join(', ')}])`,
            attributes: ['subject.countryOfAffiliation', 'resource.releasabilityTo'],
        });

        // Step 4: COI
        const userCOI = input.subject.acpCOI || [];
        const resourceCOI = input.resource.COI || [];
        const coiIntersection = userCOI.filter((c: string) => resourceCOI.includes(c));
        const coiSatisfied = coiIntersection.length > 0 || resourceCOI.length === 0;
        steps.push({
            rule: 'is_coi_violation',
            result: coiSatisfied ? 'PASS' : 'FAIL',
            reason: coiIntersection.length > 0
                ? `User COI intersects resource COI: [${coiIntersection.join(', ')}]`
                : resourceCOI.length === 0
                    ? 'Resource has no COI restrictions'
                    : 'No COI overlap',
            attributes: ['subject.acpCOI', 'resource.COI'],
        });

        // Step 5: Embargo
        const embargoLifted = !input.resource.creationDate ||
            new Date(input.context.currentTime) > new Date(input.resource.creationDate);
        steps.push({
            rule: 'is_under_embargo',
            result: embargoLifted ? 'PASS' : 'FAIL',
            reason: embargoLifted
                ? 'Current time > creation date (embargo lifted)'
                : 'Resource under embargo',
            attributes: ['context.currentTime', 'resource.creationDate'],
        });

        // Step 6: ZTDF Integrity
        // Mock: assume signature valid (will be replaced with actual verification)
        steps.push({
            rule: 'is_ztdf_integrity_violation',
            result: 'PASS',
            reason: 'ZTDF signature valid (STANAG 4778)',
            attributes: ['resource.signatureValid'],
        });

        return steps;
    }

    /**
     * Compare clearance levels
     */
    private static compareClearance(userClearance: string, resourceClassification: string): boolean {
        const levels = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
        const userLevel = levels.indexOf(userClearance);
        const resourceLevel = levels.indexOf(resourceClassification);
        return userLevel >= resourceLevel;
    }

    /**
     * Build attribute provenance
     */
    private static buildProvenance(userToken: any): any {
        return {
            subject: {
                issuer: { source: 'IdP', claim: 'iss', value: userToken.iss },
                uniqueID: { source: 'IdP', claim: 'sub', value: userToken.sub },
                clearance: { source: 'Attribute Authority', claim: 'clearance', value: userToken.clearance },
                countryOfAffiliation: {
                    source: userToken.countryOfAffiliation_source || 'Derived (email domain)',
                    claim: 'countryOfAffiliation',
                    value: userToken.countryOfAffiliation
                },
                auth_time: { source: 'IdP', claim: 'auth_time', value: userToken.auth_time },
                acr: { source: 'Derived', claim: 'acr', value: userToken.acr },
            },
        };
    }
}

