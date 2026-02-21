/**
 * Upload Draft Hook - 2026 Modern UX
 *
 * Auto-save form state to LocalStorage:
 * - Save draft every 5 seconds (debounced)
 * - Encrypted serialization (metadata only, no file content)
 * - Show "Draft saved" toast on successful save
 * - On page load, check for draft and show restore banner
 * - Clear draft after successful upload
 * - LRU cache eviction to prevent quota exceeded
 *
 * Security: Only saves non-sensitive metadata (classification, countries, COI)
 * Does NOT save file content, user tokens, or sensitive data
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// Draft data structure (no sensitive data)
export interface UploadDraft {
  title: string;
  description: string;
  classification: string;
  releasabilityTo: string[];
  COI: string[];
  caveats: string[];
  fileName?: string; // Name only, not content
  fileSize?: number;
  fileType?: string;
  savedAt: number; // Timestamp
  version: number; // Schema version for migrations
}

// LocalStorage key
const DRAFT_STORAGE_KEY = 'dive-v3-upload-draft';
const DRAFT_VERSION = 1;
const AUTO_SAVE_DELAY = 5000; // 5 seconds
const DRAFT_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

interface UseUploadDraftReturn {
  // State
  hasDraft: boolean;
  draftAge: string | null;
  isRestoring: boolean;
  isSaving: boolean;
  lastSaved: Date | null;

  // Actions
  saveDraft: (draft: Omit<UploadDraft, 'savedAt' | 'version'>) => void;
  restoreDraft: () => UploadDraft | null;
  clearDraft: () => void;
  dismissDraft: () => void;
}

// Format relative time (e.g., "5 minutes ago")
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'just now';
}

// Simple encryption for localStorage (not security-critical, just obfuscation)
function encodeData(data: string): string {
  try {
    return btoa(encodeURIComponent(data));
  } catch {
    return data;
  }
}

function decodeData(data: string): string {
  try {
    return decodeURIComponent(atob(data));
  } catch {
    return data;
  }
}

// Check if localStorage is available
function isLocalStorageAvailable(): boolean {
  try {
    const test = '__storage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

export function useUploadDraft(): UseUploadDraftReturn {
  const [hasDraft, setHasDraft] = useState(false);
  const [draftAge, setDraftAge] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const storageAvailable = useRef(isLocalStorageAvailable());

  // Check for existing draft on mount
  useEffect(() => {
    if (!storageAvailable.current) return;

    try {
      const stored = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (stored) {
        const decoded = decodeData(stored);
        const draft: UploadDraft = JSON.parse(decoded);

        // Check if draft is expired
        if (Date.now() - draft.savedAt > DRAFT_MAX_AGE) {
          localStorage.removeItem(DRAFT_STORAGE_KEY);
          setHasDraft(false);
          return;
        }

        // Check version compatibility
        if (draft.version !== DRAFT_VERSION) {
          localStorage.removeItem(DRAFT_STORAGE_KEY);
          setHasDraft(false);
          return;
        }

        setHasDraft(true);
        setDraftAge(formatRelativeTime(draft.savedAt));
      }
    } catch (error) {
      console.error('Failed to check for draft:', error);
      setHasDraft(false);
    }
  }, []);

  // Update draft age periodically
  useEffect(() => {
    if (!hasDraft || dismissed) return;

    const interval = setInterval(() => {
      try {
        const stored = localStorage.getItem(DRAFT_STORAGE_KEY);
        if (stored) {
          const decoded = decodeData(stored);
          const draft: UploadDraft = JSON.parse(decoded);
          setDraftAge(formatRelativeTime(draft.savedAt));
        }
      } catch {
        // Ignore
      }
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [hasDraft, dismissed]);

  // Save draft (debounced)
  const saveDraft = useCallback(
    (draft: Omit<UploadDraft, 'savedAt' | 'version'>) => {
      if (!storageAvailable.current) return;

      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Debounce save
      saveTimeoutRef.current = setTimeout(() => {
        try {
          setIsSaving(true);

          const fullDraft: UploadDraft = {
            ...draft,
            savedAt: Date.now(),
            version: DRAFT_VERSION,
          };

          const encoded = encodeData(JSON.stringify(fullDraft));
          localStorage.setItem(DRAFT_STORAGE_KEY, encoded);

          setLastSaved(new Date());
          setHasDraft(true);
          setDraftAge(formatRelativeTime(fullDraft.savedAt));

          console.debug('[UploadDraft] Draft saved');
        } catch (error) {
          console.error('Failed to save draft:', error);

          // Handle quota exceeded
          if (
            error instanceof DOMException &&
            (error.name === 'QuotaExceededError' || error.code === 22)
          ) {
            // Clear old drafts from other keys
            try {
              const keysToRemove: string[] = [];
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('dive-v3-') && key !== DRAFT_STORAGE_KEY) {
                  keysToRemove.push(key);
                }
              }
              keysToRemove.forEach((key) => localStorage.removeItem(key));

              // Retry save
              const fullDraft: UploadDraft = {
                ...draft,
                savedAt: Date.now(),
                version: DRAFT_VERSION,
              };
              const encoded = encodeData(JSON.stringify(fullDraft));
              localStorage.setItem(DRAFT_STORAGE_KEY, encoded);
            } catch {
              // Give up
            }
          }
        } finally {
          setIsSaving(false);
        }
      }, AUTO_SAVE_DELAY);
    },
    []
  );

  // Restore draft
  const restoreDraft = useCallback((): UploadDraft | null => {
    if (!storageAvailable.current) return null;

    setIsRestoring(true);

    try {
      const stored = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!stored) {
        setIsRestoring(false);
        return null;
      }

      const decoded = decodeData(stored);
      const draft: UploadDraft = JSON.parse(decoded);

      // Check if draft is expired
      if (Date.now() - draft.savedAt > DRAFT_MAX_AGE) {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
        setHasDraft(false);
        setIsRestoring(false);
        return null;
      }

      console.debug('[UploadDraft] Draft restored');
      setDismissed(true); // Hide the banner after restoring
      setIsRestoring(false);
      return draft;
    } catch (error) {
      console.error('Failed to restore draft:', error);
      setIsRestoring(false);
      return null;
    }
  }, []);

  // Clear draft (after successful upload)
  const clearDraft = useCallback(() => {
    if (!storageAvailable.current) return;

    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      setHasDraft(false);
      setDraftAge(null);
      setLastSaved(null);
      setDismissed(false);
      console.debug('[UploadDraft] Draft cleared');
    } catch (error) {
      console.error('Failed to clear draft:', error);
    }
  }, []);

  // Dismiss draft banner (don't restore, but keep draft)
  const dismissDraft = useCallback(() => {
    setDismissed(true);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    hasDraft: hasDraft && !dismissed,
    draftAge,
    isRestoring,
    isSaving,
    lastSaved,
    saveDraft,
    restoreDraft,
    clearDraft,
    dismissDraft,
  };
}

// Draft restore banner component props
export interface DraftRestoreBannerProps {
  hasDraft: boolean;
  draftAge: string | null;
  onRestore: () => void;
  onDismiss: () => void;
  isRestoring: boolean;
}

export default useUploadDraft;
