/**
 * Unit Tests for useUploadHistory Hook
 *
 * Tests the undo/redo system:
 * - State tracking
 * - Undo functionality
 * - Redo functionality
 * - History limits
 * - Callbacks
 */

import { renderHook, act } from '@testing-library/react';
import { useUploadHistory, useUploadFormWithHistory } from '../useUploadHistory';

describe('useUploadHistory', () => {
  describe('initial state', () => {
    it('should start with empty history', () => {
      const { result } = renderHook(() => useUploadHistory());

      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
      expect(result.current.historyLength).toBe(0);
    });
  });

  describe('pushState', () => {
    it('should add state to history', () => {
      const { result } = renderHook(() => useUploadHistory());

      act(() => {
        result.current.pushState(
          {
            classification: 'SECRET',
            releasabilityTo: ['USA'],
            COI: [],
            caveats: [],
          },
          'Initial state'
        );
      });

      expect(result.current.undoStackLength).toBe(1);
    });

    it('should not add duplicate states', () => {
      const { result } = renderHook(() => useUploadHistory());

      const state = {
        classification: 'SECRET',
        releasabilityTo: ['USA'],
        COI: [],
        caveats: [],
      };

      act(() => {
        result.current.pushState(state, 'First');
        result.current.pushState(state, 'Second'); // Same state
      });

      expect(result.current.undoStackLength).toBe(1);
    });

    it('should add different states', () => {
      const { result } = renderHook(() => useUploadHistory());

      act(() => {
        result.current.pushState(
          {
            classification: 'SECRET',
            releasabilityTo: ['USA'],
            COI: [],
            caveats: [],
          },
          'First'
        );
      });

      act(() => {
        result.current.pushState(
          {
            classification: 'TOP_SECRET',
            releasabilityTo: ['USA'],
            COI: [],
            caveats: [],
          },
          'Second'
        );
      });

      expect(result.current.undoStackLength).toBe(2);
    });

    it('should respect max history size', () => {
      const { result } = renderHook(() => useUploadHistory({ maxHistorySize: 3 }));

      act(() => {
        for (let i = 0; i < 5; i++) {
          result.current.pushState(
            {
              classification: 'SECRET',
              releasabilityTo: ['USA', String(i)], // Make each state unique
              COI: [],
              caveats: [],
            },
            `State ${i}`
          );
        }
      });

      expect(result.current.undoStackLength).toBe(3);
    });
  });

  describe('undo', () => {
    it('should return null if no history', () => {
      const { result } = renderHook(() => useUploadHistory());

      let undoneState: any;
      act(() => {
        undoneState = result.current.undo();
      });

      expect(undoneState).toBeNull();
    });

    it('should return previous state', () => {
      const { result } = renderHook(() => useUploadHistory());

      const firstState = {
        classification: 'UNCLASSIFIED',
        releasabilityTo: [],
        COI: [],
        caveats: [],
      };

      const secondState = {
        classification: 'SECRET',
        releasabilityTo: ['USA'],
        COI: [],
        caveats: [],
      };

      act(() => {
        result.current.pushState(firstState, 'First');
        result.current.pushState(secondState, 'Second');
      });

      let undoneState: any;
      act(() => {
        undoneState = result.current.undo();
      });

      expect(undoneState?.classification).toBe('UNCLASSIFIED');
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(true);
    });

    it('should call onUndo callback', () => {
      const onUndo = jest.fn();
      const { result } = renderHook(() => useUploadHistory({ onUndo }));

      act(() => {
        result.current.pushState(
          { classification: 'UNCLASSIFIED', releasabilityTo: [], COI: [], caveats: [] },
          'First'
        );
        result.current.pushState(
          { classification: 'SECRET', releasabilityTo: [], COI: [], caveats: [] },
          'Second'
        );
      });

      act(() => {
        result.current.undo();
      });

      expect(onUndo).toHaveBeenCalledWith('Second');
    });
  });

  describe('redo', () => {
    it('should return null if no redo history', () => {
      const { result } = renderHook(() => useUploadHistory());

      let redoneState: any;
      act(() => {
        redoneState = result.current.redo();
      });

      expect(redoneState).toBeNull();
    });

    it('should return next state after undo', () => {
      const { result } = renderHook(() => useUploadHistory());

      const firstState = {
        classification: 'UNCLASSIFIED',
        releasabilityTo: [],
        COI: [],
        caveats: [],
      };

      const secondState = {
        classification: 'SECRET',
        releasabilityTo: ['USA'],
        COI: [],
        caveats: [],
      };

      act(() => {
        result.current.pushState(firstState, 'First');
        result.current.pushState(secondState, 'Second');
      });

      act(() => {
        result.current.undo();
      });

      let redoneState: any;
      act(() => {
        redoneState = result.current.redo();
      });

      expect(redoneState?.classification).toBe('SECRET');
      expect(result.current.canRedo).toBe(false);
    });

    it('should call onRedo callback', () => {
      const onRedo = jest.fn();
      const { result } = renderHook(() => useUploadHistory({ onRedo }));

      act(() => {
        result.current.pushState(
          { classification: 'UNCLASSIFIED', releasabilityTo: [], COI: [], caveats: [] },
          'First'
        );
        result.current.pushState(
          { classification: 'SECRET', releasabilityTo: [], COI: [], caveats: [] },
          'Classification changed to SECRET'
        );
      });

      act(() => {
        result.current.undo();
      });

      act(() => {
        result.current.redo();
      });

      expect(onRedo).toHaveBeenCalledWith('Classification changed to SECRET');
    });
  });

  describe('clearHistory', () => {
    it('should clear all history', () => {
      const { result } = renderHook(() => useUploadHistory());

      act(() => {
        result.current.pushState(
          { classification: 'SECRET', releasabilityTo: [], COI: [], caveats: [] },
          'First'
        );
        result.current.pushState(
          { classification: 'TOP_SECRET', releasabilityTo: [], COI: [], caveats: [] },
          'Second'
        );
      });

      act(() => {
        result.current.clearHistory();
      });

      expect(result.current.undoStackLength).toBe(0);
      expect(result.current.redoStackLength).toBe(0);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });
  });

  describe('action descriptions', () => {
    it('should generate description for classification change', () => {
      const { result } = renderHook(() => useUploadHistory());

      act(() => {
        result.current.pushState(
          { classification: 'UNCLASSIFIED', releasabilityTo: [], COI: [], caveats: [] }
        );
        result.current.pushState(
          { classification: 'SECRET', releasabilityTo: [], COI: [], caveats: [] }
        );
      });

      expect(result.current.getPreviousAction()).toContain('Classification changed to SECRET');
    });

    it('should generate description for country changes', () => {
      const { result } = renderHook(() => useUploadHistory());

      act(() => {
        result.current.pushState(
          { classification: 'SECRET', releasabilityTo: [], COI: [], caveats: [] }
        );
        result.current.pushState(
          { classification: 'SECRET', releasabilityTo: ['USA'], COI: [], caveats: [] }
        );
      });

      expect(result.current.getPreviousAction()).toContain('Added');
    });
  });
});

describe('useUploadFormWithHistory', () => {
  const initialState = {
    classification: 'UNCLASSIFIED',
    releasabilityTo: [],
    COI: [],
    caveats: [],
  };

  it('should initialize with provided state', () => {
    const { result } = renderHook(() =>
      useUploadFormWithHistory({ initialState })
    );

    expect(result.current.state.classification).toBe('UNCLASSIFIED');
    expect(result.current.state.releasabilityTo).toEqual([]);
  });

  it('should update classification and track history', () => {
    const { result } = renderHook(() =>
      useUploadFormWithHistory({ initialState })
    );

    act(() => {
      result.current.setClassification('SECRET');
    });

    expect(result.current.state.classification).toBe('SECRET');
    expect(result.current.canUndo).toBe(true);
  });

  it('should toggle country and track history', () => {
    const { result } = renderHook(() =>
      useUploadFormWithHistory({ initialState })
    );

    act(() => {
      result.current.toggleCountry('USA');
    });

    expect(result.current.state.releasabilityTo).toContain('USA');

    act(() => {
      result.current.toggleCountry('USA');
    });

    expect(result.current.state.releasabilityTo).not.toContain('USA');
  });

  it('should undo and restore previous state', () => {
    const { result } = renderHook(() =>
      useUploadFormWithHistory({ initialState })
    );

    act(() => {
      result.current.setClassification('SECRET');
    });

    act(() => {
      result.current.undo();
    });

    expect(result.current.state.classification).toBe('UNCLASSIFIED');
  });

  it('should reset form and clear history', () => {
    const { result } = renderHook(() =>
      useUploadFormWithHistory({ initialState })
    );

    act(() => {
      result.current.setClassification('SECRET');
      result.current.toggleCountry('USA');
    });

    act(() => {
      result.current.resetForm();
    });

    expect(result.current.state.classification).toBe('UNCLASSIFIED');
    expect(result.current.state.releasabilityTo).toEqual([]);
    expect(result.current.canUndo).toBe(false);
  });
});
