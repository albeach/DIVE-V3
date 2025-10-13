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
        <nav aria-label="Progress">
            <ol role="list" className="flex items-center">
                {steps.map((step, stepIdx) => (
                    <li
                        key={step.number}
                        className={`relative ${
                            stepIdx !== steps.length - 1 ? 'pr-8 sm:pr-20' : ''
                        } flex-1`}
                    >
                        {/* Completed Step */}
                        {step.number < currentStep ? (
                            <>
                                {/* Connector Line */}
                                {stepIdx !== steps.length - 1 && (
                                    <div
                                        className="absolute inset-0 flex items-center"
                                        aria-hidden="true"
                                    >
                                        <div className="h-0.5 w-full bg-blue-600" />
                                    </div>
                                )}
                                <div className="relative flex items-start group">
                                    <span className="flex items-center">
                                        <span className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-blue-600">
                                            <svg
                                                className="h-5 w-5 text-white"
                                                viewBox="0 0 20 20"
                                                fill="currentColor"
                                            >
                                                <path
                                                    fillRule="evenodd"
                                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                                    clipRule="evenodd"
                                                />
                                            </svg>
                                        </span>
                                    </span>
                                    <span className="ml-3 text-sm font-medium text-gray-900">
                                        {step.title}
                                    </span>
                                </div>
                            </>
                        ) : step.number === currentStep ? (
                            /* Current Step */
                            <>
                                {stepIdx !== steps.length - 1 && (
                                    <div
                                        className="absolute inset-0 flex items-center"
                                        aria-hidden="true"
                                    >
                                        <div className="h-0.5 w-full bg-gray-200" />
                                    </div>
                                )}
                                <div className="relative flex items-start group">
                                    <span className="flex items-center" aria-current="step">
                                        <span className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-blue-600 bg-white">
                                            <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                                        </span>
                                    </span>
                                    <span className="ml-3">
                                        <span className="text-sm font-medium text-blue-600">
                                            {step.title}
                                        </span>
                                        <span className="block text-xs text-gray-500">
                                            {step.description}
                                        </span>
                                    </span>
                                </div>
                            </>
                        ) : (
                            /* Upcoming Step */
                            <>
                                {stepIdx !== steps.length - 1 && (
                                    <div
                                        className="absolute inset-0 flex items-center"
                                        aria-hidden="true"
                                    >
                                        <div className="h-0.5 w-full bg-gray-200" />
                                    </div>
                                )}
                                <div className="relative flex items-start group">
                                    <span className="flex items-center">
                                        <span className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-gray-300 bg-white">
                                            <span className="h-2.5 w-2.5 rounded-full bg-transparent group-hover:bg-gray-300" />
                                        </span>
                                    </span>
                                    <span className="ml-3 text-sm font-medium text-gray-500">
                                        {step.title}
                                    </span>
                                </div>
                            </>
                        )}
                    </li>
                ))}
            </ol>
        </nav>
    );
}

