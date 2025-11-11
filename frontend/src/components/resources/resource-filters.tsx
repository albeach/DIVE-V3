/**
 * Modern Resource Filters Component (2025)
 * 
 * Features:
 * - Compact collapsible sections (Disclosure)
 * - Count badges on filter categories
 * - Space-efficient design
 * - Visual active filter chips
 * - Quick filters for common scenarios
 */

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Disclosure } from '@headlessui/react';

export interface ResourceFiltersState {
    search: string;
    classifications: string[];
    countries: string[];
    cois: string[];
    encryptionStatus: 'all' | 'encrypted' | 'unencrypted';
    sortBy: 'title' | 'classification' | 'createdAt';
    sortOrder: 'asc' | 'desc';
}

interface ResourceFiltersProps {
    userAttributes?: {
        clearance?: string;
        country?: string;
        coi?: string[];
    };
    onFilterChange: (filters: ResourceFiltersState) => void;
    totalCount: number;
    filteredCount: number;
}

const ALL_CLASSIFICATIONS = [
    { value: 'UNCLASSIFIED', label: 'UNCLASSIFIED', color: 'bg-green-50 text-green-900 border-green-300', icon: '🟢' },
    { value: 'RESTRICTED', label: 'RESTRICTED', color: 'bg-blue-50 text-blue-900 border-blue-300', icon: '🔵' },
    { value: 'CONFIDENTIAL', label: 'CONFIDENTIAL', color: 'bg-yellow-50 text-yellow-900 border-yellow-300', icon: '🟡' },
    { value: 'SECRET', label: 'SECRET', color: 'bg-orange-50 text-orange-900 border-orange-300', icon: '🟠' },
    { value: 'TOP_SECRET', label: 'TOP SECRET', color: 'bg-red-50 text-red-900 border-red-300', icon: '🔴' }
];

const COUNTRIES = [
    { code: 'USA', name: 'United States', flag: '🇺🇸' },
    { code: 'GBR', name: 'United Kingdom', flag: '🇬🇧' },
    { code: 'FRA', name: 'France', flag: '🇫🇷' },
    { code: 'CAN', name: 'Canada', flag: '🇨🇦' },
    { code: 'DEU', name: 'Germany', flag: '🇩🇪' },
    { code: 'ESP', name: 'Spain', flag: '🇪🇸' },
    { code: 'ITA', name: 'Italy', flag: '🇮🇹' },
    { code: 'POL', name: 'Poland', flag: '🇵🇱' },
    { code: 'AUS', name: 'Australia', flag: '🇦🇺' },
    { code: 'NZL', name: 'New Zealand', flag: '🇳🇿' }
];

// COI list will be dynamically fetched from API
interface COI {
    value: string;
    label: string;
    icon: string;
    color: string;
}

// CRITICAL: RESTRICTED is now a separate level above UNCLASSIFIED
// - UNCLASSIFIED users can ONLY see UNCLASSIFIED
// - RESTRICTED users can see UNCLASSIFIED and RESTRICTED
const CLEARANCE_HIERARCHY: Record<string, string[]> = {
    'UNCLASSIFIED': ['UNCLASSIFIED'],
    'RESTRICTED': ['UNCLASSIFIED', 'RESTRICTED'],
    'CONFIDENTIAL': ['UNCLASSIFIED', 'RESTRICTED', 'CONFIDENTIAL'],
    'SECRET': ['UNCLASSIFIED', 'RESTRICTED', 'CONFIDENTIAL', 'SECRET'],
    'TOP_SECRET': ['UNCLASSIFIED', 'RESTRICTED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'],
};

const CLASSIFICATION_VALUES = ALL_CLASSIFICATIONS.map(c => c.value);
const COUNTRY_CODES = COUNTRIES.map(c => c.code);
// COI_VALUES will be computed dynamically from fetched COIs

export default function ResourceFilters({ 
    userAttributes, 
    onFilterChange, 
    totalCount, 
    filteredCount 
}: ResourceFiltersProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    
    // Fetch COI options from API
    const [cois, setCois] = useState<COI[]>([]);
    const [coiLoading, setCoiLoading] = useState(true);
    
    useEffect(() => {
        const fetchCOIs = async () => {
            try {
                const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';
                const response = await fetch(`${backendUrl}/api/coi-keys?status=active`);
                const data = await response.json();
                
                // Transform API response to filter format
                const coiFilters: COI[] = data.cois.map((coi: any) => {
                    // Map colors to Tailwind-friendly values
                    const colorMap: Record<string, string> = {
                        '#8B5CF6': 'purple',
                        '#3B82F6': 'blue',
                        '#1E40AF': 'indigo',
                        '#DC2626': 'red',
                        '#6366F1': 'indigo',
                        '#10B981': 'green',
                        '#F59E0B': 'amber',
                        '#EF4444': 'red'
                    };
                    
                    return {
                        value: coi.coiId,
                        label: coi.name,
                        icon: coi.icon,
                        color: colorMap[coi.color] || 'gray'
                    };
                });
                
                setCois(coiFilters);
            } catch (error) {
                console.error('Failed to fetch COI options:', error);
                // Fallback to empty array
                setCois([]);
            } finally {
                setCoiLoading(false);
            }
        };
        
        fetchCOIs();
    }, []);
    
    const COI_VALUES = useMemo(() => cois.map(c => c.value), [cois]);
    
    const [filters, setFilters] = useState<ResourceFiltersState>(() => ({
        search: searchParams.get('search') || '',
        classifications: searchParams.get('classification')?.split(',').filter(Boolean) || [],
        countries: searchParams.get('country')?.split(',').filter(Boolean) || [],
        cois: searchParams.get('coi')?.split(',').filter(Boolean) || [],
        encryptionStatus: (searchParams.get('encrypted') as any) || 'all',
        sortBy: (searchParams.get('sortBy') as any) || 'title',
        sortOrder: (searchParams.get('sortOrder') as any) || 'asc',
    }));

    useEffect(() => {
        const params = new URLSearchParams();
        
        if (filters.search) params.set('search', filters.search);
        if (filters.classifications.length > 0) params.set('classification', filters.classifications.join(','));
        if (filters.countries.length > 0) params.set('country', filters.countries.join(','));
        if (filters.cois.length > 0) params.set('coi', filters.cois.join(','));
        if (filters.encryptionStatus !== 'all') params.set('encrypted', filters.encryptionStatus);
        if (filters.sortBy !== 'title') params.set('sortBy', filters.sortBy);
        if (filters.sortOrder !== 'asc') params.set('sortOrder', filters.sortOrder);

        const currentParams = new URLSearchParams(window.location.search);
        const newParamsString = params.toString();
        const currentParamsString = currentParams.toString();
        
        if (newParamsString !== currentParamsString) {
            const newUrl = newParamsString ? `?${newParamsString}` : '/resources';
            router.replace(newUrl, { scroll: false });
        }

        onFilterChange(filters);
    }, [filters, onFilterChange, router]);

    const updateFilter = (key: keyof ResourceFiltersState, value: any) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const toggleArrayFilter = (key: 'classifications' | 'countries' | 'cois', value: string) => {
        setFilters(prev => ({
            ...prev,
            [key]: prev[key].includes(value)
                ? prev[key].filter(v => v !== value)
                : [...prev[key], value]
        }));
    };

    const clearAllFilters = () => {
        setFilters({
            search: '',
            classifications: [],
            countries: [],
            cois: [],
            encryptionStatus: 'all',
            sortBy: 'title',
            sortOrder: 'asc',
        });
    };

    const applyMyCountryFilter = () => {
        if (userAttributes?.country) {
            setFilters(prev => ({ ...prev, countries: [userAttributes.country!] }));
        }
    };

    const applyMyClearanceFilter = () => {
        if (userAttributes?.clearance) {
            const allowedClassifications = CLEARANCE_HIERARCHY[userAttributes.clearance] || [];
            setFilters(prev => ({ ...prev, classifications: allowedClassifications }));
        }
    };

    const applyFVEYFilter = () => {
        setFilters(prev => ({ ...prev, cois: ['FVEY'] }));
    };

    const applyEncryptedOnlyFilter = () => {
        setFilters(prev => ({ ...prev, encryptionStatus: 'encrypted' }));
    };

    const activeFilterCount = 
        (filters.search ? 1 : 0) +
        filters.classifications.length +
        filters.countries.length +
        filters.cois.length +
        (filters.encryptionStatus !== 'all' ? 1 : 0);

    // Active filter chips (for display at top)
    const activeFilters = useMemo(() => {
        const chips: Array<{ label: string; onRemove: () => void }> = [];
        
        if (filters.search) {
            chips.push({
                label: `Search: "${filters.search}"`,
                onRemove: () => updateFilter('search', '')
            });
        }
        
        filters.classifications.forEach(c => {
            chips.push({
                label: c,
                onRemove: () => toggleArrayFilter('classifications', c)
            });
        });
        
        filters.countries.forEach(c => {
            chips.push({
                label: c,
                onRemove: () => toggleArrayFilter('countries', c)
            });
        });
        
        filters.cois.forEach(c => {
            chips.push({
                label: c,
                onRemove: () => toggleArrayFilter('cois', c)
            });
        });
        
        if (filters.encryptionStatus !== 'all') {
            chips.push({
                label: filters.encryptionStatus === 'encrypted' ? '🔐 Encrypted' : '📝 Unencrypted',
                onRemove: () => updateFilter('encryptionStatus', 'all')
            });
        }
        
        return chips;
    }, [filters]);

    return (
        <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden">
            {/* Search Bar */}
            <div className="p-4 border-b border-gray-200">
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <input
                        type="text"
                        value={filters.search}
                        onChange={(e) => updateFilter('search', e.target.value)}
                        placeholder="Search..."
                        className="block w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                </div>
            </div>

            {/* Results Summary & Clear */}
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-gray-900">
                        {filteredCount} <span className="font-normal text-gray-600">of {totalCount}</span>
                    </span>
                    {activeFilterCount > 0 && (
                        <button
                            onClick={clearAllFilters}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>

            {/* Quick Filters */}
            <div className="px-4 py-3 border-b border-gray-200">
                <div className="flex flex-wrap gap-1.5">
                    <button
                        onClick={clearAllFilters}
                        className="px-2 py-1 text-xs rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium"
                    >
                        All
                    </button>
                    {userAttributes?.country && (
                        <button
                            onClick={applyMyCountryFilter}
                            className="px-2 py-1 text-xs rounded-md bg-blue-100 text-blue-700 hover:bg-blue-200 font-medium"
                        >
                            {userAttributes.country}
                        </button>
                    )}
                    {userAttributes?.clearance && (
                        <button
                            onClick={applyMyClearanceFilter}
                            className="px-2 py-1 text-xs rounded-md bg-green-100 text-green-700 hover:bg-green-200 font-medium"
                        >
                            {userAttributes.clearance}
                        </button>
                    )}
                    <button
                        onClick={applyFVEYFilter}
                        className="px-2 py-1 text-xs rounded-md bg-purple-100 text-purple-700 hover:bg-purple-200 font-medium"
                    >
                        FVEY
                    </button>
                    <button
                        onClick={applyEncryptedOnlyFilter}
                        className="px-2 py-1 text-xs rounded-md bg-indigo-100 text-indigo-700 hover:bg-indigo-200 font-medium"
                    >
                        🔐
                    </button>
                </div>
            </div>

            {/* Collapsible Filter Sections */}
            <div className="divide-y divide-gray-200">
                {/* Classification Filter */}
                <Disclosure defaultOpen>
                    {({ open }) => (
                        <>
                            <Disclosure.Button className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                                    Classification
                                    {filters.classifications.length > 0 && (
                                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                                            {filters.classifications.length}
                                        </span>
                                    )}
                                </span>
                                <svg
                                    className={`${open ? 'rotate-180' : ''} h-4 w-4 text-gray-500 transition-transform`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </Disclosure.Button>
                            <Disclosure.Panel className="px-4 pb-3 space-y-1.5">
                                {ALL_CLASSIFICATIONS
                                    .filter(classItem => {
                                        // Only show classifications at or below user's clearance
                                        const userClearance = userAttributes?.clearance || 'UNCLASSIFIED';
                                        const accessibleLevels = CLEARANCE_HIERARCHY[userClearance] || ['UNCLASSIFIED'];
                                        return accessibleLevels.includes(classItem.value);
                                    })
                                    .map(classItem => {
                                    const isSelected = filters.classifications.includes(classItem.value);
                                    return (
                                        <button
                                            key={classItem.value}
                                            type="button"
                                            onClick={() => toggleArrayFilter('classifications', classItem.value)}
                                            className={`relative w-full px-3 py-2 rounded-lg border-2 text-left transition-all transform hover:scale-102 ${
                                                isSelected
                                                    ? `${classItem.color} border-current shadow-sm`
                                                    : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                                            }`}
                                        >
                                            {isSelected && (
                                                <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                                                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                    </svg>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-2">
                                                <span className="text-lg">{classItem.icon}</span>
                                                <span className="text-xs font-bold">{classItem.label}</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </Disclosure.Panel>
                        </>
                    )}
                </Disclosure>

                {/* Country Filter */}
                <Disclosure>
                    {({ open }) => (
                        <>
                            <Disclosure.Button className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                                    Countries
                                    {filters.countries.length > 0 && (
                                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                                            {filters.countries.length}
                                        </span>
                                    )}
                                </span>
                                <svg
                                    className={`${open ? 'rotate-180' : ''} h-4 w-4 text-gray-500 transition-transform`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </Disclosure.Button>
                            <Disclosure.Panel className="px-4 pb-3">
                                <div className="grid grid-cols-2 gap-1.5">
                                    {COUNTRIES.map(country => {
                                        const isSelected = filters.countries.includes(country.code);
                                        const isUserCountry = country.code === userAttributes?.country;
                                        
                                        return (
                                            <button
                                                key={country.code}
                                                type="button"
                                                onClick={() => toggleArrayFilter('countries', country.code)}
                                                className={`relative px-2 py-2 rounded-lg border-2 text-left transition-all transform hover:scale-105 ${
                                                    isSelected
                                                        ? 'bg-blue-50 text-blue-900 border-blue-400 shadow-sm'
                                                        : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                                                }`}
                                            >
                                                {isSelected && (
                                                    <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center">
                                                        <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                        </svg>
                                                    </div>
                                                )}
                                                {isUserCountry && (
                                                    <div className="absolute -top-1 -left-1 px-1 py-0.5 rounded-full bg-green-500 text-white text-xs font-bold leading-none">
                                                        You
                                                    </div>
                                                )}
                                                <div className="text-center">
                                                    <div className="text-xl mb-0.5">{country.flag}</div>
                                                    <div className="text-xs font-bold">{country.code}</div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </Disclosure.Panel>
                        </>
                    )}
                </Disclosure>

                {/* COI Filter */}
                <Disclosure>
                    {({ open }) => (
                        <>
                            <Disclosure.Button className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                                    Communities
                                    {filters.cois.length > 0 && (
                                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
                                            {filters.cois.length}
                                        </span>
                                    )}
                                </span>
                                <svg
                                    className={`${open ? 'rotate-180' : ''} h-4 w-4 text-gray-500 transition-transform`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </Disclosure.Button>
                            <Disclosure.Panel className="px-4 pb-3 space-y-1.5">
                                {coiLoading ? (
                                    <div className="text-center text-sm text-gray-500 py-2">Loading COIs...</div>
                                ) : cois.length === 0 ? (
                                    <div className="text-center text-sm text-gray-500 py-2">No COIs available</div>
                                ) : (
                                    cois.map(coiItem => {
                                        const isSelected = filters.cois.includes(coiItem.value);
                                        const colorClasses = {
                                            purple: 'bg-purple-50 text-purple-900 border-purple-400',
                                            blue: 'bg-blue-50 text-blue-900 border-blue-400',
                                            red: 'bg-red-50 text-red-900 border-red-400',
                                            indigo: 'bg-indigo-50 text-indigo-900 border-indigo-400',
                                            green: 'bg-green-50 text-green-900 border-green-400',
                                            amber: 'bg-amber-50 text-amber-900 border-amber-400',
                                            gray: 'bg-gray-50 text-gray-900 border-gray-400'
                                        };
                                        
                                        return (
                                            <button
                                                key={coiItem.value}
                                                type="button"
                                                onClick={() => toggleArrayFilter('cois', coiItem.value)}
                                                className={`relative w-full px-3 py-2 rounded-lg border-2 text-left transition-all transform hover:scale-102 ${
                                                isSelected
                                                    ? colorClasses[coiItem.color as keyof typeof colorClasses]
                                                    : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                                            }`}
                                        >
                                            {isSelected && (
                                                <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-purple-600 flex items-center justify-center">
                                                    <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                    </svg>
                                                </div>
                                            )}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-base">{coiItem.icon}</span>
                                                    <span className="text-xs font-bold">{coiItem.label}</span>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })
                                )}
                            </Disclosure.Panel>
                        </>
                    )}
                </Disclosure>

                {/* Encryption Filter */}
                <Disclosure>
                    {({ open }) => (
                        <>
                            <Disclosure.Button className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                                    Encryption
                                    {filters.encryptionStatus !== 'all' && (
                                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
                                            1
                                        </span>
                                    )}
                                </span>
                                <svg
                                    className={`${open ? 'rotate-180' : ''} h-4 w-4 text-gray-500 transition-transform`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </Disclosure.Button>
                            <Disclosure.Panel className="px-4 pb-3 space-y-1">
                                {[
                                    { value: 'all', label: 'All', icon: '📄' },
                                    { value: 'encrypted', label: 'ZTDF Encrypted', icon: '🔐' },
                                    { value: 'unencrypted', label: 'Unencrypted', icon: '📝' }
                                ].map(option => (
                                    <label 
                                        key={option.value}
                                        className={`flex items-center px-2 py-1.5 rounded cursor-pointer transition-colors ${
                                            filters.encryptionStatus === option.value
                                                ? 'bg-indigo-50'
                                                : 'hover:bg-gray-50'
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="encryptionStatus"
                                            value={option.value}
                                            checked={filters.encryptionStatus === option.value}
                                            onChange={(e) => updateFilter('encryptionStatus', e.target.value)}
                                            className="h-3.5 w-3.5 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                                        />
                                        <span className="ml-2 text-xs text-gray-900">
                                            <span className="mr-1">{option.icon}</span>
                                            {option.label}
                                        </span>
                                    </label>
                                ))}
                            </Disclosure.Panel>
                        </>
                    )}
                </Disclosure>
            </div>

            {/* Active Filter Chips (if any) */}
            {activeFilters.length > 0 && (
                <div className="px-4 py-3 bg-blue-50 border-t border-blue-200">
                    <div className="flex flex-wrap gap-1.5">
                        {activeFilters.map((chip, idx) => (
                            <span
                                key={idx}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-blue-600 text-white"
                            >
                                {chip.label}
                                <button
                                    onClick={chip.onRemove}
                                    className="hover:bg-blue-700 rounded-full p-0.5"
                                >
                                    <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
