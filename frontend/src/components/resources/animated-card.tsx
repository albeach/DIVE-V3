/**
 * Animated Resource Card - Phase 4 Micro-interactions
 * 
 * Enhanced resource card with beautiful micro-interactions:
 * - Hover lift and scale animations
 * - Staggered reveal on load
 * - Press feedback
 * - Classification pulse animation
 * - Bookmark toggle animation
 * 
 * Uses Framer Motion for smooth, physics-based animations
 */

'use client';

import React, { forwardRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import Link from 'next/link';
import {
  FileText,
  Lock,
  Globe2,
  Users,
  Bookmark,
  ExternalLink,
  Eye,
  EyeOff,
  Shield,
} from 'lucide-react';

// ============================================
// Types
// ============================================

interface AnimatedResourceCardProps {
  resource: {
    resourceId: string;
    title: string;
    classification: string;
    releasabilityTo: string[];
    COI: string[];
    encrypted: boolean;
    creationDate?: string;
    originRealm?: string;
  };
  index: number;
  isBookmarked?: boolean;
  onBookmarkToggle?: () => void;
  onPreview?: () => void;
  accessStatus?: 'allowed' | 'denied' | 'unknown';
  isSelected?: boolean;
  isFocused?: boolean;
}

// ============================================
// Constants
// ============================================

const classificationStyles: Record<string, { 
  bg: string; 
  text: string; 
  border: string;
  glow: string;
  darkBg: string;
  darkText: string;
}> = {
  UNCLASSIFIED: {
    bg: 'bg-emerald-100',
    text: 'text-emerald-800',
    border: 'border-emerald-300',
    glow: 'shadow-emerald-200/50',
    darkBg: 'dark:bg-emerald-900/30',
    darkText: 'dark:text-emerald-300',
  },
  CONFIDENTIAL: {
    bg: 'bg-amber-100',
    text: 'text-amber-800',
    border: 'border-amber-300',
    glow: 'shadow-amber-200/50',
    darkBg: 'dark:bg-amber-900/30',
    darkText: 'dark:text-amber-300',
  },
  SECRET: {
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    border: 'border-orange-300',
    glow: 'shadow-orange-200/50',
    darkBg: 'dark:bg-orange-900/30',
    darkText: 'dark:text-orange-300',
  },
  TOP_SECRET: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    border: 'border-red-300',
    glow: 'shadow-red-200/50',
    darkBg: 'dark:bg-red-900/30',
    darkText: 'dark:text-red-300',
  },
};

const instanceFlags: Record<string, string> = {
  USA: '🇺🇸',
  FRA: '🇫🇷',
  GBR: '🇬🇧',
  DEU: '🇩🇪',
  CAN: '🇨🇦',
};

// ============================================
// Animation Variants
// ============================================

const cardVariants = {
  hidden: { 
    opacity: 0, 
    y: 20,
    scale: 0.95,
  },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 24,
      delay: index * 0.05, // Staggered reveal
    },
  }),
};

const bookmarkVariants = {
  initial: { scale: 1 },
  tap: { scale: 0.85 },
  hover: { scale: 1.1 },
  bookmarked: {
    scale: [1, 1.3, 1],
    transition: { duration: 0.3 },
  },
};

const pulseVariants = {
  pulse: {
    boxShadow: [
      '0 0 0 0 rgba(239, 68, 68, 0)',
      '0 0 0 4px rgba(239, 68, 68, 0.3)',
      '0 0 0 0 rgba(239, 68, 68, 0)',
    ],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

// ============================================
// Component
// ============================================

const AnimatedResourceCard = forwardRef<HTMLDivElement, AnimatedResourceCardProps>(({
  resource,
  index,
  isBookmarked = false,
  onBookmarkToggle,
  onPreview,
  accessStatus = 'unknown',
  isSelected = false,
  isFocused = false,
}, ref) => {
  // 3D tilt effect
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  
  const springConfig = { damping: 30, stiffness: 300 };
  const rotateX = useSpring(useTransform(y, [-100, 100], [5, -5]), springConfig);
  const rotateY = useSpring(useTransform(x, [-100, 100], [-5, 5]), springConfig);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    x.set(e.clientX - centerX);
    y.set(e.clientY - centerY);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  const classStyles = classificationStyles[resource.classification] || classificationStyles.UNCLASSIFIED;

  return (
    <motion.div
      ref={ref}
      custom={index}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      whileHover={{ 
        y: -4,
        transition: { type: 'spring', stiffness: 400, damping: 25 }
      }}
      whileTap={{ scale: 0.98 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX,
        rotateY,
        transformPerspective: 1000,
      }}
      className={`
        relative group cursor-pointer
        bg-white dark:bg-gray-800/90
        backdrop-blur-sm
        rounded-2xl
        border-2 transition-colors duration-200
        ${isSelected 
          ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-200 dark:ring-blue-800' 
          : isFocused 
            ? 'border-blue-300 dark:border-blue-600' 
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
        }
        shadow-lg hover:shadow-xl
        overflow-hidden
      `}
      data-testid="resource-card"
      data-resource-id={resource.resourceId}
    >
      {/* Classification Banner */}
      <motion.div
        variants={resource.classification === 'TOP_SECRET' || resource.classification === 'SECRET' ? pulseVariants : undefined}
        animate={resource.classification === 'TOP_SECRET' || resource.classification === 'SECRET' ? 'pulse' : undefined}
        className={`
          px-4 py-2
          ${classStyles.bg} ${classStyles.darkBg}
          border-b ${classStyles.border}
          flex items-center justify-between
        `}
      >
        <span className={`text-xs font-black tracking-wide ${classStyles.text} ${classStyles.darkText}`}>
          {resource.classification.replace('_', ' ')}
        </span>
        
        <div className="flex items-center gap-2">
          {resource.originRealm && (
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
              {instanceFlags[resource.originRealm]} {resource.originRealm}
            </span>
          )}
          {resource.encrypted && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1 px-2 py-0.5 bg-purple-600 text-white rounded-full text-[10px] font-bold"
            >
              <Lock className="w-3 h-3" />
              ZTDF
            </motion.span>
          )}
        </div>
      </motion.div>

      {/* Content */}
      <div className="p-4">
        {/* Title */}
        <Link href={`/resources/${resource.resourceId}`}>
          <motion.h3 
            className="text-base font-bold text-gray-900 dark:text-gray-100 mb-2 line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
            whileHover={{ x: 2 }}
          >
            {resource.title}
          </motion.h3>
        </Link>
        
        {/* Resource ID */}
        <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mb-3 truncate">
          {resource.resourceId}
        </p>

        {/* Releasability Tags */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {resource.releasabilityTo.slice(0, 4).map((country) => (
            <motion.span
              key={country}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
            >
              {instanceFlags[country] || ''} {country}
            </motion.span>
          ))}
          {resource.releasabilityTo.length > 4 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
              +{resource.releasabilityTo.length - 4}
            </span>
          )}
        </div>

        {/* COI Tags */}
        {resource.COI.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {resource.COI.map((coi) => (
              <span
                key={coi}
                className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
              >
                <Users className="w-3 h-3 mr-1" />
                {coi}
              </span>
            ))}
          </div>
        )}

        {/* Access Status */}
        <div className={`
          flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium
          ${accessStatus === 'allowed' 
            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' 
            : accessStatus === 'denied'
              ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
              : 'bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400'
          }
        `}>
          {accessStatus === 'allowed' ? (
            <>
              <Eye className="w-3.5 h-3.5" />
              <span>Access likely</span>
            </>
          ) : accessStatus === 'denied' ? (
            <>
              <EyeOff className="w-3.5 h-3.5" />
              <span>Access restricted</span>
            </>
          ) : (
            <>
              <Shield className="w-3.5 h-3.5" />
              <span>Access unknown</span>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        {onPreview && (
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPreview();
            }}
            className="p-2 rounded-lg bg-white/90 dark:bg-gray-800/90 text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 shadow-lg backdrop-blur-sm transition-colors"
            aria-label="Preview document"
          >
            <ExternalLink className="w-4 h-4" />
          </motion.button>
        )}
        
        {onBookmarkToggle && (
          <motion.button
            variants={bookmarkVariants}
            initial="initial"
            whileHover="hover"
            whileTap="tap"
            animate={isBookmarked ? 'bookmarked' : 'initial'}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onBookmarkToggle();
            }}
            className={`
              p-2 rounded-lg shadow-lg backdrop-blur-sm transition-colors
              ${isBookmarked 
                ? 'bg-amber-500 text-white' 
                : 'bg-white/90 dark:bg-gray-800/90 text-gray-600 dark:text-gray-300 hover:text-amber-500'
              }
            `}
            aria-label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
          >
            <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`} />
          </motion.button>
        )}
      </div>

      {/* Selection Indicator */}
      {isSelected && (
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0 }}
          className="absolute top-4 left-4 w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center shadow-lg"
        >
          <svg className="w-4 h-4 text-white" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </motion.div>
      )}
    </motion.div>
  );
});

AnimatedResourceCard.displayName = 'AnimatedResourceCard';

export default AnimatedResourceCard;

// ============================================
// Grid Container
// ============================================

export function AnimatedResourceGrid({ 
  children,
  viewMode = 'grid',
}: { 
  children: React.ReactNode;
  viewMode?: 'grid' | 'list' | 'compact';
}) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      className={
        viewMode === 'grid'
          ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4'
          : viewMode === 'list'
            ? 'flex flex-col gap-3'
            : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3'
      }
    >
      {children}
    </motion.div>
  );
}









