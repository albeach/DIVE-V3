/**
 * Wizard Step Indicator Component
 * 
 * Displays progress through multi-step IdP wizard
 */

'use client';

import React from 'react';

interface IWizardStep {
    number: number;
    title: string;
    description: string;
}

interface IWizardStepsProps {
    currentStep: number;
    steps: IWizardStep[];
}

export default function WizardSteps({ currentStep, steps }: IWizardStepsProps) {
    return (
        <nav aria-label="Progress" className="px-4">
            <ol role="list" className="flex items-center justify-between">
                {steps.map((step, stepIdx) => (
                    <li
                        key={step.number}
                        className="relative flex items-center"
                    >
                        {/* Completed Step */}
                        {step.number < currentStep ? (
                            <div className="flex flex-col items-center">
                                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600">
                                    <svg className="h-6 w-6 text-white" viewBox="0 0 20 20" fill="currentColor">
                                        <path
                                            fillRule="evenodd"
                                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                            clipRule="evenodd"
                                        />
                                    </svg>
                                </span>
                                <span className="mt-2 text-xs font-medium text-gray-900 text-center">{step.title}</span>
                            </div>
                        ) : step.number === currentStep ? (
                            /* Current Step */
                            <div className="flex flex-col items-center">
                                <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-blue-600 bg-white" aria-current="step">
                                    <span className="h-3 w-3 rounded-full bg-blue-600" />
                                </span>
                                <span className="mt-2 text-xs font-medium text-blue-600 text-center">{step.title}</span>
                                <span className="text-xs text-gray-500 text-center">{step.description}</span>
                            </div>
                        ) : (
                            /* Upcoming Step */
                            <div className="flex flex-col items-center">
                                <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-gray-300 bg-white group-hover:border-gray-400">
                                    <span className="h-3 w-3 rounded-full bg-transparent" />
                                </span>
                                <span className="mt-2 text-xs font-medium text-gray-500 text-center">{step.title}</span>
                            </div>
                        )}
                    </li>
                ))}
            </ol>
        </nav>
    );
}
