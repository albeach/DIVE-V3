/**
 * Modern Security Label Form - 2026 UI/UX
 *
 * Enhanced classification form with:
 * - Visual gradient classification cards with spring animations
 * - Country selector with search, keyboard navigation, and staggered animations
 * - COI selector with smart auto-sync and visual connection animations
 * - Caveat selector with severity indicators
 * - Real-time validation with inline suggestions
 * - Full accessibility support (WCAG 2.2 AAA)
 */

'use client';

import { useState, useEffect, useMemo, useCallback, useRef, KeyboardEvent } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import Fuse from 'fuse.js';
import { cn } from '@/lib/utils';
import {
  Shield,
  Lock,
  Unlock,
  Search,
  Check,
  AlertTriangle,
  Info,
  Globe,
  Users,
  ChevronDown,
  X,
} from 'lucide-react';

interface SecurityLabelFormProps {
  userClearance: string;
  userCountry: string;
  userCOI?: string[];
  classification: string;
  releasabilityTo: string[];
  COI: string[];
  caveats: string[];
  onClassificationChange: (value: string) => void;
  onReleasabilityChange: (value: string[]) => void;
  onCOIChange: (value: string[]) => void;
  onCaveatsChange: (value: string[]) => void;
  disabled?: boolean;
}

// Classification levels
const CLASSIFICATION_LEVELS = ['UNCLASSIFIED', 'RESTRICTED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];

const CLASSIFICATION_HIERARCHY: Record<string, number> = {
  UNCLASSIFIED: 0,
  RESTRICTED: 1,
  CONFIDENTIAL: 2,
  SECRET: 3,
  TOP_SECRET: 4,
};

// Classification visual config
const CLASSIFICATION_CONFIG: Record<
  string,
  {
    gradient: string;
    bgHover: string;
    textColor: string;
    borderColor: string;
    ringColor: string;
    icon: string;
  }
> = {
  UNCLASSIFIED: {
    gradient: 'from-green-400 to-green-600',
    bgHover: 'hover:bg-green-50 dark:hover:bg-green-900/20',
    textColor: 'text-green-700 dark:text-green-300',
    borderColor: 'border-green-300 dark:border-green-700',
    ringColor: 'ring-green-200 dark:ring-green-800',
    icon: '🟢',
  },
  RESTRICTED: {
    gradient: 'from-blue-400 to-blue-600',
    bgHover: 'hover:bg-blue-50 dark:hover:bg-blue-900/20',
    textColor: 'text-blue-700 dark:text-blue-300',
    borderColor: 'border-blue-300 dark:border-blue-700',
    ringColor: 'ring-blue-200 dark:ring-blue-800',
    icon: '🔵',
  },
  CONFIDENTIAL: {
    gradient: 'from-yellow-400 to-yellow-600',
    bgHover: 'hover:bg-yellow-50 dark:hover:bg-yellow-900/20',
    textColor: 'text-yellow-700 dark:text-yellow-300',
    borderColor: 'border-yellow-300 dark:border-yellow-700',
    ringColor: 'ring-yellow-200 dark:ring-yellow-800',
    icon: '🟡',
  },
  SECRET: {
    gradient: 'from-orange-400 to-orange-600',
    bgHover: 'hover:bg-orange-50 dark:hover:bg-orange-900/20',
    textColor: 'text-orange-700 dark:text-orange-300',
    borderColor: 'border-orange-300 dark:border-orange-700',
    ringColor: 'ring-orange-200 dark:ring-orange-800',
    icon: '🟠',
  },
  TOP_SECRET: {
    gradient: 'from-red-500 to-red-700',
    bgHover: 'hover:bg-red-50 dark:hover:bg-red-900/20',
    textColor: 'text-red-700 dark:text-red-300',
    borderColor: 'border-red-300 dark:border-red-700',
    ringColor: 'ring-red-200 dark:ring-red-800',
    icon: '🔴',
  },
};

// National classification equivalents (ACP-240 Section 4.3)
const NATIONAL_CLASSIFICATIONS: Record<string, Record<string, string>> = {
  USA: {
    UNCLASSIFIED: 'UNCLASSIFIED',
    RESTRICTED: 'RESTRICTED',
    CONFIDENTIAL: 'CONFIDENTIAL',
    SECRET: 'SECRET',
    TOP_SECRET: 'TOP SECRET',
  },
  GBR: {
    UNCLASSIFIED: 'OFFICIAL',
    RESTRICTED: 'OFFICIAL-SENSITIVE',
    CONFIDENTIAL: 'CONFIDENTIAL',
    SECRET: 'SECRET',
    TOP_SECRET: 'TOP SECRET',
  },
  FRA: {
    UNCLASSIFIED: 'NON CLASSIFIÉ',
    RESTRICTED: 'DIFFUSION RESTREINTE',
    CONFIDENTIAL: 'CONFIDENTIEL DÉFENSE',
    SECRET: 'SECRET DÉFENSE',
    TOP_SECRET: 'TRÈS SECRET DÉFENSE',
  },
  CAN: {
    UNCLASSIFIED: 'UNCLASSIFIED',
    RESTRICTED: 'PROTECTED',
    CONFIDENTIAL: 'CONFIDENTIAL',
    SECRET: 'SECRET',
    TOP_SECRET: 'TOP SECRET',
  },
  DEU: {
    UNCLASSIFIED: 'OFFEN',
    RESTRICTED: 'VS-NUR FÜR DEN DIENSTGEBRAUCH',
    CONFIDENTIAL: 'VS-VERTRAULICH',
    SECRET: 'GEHEIM',
    TOP_SECRET: 'STRENG GEHEIM',
  },
  AUS: {
    UNCLASSIFIED: 'UNCLASSIFIED',
    RESTRICTED: 'PROTECTED',
    CONFIDENTIAL: 'CONFIDENTIAL',
    SECRET: 'SECRET',
    TOP_SECRET: 'TOP SECRET',
  },
  NZL: {
    UNCLASSIFIED: 'UNCLASSIFIED',
    RESTRICTED: 'IN-CONFIDENCE',
    CONFIDENTIAL: 'CONFIDENTIAL',
    SECRET: 'SECRET',
    TOP_SECRET: 'TOP SECRET',
  },
  ESP: {
    UNCLASSIFIED: 'NO CLASIFICADO',
    RESTRICTED: 'DIFUSIÓN LIMITADA',
    CONFIDENTIAL: 'CONFIDENCIAL',
    SECRET: 'SECRETO',
    TOP_SECRET: 'ALTO SECRETO',
  },
  ITA: {
    UNCLASSIFIED: 'NON CLASSIFICATO',
    RESTRICTED: 'RISERVATO',
    CONFIDENTIAL: 'CONFIDENZIALE',
    SECRET: 'SEGRETO',
    TOP_SECRET: 'SEGRETISSIMO',
  },
  POL: {
    UNCLASSIFIED: 'NIEJAWNE',
    RESTRICTED: 'ZASTRZEŻONE',
    CONFIDENTIAL: 'POUFNE',
    SECRET: 'TAJNE',
    TOP_SECRET: 'ŚCIŚLE TAJNE',
  },
};

// Country data with flags and full names
const COUNTRIES = [
  { code: 'USA', name: 'United States', flag: '🇺🇸', region: 'FVEY' },
  { code: 'GBR', name: 'United Kingdom', flag: '🇬🇧', region: 'FVEY' },
  { code: 'CAN', name: 'Canada', flag: '🇨🇦', region: 'FVEY' },
  { code: 'AUS', name: 'Australia', flag: '🇦🇺', region: 'FVEY' },
  { code: 'NZL', name: 'New Zealand', flag: '🇳🇿', region: 'FVEY' },
  { code: 'FRA', name: 'France', flag: '🇫🇷', region: 'NATO' },
  { code: 'DEU', name: 'Germany', flag: '🇩🇪', region: 'NATO' },
  { code: 'ESP', name: 'Spain', flag: '🇪🇸', region: 'NATO' },
  { code: 'ITA', name: 'Italy', flag: '🇮🇹', region: 'NATO' },
  { code: 'POL', name: 'Poland', flag: '🇵🇱', region: 'NATO' },
];

// COI Options
interface COIOption {
  value: string;
  label: string;
  description: string;
  requiredCountries: string[];
}

// Caveat options
const CAVEAT_OPTIONS = [
  {
    value: 'NOFORN',
    label: 'NOFORN',
    description: 'No Foreign Nationals',
    incompatibleWith: ['releasability'],
    severity: 'high' as const,
  },
  {
    value: 'ORCON',
    label: 'ORCON',
    description: 'Originator Controlled',
    severity: 'medium' as const,
  },
  {
    value: 'RELIDO',
    label: 'RELIDO',
    description: 'Releasable by Information Disclosure Official only',
    severity: 'medium' as const,
  },
  {
    value: 'PROPIN',
    label: 'PROPIN',
    description: 'Caution—Proprietary Information Involved',
    severity: 'low' as const,
  },
  {
    value: 'IMCON',
    label: 'IMCON',
    description: 'Imagery Controlled',
    severity: 'medium' as const,
  },
];

// Fuse.js search options for countries
const fuseOptions = {
  keys: ['code', 'name'],
  threshold: 0.3,
  includeScore: true,
};

// Animation variants
const cardVariants = {
  hidden: { opacity: 0, y: 10, scale: 0.95 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 25,
      delay: i * 0.05,
    },
  }),
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.15 } },
};

const pulseVariants = {
  pulse: {
    scale: [1, 1.05, 1],
    transition: { duration: 0.3, repeat: 2 },
  },
};

function getNationalClassificationLabel(natoLevel: string, country: string): string {
  return NATIONAL_CLASSIFICATIONS[country]?.[natoLevel] || natoLevel;
}

export default function SecurityLabelForm({
  userClearance,
  userCountry,
  userCOI = [],
  classification,
  releasabilityTo,
  COI,
  caveats,
  onClassificationChange,
  onReleasabilityChange,
  onCOIChange,
  onCaveatsChange,
  disabled = false,
}: SecurityLabelFormProps) {
  const shouldReduceMotion = useReducedMotion();

  // Country search state
  const [countrySearch, setCountrySearch] = useState('');
  const [focusedCountryIndex, setFocusedCountryIndex] = useState(-1);
  const countryGridRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // COI loading state
  const [allCOIOptions, setAllCOIOptions] = useState<COIOption[]>([]);
  const [coiLoading, setCoiLoading] = useState(true);

  // Recently auto-added countries (for animation)
  const [recentlyAdded, setRecentlyAdded] = useState<string[]>([]);

  // Fuse search instance
  const fuse = useMemo(() => new Fuse(COUNTRIES, fuseOptions), []);

  // Filtered countries based on search
  const filteredCountries = useMemo(() => {
    if (!countrySearch.trim()) return COUNTRIES;
    const results = fuse.search(countrySearch);
    return results.map((result) => result.item);
  }, [countrySearch, fuse]);

  // Fetch COI options from API
  useEffect(() => {
    const fetchCOIs = async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';
        const response = await fetch(`${backendUrl}/api/coi-keys?status=active`);
        const data = await response.json();

        const coiOptions: COIOption[] = data.cois.map((coi: any) => ({
          value: coi.coiId,
          label: coi.name,
          description: coi.description,
          requiredCountries: coi.memberCountries,
        }));

        setAllCOIOptions(coiOptions);
      } catch (error) {
        console.error('Failed to fetch COI options:', error);
        setAllCOIOptions([]);
      } finally {
        setCoiLoading(false);
      }
    };

    fetchCOIs();
  }, []);

  // Filter COI options to only show user's COIs
  const availableCOIs = useMemo(() => {
    if (coiLoading) return [];
    if (!userCOI || userCOI.length === 0) {
      return allCOIOptions;
    }
    return allCOIOptions.filter((option) => userCOI.includes(option.value));
  }, [userCOI, allCOIOptions, coiLoading]);

  // Quick select presets
  const selectFVEY = useCallback(() => {
    const fveyCOI = availableCOIs.find((c) => c.value === 'FVEY');
    if (fveyCOI) {
      onReleasabilityChange(fveyCOI.requiredCountries);
      onCOIChange(['FVEY']);
    } else {
      const fveyCountries = COUNTRIES.filter((c) => c.region === 'FVEY').map((c) => c.code);
      onReleasabilityChange(fveyCountries);
    }
  }, [availableCOIs, onReleasabilityChange, onCOIChange]);

  const selectNATO = useCallback(() => {
    const natoCountries = COUNTRIES.map((c) => c.code);
    onReleasabilityChange(natoCountries);
  }, [onReleasabilityChange]);

  const selectUserCountryOnly = useCallback(() => {
    onReleasabilityChange([userCountry]);
  }, [onReleasabilityChange, userCountry]);

  // Validation warnings
  const warnings = useMemo(() => {
    const warns: { message: string; severity: 'error' | 'warning' | 'info'; action?: () => void; actionLabel?: string }[] = [];

    // CRITICAL: User selecting COI they don't have
    if (COI.length > 0 && (!userCOI || userCOI.length === 0)) {
      warns.push({
        message: `You are not a member of any COI. Remove COI selection or contact your administrator.`,
        severity: 'error',
        action: () => onCOIChange([]),
        actionLabel: 'Remove COI',
      });
    } else if (COI.length > 0 && userCOI && userCOI.length > 0) {
      const invalidCOIs = COI.filter((coi) => !userCOI.includes(coi));
      if (invalidCOIs.length > 0) {
        warns.push({
          message: `You are not a member of ${invalidCOIs.join(', ')}.`,
          severity: 'error',
          action: () => onCOIChange(COI.filter((c) => !invalidCOIs.includes(c))),
          actionLabel: 'Remove invalid COIs',
        });
      }
    }

    // NOFORN incompatibility
    if (caveats.includes('NOFORN') && releasabilityTo.some((c) => c !== userCountry)) {
      warns.push({
        message: 'NOFORN caveat is incompatible with foreign country releasability',
        severity: 'warning',
        action: () => onCaveatsChange(caveats.filter((c) => c !== 'NOFORN')),
        actionLabel: 'Remove NOFORN',
      });
    }

    // User country not included
    if (!releasabilityTo.includes(userCountry) && releasabilityTo.length > 0) {
      warns.push({
        message: `Your country (${userCountry}) is not included - you won't be able to access this document`,
        severity: 'warning',
        action: () => onReleasabilityChange([...releasabilityTo, userCountry]),
        actionLabel: `Add ${userCountry}`,
      });
    }

    // Classification above user clearance
    if (CLASSIFICATION_HIERARCHY[classification] > CLASSIFICATION_HIERARCHY[userClearance]) {
      warns.push({
        message: `Classification ${classification} is above your clearance level (${userClearance})`,
        severity: 'error',
        action: () => onClassificationChange(userClearance),
        actionLabel: `Set to ${userClearance}`,
      });
    }

    // COI selected but countries don't match
    COI.forEach((coi) => {
      const coiOption = allCOIOptions.find((o) => o.value === coi);
      if (coiOption?.requiredCountries && coiOption.requiredCountries.length > 0) {
        const missingCountries = coiOption.requiredCountries.filter(
          (c) => !releasabilityTo.includes(c)
        );
        if (missingCountries.length > 0) {
          warns.push({
            message: `${coi} requires countries: ${missingCountries.join(', ')}`,
            severity: 'info',
            action: () => {
              const newCountries = [...new Set([...releasabilityTo, ...missingCountries])];
              onReleasabilityChange(newCountries);
            },
            actionLabel: 'Add missing countries',
          });
        }
      }
    });

    return warns;
  }, [
    caveats,
    releasabilityTo,
    userCountry,
    classification,
    userClearance,
    COI,
    userCOI,
    allCOIOptions,
    onCOIChange,
    onCaveatsChange,
    onReleasabilityChange,
    onClassificationChange,
  ]);

  const isClassificationAllowed = (level: string): boolean => {
    return CLASSIFICATION_HIERARCHY[level] <= CLASSIFICATION_HIERARCHY[userClearance];
  };

  // Toggle country with auto-sync tracking
  const toggleCountry = useCallback(
    (countryCode: string) => {
      if (disabled) return;

      if (releasabilityTo.includes(countryCode)) {
        // Removing a country
        const newReleasability = releasabilityTo.filter((c) => c !== countryCode);
        onReleasabilityChange(newReleasability);

        // Auto-deselect COIs that require this country
        const newCOIs = COI.filter((coiValue) => {
          const coiOption = allCOIOptions.find((o) => o.value === coiValue);
          if (coiOption?.requiredCountries?.includes(countryCode)) {
            return false;
          }
          return true;
        });

        if (newCOIs.length !== COI.length) {
          onCOIChange(newCOIs);
        }
      } else {
        // Adding a country
        onReleasabilityChange([...releasabilityTo, countryCode]);
      }
    },
    [disabled, releasabilityTo, COI, allCOIOptions, onReleasabilityChange, onCOIChange]
  );

  // Toggle COI with auto-sync
  const toggleCOI = useCallback(
    (coiValue: string) => {
      if (disabled) return;

      const coiOption = allCOIOptions.find((o) => o.value === coiValue);

      if (COI.includes(coiValue)) {
        // Deselecting COI
        onCOIChange(COI.filter((c) => c !== coiValue));

        if (coiOption?.requiredCountries) {
          // Remove countries only required by this COI
          const remainingCOIs = COI.filter((c) => c !== coiValue);
          const countriesStillNeeded = new Set<string>();

          remainingCOIs.forEach((remainingCoi) => {
            const remainingOption = allCOIOptions.find((o) => o.value === remainingCoi);
            remainingOption?.requiredCountries?.forEach((country) =>
              countriesStillNeeded.add(country)
            );
          });

          const newCountries = releasabilityTo.filter((country) => {
            if (!coiOption.requiredCountries.includes(country)) return true;
            return countriesStillNeeded.has(country);
          });

          if (newCountries.length !== releasabilityTo.length) {
            onReleasabilityChange(newCountries);
          }
        }
      } else {
        // Selecting COI - auto-add required countries
        onCOIChange([...COI, coiValue]);

        if (coiOption?.requiredCountries) {
          const newCountries = [...releasabilityTo];
          const addedCountries: string[] = [];

          coiOption.requiredCountries.forEach((country) => {
            if (!newCountries.includes(country)) {
              newCountries.push(country);
              addedCountries.push(country);
            }
          });

          if (addedCountries.length > 0) {
            onReleasabilityChange(newCountries);
            setRecentlyAdded(addedCountries);
            setTimeout(() => setRecentlyAdded([]), 1500);
          }
        }
      }
    },
    [disabled, COI, allCOIOptions, releasabilityTo, onCOIChange, onReleasabilityChange]
  );

  // Toggle caveat
  const toggleCaveat = useCallback(
    (caveatValue: string) => {
      if (disabled) return;

      if (caveats.includes(caveatValue)) {
        onCaveatsChange(caveats.filter((c) => c !== caveatValue));
      } else {
        onCaveatsChange([...caveats, caveatValue]);
      }
    },
    [disabled, caveats, onCaveatsChange]
  );

  // Keyboard navigation for country grid
  const handleCountryKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const cols = 5; // Grid columns (adjust for responsive)
      const countries = filteredCountries;
      const total = countries.length;

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          setFocusedCountryIndex((prev) => (prev + 1) % total);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setFocusedCountryIndex((prev) => (prev - 1 + total) % total);
          break;
        case 'ArrowDown':
          e.preventDefault();
          setFocusedCountryIndex((prev) => Math.min(prev + cols, total - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedCountryIndex((prev) => Math.max(prev - cols, 0));
          break;
        case ' ':
        case 'Enter':
          e.preventDefault();
          if (focusedCountryIndex >= 0 && focusedCountryIndex < total) {
            toggleCountry(countries[focusedCountryIndex].code);
          }
          break;
        case 'Escape':
          setCountrySearch('');
          searchInputRef.current?.blur();
          break;
      }
    },
    [filteredCountries, focusedCountryIndex, toggleCountry]
  );

  return (
    <div className="space-y-8">
      {/* Classification Level */}
      <section aria-labelledby="classification-heading">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3
              id="classification-heading"
              className="text-sm font-semibold text-gray-900 dark:text-gray-100"
            >
              Classification Level <span className="text-red-500">*</span>
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Showing {userCountry} national labels with NATO equivalents
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Your clearance:</span>
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-xs font-semibold',
                CLASSIFICATION_CONFIG[userClearance]?.textColor,
                'bg-gray-100 dark:bg-gray-800'
              )}
            >
              {userClearance}
            </span>
          </div>
        </div>

        <div
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3"
          role="radiogroup"
          aria-label="Classification level"
        >
          {CLASSIFICATION_LEVELS.map((level, index) => {
            const allowed = isClassificationAllowed(level);
            const selected = classification === level;
            const config = CLASSIFICATION_CONFIG[level];
            const nationalLabel = getNationalClassificationLabel(level, userCountry);
            const isDifferent = nationalLabel !== level && nationalLabel !== level.replace('_', ' ');

            return (
              <motion.button
                key={level}
                type="button"
                onClick={() => allowed && !disabled && onClassificationChange(level)}
                disabled={!allowed || disabled}
                custom={index}
                variants={shouldReduceMotion ? undefined : cardVariants}
                initial="hidden"
                animate="visible"
                whileHover={allowed && !disabled ? { scale: 1.02 } : undefined}
                whileTap={allowed && !disabled ? { scale: 0.98 } : undefined}
                className={cn(
                  'relative flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all',
                  'focus:outline-none focus-visible:ring-4',
                  selected && [
                    'border-transparent shadow-lg',
                    `bg-gradient-to-br ${config.gradient} text-white`,
                    config.ringColor,
                  ],
                  !selected &&
                    allowed && [
                      'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800',
                      config.bgHover,
                    ],
                  !allowed && 'opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-900',
                  disabled && 'cursor-not-allowed'
                )}
                role="radio"
                aria-checked={selected}
                aria-label={`${nationalLabel} (${level})`}
                tabIndex={selected ? 0 : -1}
              >
                {/* Lock icon for unavailable levels */}
                {!allowed && (
                  <div className="absolute top-2 right-2">
                    <Lock className="w-4 h-4 text-gray-400" />
                  </div>
                )}

                {/* Selected checkmark */}
                {selected && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white shadow-md flex items-center justify-center"
                  >
                    <Check className="w-4 h-4 text-green-600" />
                  </motion.div>
                )}

                {/* Icon */}
                <span className="text-2xl mb-2">{config.icon}</span>

                {/* Labels */}
                <span
                  className={cn(
                    'text-xs font-bold text-center',
                    selected ? 'text-white' : config.textColor
                  )}
                >
                  {nationalLabel}
                </span>
                {isDifferent && (
                  <span
                    className={cn(
                      'text-[10px] text-center mt-0.5',
                      selected ? 'text-white/80' : 'text-gray-400 dark:text-gray-500'
                    )}
                  >
                    ({level.replace('_', ' ')})
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* Releasable To (Countries) */}
      <section aria-labelledby="releasability-heading">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h3
              id="releasability-heading"
              className="text-sm font-semibold text-gray-900 dark:text-gray-100"
            >
              Releasable To <span className="text-red-500">*</span>
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Select countries that can access this document
            </p>
          </div>

          {/* Quick presets */}
          <div className="flex flex-wrap gap-2">
            <motion.button
              type="button"
              onClick={selectUserCountryOnly}
              disabled={disabled}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
                'border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400',
                'hover:bg-blue-50 dark:hover:bg-blue-900/20',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              My Country Only
            </motion.button>
            <motion.button
              type="button"
              onClick={selectFVEY}
              disabled={disabled}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
                'border-purple-300 dark:border-purple-700 text-purple-600 dark:text-purple-400',
                'hover:bg-purple-50 dark:hover:bg-purple-900/20',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              FVEY
            </motion.button>
            <motion.button
              type="button"
              onClick={selectNATO}
              disabled={disabled}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
                'border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400',
                'hover:bg-indigo-50 dark:hover:bg-indigo-900/20',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              All NATO
            </motion.button>
          </div>
        </div>

        {/* Search input */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={countrySearch}
            onChange={(e) => setCountrySearch(e.target.value)}
            placeholder="Search countries..."
            disabled={disabled}
            className={cn(
              'w-full pl-10 pr-4 py-2 text-sm rounded-xl border',
              'border-gray-200 dark:border-gray-700',
              'bg-white dark:bg-gray-800',
              'focus:outline-none focus:ring-2 focus:ring-blue-500',
              'placeholder:text-gray-400 dark:placeholder:text-gray-500',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
            aria-label="Search countries"
          />
          {countrySearch && (
            <button
              type="button"
              onClick={() => setCountrySearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Country Grid */}
        <div
          ref={countryGridRef}
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2"
          onKeyDown={handleCountryKeyDown}
          role="group"
          aria-label="Select countries"
        >
          <AnimatePresence mode="popLayout">
            {filteredCountries.map((country, index) => {
              const isSelected = releasabilityTo.includes(country.code);
              const isUserCountry = country.code === userCountry;
              const isFocused = focusedCountryIndex === index;
              const wasAutoAdded = recentlyAdded.includes(country.code);

              return (
                <motion.button
                  key={country.code}
                  type="button"
                  onClick={() => toggleCountry(country.code)}
                  disabled={disabled}
                  custom={index}
                  variants={shouldReduceMotion ? undefined : cardVariants}
                  initial="hidden"
                  animate={wasAutoAdded ? ['visible', 'pulse'] : 'visible'}
                  exit="exit"
                  layout
                  whileHover={!disabled ? { scale: 1.03 } : undefined}
                  whileTap={!disabled ? { scale: 0.97 } : undefined}
                  className={cn(
                    'relative flex flex-col items-center p-3 rounded-xl border-2 transition-all',
                    'focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-400',
                    isSelected && [
                      'bg-blue-50 dark:bg-blue-900/30 border-blue-400 dark:border-blue-600',
                      'shadow-md',
                    ],
                    !isSelected && [
                      'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700',
                      'hover:bg-gray-50 dark:hover:bg-gray-700/50',
                    ],
                    isFocused && 'ring-2 ring-blue-400',
                    wasAutoAdded && 'ring-4 ring-green-400',
                    disabled && 'opacity-50 cursor-not-allowed'
                  )}
                  tabIndex={index === 0 ? 0 : -1}
                  aria-pressed={isSelected}
                  aria-label={`${country.name} (${country.code})`}
                >
                  {/* Selected checkmark */}
                  {isSelected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center"
                    >
                      <Check className="w-3 h-3 text-white" />
                    </motion.div>
                  )}

                  {/* User country badge */}
                  {isUserCountry && (
                    <div className="absolute -top-1.5 -left-1.5 px-1.5 py-0.5 rounded-full bg-green-500 text-white text-[10px] font-bold">
                      You
                    </div>
                  )}

                  {/* Auto-added badge */}
                  {wasAutoAdded && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute -top-3 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-green-500 text-white text-[9px] font-bold whitespace-nowrap"
                    >
                      Auto-added
                    </motion.div>
                  )}

                  <span className="text-2xl mb-1">{country.flag}</span>
                  <span className="text-xs font-bold text-gray-900 dark:text-gray-100">
                    {country.code}
                  </span>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-full">
                    {country.name}
                  </span>
                  <span
                    className={cn(
                      'text-[9px] px-1.5 py-0.5 rounded mt-1',
                      country.region === 'FVEY'
                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                        : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                    )}
                  >
                    {country.region}
                  </span>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Selection summary */}
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-gray-600 dark:text-gray-400">
            {releasabilityTo.length === 0 ? (
              <span className="text-red-600 dark:text-red-400 font-medium flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                No countries selected
              </span>
            ) : (
              <span className="text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                {releasabilityTo.length} {releasabilityTo.length === 1 ? 'country' : 'countries'}{' '}
                selected
              </span>
            )}
          </span>
          {releasabilityTo.length > 0 && (
            <button
              type="button"
              onClick={() => onReleasabilityChange([])}
              disabled={disabled}
              className={cn(
                'text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 font-medium',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              Clear All
            </button>
          )}
        </div>
      </section>

      {/* Communities of Interest (COI) */}
      <section aria-labelledby="coi-heading">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3
              id="coi-heading"
              className="text-sm font-semibold text-gray-900 dark:text-gray-100"
            >
              Communities of Interest{' '}
              <span className="text-gray-400 dark:text-gray-500 font-normal">(Optional)</span>
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Selecting a COI auto-adds required member countries
            </p>
          </div>
          {userCOI && userCOI.length > 0 && (
            <span className="px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-xs rounded-lg border border-green-200 dark:border-green-800">
              Your COIs: {userCOI.join(', ')}
            </span>
          )}
        </div>

        {coiLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="animate-pulse h-16 bg-gray-100 dark:bg-gray-800 rounded-xl"
              />
            ))}
          </div>
        ) : availableCOIs.length > 0 ? (
          <div className="space-y-2">
            {availableCOIs.map((option, index) => {
              const isSelected = COI.includes(option.value);
              const isUserCOI = userCOI?.includes(option.value);

              return (
                <motion.button
                  key={option.value}
                  type="button"
                  onClick={() => toggleCOI(option.value)}
                  disabled={disabled}
                  custom={index}
                  variants={shouldReduceMotion ? undefined : cardVariants}
                  initial="hidden"
                  animate="visible"
                  whileHover={!disabled ? { scale: 1.01 } : undefined}
                  whileTap={!disabled ? { scale: 0.99 } : undefined}
                  className={cn(
                    'w-full px-4 py-3 rounded-xl border-2 text-left transition-all',
                    'focus:outline-none focus-visible:ring-4 focus-visible:ring-purple-400',
                    isSelected && [
                      'bg-purple-50 dark:bg-purple-900/30 border-purple-400 dark:border-purple-600',
                      isUserCOI
                        ? 'shadow-md'
                        : 'border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-900/20',
                    ],
                    !isSelected && [
                      'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700',
                      'hover:bg-gray-50 dark:hover:bg-gray-700/50',
                    ],
                    disabled && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Users
                        className={cn(
                          'w-5 h-5',
                          isSelected
                            ? 'text-purple-600 dark:text-purple-400'
                            : 'text-gray-400 dark:text-gray-500'
                        )}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                            {option.label}
                          </span>
                          {isSelected && (
                            <Check
                              className={cn(
                                'w-4 h-4',
                                isUserCOI
                                  ? 'text-purple-600 dark:text-purple-400'
                                  : 'text-red-600 dark:text-red-400'
                              )}
                            />
                          )}
                          {!isUserCOI && userCOI && userCOI.length > 0 && isSelected && (
                            <span className="px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-[10px] font-bold rounded">
                              Not your COI
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {option.description}
                        </p>
                        {option.requiredCountries.length > 0 && (
                          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                            Requires: {option.requiredCountries.join(', ')}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        ) : (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm text-amber-900 dark:text-amber-100">
                  No COI Memberships
                </p>
                <p className="text-xs text-amber-800 dark:text-amber-200 mt-1">
                  You are not a member of any Communities of Interest. Contact your administrator if
                  you need COI assignments.
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Handling Caveats */}
      <section aria-labelledby="caveats-heading">
        <div className="mb-4">
          <h3
            id="caveats-heading"
            className="text-sm font-semibold text-gray-900 dark:text-gray-100"
          >
            Handling Caveats{' '}
            <span className="text-gray-400 dark:text-gray-500 font-normal">(Optional)</span>
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Caveats restrict how the document can be further disseminated
          </p>
        </div>

        <div className="space-y-2">
          {CAVEAT_OPTIONS.map((option, index) => {
            const isSelected = caveats.includes(option.value);
            const severityColors = {
              high: 'border-red-200 dark:border-red-800',
              medium: 'border-yellow-200 dark:border-yellow-800',
              low: 'border-gray-200 dark:border-gray-700',
            };

            return (
              <motion.button
                key={option.value}
                type="button"
                onClick={() => toggleCaveat(option.value)}
                disabled={disabled}
                custom={index}
                variants={shouldReduceMotion ? undefined : cardVariants}
                initial="hidden"
                animate="visible"
                whileHover={!disabled ? { scale: 1.01 } : undefined}
                whileTap={!disabled ? { scale: 0.99 } : undefined}
                className={cn(
                  'w-full px-4 py-3 rounded-xl border-2 text-left transition-all',
                  'focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-400',
                  isSelected && [
                    'bg-amber-50 dark:bg-amber-900/30 border-amber-400 dark:border-amber-600',
                    'shadow-md',
                  ],
                  !isSelected && [
                    'bg-white dark:bg-gray-800',
                    severityColors[option.severity],
                    'hover:bg-gray-50 dark:hover:bg-gray-700/50',
                  ],
                  disabled && 'opacity-50 cursor-not-allowed'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Shield
                      className={cn(
                        'w-5 h-5',
                        isSelected
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-gray-400 dark:text-gray-500'
                      )}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-sm text-gray-900 dark:text-gray-100">
                          {option.label}
                        </span>
                        {isSelected && <Check className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
                        {option.severity === 'high' && (
                          <span className="px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-[10px] font-bold rounded">
                            High Impact
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {option.description}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>

        {caveats.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl"
          >
            <p className="text-xs text-amber-800 dark:text-amber-200">
              <strong>Active caveats:</strong> {caveats.join(', ')}
            </p>
          </motion.div>
        )}
      </section>

      {/* Validation Warnings */}
      <AnimatePresence>
        {warnings.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-2"
            aria-labelledby="warnings-heading"
          >
            <h3 id="warnings-heading" className="sr-only">
              Validation Warnings
            </h3>
            {warnings.map((warning, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: index * 0.1 }}
                className={cn(
                  'flex items-start justify-between gap-3 px-4 py-3 rounded-xl border-2',
                  warning.severity === 'error' && 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700',
                  warning.severity === 'warning' && 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700',
                  warning.severity === 'info' && 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                )}
                role="alert"
              >
                <div className="flex items-start gap-3">
                  {warning.severity === 'error' && <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />}
                  {warning.severity === 'warning' && <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />}
                  {warning.severity === 'info' && <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />}
                  <p
                    className={cn(
                      'text-sm',
                      warning.severity === 'error' && 'text-red-800 dark:text-red-200',
                      warning.severity === 'warning' && 'text-yellow-800 dark:text-yellow-200',
                      warning.severity === 'info' && 'text-blue-800 dark:text-blue-200'
                    )}
                  >
                    {warning.message}
                  </p>
                </div>
                {warning.action && (
                  <button
                    type="button"
                    onClick={warning.action}
                    className={cn(
                      'flex-shrink-0 px-3 py-1 text-xs font-medium rounded-lg transition-colors',
                      warning.severity === 'error' && 'bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200 hover:bg-red-300 dark:hover:bg-red-700',
                      warning.severity === 'warning' && 'bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 hover:bg-yellow-300 dark:hover:bg-yellow-700',
                      warning.severity === 'info' && 'bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 hover:bg-blue-300 dark:hover:bg-blue-700'
                    )}
                  >
                    {warning.actionLabel}
                  </button>
                )}
              </motion.div>
            ))}
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
