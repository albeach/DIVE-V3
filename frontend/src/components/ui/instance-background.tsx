'use client';

/**
 * Instance Background Component
 * 
 * Provides visually distinct backgrounds for each coalition partner instance.
 * Supports multiple background types:
 * - gradient: Dynamic gradient from instance colors
 * - image: Country-specific background images
 * - pattern: Geometric patterns with instance colors
 * - mesh: Modern mesh gradient effect
 * 
 * 🎨 All colors are derived from CSS variables set by ThemeProvider
 */

import React from 'react';
import { useInstanceTheme } from './theme-provider';

export type BackgroundType = 'gradient' | 'image' | 'pattern' | 'mesh' | 'minimal';

interface InstanceBackgroundProps {
  children: React.ReactNode;
  type?: BackgroundType;
  className?: string;
  overlay?: boolean;
  intensity?: 'light' | 'medium' | 'strong';
}

/**
 * Main InstanceBackground component
 * Wraps content with an instance-themed background
 */
export function InstanceBackground({ 
  children, 
  type = 'gradient',
  className = '',
  overlay = true,
  intensity = 'medium'
}: InstanceBackgroundProps) {
  const { instanceCode } = useInstanceTheme();
  
  const overlayOpacity = {
    light: 'bg-black/10',
    medium: 'bg-black/30',
    strong: 'bg-black/50',
  };

  return (
    <div className={`relative min-h-screen ${className}`}>
      {/* Background Layer */}
      <BackgroundLayer type={type} instanceCode={instanceCode} />
      
      {/* Optional overlay for better text readability */}
      {overlay && (
        <div className={`absolute inset-0 ${overlayOpacity[intensity]}`} />
      )}
      
      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}

/**
 * Background Layer - renders the actual background based on type
 */
function BackgroundLayer({ 
  type, 
  instanceCode 
}: { 
  type: BackgroundType; 
  instanceCode: string;
}) {
  switch (type) {
    case 'gradient':
      return <GradientBackground instanceCode={instanceCode} />;
    case 'image':
      return <ImageBackground instanceCode={instanceCode} />;
    case 'pattern':
      return <PatternBackground instanceCode={instanceCode} />;
    case 'mesh':
      return <MeshBackground instanceCode={instanceCode} />;
    case 'minimal':
      return <MinimalBackground />;
    default:
      return <GradientBackground instanceCode={instanceCode} />;
  }
}

/**
 * Gradient Background
 * Elegant gradient using instance primary and secondary colors
 */
function GradientBackground({ instanceCode }: { instanceCode: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Primary gradient */}
      <div 
        className="absolute inset-0 bg-instance-banner"
        style={{ 
          background: 'var(--instance-banner-bg)',
        }}
      />
      
      {/* Animated accent orbs */}
      <div 
        className="absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-30 blur-3xl animate-pulse"
        style={{ backgroundColor: 'var(--instance-secondary)' }}
      />
      <div 
        className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full opacity-20 blur-3xl animate-pulse"
        style={{ 
          backgroundColor: 'var(--instance-accent)',
          animationDelay: '1s'
        }}
      />
      
      {/* Subtle grid overlay */}
      <div 
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `
            linear-gradient(var(--instance-text) 1px, transparent 1px),
            linear-gradient(90deg, var(--instance-text) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />
    </div>
  );
}

/**
 * Image Background
 * Country-specific background images with gradient overlay
 */
function ImageBackground({ instanceCode }: { instanceCode: string }) {
  const backgroundImages: Record<string, string> = {
    USA: '/backgrounds/usa-capitol.jpg',
    FRA: '/backgrounds/fra-eiffel.jpg',
    DEU: '/backgrounds/deu-brandenburg.jpg',
    GBR: '/backgrounds/gbr-parliament.jpg',
    CAN: '/backgrounds/can-parliament.jpg',
    ITA: '/backgrounds/ita-colosseum.jpg',
  };

  const imagePath = backgroundImages[instanceCode] || backgroundImages.USA;

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Background image */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ 
          backgroundImage: `url(${imagePath})`,
        }}
      />
      
      {/* Gradient overlay using instance colors */}
      <div 
        className="absolute inset-0"
        style={{
          background: `linear-gradient(
            135deg, 
            rgba(var(--instance-primary-rgb), 0.9) 0%, 
            rgba(var(--instance-secondary-rgb), 0.8) 50%,
            rgba(var(--instance-primary-rgb), 0.95) 100%
          )`,
        }}
      />
    </div>
  );
}

/**
 * Pattern Background
 * Geometric patterns with instance colors
 */
function PatternBackground({ instanceCode }: { instanceCode: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Base gradient */}
      <div 
        className="absolute inset-0"
        style={{ 
          background: 'var(--instance-banner-bg)',
        }}
      />
      
      {/* Hexagonal pattern */}
      <div 
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0l25.98 15v30L30 60 4.02 45V15z' fill='none' stroke='%23ffffff' stroke-width='1'/%3E%3C/svg%3E")`,
          backgroundSize: '60px 60px',
        }}
      />
      
      {/* Floating shapes */}
      <div className="absolute inset-0">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full opacity-10 animate-float"
            style={{
              width: `${80 + i * 40}px`,
              height: `${80 + i * 40}px`,
              left: `${10 + i * 15}%`,
              top: `${20 + (i % 3) * 25}%`,
              backgroundColor: i % 2 === 0 ? 'var(--instance-secondary)' : 'var(--instance-accent)',
              animationDelay: `${i * 0.5}s`,
              animationDuration: `${4 + i}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Mesh Gradient Background
 * Modern mesh gradient effect (Apple-style)
 */
function MeshBackground({ instanceCode }: { instanceCode: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Base color */}
      <div 
        className="absolute inset-0"
        style={{ backgroundColor: 'var(--instance-primary)' }}
      />
      
      {/* Mesh gradient blobs */}
      <div 
        className="absolute top-0 left-0 w-[60%] h-[60%] rounded-full blur-[120px] opacity-60"
        style={{ backgroundColor: 'var(--instance-secondary)' }}
      />
      <div 
        className="absolute bottom-0 right-0 w-[50%] h-[50%] rounded-full blur-[100px] opacity-50"
        style={{ backgroundColor: 'var(--instance-accent)' }}
      />
      <div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40%] h-[40%] rounded-full blur-[80px] opacity-40"
        style={{ backgroundColor: 'var(--instance-primary)' }}
      />
      
      {/* Noise texture */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
}

/**
 * Minimal Background
 * Clean, subtle background for content-focused pages
 */
function MinimalBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Very subtle gradient */}
      <div 
        className="absolute inset-0"
        style={{ 
          background: 'linear-gradient(180deg, rgba(var(--instance-primary-rgb), 0.03) 0%, transparent 50%)',
        }}
      />
      
      {/* Top accent line */}
      <div 
        className="absolute top-0 left-0 right-0 h-1"
        style={{ 
          background: 'var(--instance-banner-bg)',
        }}
      />
    </div>
  );
}

/**
 * Hero Section Background
 * For landing pages and prominent sections
 */
export function HeroBackground({ 
  children,
  className = ''
}: { 
  children: React.ReactNode;
  className?: string;
}) {
  const { instanceCode } = useInstanceTheme();
  
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Animated gradient background */}
      <div 
        className="absolute inset-0 animate-gradient"
        style={{
          background: `linear-gradient(
            -45deg,
            var(--instance-primary),
            var(--instance-secondary),
            var(--instance-primary),
            var(--instance-accent)
          )`,
          backgroundSize: '400% 400%',
        }}
      />
      
      {/* Floating orbs */}
      <div className="absolute inset-0 overflow-hidden">
        <div 
          className="absolute w-72 h-72 rounded-full blur-3xl opacity-30 animate-float"
          style={{ 
            backgroundColor: 'var(--instance-accent)',
            top: '10%',
            right: '10%',
          }}
        />
        <div 
          className="absolute w-96 h-96 rounded-full blur-3xl opacity-20 animate-float"
          style={{ 
            backgroundColor: 'var(--instance-secondary)',
            bottom: '10%',
            left: '5%',
            animationDelay: '2s',
          }}
        />
      </div>
      
      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}

/**
 * Card Background
 * For elevated content cards with subtle instance theming
 */
export function CardBackground({ 
  children,
  className = '',
  glow = false
}: { 
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div 
      className={`
        relative bg-white/90 backdrop-blur-sm rounded-2xl
        border border-gray-200
        ${glow ? 'shadow-lg' : 'shadow-md'}
        ${className}
      `}
      style={{
        boxShadow: glow 
          ? '0 0 40px rgba(var(--instance-primary-rgb), 0.15), 0 8px 32px rgba(0,0,0,0.1)' 
          : undefined,
      }}
    >
      {/* Top accent border */}
      <div 
        className="absolute top-0 left-4 right-4 h-0.5 rounded-full"
        style={{ backgroundColor: 'var(--instance-primary)' }}
      />
      
      {children}
    </div>
  );
}

/**
 * Section Divider with instance colors
 */
export function InstanceDivider({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <div 
        className="flex-1 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, var(--instance-primary), transparent)' }}
      />
      <div 
        className="w-2 h-2 rounded-full"
        style={{ backgroundColor: 'var(--instance-accent)' }}
      />
      <div 
        className="flex-1 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, var(--instance-primary), transparent)' }}
      />
    </div>
  );
}

export default InstanceBackground;

