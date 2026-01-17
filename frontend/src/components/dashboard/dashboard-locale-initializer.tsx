/**
 * Dashboard Locale Initializer
 *
 * Client-side component that ensures the correct locale is set based on the user's
 * country of affiliation when they access the dashboard. This handles the case where
 * the login page sets the locale but the dashboard loads in a fresh context.
 */

'use client';

import { useEffect } from 'react';
import { useLocale } from '@/contexts/LocaleContext';
import { getLocaleFromCountry } from '@/utils/country-locale-mapping';

interface User {
  uniqueID?: string;
  clearance?: string;
  countryOfAffiliation?: string;
  acpCOI?: string[];
  name?: string;
  email?: string;
}

interface DashboardLocaleInitializerProps {
  user?: User;
}

export function DashboardLocaleInitializer({ user }: DashboardLocaleInitializerProps) {
  const { locale, changeLocale } = useLocale();

  useEffect(() => {
    if (!user?.countryOfAffiliation) return;

    // Check if user has manually overridden locale recently (within last 30 minutes)
    const manualOverride = localStorage.getItem('dive-v3-locale-override');
    const overrideTime = localStorage.getItem('dive-v3-locale-override-time');

    if (manualOverride && overrideTime) {
      const overrideTimestamp = parseInt(overrideTime);
      const now = Date.now();
      const thirtyMinutes = 30 * 60 * 1000; // 30 minutes in milliseconds

      // If manual override is recent (within 30 minutes), respect user choice
      if (now - overrideTimestamp < thirtyMinutes) {
        console.log('[DashboardLocaleInitializer] Respecting recent manual locale override');
        return;
      } else {
        // Clear expired override
        localStorage.removeItem('dive-v3-locale-override');
        localStorage.removeItem('dive-v3-locale-override-time');
        console.log('[DashboardLocaleInitializer] Cleared expired manual locale override');
      }
    }

    // Detect locale based on user's country
    const detectedLocale = getLocaleFromCountry(user.countryOfAffiliation);

    // Only change if different from current locale
    if (detectedLocale !== locale) {
      console.log('[DashboardLocaleInitializer] Setting locale based on user country:', {
        country: user.countryOfAffiliation,
        currentLocale: locale,
        newLocale: detectedLocale
      });
      changeLocale(detectedLocale);
    }
  }, [user?.countryOfAffiliation, locale, changeLocale]);

  // This component doesn't render anything
  return null;
}