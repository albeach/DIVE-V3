/**
 * Upload History Hook - 2026 Modern UX
 *
 * Undo/redo system for form changes:
 * - Track state snapshots after significant changes
 * - Max 20 history steps (configurable)
 * - Keyboard shortcuts: Cmd/Ctrl + Z (undo), Cmd/Ctrl + Shift + Z (redo)
 * - Show subtle toast: "Undone: Classification changed to SECRET"
 *
 * Tracks:
 * - Classification changes
 * - Country selections
 * - COI selections
 * - Caveat changes
 */

import { useCallback, useRef, useMemo, useState } from 'react';

// Form state that gets tracked
export interface UploadFormState {
  classification: string;
  releasabilityTo: string[];
  COI: string[];
  caveats: string[];
}

// History entry with action description
interface HistoryEntry {
  state: UploadFormState;
  action: string; // Human-readable action description
  timestamp: number;
}

interface UseUploadHistoryOptions {
  maxHistorySize?: number;
  onUndo?: (action: string) => void;
  onRedo?: (action: string) => void;
}

interface UseUploadHistoryReturn {
  // Current history state
  canUndo: boolean;
  canRedo: boolean;
  historyLength: number;
  undoStackLength: number;
  redoStackLength: number;

  // Actions
  pushState: (state: UploadFormState, action: string) => void;
  undo: () => UploadFormState | null;
  redo: () => UploadFormState | null;
  clearHistory: () => void;

  // Get current/previous state
  getCurrentState: () => UploadFormState | null;
  getPreviousAction: () => string | null;
  getNextAction: () => string | null;
}

// Default max history size
const DEFAULT_MAX_HISTORY = 20;

// Detect significant state changes
function hasSignificantChange(
  prevState: UploadFormState | null,
  newState: UploadFormState
): boolean {
  if (!prevState) return true;

  // Classification changed
  if (prevState.classification !== newState.classification) return true;

  // Countries changed
  if (prevState.releasabilityTo.length !== newState.releasabilityTo.length) return true;
  if (!prevState.releasabilityTo.every((c) => newState.releasabilityTo.includes(c))) return true;

  // COI changed
  if (prevState.COI.length !== newState.COI.length) return true;
  if (!prevState.COI.every((c) => newState.COI.includes(c))) return true;

  // Caveats changed
  if (prevState.caveats.length !== newState.caveats.length) return true;
  if (!prevState.caveats.every((c) => newState.caveats.includes(c))) return true;

  return false;
}

// Generate action description from state diff
function generateActionDescription(
  prevState: UploadFormState | null,
  newState: UploadFormState
): string {
  if (!prevState) return 'Initial state';

  // Classification changed
  if (prevState.classification !== newState.classification) {
    return `Classification changed to ${newState.classification}`;
  }

  // Countries changed
  const addedCountries = newState.releasabilityTo.filter(
    (c) => !prevState.releasabilityTo.includes(c)
  );
  const removedCountries = prevState.releasabilityTo.filter(
    (c) => !newState.releasabilityTo.includes(c)
  );

  if (addedCountries.length > 0) {
    return `Added ${addedCountries.length === 1 ? addedCountries[0] : `${addedCountries.length} countries`}`;
  }
  if (removedCountries.length > 0) {
    return `Removed ${removedCountries.length === 1 ? removedCountries[0] : `${removedCountries.length} countries`}`;
  }

  // COI changed
  const addedCOI = newState.COI.filter((c) => !prevState.COI.includes(c));
  const removedCOI = prevState.COI.filter((c) => !newState.COI.includes(c));

  if (addedCOI.length > 0) {
    return `Added COI: ${addedCOI.join(', ')}`;
  }
  if (removedCOI.length > 0) {
    return `Removed COI: ${removedCOI.join(', ')}`;
  }

  // Caveats changed
  const addedCaveats = newState.caveats.filter((c) => !prevState.caveats.includes(c));
  const removedCaveats = prevState.caveats.filter((c) => !newState.caveats.includes(c));

  if (addedCaveats.length > 0) {
    return `Added caveat: ${addedCaveats.join(', ')}`;
  }
  if (removedCaveats.length > 0) {
    return `Removed caveat: ${removedCaveats.join(', ')}`;
  }

  return 'Form updated';
}

// Deep clone state to prevent mutation issues
function cloneState(state: UploadFormState): UploadFormState {
  return {
    classification: state.classification,
    releasabilityTo: [...state.releasabilityTo],
    COI: [...state.COI],
    caveats: [...state.caveats],
  };
}

export function useUploadHistory(options: UseUploadHistoryOptions = {}): UseUploadHistoryReturn {
  const { maxHistorySize = DEFAULT_MAX_HISTORY, onUndo, onRedo } = options;

  // History stacks
  const undoStack = useRef<HistoryEntry[]>([]);
  const redoStack = useRef<HistoryEntry[]>([]);

  // Force re-render when stacks change
  const [, setUpdateTrigger] = useState(0);
  const forceUpdate = useCallback(() => setUpdateTrigger((n) => n + 1), []);

  // Push new state to history
  const pushState = useCallback(
    (state: UploadFormState, action?: string) => {
      const prevState = undoStack.current.length > 0
        ? undoStack.current[undoStack.current.length - 1].state
        : null;

      // Only push if there's a significant change
      if (!hasSignificantChange(prevState, state)) {
        return;
      }

      // Generate action description if not provided
      const actionDescription = action || generateActionDescription(prevState, state);

      // Create new history entry
      const entry: HistoryEntry = {
        state: cloneState(state),
        action: actionDescription,
        timestamp: Date.now(),
      };

      // Push to undo stack
      undoStack.current.push(entry);

      // Trim if exceeds max size
      if (undoStack.current.length > maxHistorySize) {
        undoStack.current.shift();
      }

      // Clear redo stack (new action invalidates redo history)
      redoStack.current = [];

      forceUpdate();
    },
    [maxHistorySize, forceUpdate]
  );

  // Undo last action
  const undo = useCallback((): UploadFormState | null => {
    if (undoStack.current.length <= 1) {
      return null; // Need at least 2 entries to undo
    }

    // Pop current state
    const currentEntry = undoStack.current.pop()!;

    // Push to redo stack
    redoStack.current.push(currentEntry);

    // Get previous state
    const previousEntry = undoStack.current[undoStack.current.length - 1];

    // Notify callback
    onUndo?.(currentEntry.action);

    forceUpdate();
    return cloneState(previousEntry.state);
  }, [onUndo, forceUpdate]);

  // Redo last undone action
  const redo = useCallback((): UploadFormState | null => {
    if (redoStack.current.length === 0) {
      return null;
    }

    // Pop from redo stack
    const entry = redoStack.current.pop()!;

    // Push back to undo stack
    undoStack.current.push(entry);

    // Notify callback
    onRedo?.(entry.action);

    forceUpdate();
    return cloneState(entry.state);
  }, [onRedo, forceUpdate]);

  // Clear all history
  const clearHistory = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    forceUpdate();
  }, [forceUpdate]);

  // Get current state
  const getCurrentState = useCallback((): UploadFormState | null => {
    if (undoStack.current.length === 0) return null;
    return cloneState(undoStack.current[undoStack.current.length - 1].state);
  }, []);

  // Get previous action (for undo tooltip)
  const getPreviousAction = useCallback((): string | null => {
    if (undoStack.current.length <= 1) return null;
    return undoStack.current[undoStack.current.length - 1].action;
  }, []);

  // Get next action (for redo tooltip)
  const getNextAction = useCallback((): string | null => {
    if (redoStack.current.length === 0) return null;
    return redoStack.current[redoStack.current.length - 1].action;
  }, []);

  // Computed values
  const canUndo = undoStack.current.length > 1;
  const canRedo = redoStack.current.length > 0;
  const historyLength = undoStack.current.length + redoStack.current.length;
  const undoStackLength = undoStack.current.length;
  const redoStackLength = redoStack.current.length;

  return {
    canUndo,
    canRedo,
    historyLength,
    undoStackLength,
    redoStackLength,
    pushState,
    undo,
    redo,
    clearHistory,
    getCurrentState,
    getPreviousAction,
    getNextAction,
  };
}

// Combined hook with form state management
export interface UseUploadFormWithHistoryOptions {
  initialState: UploadFormState;
  maxHistorySize?: number;
  onUndo?: (action: string) => void;
  onRedo?: (action: string) => void;
}

export interface UseUploadFormWithHistoryReturn extends UseUploadHistoryReturn {
  state: UploadFormState;
  setClassification: (value: string) => void;
  setReleasabilityTo: (countries: string[]) => void;
  toggleCountry: (country: string) => void;
  setCOI: (coi: string[]) => void;
  toggleCOI: (coi: string) => void;
  setCaveats: (caveats: string[]) => void;
  toggleCaveat: (caveat: string) => void;
  resetForm: () => void;
}

export function useUploadFormWithHistory(
  options: UseUploadFormWithHistoryOptions
): UseUploadFormWithHistoryReturn {
  const { initialState, maxHistorySize, onUndo: externalOnUndo, onRedo: externalOnRedo } = options;

  const [state, setState] = useState<UploadFormState>(initialState);

  // Internal undo/redo handlers that update local state
  const handleUndo = useCallback(
    (action: string) => {
      externalOnUndo?.(action);
    },
    [externalOnUndo]
  );

  const handleRedo = useCallback(
    (action: string) => {
      externalOnRedo?.(action);
    },
    [externalOnRedo]
  );

  const history = useUploadHistory({
    maxHistorySize,
    onUndo: handleUndo,
    onRedo: handleRedo,
  });

  // Wrap undo to update state
  const undo = useCallback(() => {
    const prevState = history.undo();
    if (prevState) {
      setState(prevState);
    }
    return prevState;
  }, [history]);

  // Wrap redo to update state
  const redo = useCallback(() => {
    const nextState = history.redo();
    if (nextState) {
      setState(nextState);
    }
    return nextState;
  }, [history]);

  // State setters that push to history
  const setClassification = useCallback(
    (value: string) => {
      setState((prev) => {
        const newState = { ...prev, classification: value };
        history.pushState(newState);
        return newState;
      });
    },
    [history]
  );

  const setReleasabilityTo = useCallback(
    (countries: string[]) => {
      setState((prev) => {
        const newState = { ...prev, releasabilityTo: countries };
        history.pushState(newState);
        return newState;
      });
    },
    [history]
  );

  const toggleCountry = useCallback(
    (country: string) => {
      setState((prev) => {
        const newCountries = prev.releasabilityTo.includes(country)
          ? prev.releasabilityTo.filter((c) => c !== country)
          : [...prev.releasabilityTo, country];
        const newState = { ...prev, releasabilityTo: newCountries };
        history.pushState(newState);
        return newState;
      });
    },
    [history]
  );

  const setCOI = useCallback(
    (coi: string[]) => {
      setState((prev) => {
        const newState = { ...prev, COI: coi };
        history.pushState(newState);
        return newState;
      });
    },
    [history]
  );

  const toggleCOI = useCallback(
    (coi: string) => {
      setState((prev) => {
        const newCOI = prev.COI.includes(coi)
          ? prev.COI.filter((c) => c !== coi)
          : [...prev.COI, coi];
        const newState = { ...prev, COI: newCOI };
        history.pushState(newState);
        return newState;
      });
    },
    [history]
  );

  const setCaveats = useCallback(
    (caveats: string[]) => {
      setState((prev) => {
        const newState = { ...prev, caveats };
        history.pushState(newState);
        return newState;
      });
    },
    [history]
  );

  const toggleCaveat = useCallback(
    (caveat: string) => {
      setState((prev) => {
        const newCaveats = prev.caveats.includes(caveat)
          ? prev.caveats.filter((c) => c !== caveat)
          : [...prev.caveats, caveat];
        const newState = { ...prev, caveats: newCaveats };
        history.pushState(newState);
        return newState;
      });
    },
    [history]
  );

  const resetForm = useCallback(() => {
    setState(initialState);
    history.clearHistory();
    history.pushState(initialState, 'Form reset');
  }, [initialState, history]);

  return {
    state,
    ...history,
    undo,
    redo,
    setClassification,
    setReleasabilityTo,
    toggleCountry,
    setCOI,
    toggleCOI,
    setCaveats,
    toggleCaveat,
    resetForm,
  };
}

export default useUploadHistory;
