"use client";

import { useRef, useState, useEffect, TouchEvent } from 'react';
import { Globe2, Target, Shield, MapPin, Users, Lock, Network, ChevronLeft, ChevronRight, LucideIcon } from 'lucide-react';

interface Feature {
  Icon: LucideIcon;
  title: string;
  desc: string;
  color: string;
  accent: string;
  iconColor: string;
}

const features: Feature[] = [
  { Icon: Network, title: "32-Nation Federation", desc: "Seamless identity federation across all NATO members", color: "from-blue-500/10 to-cyan-500/10", accent: "#009ab3", iconColor: "text-[#009ab3]" },
  { Icon: Globe2, title: "Multi-IdP Support", desc: "OIDC and SAML protocols with cross-border authentication", color: "from-sky-500/10 to-blue-500/10", accent: "#0ea5e9", iconColor: "text-sky-500" },
  { Icon: Target, title: "ABAC Authorization", desc: "Attribute-based access control with OPA policies", color: "from-purple-500/10 to-pink-500/10", accent: "#9333ea", iconColor: "text-purple-600" },
  { Icon: Shield, title: "Clearance-Based Access", desc: "UNCLASSIFIED to TOP_SECRET enforcement", color: "from-red-500/10 to-orange-500/10", accent: "#dc2626", iconColor: "text-red-600" },
  { Icon: MapPin, title: "Coalition Releasability", desc: "Country-based information sharing controls", color: "from-green-500/10 to-emerald-500/10", accent: "#79d85a", iconColor: "text-[#79d85a]" },
  { Icon: Users, title: "COI Management", desc: "Community of Interest tagging & access", color: "from-yellow-500/10 to-amber-500/10", accent: "#f59e0b", iconColor: "text-amber-500" },
  { Icon: Lock, title: "Encrypted Documents", desc: "KAS-enabled policy-bound encryption", color: "from-indigo-500/10 to-violet-500/10", accent: "#6366f1", iconColor: "text-indigo-600" },
];

/**
 * FeatureCarousel - Modern 2025 UX pattern
 *
 * Mobile: Horizontal swipeable carousel with snap points
 * Desktop: 3-column grid layout
 */
export function FeatureCarousel() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  // Check if mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Update active index on scroll
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !isMobile) return;

    const handleScroll = () => {
      const scrollLeft = container.scrollLeft;
      const cardWidth = container.offsetWidth * 0.85; // 85% width cards
      const gap = 16; // gap-4 = 16px
      const newIndex = Math.round(scrollLeft / (cardWidth + gap));
      setActiveIndex(Math.min(newIndex, features.length - 1));
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [isMobile]);

  // Touch handlers for swipe with haptic feedback
  const handleTouchStart = (e: TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe && activeIndex < features.length - 1) {
      // Haptic feedback if supported
      if ('vibrate' in navigator) {
        navigator.vibrate(10);
      }
      scrollToCard(activeIndex + 1);
    }
    if (isRightSwipe && activeIndex > 0) {
      // Haptic feedback if supported
      if ('vibrate' in navigator) {
        navigator.vibrate(10);
      }
      scrollToCard(activeIndex - 1);
    }
  };

  const scrollToCard = (index: number) => {
    const container = scrollRef.current;
    if (!container) return;

    const cardWidth = container.offsetWidth * 0.85;
    const gap = 16;
    container.scrollTo({
      left: index * (cardWidth + gap),
      behavior: 'smooth'
    });
    setActiveIndex(index);
  };

  // Desktop grid view
  if (!isMobile) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {features.map((feature, idx) => (
          <FeatureCard key={idx} feature={feature} index={idx} />
        ))}
      </div>
    );
  }

  // Mobile carousel view
  return (
    <div className="relative -mx-4 px-4">
      {/* Carousel container */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-4"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch'
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Spacer for centering first card */}
        <div className="flex-shrink-0 w-[7.5%]" />

        {features.map((feature, idx) => (
          <div
            key={idx}
            className="flex-shrink-0 w-[85%] snap-center"
          >
            <MobileFeatureCard feature={feature} index={idx} isActive={idx === activeIndex} />
          </div>
        ))}

        {/* Spacer for centering last card */}
        <div className="flex-shrink-0 w-[7.5%]" />
      </div>

      {/* Navigation arrows */}
      {activeIndex > 0 && (
        <button
          onClick={() => scrollToCard(activeIndex - 1)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center bg-white/90 backdrop-blur-sm rounded-full shadow-lg border border-gray-200 text-gray-600 hover:text-gray-900 transition-all hover:scale-110"
          aria-label="Previous"
        >
          <ChevronLeft size={20} />
        </button>
      )}
      {activeIndex < features.length - 1 && (
        <button
          onClick={() => scrollToCard(activeIndex + 1)}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center bg-white/90 backdrop-blur-sm rounded-full shadow-lg border border-gray-200 text-gray-600 hover:text-gray-900 transition-all hover:scale-110"
          aria-label="Next"
        >
          <ChevronRight size={20} />
        </button>
      )}

      {/* Dot indicators */}
      <div className="flex justify-center gap-2 mt-4">
        {features.map((_, idx) => (
          <button
            key={idx}
            onClick={() => scrollToCard(idx)}
            className={`transition-all duration-300 rounded-full ${
              idx === activeIndex
                ? 'w-8 h-2 bg-gradient-to-r from-[#009ab3] to-[#79d85a]'
                : 'w-2 h-2 bg-gray-300 hover:bg-gray-400'
            }`}
            aria-label={`Go to slide ${idx + 1}`}
          />
        ))}
      </div>

      {/* Swipe hint - shows briefly on first load */}
      <div className="absolute inset-x-0 bottom-12 flex justify-center pointer-events-none animate-pulse">
        <div className="text-xs text-gray-400 flex items-center gap-1 opacity-60 bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full">
          <ChevronLeft size={14} />
          <span className="font-medium">Swipe to explore</span>
          <ChevronRight size={14} />
        </div>
      </div>
    </div>
  );
}

/**
 * Desktop feature card
 */
function FeatureCard({ feature, index }: { feature: Feature; index: number }) {
  return (
    <div
      className="group relative p-4 bg-white rounded-xl border border-gray-200 hover:border-transparent transition-all duration-300 hover:shadow-xl hover:-translate-y-1 animate-fade-in-up overflow-hidden"
      style={{ animationDelay: `${0.9 + index * 0.08}s` }}
    >
      {/* Animated gradient background on hover */}
      <div className={`absolute inset-0 bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />

      {/* Shimmer effect */}
      <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out">
        <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12" />
      </div>

      {/* Content */}
      <div className="relative z-10">
        {/* Animated icon */}
        <div className="mb-3 flex items-center justify-center">
          <div className="relative w-14 h-14 flex items-center justify-center">
            <div
              className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-20 blur-lg transition-all duration-300"
              style={{ background: feature.accent }}
            />
            <feature.Icon
              className={`relative ${feature.iconColor} transition-all duration-300 group-hover:scale-110 group-hover:rotate-6`}
              size={32}
              strokeWidth={2}
            />
          </div>
        </div>

        {/* Title */}
        <h4 className="font-bold text-base text-gray-900 mb-1.5 text-center transition-all duration-300">
          <span className="bg-gradient-to-r from-gray-900 to-gray-900 group-hover:from-[#009ab3] group-hover:to-[#79d85a] bg-clip-text group-hover:text-transparent transition-all duration-300">
            {feature.title}
          </span>
        </h4>

        {/* Description */}
        <p className="text-xs text-gray-600 leading-relaxed text-center group-hover:text-gray-700 transition-colors duration-300">
          {feature.desc}
        </p>

        {/* Corner accent circle */}
        <div
          className="absolute -bottom-4 -right-4 w-12 h-12 rounded-full opacity-0 group-hover:opacity-5 transition-opacity duration-300"
          style={{ background: feature.accent }}
        />
      </div>
    </div>
  );
}

/**
 * Mobile feature card - optimized for touch
 */
function MobileFeatureCard({ feature, index, isActive }: { feature: Feature; index: number; isActive: boolean }) {
  return (
    <div
      className={`relative p-6 rounded-2xl border transition-all duration-500 overflow-hidden ${
        isActive
          ? 'bg-white shadow-2xl border-transparent scale-100'
          : 'bg-white/80 shadow-lg border-gray-200 scale-95 opacity-80'
      }`}
    >
      {/* Gradient background - always visible on mobile */}
      <div className={`absolute inset-0 bg-gradient-to-br ${feature.color} transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-50'}`} />

      {/* Animated border glow */}
      {isActive && (
        <div
          className="absolute inset-0 rounded-2xl opacity-30"
          style={{
            boxShadow: `0 0 30px ${feature.accent}40, inset 0 0 30px ${feature.accent}10`
          }}
        />
      )}

      {/* Content */}
      <div className="relative z-10">
        {/* Icon with animated ring */}
        <div className="mb-4 flex items-center justify-center">
          <div className="relative">
            {/* Pulsing ring */}
            {isActive && (
              <div
                className="absolute inset-0 rounded-full animate-ping opacity-20"
                style={{ background: feature.accent }}
              />
            )}
            {/* Icon container */}
            <div
              className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-500 ${
                isActive ? 'rotate-3 scale-110' : ''
              }`}
              style={{
                background: `linear-gradient(135deg, ${feature.accent}20, ${feature.accent}05)`,
                border: `1px solid ${feature.accent}30`
              }}
            >
              <feature.Icon
                className={feature.iconColor}
                size={32}
                strokeWidth={2}
              />
            </div>
          </div>
        </div>

        {/* Title */}
        <h4 className={`font-bold text-lg text-center mb-2 transition-all duration-300 ${
          isActive ? 'text-gray-900' : 'text-gray-700'
        }`}>
          {feature.title}
        </h4>

        {/* Description */}
        <p className={`text-sm leading-relaxed text-center transition-all duration-300 ${
          isActive ? 'text-gray-700' : 'text-gray-500'
        }`}>
          {feature.desc}
        </p>

        {/* Feature tags */}
        {isActive && (
          <div className="mt-4 flex justify-center gap-2 animate-fade-in">
            <span
              className="px-3 py-1 rounded-full text-xs font-medium text-white"
              style={{ background: feature.accent }}
            >
              NATO Compliant
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
              Zero Trust
            </span>
          </div>
        )}
      </div>

      {/* Corner decorations */}
      <div
        className={`absolute -top-8 -right-8 w-24 h-24 rounded-full transition-opacity duration-500 ${
          isActive ? 'opacity-10' : 'opacity-5'
        }`}
        style={{ background: feature.accent }}
      />
      <div
        className={`absolute -bottom-6 -left-6 w-20 h-20 rounded-full transition-opacity duration-500 ${
          isActive ? 'opacity-10' : 'opacity-5'
        }`}
        style={{ background: feature.accent }}
      />
    </div>
  );
}

export default FeatureCarousel;
