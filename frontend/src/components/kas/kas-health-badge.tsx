'use client';

/**
 * KAS Health Badge Component
 * 
 * Real-time health indicator with pulse animation for active KAS instances.
 * Shows status, circuit breaker state, and last heartbeat.
 */

import { Activity, AlertCircle, Clock, Pause, CheckCircle2 } from 'lucide-react';
import { isHeartbeatStale, getTimeSinceHeartbeat, getStatusColorClass, getCircuitBreakerColorClass } from '@/lib/api/kas';

interface KASHealthBadgeProps {
  status: 'active' | 'pending' | 'suspended' | 'offline';
  lastHeartbeat: string | null;
  circuitBreakerState?: 'CLOSED' | 'OPEN' | 'HALF_OPEN' | 'UNKNOWN';
  showCircuitBreaker?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function KASHealthBadge({
  status,
  lastHeartbeat,
  circuitBreakerState = 'UNKNOWN',
  showCircuitBreaker = false,
  size = 'md'
}: KASHealthBadgeProps) {
  const isStale = isHeartbeatStale(lastHeartbeat);
  const timeSince = getTimeSinceHeartbeat(lastHeartbeat);
  
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-1.5'
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  const StatusIcon = () => {
    switch (status) {
      case 'active':
        return <Activity className={`${iconSizes[size]} ${isStale ? '' : 'animate-pulse'}`} />;
      case 'pending':
        return <Clock className={iconSizes[size]} />;
      case 'suspended':
        return <Pause className={iconSizes[size]} />;
      case 'offline':
        return <AlertCircle className={iconSizes[size]} />;
      default:
        return <Activity className={iconSizes[size]} />;
    }
  };

  const CircuitBreakerIcon = () => {
    switch (circuitBreakerState) {
      case 'CLOSED':
        return <CheckCircle2 className={iconSizes[size]} />;
      case 'HALF_OPEN':
        return <Clock className={iconSizes[size]} />;
      case 'OPEN':
        return <AlertCircle className={iconSizes[size]} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-1">
      {/* Main status badge */}
      <div className={`
        inline-flex items-center gap-1.5 rounded-full font-semibold border
        ${sizeClasses[size]}
        ${getStatusColorClass(status)}
        ${status === 'active' && !isStale ? 'ring-2 ring-green-200 ring-offset-1' : ''}
      `}>
        <StatusIcon />
        <span className="uppercase">{status}</span>
      </div>

      {/* Heartbeat indicator */}
      {lastHeartbeat && (
        <div className={`
          flex items-center gap-1 text-gray-500
          ${size === 'sm' ? 'text-xs' : 'text-xs'}
        `}>
          <Clock className="w-3 h-3" />
          <span>{timeSince}</span>
          {isStale && status === 'active' && (
            <span className="text-yellow-600 font-medium">(stale)</span>
          )}
        </div>
      )}

      {/* Circuit breaker badge */}
      {showCircuitBreaker && circuitBreakerState !== 'UNKNOWN' && (
        <div className={`
          inline-flex items-center gap-1 rounded-full text-xs px-2 py-0.5
          ${getCircuitBreakerColorClass(circuitBreakerState)}
        `}>
          <CircuitBreakerIcon />
          <span>CB: {circuitBreakerState}</span>
        </div>
      )}
    </div>
  );
}

export default KASHealthBadge;
