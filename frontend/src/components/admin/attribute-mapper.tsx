/**
 * Attribute Mapper Component
 * 
 * Step 4 of IdP wizard - Map IdP sources to DIVE attributes
 */

'use client';

import React from 'react';
import { IAttributeMapping } from '@/types/admin.types';

interface IAttributeMappings {
    uniqueID: IAttributeMapping;
    clearance: IAttributeMapping;
    countryOfAffiliation: IAttributeMapping;
    acpCOI: IAttributeMapping;
}

interface IAttributeMapperProps {
    mappings: IAttributeMappings;
    onChange: (mappings: IAttributeMappings) => void;
    protocol: 'oidc' | 'saml';
    errors?: Record<string, string>;
}

export default function AttributeMapper({ mappings, onChange, protocol, errors = {} }: IAttributeMapperProps) {
    const handleMappingChange = (
        attribute: keyof IAttributeMappings,
        field: 'source' | 'userAttribute',
        value: string
    ) => {
        onChange({
            ...mappings,
            [attribute]: {
                ...mappings[attribute],
                [field]: value
            }
        });
    };

    const sourceLabel = protocol === 'oidc' ? 'Claim Name' : 'SAML Attribute Name';

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium text-gray-900">DIVE Attribute Mapping</h3>
                <p className="mt-1 text-sm text-gray-500">
                    Map {protocol.toUpperCase()} {protocol === 'oidc' ? 'sources' : 'attributes'} to DIVE user attributes.
                    These mappings ensure user identity attributes are correctly synchronized.
                </p>
            </div>

            {/* Mapping Table */}
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
                <table className="min-w-full divide-y divide-gray-300">
                    <thead className="bg-gray-50">
                        <tr>
                            <th
                                scope="col"
                                className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6"
                            >
                                DIVE Attribute
                            </th>
                            <th
                                scope="col"
                                className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                            >
                                {sourceLabel}
                            </th>
                            <th
                                scope="col"
                                className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                            >
                                Description
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                        {/* uniqueID */}
                        <tr>
                            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                                uniqueID
                                <span className="ml-1 text-red-500">*</span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                <input
                                    type="text"
                                    value={mappings.uniqueID.source}
                                    onChange={(e) =>
                                        handleMappingChange('uniqueID', 'source', e.target.value)
                                    }
                                    placeholder={protocol === 'oidc' ? 'sub' : 'uniqueID'}
                                    className={`block w-full rounded-md shadow-sm sm:text-sm ${
                                        errors['uniqueID.source']
                                            ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                                            : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                                    }`}
                                />
                            </td>
                            <td className="px-3 py-4 text-sm text-gray-500">
                                Unique user identifier (required)
                            </td>
                        </tr>

                        {/* clearance */}
                        <tr>
                            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                                clearance
                                <span className="ml-1 text-red-500">*</span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                <input
                                    type="text"
                                    value={mappings.clearance.source}
                                    onChange={(e) =>
                                        handleMappingChange('clearance', 'source', e.target.value)
                                    }
                                    placeholder="clearance"
                                    className={`block w-full rounded-md shadow-sm sm:text-sm ${
                                        errors['clearance.source']
                                            ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                                            : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                                    }`}
                                />
                            </td>
                            <td className="px-3 py-4 text-sm text-gray-500">
                                Security clearance level (UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET)
                            </td>
                        </tr>

                        {/* countryOfAffiliation */}
                        <tr>
                            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                                countryOfAffiliation
                                <span className="ml-1 text-red-500">*</span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                <input
                                    type="text"
                                    value={mappings.countryOfAffiliation.source}
                                    onChange={(e) =>
                                        handleMappingChange(
                                            'countryOfAffiliation',
                                            'source',
                                            e.target.value
                                        )
                                    }
                                    placeholder={protocol === 'oidc' ? 'country' : 'countryOfAffiliation'}
                                    className={`block w-full rounded-md shadow-sm sm:text-sm ${
                                        errors['countryOfAffiliation.source']
                                            ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                                            : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                                    }`}
                                />
                            </td>
                            <td className="px-3 py-4 text-sm text-gray-500">
                                ISO 3166-1 alpha-3 country code (USA, FRA, CAN, GBR, DEU)
                            </td>
                        </tr>

                        {/* acpCOI */}
                        <tr>
                            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                                acpCOI
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                <input
                                    type="text"
                                    value={mappings.acpCOI.source}
                                    onChange={(e) =>
                                        handleMappingChange('acpCOI', 'source', e.target.value)
                                    }
                                    placeholder={protocol === 'oidc' ? 'groups' : 'acpCOI'}
                                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                />
                            </td>
                            <td className="px-3 py-4 text-sm text-gray-500">
                                Community of Interest tags (NATO-COSMIC, FVEY, CAN-US)
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Default Mappings Info */}
            <div className="rounded-md bg-blue-50 p-4">
                <div className="flex">
                    <div className="flex-shrink-0">
                        <svg
                            className="h-5 w-5 text-blue-400"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                        >
                            <path
                                fillRule="evenodd"
                                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                                clipRule="evenodd"
                            />
                        </svg>
                    </div>
                    <div className="ml-3 flex-1">
                        <h3 className="text-sm font-medium text-blue-800">Default Mappings</h3>
                        <div className="mt-2 text-sm text-blue-700 space-y-1">
                            <p><strong>OIDC:</strong> sub → uniqueID, clearance → clearance, country → countryOfAffiliation, groups → acpCOI</p>
                            <p><strong>SAML:</strong> uniqueID → uniqueID, clearance → clearance, countryOfAffiliation → countryOfAffiliation, acpCOI → acpCOI</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ACP-240 Compliance Note */}
            <div className="rounded-md bg-yellow-50 p-4">
                <div className="flex">
                    <div className="flex-shrink-0">
                        <svg
                            className="h-5 w-5 text-yellow-400"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                        >
                            <path
                                fillRule="evenodd"
                                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                clipRule="evenodd"
                            />
                        </svg>
                    </div>
                    <div className="ml-3 flex-1">
                        <h3 className="text-sm font-medium text-yellow-800">ACP-240 Compliance</h3>
                        <div className="mt-2 text-sm text-yellow-700">
                            <p>
                                All DIVE attributes are required for NATO ACP-240 compliant authorization.
                                Missing attributes may result in access denial.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

