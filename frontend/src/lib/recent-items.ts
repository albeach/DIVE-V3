/**
 * Recent Items Tracking - Phase 3
 * 
 * Features:
 * - Track last 10 viewed items per user
 * - Store in localStorage (client-side)
 * - Support documents and policies
 * - Automatic deduplication
 */

const STORAGE_KEY = 'dive-recent-items';
const MAX_ITEMS = 10;

export interface RecentItem {
  id: string;
  type: 'document' | 'policy';
  title: string;
  classification?: string;
  timestamp: number;
}

/**
 * Add an item to recent items list
 * Automatically removes duplicates and limits to MAX_ITEMS
 */
export function addRecentItem(item: Omit<RecentItem, 'timestamp'>): void {
  if (typeof window === 'undefined') return;

  try {
    const recent = getRecentItems();
    const newItem: RecentItem = { ...item, timestamp: Date.now() };
    
    // Remove duplicates (same id and type)
    const filtered = recent.filter((r) => !(r.id === item.id && r.type === item.type));
    
    // Add to start, limit to MAX_ITEMS
    const updated = [newItem, ...filtered].slice(0, MAX_ITEMS);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    // Handle quota exceeded or other localStorage errors
    console.error('Failed to save recent item:', error);
  }
}

/**
 * Get all recent items, sorted by timestamp (newest first)
 */
export function getRecentItems(): RecentItem[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    
    const items = JSON.parse(stored) as RecentItem[];
    
    // Validate structure
    if (!Array.isArray(items)) return [];
    
    // Sort by timestamp (newest first)
    return items.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('Failed to get recent items:', error);
    return [];
  }
}

/**
 * Clear all recent items
 */
export function clearRecentItems(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear recent items:', error);
  }
}

/**
 * Get recent items of a specific type
 */
export function getRecentItemsByType(type: 'document' | 'policy'): RecentItem[] {
  return getRecentItems().filter((item) => item.type === type);
}

/**
 * Remove a specific recent item
 */
export function removeRecentItem(id: string, type: 'document' | 'policy'): void {
  if (typeof window === 'undefined') return;

  try {
    const recent = getRecentItems();
    const updated = recent.filter((item) => !(item.id === id && item.type === type));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to remove recent item:', error);
  }
}


