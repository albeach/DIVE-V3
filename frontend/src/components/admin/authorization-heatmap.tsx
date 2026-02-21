/**
 * AuthorizationHeatmap Component
 *
 * 24x7 grid (hours x days) showing authorization decision patterns.
 * Color: green (allow) -> red (deny) with opacity for volume.
 * CSS Grid + custom rendering.
 *
 * @version 1.0.0
 * @date 2026-01-31
 */

'use client';

import React, { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

// ============================================
// Types
// ============================================

export interface HeatmapCell {
  /** Hour (0-23) */
  hour: number;
  /** Day (0=Monday, 6=Sunday) */
  day: number;
  /** Total authorization requests */
  total: number;
  /** Number of allowed requests */
  allowed: number;
  /** Number of denied requests */
  denied: number;
}

export interface AuthorizationHeatmapProps {
  data: HeatmapCell[];
  className?: string;
  onCellClick?: (cell: HeatmapCell) => void;
}

// ============================================
// Constants
// ============================================

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// ============================================
// Component
// ============================================

export function AuthorizationHeatmap({ data, className, onCellClick }: AuthorizationHeatmapProps) {
  const prefersReducedMotion = useReducedMotion();
  const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Build a lookup map: `${day}-${hour}` -> cell
  const cellMap = useMemo(() => {
    const map = new Map<string, HeatmapCell>();
    data.forEach(cell => map.set(`${cell.day}-${cell.hour}`, cell));
    return map;
  }, [data]);

  // Find max total for opacity scaling
  const maxTotal = useMemo(() => Math.max(1, ...data.map(c => c.total)), [data]);

  function getCellColor(cell: HeatmapCell | undefined): string {
    if (!cell || cell.total === 0) {
      return 'bg-gray-100 dark:bg-slate-800';
    }

    const denyRatio = cell.denied / cell.total;
    const opacity = Math.max(0.2, cell.total / maxTotal);

    // Green (mostly allowed) -> Yellow (mixed) -> Red (mostly denied)
    if (denyRatio < 0.1) {
      return `bg-emerald-500`;
    } else if (denyRatio < 0.3) {
      return `bg-emerald-400`;
    } else if (denyRatio < 0.5) {
      return `bg-amber-400`;
    } else if (denyRatio < 0.7) {
      return `bg-orange-400`;
    } else {
      return `bg-red-500`;
    }
  }

  function getCellOpacity(cell: HeatmapCell | undefined): number {
    if (!cell || cell.total === 0) return 0.3;
    return Math.max(0.25, Math.min(1, cell.total / maxTotal));
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Legend */}
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-3">
        <span className="font-medium">Authorization Decisions by Time</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-emerald-500" />
            <span>Allow</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-amber-400" />
            <span>Mixed</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-red-500" />
            <span>Deny</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-gray-200 dark:bg-slate-700" />
            <span>No data</span>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="relative overflow-x-auto">
        <div className="inline-grid" style={{ gridTemplateColumns: `48px repeat(24, 1fr)`, gap: '2px' }}>
          {/* Hour labels (top row) */}
          <div /> {/* Empty corner cell */}
          {HOURS.map(h => (
            <div key={`h-${h}`} className="text-[10px] text-gray-400 dark:text-gray-500 text-center font-mono leading-4">
              {h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`}
            </div>
          ))}

          {/* Data rows */}
          {DAYS.map((day, dayIdx) => (
            <React.Fragment key={day}>
              {/* Day label */}
              <div className="text-xs text-gray-500 dark:text-gray-400 font-medium flex items-center pr-2 justify-end">
                {day}
              </div>

              {/* Hour cells */}
              {HOURS.map(hour => {
                const cell = cellMap.get(`${dayIdx}-${hour}`);
                const color = getCellColor(cell);
                const opacity = getCellOpacity(cell);

                return (
                  <motion.div
                    key={`${dayIdx}-${hour}`}
                    className={cn(
                      'rounded-[3px] cursor-pointer min-w-[16px] h-[22px]',
                      color,
                      'hover:ring-2 hover:ring-indigo-400 hover:ring-offset-1 dark:hover:ring-offset-slate-900',
                      'transition-shadow',
                    )}
                    style={{ opacity }}
                    whileHover={prefersReducedMotion ? undefined : { scale: 1.3 }}
                    onMouseEnter={(e) => {
                      if (cell) {
                        setHoveredCell(cell);
                        const rect = (e.target as HTMLElement).getBoundingClientRect();
                        setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top - 8 });
                      }
                    }}
                    onMouseLeave={() => setHoveredCell(null)}
                    onClick={() => cell && onCellClick?.(cell)}
                    role="gridcell"
                    aria-label={cell
                      ? `${day} ${hour}:00 - ${cell.total} requests, ${cell.allowed} allowed, ${cell.denied} denied`
                      : `${day} ${hour}:00 - no data`
                    }
                  />
                );
              })}
            </React.Fragment>
          ))}
        </div>

        {/* Tooltip */}
        {hoveredCell && (
          <div
            className="fixed z-50 pointer-events-none"
            style={{
              left: tooltipPos.x,
              top: tooltipPos.y,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <div className="bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
              <div className="font-semibold mb-1">
                {DAYS[hoveredCell.day]} {String(hoveredCell.hour).padStart(2, '0')}:00
              </div>
              <div className="flex items-center gap-3">
                <span className="text-emerald-400">{hoveredCell.allowed} allow</span>
                <span className="text-red-400">{hoveredCell.denied} deny</span>
                <span className="text-gray-300">{hoveredCell.total} total</span>
              </div>
              {/* Arrow */}
              <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 bg-gray-900 dark:bg-gray-700 rotate-45" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Generate sample heatmap data for demo/testing purposes
 */
export function generateSampleHeatmapData(): HeatmapCell[] {
  const cells: HeatmapCell[] = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      // Simulate realistic patterns: more traffic during business hours
      const isBusinessHour = hour >= 8 && hour <= 18;
      const isWeekday = day < 5;
      const baseTraffic = isWeekday
        ? (isBusinessHour ? 150 + Math.random() * 300 : 20 + Math.random() * 60)
        : (isBusinessHour ? 30 + Math.random() * 80 : 5 + Math.random() * 20);

      const total = Math.round(baseTraffic);
      // Higher deny rates during off-hours (suspicious activity)
      const denyRate = isBusinessHour && isWeekday
        ? 0.02 + Math.random() * 0.08
        : 0.1 + Math.random() * 0.3;
      const denied = Math.round(total * denyRate);
      const allowed = total - denied;

      cells.push({ hour, day, total, allowed, denied });
    }
  }
  return cells;
}
