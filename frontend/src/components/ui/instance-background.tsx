'use client';

/**
 * Instance Background Component
 * 
 * Provides a visually distinct background for each coalition instance.
 * Supports multiple background types:
 * - gradient: Uses CSS variables for instance-specific gradients
 * - image: Country-specific background images
 * - pattern: Geometric patterns with instance colors
 * - animated: Subtle animated backgrounds with data flow effects
 * 
 * Scalable design - new instances only need to add their theme to instance.json
 */

import React from 'react';
import { useInstanceTheme } from './theme-provider';

type BackgroundType = 'gradient' | 'image' | 'pattern' | 'animated' | 'minimal';

interface InstanceBackgroundProps {
  children?: React.ReactNode;
  type?: BackgroundType;
  className?: string;
  overlay?: boolean;
  intensity?: 'light' | 'medium' | 'strong';
}

/**
 * Gradient Background - Uses instance CSS variables
 */
function GradientBackground({ intensity = 'medium' }: { intensity: string }) {
  const opacityMap = {
    light: 'opacity-90',
    medium: 'opacity-95',
    strong: 'opacity-100',
  };

  return (
    <div 
      className={`absolute inset-0 ${opacityMap[intensity as keyof typeof opacityMap]}`}
      style={{ background: 'var(--instance-banner-bg)' }}
    />
  );
}

/**
 * Pattern Background - Geometric grid with instance colors
 */
function PatternBackground({ intensity = 'medium' }: { intensity: string }) {
  const opacityMap = {
    light: 0.05,
    medium: 0.1,
    strong: 0.15,
  };
  const opacity = opacityMap[intensity as keyof typeof opacityMap];

  return (
    <>
      {/* Base gradient */}
      <div 
        className="absolute inset-0"
        style={{ background: 'var(--instance-banner-bg)' }}
      />
      
      {/* Grid pattern overlay */}
      <div 
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(var(--instance-accent-rgb, 255, 255, 255), ${opacity}) 1px, transparent 1px),
            linear-gradient(90deg, rgba(var(--instance-accent-rgb, 255, 255, 255), ${opacity}) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }}
      />
      
      {/* Diagonal lines */}
      <div 
        className="absolute inset-0"
        style={{
          backgroundImage: `
            repeating-linear-gradient(
              45deg,
              transparent,
              transparent 100px,
              rgba(var(--instance-accent-rgb, 255, 255, 255), ${opacity * 0.5}) 100px,
              rgba(var(--instance-accent-rgb, 255, 255, 255), ${opacity * 0.5}) 101px
            )
          `,
        }}
      />
    </>
  );
}

/**
 * Image Background - Uses country-specific background images
 */
function ImageBackground({ instanceCode, intensity = 'medium' }: { instanceCode: string; intensity: string }) {
  const overlayOpacity = {
    light: 'bg-black/30',
    medium: 'bg-black/50',
    strong: 'bg-black/70',
  };

  // Map instance codes to background image paths
  const backgroundImages: Record<string, string> = {
    USA: '/backgrounds/background-usa.jpg',
    FRA: '/backgrounds/background-fra.jpg',
    DEU: '/backgrounds/background-deu.jpg',
    GBR: '/backgrounds/background-gbr.jpg',
    CAN: '/backgrounds/background-can.jpg',
    ITA: '/backgrounds/background-ita.jpg',
    ESP: '/backgrounds/background-esp.jpg',
    NLD: '/backgrounds/background-nld.jpg',
    POL: '/backgrounds/background-pol.jpg',
  };

  const imagePath = backgroundImages[instanceCode] || backgroundImages.USA;

  return (
    <>
      {/* Background image */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${imagePath})` }}
      />
      {/* Gradient overlay for readability */}
      <div className={`absolute inset-0 ${overlayOpacity[intensity as keyof typeof overlayOpacity]}`} />
      {/* Instance color tint */}
      <div 
        className="absolute inset-0 mix-blend-overlay opacity-30"
        style={{ background: 'var(--instance-banner-bg)' }}
      />
    </>
  );
}

/**
 * Animated Background - Data flow visualization
 */
function AnimatedBackground({ intensity = 'medium' }: { intensity: string }) {
  const opacityMap = {
    light: { grid: 0.1, lines: 0.15, particles: 0.4 },
    medium: { grid: 0.2, lines: 0.25, particles: 0.6 },
    strong: { grid: 0.3, lines: 0.35, particles: 0.8 },
  };
  const opacities = opacityMap[intensity as keyof typeof opacityMap];

  return (
    <>
      {/* Base gradient */}
      <div 
        className="absolute inset-0"
        style={{ background: 'var(--instance-banner-bg)' }}
      />
      
      {/* Animated grid */}
      <div 
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(var(--instance-accent-rgb, 255, 255, 255), ${opacities.grid}) 1px, transparent 1px),
            linear-gradient(90deg, rgba(var(--instance-accent-rgb, 255, 255, 255), ${opacities.grid}) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
          animation: 'backgroundScroll 20s linear infinite',
        }}
      />
      
      {/* Animated circuit lines */}
      <div className="absolute inset-0 overflow-hidden" style={{ opacity: opacities.lines }}>
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          {/* Horizontal lines */}
          <line x1="0" y1="25%" x2="100%" y2="25%" stroke="rgba(var(--instance-accent-rgb, 255, 255, 255), 0.5)" strokeWidth="1" strokeDasharray="8,4">
            <animate attributeName="stroke-dashoffset" from="0" to="12" dur="2s" repeatCount="indefinite" />
          </line>
          <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(var(--instance-accent-rgb, 255, 255, 255), 0.5)" strokeWidth="1" strokeDasharray="8,4">
            <animate attributeName="stroke-dashoffset" from="0" to="12" dur="3s" repeatCount="indefinite" />
          </line>
          <line x1="0" y1="75%" x2="100%" y2="75%" stroke="rgba(var(--instance-accent-rgb, 255, 255, 255), 0.5)" strokeWidth="1" strokeDasharray="8,4">
            <animate attributeName="stroke-dashoffset" from="0" to="12" dur="2.5s" repeatCount="indefinite" />
          </line>
          
          {/* Data nodes */}
          <circle cx="15%" cy="25%" r="4" fill="rgba(var(--instance-accent-rgb, 255, 255, 255), 0.8)">
            <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx="45%" cy="50%" r="4" fill="rgba(var(--instance-accent-rgb, 255, 255, 255), 0.8)">
            <animate attributeName="opacity" values="0.3;1;0.3" dur="2.5s" repeatCount="indefinite" />
          </circle>
          <circle cx="75%" cy="75%" r="4" fill="rgba(var(--instance-accent-rgb, 255, 255, 255), 0.8)">
            <animate attributeName="opacity" values="0.3;1;0.3" dur="3s" repeatCount="indefinite" />
          </circle>
          <circle cx="85%" cy="25%" r="4" fill="rgba(var(--instance-accent-rgb, 255, 255, 255), 0.8)">
            <animate attributeName="opacity" values="0.3;1;0.3" dur="1.8s" repeatCount="indefinite" />
          </circle>
        </svg>
      </div>
      
      {/* Floating particles */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full animate-float"
            style={{
              width: `${4 + (i % 3) * 2}px`,
              height: `${4 + (i % 3) * 2}px`,
              backgroundColor: `rgba(var(--instance-accent-rgb, 255, 255, 255), ${opacities.particles})`,
              left: `${10 + i * 12}%`,
              top: `${20 + (i % 4) * 20}%`,
              animationDelay: `${i * 0.5}s`,
              animationDuration: `${3 + i * 0.5}s`,
            }}
          />
        ))}
      </div>
      
      {/* Subtle radial glow */}
      <div 
        className="absolute inset-0 opacity-30"
        style={{
          background: 'radial-gradient(ellipse at 30% 20%, rgba(var(--instance-accent-rgb, 255, 255, 255), 0.15) 0%, transparent 50%)',
        }}
      />
      <div 
        className="absolute inset-0 opacity-20"
        style={{
          background: 'radial-gradient(ellipse at 70% 80%, rgba(var(--instance-secondary-rgb, 255, 255, 255), 0.15) 0%, transparent 50%)',
        }}
      />
    </>
  );
}

/**
 * Minimal Background - Clean, professional look
 */
function MinimalBackground() {
  return (
    <>
      {/* Base gradient */}
      <div 
        className="absolute inset-0"
        style={{ background: 'var(--instance-banner-bg)' }}
      />
      
      {/* Subtle texture */}
      <div 
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />
      
      {/* Top shine accent */}
      <div 
        className="absolute top-0 left-0 right-0 h-px opacity-20"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--instance-accent-rgb, 255, 255, 255), 0.5), transparent)' }}
      />
    </>
  );
}

/**
 * Main InstanceBackground Component
 */
export function InstanceBackground({ 
  children, 
  type = 'animated',
  className = '',
  overlay = false,
  intensity = 'medium',
}: InstanceBackgroundProps) {
  const { instanceCode } = useInstanceTheme();

  const renderBackground = () => {
    switch (type) {
      case 'gradient':
        return <GradientBackground intensity={intensity} />;
      case 'pattern':
        return <PatternBackground intensity={intensity} />;
      case 'image':
        return <ImageBackground instanceCode={instanceCode} intensity={intensity} />;
      case 'animated':
        return <AnimatedBackground intensity={intensity} />;
      case 'minimal':
        return <MinimalBackground />;
      default:
        return <GradientBackground intensity={intensity} />;
    }
  };

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Background layer */}
      {renderBackground()}
      
      {/* Optional dark overlay for better content visibility */}
      {overlay && (
        <div className="absolute inset-0 bg-black/20" />
      )}
      
      {/* Content layer */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}

/**
 * Full-page background wrapper
 */
export function InstancePageBackground({ 
  children,
  type = 'animated',
  intensity = 'medium',
}: InstanceBackgroundProps) {
  return (
    <InstanceBackground 
      type={type} 
      intensity={intensity}
      className="min-h-screen"
    >
      {children}
    </InstanceBackground>
  );
}

/**
 * Hero section background
 */
export function InstanceHeroBackground({ 
  children,
  type = 'animated',
  className = '',
}: InstanceBackgroundProps) {
  return (
    <InstanceBackground 
      type={type} 
      intensity="medium"
      className={`py-12 md:py-20 ${className}`}
    >
      {children}
    </InstanceBackground>
  );
}

/**
 * Card/Section background with lighter treatment
 */
export function InstanceCardBackground({ 
  children,
  className = '',
}: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Light gradient background */}
      <div 
        className="absolute inset-0 opacity-5"
        style={{ background: 'var(--instance-banner-bg)' }}
      />
      {/* Subtle border accent */}
      <div 
        className="absolute top-0 left-0 right-0 h-1"
        style={{ background: 'var(--instance-banner-bg)' }}
      />
      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}

export default InstanceBackground;
