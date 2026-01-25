'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { getCountryFlagComponent } from './flags';

interface CountryAvatarProps {
  countryCode: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  clearance?: string;
  isFederated?: boolean;
  showStatus?: boolean;
  className?: string;
}

const sizeMap = {
  sm: 40,
  md: 64,
  lg: 96,
  xl: 128,
};

const clearanceColors = {
  UNCLASSIFIED: 'from-green-400 to-green-600',
  CONFIDENTIAL: 'from-blue-400 to-blue-600',
  SECRET: 'from-amber-400 to-amber-600',
  TOP_SECRET: 'from-red-400 to-red-600',
};

const clearanceRingColors = {
  UNCLASSIFIED: 'ring-green-500/50',
  CONFIDENTIAL: 'ring-blue-500/50',
  SECRET: 'ring-amber-500/50',
  TOP_SECRET: 'ring-red-500/50',
};

export function CountryAvatar({
  countryCode,
  size = 'md',
  clearance,
  isFederated = false,
  showStatus = true,
  className = '',
}: CountryAvatarProps) {
  const pixelSize = sizeMap[size];
  const FlagComponent = getCountryFlagComponent(countryCode);
  const clearanceColor = clearanceColors[clearance as keyof typeof clearanceColors] || clearanceColors.UNCLASSIFIED;
  const ringColor = clearanceRingColors[clearance as keyof typeof clearanceRingColors] || clearanceRingColors.UNCLASSIFIED;

  // Determine status indicator color
  const statusColor = isFederated ? 'bg-amber-500' : 'bg-emerald-500';
  const statusRing = isFederated ? 'ring-amber-400' : 'ring-emerald-400';

  // Respect prefers-reduced-motion
  const prefersReducedMotion = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  return (
    <div className={`relative inline-block ${className}`} style={{ width: pixelSize, height: pixelSize }}>
      {/* Animated floating container */}
      <motion.div
        className="relative w-full h-full"
        animate={prefersReducedMotion ? {} : {
          y: [0, -2, 0],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        {/* Glow effect background */}
        <motion.div
          className={`absolute inset-0 rounded-full bg-gradient-to-br ${clearanceColor} blur-xl`}
          animate={prefersReducedMotion ? {} : {
            opacity: [0.3, 0.5, 0.3],
            scale: [0.95, 1.05, 0.95],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Main avatar container with clearance ring */}
        <div
          className={`relative w-full h-full rounded-full bg-gradient-to-br ${clearanceColor} p-1 ring-4 ${ringColor} shadow-2xl`}
        >
          {/* Inner white circle for flag background */}
          <div className="w-full h-full rounded-full bg-white flex items-center justify-center overflow-hidden shadow-inner">
            {/* Flag scaled to fit */}
            <div className="relative flex items-center justify-center" style={{ width: pixelSize * 0.7, height: pixelSize * 0.7 }}>
              <FlagComponent size={pixelSize * 0.65} />
            </div>
          </div>
        </div>

        {/* Status indicator */}
        {showStatus && (
          <motion.div
            className="absolute -bottom-1 -right-1 flex items-center justify-center"
            style={{ width: pixelSize * 0.22, height: pixelSize * 0.22 }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 500, damping: 15 }}
          >
            {/* Pulsing ring */}
            <span className="absolute inline-flex h-full w-full">
              <motion.span
                className={`absolute inline-flex h-full w-full rounded-full ${statusColor} opacity-75`}
                animate={prefersReducedMotion ? {} : { scale: [1, 1.3, 1], opacity: [0.75, 0, 0.75] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
              />
            </span>

            {/* Solid indicator with icon */}
            <span
              className={`relative inline-flex rounded-full ${statusColor} border-2 border-white shadow-lg items-center justify-center`}
              style={{ width: pixelSize * 0.22, height: pixelSize * 0.22 }}
              title={isFederated ? 'Federated access' : 'Home instance'}
            >
              {isFederated ? (
                <svg className="w-1/2 h-1/2 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-1/2 h-1/2 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </span>
          </motion.div>
        )}
      </motion.div>

      {/* ARIA label for accessibility */}
      <span className="sr-only">
        {countryCode} {isFederated ? 'federated user' : 'home user'} avatar
        {clearance && ` with ${clearance} clearance`}
      </span>
    </div>
  );
}

/**
 * Smaller variant for navigation/header use
 */
export function CountryAvatarCompact({
  countryCode,
  isFederated = false,
  size = 40,
  className = '',
}: {
  countryCode: string;
  isFederated?: boolean;
  size?: number;
  className?: string;
}) {
  const FlagComponent = getCountryFlagComponent(countryCode);
  const borderColor = isFederated ? 'border-amber-400/50' : 'border-emerald-400/50';

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-full bg-white border-2 ${borderColor} shadow-md overflow-hidden ${className}`}
      style={{ width: size, height: size }}
    >
      <FlagComponent size={size * 0.7} />
      <span className="sr-only">{countryCode} {isFederated ? 'federated' : 'home'} user</span>
    </div>
  );
}
