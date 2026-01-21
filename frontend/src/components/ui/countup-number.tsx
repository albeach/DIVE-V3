/**
 * CountUp Number Component
 *
 * Animated number counting effect
 * Shows the progression from 0 to target number
 */

'use client';

import { useEffect, useState } from 'react';

interface CountUpNumberProps {
  /** Target number to count up to */
  value: number;
  /** Duration of the animation in seconds */
  duration?: number;
  /** Number of decimal places to show */
  decimals?: number;
  /** Delay before starting animation in seconds */
  delay?: number;
  /** Whether to animate or show final value immediately */
  animate?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function CountUpNumber({
  value,
  duration = 2.5,
  decimals = 0,
  delay = 0,
  animate = true,
  className = ''
}: CountUpNumberProps) {
  const [displayValue, setDisplayValue] = useState(animate ? 0 : value);

  useEffect(() => {
    if (!animate) {
      setDisplayValue(value);
      return;
    }

    // Delay the start of animation
    const startTimer = setTimeout(() => {
      const startTime = Date.now();
      const startValue = 0;
      const endValue = value;
      const totalDuration = duration * 1000;

      const animateValue = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / totalDuration, 1);

        // Easing function (ease-out)
        const easedProgress = 1 - Math.pow(1 - progress, 3);

        const currentValue = startValue + (endValue - startValue) * easedProgress;
        setDisplayValue(currentValue);

        if (progress < 1) {
          requestAnimationFrame(animateValue);
        } else {
          setDisplayValue(endValue); // Ensure final value is exact
        }
      };

      requestAnimationFrame(animateValue);
    }, delay * 1000);

    return () => clearTimeout(startTimer);
  }, [value, duration, delay, animate]);

  return (
    <span className={className}>
      {displayValue.toFixed(decimals)}
    </span>
  );
}