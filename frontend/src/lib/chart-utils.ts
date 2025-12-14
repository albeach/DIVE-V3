/**
 * Chart Optimization Utilities
 * 
 * Performance utilities for chart rendering:
 * - Data downsampling
 * - Memoization helpers
 * - Color palettes
 * - Formatting helpers
 */

import { useMemo, useCallback, useRef, useEffect } from 'react';

// ============================================
// Types
// ============================================

export interface DataPoint {
  x: number | string | Date;
  y: number;
  [key: string]: unknown;
}

export interface ChartConfig {
  width?: number;
  height?: number;
  margin?: { top: number; right: number; bottom: number; left: number };
  animate?: boolean;
  responsive?: boolean;
}

// ============================================
// Data Optimization
// ============================================

/**
 * Downsample data for large datasets
 * Uses Largest-Triangle-Three-Buckets algorithm
 */
export function downsampleData(
  data: DataPoint[],
  threshold: number
): DataPoint[] {
  if (data.length <= threshold) return data;

  const bucketSize = (data.length - 2) / (threshold - 2);
  const sampled: DataPoint[] = [data[0]]; // Always keep first point

  for (let i = 0; i < threshold - 2; i++) {
    const bucketStart = Math.floor((i + 1) * bucketSize);
    const bucketEnd = Math.floor((i + 2) * bucketSize);
    const bucket = data.slice(bucketStart, bucketEnd);

    if (bucket.length === 0) continue;

    // Find point with largest triangle area
    const lastPoint = sampled[sampled.length - 1];
    const avgX = bucket.reduce((sum, p) => sum + Number(p.x), 0) / bucket.length;
    const avgY = bucket.reduce((sum, p) => sum + p.y, 0) / bucket.length;

    let maxArea = -1;
    let maxPoint = bucket[0];

    for (const point of bucket) {
      const area = Math.abs(
        (Number(lastPoint.x) - avgX) * (point.y - lastPoint.y) -
        (Number(lastPoint.x) - Number(point.x)) * (avgY - lastPoint.y)
      );
      if (area > maxArea) {
        maxArea = area;
        maxPoint = point;
      }
    }

    sampled.push(maxPoint);
  }

  sampled.push(data[data.length - 1]); // Always keep last point
  return sampled;
}

/**
 * Aggregate data points by time bucket
 */
export function aggregateByTime(
  data: DataPoint[],
  interval: 'minute' | 'hour' | 'day' | 'week' | 'month',
  aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count' = 'avg'
): DataPoint[] {
  const buckets = new Map<string, number[]>();

  for (const point of data) {
    const date = new Date(point.x);
    let key: string;

    switch (interval) {
      case 'minute':
        key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}`;
        break;
      case 'hour':
        key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
        break;
      case 'day':
        key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        break;
      case 'week':
        const week = Math.floor(date.getDate() / 7);
        key = `${date.getFullYear()}-${date.getMonth()}-${week}`;
        break;
      case 'month':
        key = `${date.getFullYear()}-${date.getMonth()}`;
        break;
    }

    if (!buckets.has(key)) {
      buckets.set(key, []);
    }
    buckets.get(key)!.push(point.y);
  }

  const result: DataPoint[] = [];

  buckets.forEach((values, key) => {
    let y: number;

    switch (aggregation) {
      case 'sum':
        y = values.reduce((a, b) => a + b, 0);
        break;
      case 'avg':
        y = values.reduce((a, b) => a + b, 0) / values.length;
        break;
      case 'min':
        y = Math.min(...values);
        break;
      case 'max':
        y = Math.max(...values);
        break;
      case 'count':
        y = values.length;
        break;
    }

    result.push({ x: key, y });
  });

  return result.sort((a, b) => String(a.x).localeCompare(String(b.x)));
}

/**
 * Smooth data using moving average
 */
export function smoothData(data: DataPoint[], windowSize: number = 3): DataPoint[] {
  if (data.length < windowSize) return data;

  return data.map((point, index) => {
    const start = Math.max(0, index - Math.floor(windowSize / 2));
    const end = Math.min(data.length, start + windowSize);
    const window = data.slice(start, end);
    const avg = window.reduce((sum, p) => sum + p.y, 0) / window.length;

    return { ...point, y: avg };
  });
}

// ============================================
// React Hooks
// ============================================

/**
 * Memoized chart data with automatic downsampling
 */
export function useOptimizedChartData(
  data: DataPoint[],
  options: {
    maxPoints?: number;
    smooth?: boolean;
    smoothWindow?: number;
  } = {}
) {
  const { maxPoints = 200, smooth = false, smoothWindow = 3 } = options;

  return useMemo(() => {
    let result = data;

    if (data.length > maxPoints) {
      result = downsampleData(result, maxPoints);
    }

    if (smooth) {
      result = smoothData(result, smoothWindow);
    }

    return result;
  }, [data, maxPoints, smooth, smoothWindow]);
}

/**
 * Debounced chart resize handler
 */
export function useChartResize(
  callback: (dimensions: { width: number; height: number }) => void,
  delay: number = 150
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleResize = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callback({
          width: container.clientWidth,
          height: container.clientHeight,
        });
      }, delay);
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(container);

    return () => {
      observer.disconnect();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [callback, delay]);

  return containerRef;
}

/**
 * Lazy chart loading - only render when visible
 */
export function useChartVisibility(
  options: IntersectionObserverInit = { threshold: 0.1 }
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      options
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [options]);

  return { containerRef, isVisible };
}

// Need to import useState for the hook above
import { useState } from 'react';

// ============================================
// Color Palettes
// ============================================

export const chartColors = {
  // Primary palette
  primary: ['#3B82F6', '#2563EB', '#1D4ED8', '#1E40AF', '#1E3A8A'],
  
  // Sequential palettes
  blue: ['#EFF6FF', '#BFDBFE', '#60A5FA', '#2563EB', '#1E40AF'],
  green: ['#ECFDF5', '#A7F3D0', '#34D399', '#059669', '#047857'],
  amber: ['#FFFBEB', '#FDE68A', '#FBBF24', '#D97706', '#B45309'],
  red: ['#FEF2F2', '#FECACA', '#F87171', '#DC2626', '#B91C1C'],
  
  // Categorical palette
  categorical: [
    '#3B82F6', // Blue
    '#10B981', // Emerald
    '#F59E0B', // Amber
    '#EF4444', // Red
    '#8B5CF6', // Violet
    '#EC4899', // Pink
    '#06B6D4', // Cyan
    '#84CC16', // Lime
  ],
  
  // Status colors
  status: {
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
    neutral: '#6B7280',
  },
  
  // Dark mode variants
  dark: {
    categorical: [
      '#60A5FA', // Blue
      '#34D399', // Emerald
      '#FBBF24', // Amber
      '#F87171', // Red
      '#A78BFA', // Violet
      '#F472B6', // Pink
      '#22D3EE', // Cyan
      '#A3E635', // Lime
    ],
  },
};

/**
 * Get color for a value on a gradient scale
 */
export function getGradientColor(
  value: number,
  min: number,
  max: number,
  palette: string[] = chartColors.blue
): string {
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const index = Math.floor(normalized * (palette.length - 1));
  return palette[index];
}

// ============================================
// Formatting Helpers
// ============================================

export const formatters = {
  /**
   * Format number with abbreviated suffix
   */
  abbreviate: (value: number): string => {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toString();
  },

  /**
   * Format percentage
   */
  percent: (value: number, decimals: number = 1): string => {
    return `${value.toFixed(decimals)}%`;
  },

  /**
   * Format duration in ms to human readable
   */
  duration: (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  },

  /**
   * Format date for chart axis
   */
  date: (value: string | Date, format: 'short' | 'medium' | 'long' = 'short'): string => {
    const date = new Date(value);
    
    switch (format) {
      case 'short':
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      case 'medium':
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric' });
      case 'long':
        return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }
  },

  /**
   * Format bytes to human readable
   */
  bytes: (bytes: number): string => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unitIndex = 0;
    let value = bytes;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }

    return `${value.toFixed(1)} ${units[unitIndex]}`;
  },
};

// ============================================
// Chart Animations
// ============================================

export const chartAnimations = {
  /**
   * Stagger animation for bar charts
   */
  barStagger: (index: number, total: number) => ({
    initial: { scaleY: 0, originY: 1 },
    animate: { scaleY: 1 },
    transition: { delay: index * (0.3 / total), duration: 0.4, ease: 'easeOut' },
  }),

  /**
   * Line draw animation
   */
  lineDrawn: {
    initial: { pathLength: 0 },
    animate: { pathLength: 1 },
    transition: { duration: 1, ease: 'easeInOut' },
  },

  /**
   * Fade in animation
   */
  fadeIn: (delay: number = 0) => ({
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { delay, duration: 0.3 },
  }),

  /**
   * Pop in animation for points
   */
  popIn: (index: number) => ({
    initial: { scale: 0 },
    animate: { scale: 1 },
    transition: { delay: index * 0.05, type: 'spring', stiffness: 500, damping: 20 },
  }),
};

// ============================================
// Export
// ============================================

export default {
  downsampleData,
  aggregateByTime,
  smoothData,
  useOptimizedChartData,
  useChartResize,
  useChartVisibility,
  chartColors,
  getGradientColor,
  formatters,
  chartAnimations,
};

