/**
 * VirtualList - Virtualized scrolling for long lists
 *
 * Uses @tanstack/react-virtual for efficient rendering of large datasets.
 * Only renders visible items + overscan buffer.
 *
 * Usage:
 *   <VirtualList
 *     items={users}
 *     estimateSize={64}
 *     renderItem={(item, index) => <UserRow key={item.id} user={item} />}
 *   />
 *
 * @version 1.0.0
 * @date 2026-02-01
 */

'use client';

import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';

export interface VirtualListProps<T> {
  items: T[];
  estimateSize: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  overscan?: number;
  className?: string;
  containerClassName?: string;
  gap?: number;
  getItemKey?: (index: number) => string | number;
  emptyMessage?: string;
}

export function VirtualList<T>({
  items,
  estimateSize,
  renderItem,
  overscan = 5,
  className,
  containerClassName,
  gap = 0,
  getItemKey,
  emptyMessage = 'No items',
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
    gap,
    getItemKey: getItemKey,
  });

  if (items.length === 0) {
    return (
      <div className={cn('text-center py-12 text-gray-500 dark:text-gray-400 text-sm', className)}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className={cn('overflow-auto', className)}
      role="list"
    >
      <div
        className={containerClassName}
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.key}
            role="listitem"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            {renderItem(items[virtualRow.index], virtualRow.index)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default VirtualList;
