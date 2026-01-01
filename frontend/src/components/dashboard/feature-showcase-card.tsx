/**
 * Feature Showcase Card Component
 *
 * Educational feature cards showcasing DIVE V3 capabilities.
 * Includes stats, educational content, and CTA.
 */

'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, Info } from 'lucide-react';
import { useState } from 'react';

export interface FeatureCardProps {
  title: string;
  description: string;
  educational: string;
  icon: React.ReactNode;
  href: string;
  stats?: Array<{ label: string; value: string | number }>;
  gradient: string;
  badges?: string[];
  isNew?: boolean;
  size?: 'small' | 'medium' | 'large';
  delay?: number;
}

export function FeatureShowcaseCard({
  title,
  description,
  educational,
  icon,
  href,
  stats = [],
  gradient,
  badges = [],
  isNew = false,
  size = 'medium',
  delay = 0,
}: FeatureCardProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const sizeClasses = {
    small: 'lg:col-span-3',
    medium: 'lg:col-span-4',
    large: 'lg:col-span-8',
  };

  const paddingClasses = {
    small: 'p-5',
    medium: 'p-6',
    large: 'p-8',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay * 0.1, duration: 0.5 }}
      className={`${sizeClasses[size]}`}
    >
      <Link
        href={href}
        className={`
          group relative block overflow-hidden rounded-2xl
          bg-gradient-to-br ${gradient}
          ${paddingClasses[size]} shadow-lg hover:shadow-2xl
          transition-all duration-500 hover:scale-[1.02]
        `}
      >
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-20">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.2) 1px, transparent 1px)`,
              backgroundSize: '24px 24px',
            }}
          />
        </div>

        {/* Floating orb effect */}
        <div className="absolute -right-16 -top-16 w-48 h-48 bg-white rounded-full blur-3xl opacity-10 group-hover:opacity-20 transition-opacity duration-700" />
        <div className="absolute -left-16 -bottom-16 w-32 h-32 bg-white rounded-full blur-3xl opacity-5 group-hover:opacity-15 transition-opacity duration-700" />

        {/* New badge */}
        {isNew && (
          <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm border border-white/30">
            <span className="text-xs font-bold text-white">NEW</span>
          </div>
        )}

        <div className="relative z-10">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
                {icon}
              </div>
              <div>
                <h3 className={`${size === 'large' ? 'text-2xl' : 'text-xl'} font-bold text-white mb-1`}>
                  {title}
                </h3>
                <p className="text-white/80 text-sm">{description}</p>
              </div>
            </div>
            <ArrowRight className="w-6 h-6 text-white group-hover:translate-x-2 transition-transform duration-300" />
          </div>

          {/* Educational tooltip */}
          <div className="relative mb-4">
            <button
              className="flex items-center gap-1 text-white/70 text-xs hover:text-white transition-colors"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              onClick={(e) => e.preventDefault()}
            >
              <Info className="w-3 h-3" />
              <span>Learn more</span>
            </button>

            {showTooltip && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute left-0 top-6 z-20 w-64 p-3 rounded-lg bg-slate-900/95 backdrop-blur-sm border border-slate-700 shadow-xl"
              >
                <p className="text-xs text-slate-200 leading-relaxed">{educational}</p>
              </motion.div>
            )}
          </div>

          {/* Stats */}
          {stats.length > 0 && (
            <div className={`flex flex-wrap gap-3 ${size === 'large' ? 'mb-6' : 'mb-4'}`}>
              {stats.map((stat, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20"
                >
                  <span className="text-lg font-bold text-white">{stat.value}</span>
                  <span className="text-xs text-white/70">{stat.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Badges */}
          {badges.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {badges.map((badge, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20"
                >
                  <span className="text-xs text-white font-medium">{badge}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  );
}

export default FeatureShowcaseCard;
