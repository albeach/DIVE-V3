'use client';

import { useState } from 'react';
import type { StandardsLens } from '@/types/policy-builder.types';
import { policyMetadataSchema } from '@/schemas/policy.schema';
import { z } from 'zod';

interface PolicyMetadataFormProps {
  name: string;
  description: string;
  standardsLens: StandardsLens;
  onNameChange: (name: string) => void;
  onDescriptionChange: (description: string) => void;
  onStandardsLensChange: (lens: StandardsLens) => void;
}

/**
 * PolicyMetadataForm - Handles policy name, description, and standards lens selection
 * Features: Zod validation, dark mode support, responsive design
 */
export function PolicyMetadataForm({
  name,
  description,
  standardsLens,
  onNameChange,
  onDescriptionChange,
  onStandardsLensChange,
}: PolicyMetadataFormProps) {
  const [errors, setErrors] = useState<{ name?: string; description?: string; standardsLens?: string }>({});

  const validateField = (field: 'name' | 'description' | 'standardsLens', value: string) => {
    try {
      policyMetadataSchema.shape[field].parse(value);
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    } catch (err) {
      if (err instanceof z.ZodError) {
        setErrors((prev) => ({ ...prev, [field]: err.issues[0]?.message }));
      }
    }
  };

  const handleNameChange = (value: string) => {
    onNameChange(value);
    if (value) validateField('name', value);
  };

  const handleDescriptionChange = (value: string) => {
    onDescriptionChange(value);
    if (value) validateField('description', value);
  };

  return (
    <div className="space-y-6">
      {/* Policy Name */}
      <div>
        <label htmlFor="policy-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Policy Name
        </label>
        <input
          id="policy-name"
          type="text"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          onBlur={(e) => validateField('name', e.target.value)}
          className={`w-full px-3 py-2 border rounded-md transition-colors
            bg-white dark:bg-gray-800 
            text-gray-900 dark:text-gray-100
            placeholder-gray-400 dark:placeholder-gray-500
            ${
              errors.name
                ? 'border-red-300 dark:border-red-700 focus:ring-red-500 focus:border-red-500'
                : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500'
            }
            focus:ring-2 focus:ring-opacity-50`}
          placeholder="e.g., Coalition Access Control"
          aria-describedby={errors.name ? 'name-error' : undefined}
          aria-invalid={!!errors.name}
        />
        {errors.name && (
          <p id="name-error" className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">
            {errors.name}
          </p>
        )}
      </div>

      {/* Description */}
      <div>
        <label htmlFor="policy-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Description
        </label>
        <textarea
          id="policy-description"
          rows={3}
          value={description}
          onChange={(e) => handleDescriptionChange(e.target.value)}
          onBlur={(e) => validateField('description', e.target.value)}
          className={`w-full px-3 py-2 border rounded-md transition-colors
            bg-white dark:bg-gray-800 
            text-gray-900 dark:text-gray-100
            placeholder-gray-400 dark:placeholder-gray-500
            ${
              errors.description
                ? 'border-red-300 dark:border-red-700 focus:ring-red-500 focus:border-red-500'
                : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500'
            }
            focus:ring-2 focus:ring-opacity-50`}
          placeholder="Describe what this policy enforces..."
          aria-describedby={errors.description ? 'description-error' : undefined}
          aria-invalid={!!errors.description}
        />
        {errors.description && (
          <p id="description-error" className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">
            {errors.description}
          </p>
        )}
      </div>

      {/* Standards Lens */}
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Standards Lens</p>
        <div className="grid grid-cols-3 gap-2">
          {(['5663', 'unified', '240'] as StandardsLens[]).map((lens) => (
            <button
              key={lens}
              type="button"
              onClick={() => onStandardsLensChange(lens)}
              className={`px-3 py-2 rounded-md border text-sm font-medium transition-all duration-200 ${
                standardsLens === lens
                  ? 'border-blue-500 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 shadow-sm'
                  : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 bg-white dark:bg-gray-800'
              }`}
              aria-pressed={standardsLens === lens}
            >
              {lens === '5663' ? 'Federation' : lens === '240' ? 'Object' : 'Unified'}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {standardsLens === '5663' && 'STANAG 5663 - Federation-level access control'}
          {standardsLens === '240' && 'ACP-240 - Object-level access control'}
          {standardsLens === 'unified' && 'Unified approach combining both standards'}
        </p>
      </div>
    </div>
  );
}
