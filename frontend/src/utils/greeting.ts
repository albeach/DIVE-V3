/**
 * Time-Based Greeting Utility
 *
 * Generates personalized greetings based on the user's local time.
 * Supports internationalization through translation keys.
 */

/**
 * Get a time-appropriate greeting based on the user's local hour
 *
 * @returns Translation key for the greeting
 */
export function getTimeBasedGreeting(): string {
  // Get current hour in user's local timezone
  const now = new Date();
  const hour = now.getHours();

  // Return appropriate greeting based on time of day
  if (hour >= 5 && hour < 12) {
    return 'greetings.morning'; // Good morning
  } else if (hour >= 12 && hour < 17) {
    return 'greetings.afternoon'; // Good afternoon
  } else if (hour >= 17 && hour < 21) {
    return 'greetings.evening'; // Good evening
  } else {
    return 'greetings.lateNight'; // Welcome back (late night)
  }
}

/**
 * Get the user's timezone
 *
 * @returns IANA timezone string (e.g., "America/New_York")
 */
export function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (error) {
    console.warn('Failed to get user timezone:', error);
    return 'UTC';
  }
}

/**
 * Get a localized time-based greeting directly (non-i18n)
 * For use in contexts where translation function isn't available
 *
 * @returns Greeting string in English
 */
export function getTimeBasedGreetingDirect(): string {
  const now = new Date();
  const hour = now.getHours();

  if (hour >= 5 && hour < 12) {
    return 'Good morning';
  } else if (hour >= 12 && hour < 17) {
    return 'Good afternoon';
  } else if (hour >= 17 && hour < 21) {
    return 'Good evening';
  } else {
    return 'Welcome back';
  }
}

/**
 * Get formatted time for display
 *
 * @param locale - Locale string (e.g., 'en-US', 'fr-FR')
 * @returns Formatted time string
 */
export function getFormattedTime(locale: string = 'en-US'): string {
  const now = new Date();
  return now.toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Get formatted date for display
 *
 * @param locale - Locale string (e.g., 'en-US', 'fr-FR')
 * @returns Formatted date string
 */
export function getFormattedDate(locale: string = 'en-US'): string {
  const now = new Date();
  return now.toLocaleDateString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Check if it's a typical work hour (8 AM - 6 PM local time)
 * Can be used to show different UI elements based on work hours
 *
 * @returns Boolean indicating if current time is work hours
 */
export function isWorkHours(): boolean {
  const hour = new Date().getHours();
  return hour >= 8 && hour < 18;
}

/**
 * Get period of day for additional context
 *
 * @returns 'morning' | 'afternoon' | 'evening' | 'night'
 */
export function getPeriodOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 12) {
    return 'morning';
  } else if (hour >= 12 && hour < 17) {
    return 'afternoon';
  } else if (hour >= 17 && hour < 21) {
    return 'evening';
  } else {
    return 'night';
  }
}
