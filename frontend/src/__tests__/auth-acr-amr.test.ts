/**
 * ACR/AMR Extraction Unit Tests
 * 
 * These tests verify the correct extraction and prioritization of ACR (Authentication
 * Context Class Reference) and AMR (Authentication Methods Reference) claims from
 * JWT tokens, including federated authentication scenarios.
 * 
 * Key behaviors tested:
 * 1. user_acr is prioritized over acr for federated users
 * 2. user_amr is prioritized over amr for federated users
 * 3. AMR can be parsed from arrays, JSON strings, or single values
 * 4. AAL is correctly derived from AMR when ACR is missing or incorrect
 * 5. jsonType: "String" multivalued arrays are correctly parsed
 * 
 * Reference: HANDOFF_ACR_AMR_COMPLETE_FIX.md
 */

describe('ACR/AMR Extraction Logic', () => {
    // Helper functions that mirror the logic in auth.ts
    
    /**
     * Extract ACR from JWT payload, prioritizing user_acr for federated users
     */
    function extractACR(payload: Record<string, unknown>): string | undefined {
        if (payload.user_acr !== undefined && payload.user_acr !== null) {
            return String(payload.user_acr);
        } else if (payload.acr !== undefined && payload.acr !== null) {
            return String(payload.acr);
        }
        return undefined;
    }

    /**
     * Extract AMR from JWT payload, prioritizing user_amr for federated users
     * Handles arrays, JSON strings, and single values
     */
    function extractAMR(payload: Record<string, unknown>): string[] {
        const amrSource = payload.user_amr || payload.amr;
        
        if (!amrSource) {
            return ['pwd']; // Default fallback
        }
        
        if (Array.isArray(amrSource)) {
            return amrSource;
        } else if (typeof amrSource === 'string') {
            // Sometimes stored as JSON string
            try {
                const parsed = JSON.parse(amrSource);
                return Array.isArray(parsed) ? parsed : [parsed];
            } catch {
                // Not JSON, treat as single value
                return [amrSource];
            }
        }
        
        return ['pwd'];
    }

    /**
     * Derive AAL level from ACR and AMR
     * Implements NIST SP 800-63B AAL derivation
     */
    function deriveAAL(acr: string | undefined, amr: string[]): string {
        const amrSet = new Set(amr.map((v) => String(v).toLowerCase()));
        
        const hasWebAuthn = amrSet.has('hwk') || amrSet.has('webauthn') || amrSet.has('passkey');
        const hasOTP = amrSet.has('otp') || amrSet.has('totp');
        const hasMultipleFactors = amr.length >= 2;
        
        // Override ACR if Keycloak returned incorrect value
        if (!acr || acr === '0' || acr === '1' || acr === 'aal1') {
            if (hasWebAuthn) {
                return '3'; // AAL3 if hardware key present
            } else if (hasMultipleFactors || hasOTP) {
                return '2'; // AAL2 if multiple factors or OTP
            } else {
                return '0';
            }
        } else if (acr === '2' && hasWebAuthn) {
            // Keycloak returned AAL2 but we have WebAuthn - upgrade to AAL3
            return '3';
        }
        
        return acr || '0';
    }

    describe('extractACR', () => {
        it('should prioritize user_acr for federated users', () => {
            const payload = { acr: '1', user_acr: '3' };
            expect(extractACR(payload)).toBe('3');
        });

        it('should use acr when user_acr is not present', () => {
            const payload = { acr: '2' };
            expect(extractACR(payload)).toBe('2');
        });

        it('should return undefined when neither acr nor user_acr is present', () => {
            const payload = {};
            expect(extractACR(payload)).toBeUndefined();
        });

        it('should handle numeric acr values', () => {
            const payload = { acr: 2 };
            expect(extractACR(payload)).toBe('2');
        });

        it('should handle null user_acr and fall back to acr', () => {
            const payload = { acr: '1', user_acr: null };
            expect(extractACR(payload)).toBe('1');
        });

        it('should handle string AAL values', () => {
            const payload = { acr: 'aal3' };
            expect(extractACR(payload)).toBe('aal3');
        });
    });

    describe('extractAMR', () => {
        it('should prioritize user_amr for federated users', () => {
            const payload = { amr: ['pwd'], user_amr: ['pwd', 'hwk'] };
            expect(extractAMR(payload)).toEqual(['pwd', 'hwk']);
        });

        it('should use amr when user_amr is not present', () => {
            const payload = { amr: ['pwd', 'otp'] };
            expect(extractAMR(payload)).toEqual(['pwd', 'otp']);
        });

        it('should return default ["pwd"] when no AMR is present', () => {
            const payload = {};
            expect(extractAMR(payload)).toEqual(['pwd']);
        });

        it('should parse JSON string AMR (Keycloak jsonType issue)', () => {
            const payload = { amr: '["pwd","hwk"]' };
            expect(extractAMR(payload)).toEqual(['pwd', 'hwk']);
        });

        it('should handle single string AMR value', () => {
            const payload = { amr: 'pwd' };
            expect(extractAMR(payload)).toEqual(['pwd']);
        });

        it('should handle empty array AMR', () => {
            const payload = { amr: [] };
            expect(extractAMR(payload)).toEqual([]);
        });

        it('should handle user_amr as JSON string', () => {
            const payload = { user_amr: '["pwd","otp"]' };
            expect(extractAMR(payload)).toEqual(['pwd', 'otp']);
        });

        it('should handle malformed JSON string gracefully', () => {
            const payload = { amr: 'not-json' };
            expect(extractAMR(payload)).toEqual(['not-json']);
        });
    });

    describe('deriveAAL', () => {
        it('should return AAL3 when hwk is in AMR', () => {
            expect(deriveAAL(undefined, ['pwd', 'hwk'])).toBe('3');
        });

        it('should return AAL3 when webauthn is in AMR', () => {
            expect(deriveAAL(undefined, ['pwd', 'webauthn'])).toBe('3');
        });

        it('should return AAL3 when passkey is in AMR', () => {
            expect(deriveAAL('1', ['pwd', 'passkey'])).toBe('3');
        });

        it('should return AAL2 when otp is in AMR', () => {
            expect(deriveAAL(undefined, ['pwd', 'otp'])).toBe('2');
        });

        it('should return AAL2 when totp is in AMR', () => {
            expect(deriveAAL('1', ['pwd', 'totp'])).toBe('2');
        });

        it('should return AAL2 when multiple factors present', () => {
            expect(deriveAAL('1', ['pwd', 'sms'])).toBe('2');
        });

        it('should return AAL0 for password-only authentication', () => {
            expect(deriveAAL('1', ['pwd'])).toBe('0');
        });

        it('should upgrade AAL2 to AAL3 when WebAuthn is present', () => {
            expect(deriveAAL('2', ['pwd', 'hwk'])).toBe('3');
        });

        it('should respect valid ACR when no upgrade needed', () => {
            expect(deriveAAL('3', ['pwd', 'hwk'])).toBe('3');
        });

        it('should handle case-insensitive AMR values', () => {
            expect(deriveAAL('1', ['PWD', 'HWK'])).toBe('3');
        });

        it('should handle aal1 string as low ACR', () => {
            expect(deriveAAL('aal1', ['pwd', 'otp'])).toBe('2');
        });
    });

    describe('Federation Scenarios', () => {
        it('should correctly handle NZL→Hub WebAuthn federation', () => {
            // NZL user authenticates with password + WebAuthn
            // Hub receives federated claims via user_acr/user_amr
            const payload = {
                acr: '1',        // Hub's SSO session (always 1)
                amr: [],         // Hub's session AMR (empty)
                user_acr: '3',   // From NZL spoke
                user_amr: ['pwd', 'hwk'],  // From NZL spoke
            };

            const acr = extractACR(payload);
            const amr = extractAMR(payload);
            const aal = deriveAAL(acr, amr);

            expect(acr).toBe('3');
            expect(amr).toEqual(['pwd', 'hwk']);
            expect(aal).toBe('3');
        });

        it('should correctly handle FRA→Hub OTP federation', () => {
            // FRA user authenticates with password + OTP
            const payload = {
                acr: '1',
                amr: [],
                user_acr: '2',
                user_amr: ['pwd', 'otp'],
            };

            const acr = extractACR(payload);
            const amr = extractAMR(payload);
            const aal = deriveAAL(acr, amr);

            expect(acr).toBe('2');
            expect(amr).toEqual(['pwd', 'otp']);
            expect(aal).toBe('2');
        });

        it('should correctly handle direct Hub authentication', () => {
            // USA user authenticates directly on Hub with password
            const payload = {
                acr: '1',
                amr: ['pwd'],
            };

            const acr = extractACR(payload);
            const amr = extractAMR(payload);
            const aal = deriveAAL(acr, amr);

            expect(acr).toBe('1');
            expect(amr).toEqual(['pwd']);
            expect(aal).toBe('0');
        });

        it('should handle jsonType String multivalued arrays (Keycloak fix)', () => {
            // When Keycloak mapper uses jsonType.label: "String" with multivalued: true,
            // the AMR comes as a proper array, not a JSON string
            const payload = {
                user_amr: ['pwd', 'hwk'], // Correctly formatted array
            };

            const amr = extractAMR(payload);
            expect(amr).toEqual(['pwd', 'hwk']);
        });
    });

    describe('Edge Cases', () => {
        it('should handle undefined values gracefully', () => {
            const payload = { acr: undefined, amr: undefined };
            expect(extractACR(payload)).toBeUndefined();
            expect(extractAMR(payload)).toEqual(['pwd']);
        });

        it('should handle empty string ACR', () => {
            const payload = { acr: '' };
            expect(extractACR(payload)).toBe('');
        });

        it('should handle numeric AMR values in array', () => {
            const payload = { amr: [1, 2, 3] };
            // deriveAAL handles this via toLowerCase()
            expect(extractAMR(payload)).toEqual([1, 2, 3]);
        });

        it('should handle very long AMR arrays', () => {
            const longAmr = ['pwd', 'otp', 'sms', 'hwk', 'mfa', 'pin'];
            const payload = { amr: longAmr };
            expect(extractAMR(payload)).toEqual(longAmr);
        });
    });
});
