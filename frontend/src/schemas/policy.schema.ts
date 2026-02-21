import { z } from 'zod';

/**
 * Zod validation schemas for Policy Editor
 * Ensures data integrity and provides type-safe validation
 */

export const policyMetadataSchema = z.object({
  name: z
    .string()
    .min(3, 'Policy name must be at least 3 characters')
    .max(100, 'Policy name must not exceed 100 characters')
    .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Policy name can only contain letters, numbers, spaces, hyphens, and underscores'),
  
  description: z
    .string()
    .min(10, 'Description must be at least 10 characters')
    .max(500, 'Description must not exceed 500 characters'),
  
  standardsLens: z.enum(['5663', 'unified', '240']),
});

export const policySourceSchema = z.object({
  source: z
    .string()
    .min(50, 'Policy source must be at least 50 characters')
    .refine(
      (val) => val.includes('package dive.authorization'),
      'Policy must declare package dive.authorization'
    )
    .refine(
      (val) => /default\s+allow\s*:=\s*false/i.test(val),
      'Policy must include "default allow := false" (fail-secure pattern)'
    )
    .refine(
      (val) => /allow\s+if\s*\{/i.test(val) || /allow\s*:=\s*true/i.test(val),
      'Policy must include at least one allow rule'
    ),
});

export const policyFormSchema = policyMetadataSchema.merge(policySourceSchema);

export type PolicyMetadata = z.infer<typeof policyMetadataSchema>;
export type PolicySource = z.infer<typeof policySourceSchema>;
export type PolicyForm = z.infer<typeof policyFormSchema>;
