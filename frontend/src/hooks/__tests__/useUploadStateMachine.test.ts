/**
 * Unit Tests for useUploadStateMachine Hook
 *
 * Tests the state machine for progressive form revelation:
 * - State transitions
 * - Form data updates
 * - Visibility calculations
 * - Computed values
 */

import { renderHook, act } from '@testing-library/react';
import { useUploadStateMachine } from '../useUploadStateMachine';

describe('useUploadStateMachine', () => {
  describe('initial state', () => {
    it('should start in idle state with default form data', () => {
      const { result } = renderHook(() => useUploadStateMachine());

      expect(result.current.state.currentState).toBe('idle');
      expect(result.current.state.formData.file).toBeNull();
      expect(result.current.state.formData.title).toBe('');
      expect(result.current.state.formData.classification).toBe('UNCLASSIFIED');
      expect(result.current.state.formData.releasabilityTo).toEqual([]);
    });

    it('should pre-populate releasability with default country', () => {
      const { result } = renderHook(() => useUploadStateMachine('USA'));

      expect(result.current.state.formData.releasabilityTo).toEqual(['USA']);
    });
  });

  describe('file selection', () => {
    it('should transition to file_selected when file is set', () => {
      const { result } = renderHook(() => useUploadStateMachine());
      const mockFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });

      act(() => {
        result.current.actions.setFile(mockFile);
      });

      expect(result.current.state.currentState).toBe('file_selected');
      expect(result.current.state.formData.file).toBe(mockFile);
    });

    it('should transition back to idle when file is removed', () => {
      const { result } = renderHook(() => useUploadStateMachine());
      const mockFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });

      act(() => {
        result.current.actions.setFile(mockFile);
      });
      expect(result.current.state.currentState).toBe('file_selected');

      act(() => {
        result.current.actions.setFile(null);
      });
      expect(result.current.state.currentState).toBe('idle');
    });
  });

  describe('title updates', () => {
    it('should transition to metadata_complete when title is set after file', () => {
      const { result } = renderHook(() => useUploadStateMachine());
      const mockFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });

      act(() => {
        result.current.actions.setFile(mockFile);
        result.current.actions.setTitle('Test Document');
      });

      expect(result.current.state.currentState).toBe('metadata_complete');
      expect(result.current.state.formData.title).toBe('Test Document');
    });

    it('should trim whitespace from title', () => {
      const { result } = renderHook(() => useUploadStateMachine());

      act(() => {
        result.current.actions.setTitle('  Test Document  ');
      });

      expect(result.current.state.formData.title).toBe('  Test Document  ');
    });
  });

  describe('classification changes', () => {
    it('should update classification', () => {
      const { result } = renderHook(() => useUploadStateMachine());

      act(() => {
        result.current.actions.setClassification('SECRET');
      });

      expect(result.current.state.formData.classification).toBe('SECRET');
    });
  });

  describe('releasability changes', () => {
    it('should update releasability array', () => {
      const { result } = renderHook(() => useUploadStateMachine());

      act(() => {
        result.current.actions.setReleasability(['USA', 'GBR']);
      });

      expect(result.current.state.formData.releasabilityTo).toEqual(['USA', 'GBR']);
    });

    it('should toggle country on and off', () => {
      const { result } = renderHook(() => useUploadStateMachine());

      act(() => {
        result.current.actions.toggleCountry('USA');
      });
      expect(result.current.state.formData.releasabilityTo).toContain('USA');

      act(() => {
        result.current.actions.toggleCountry('USA');
      });
      expect(result.current.state.formData.releasabilityTo).not.toContain('USA');
    });

    it('should transition to ready_to_upload when all required fields are set', () => {
      const { result } = renderHook(() => useUploadStateMachine());
      const mockFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });

      act(() => {
        result.current.actions.setFile(mockFile);
        result.current.actions.setTitle('Test Document');
        result.current.actions.setClassification('SECRET');
        result.current.actions.setReleasability(['USA']);
      });

      expect(result.current.state.currentState).toBe('ready_to_upload');
    });
  });

  describe('COI changes', () => {
    it('should update COI array', () => {
      const { result } = renderHook(() => useUploadStateMachine());

      act(() => {
        result.current.actions.setCOI(['FVEY', 'NATO']);
      });

      expect(result.current.state.formData.COI).toEqual(['FVEY', 'NATO']);
    });

    it('should toggle COI on and off', () => {
      const { result } = renderHook(() => useUploadStateMachine());

      act(() => {
        result.current.actions.toggleCOI('FVEY');
      });
      expect(result.current.state.formData.COI).toContain('FVEY');

      act(() => {
        result.current.actions.toggleCOI('FVEY');
      });
      expect(result.current.state.formData.COI).not.toContain('FVEY');
    });
  });

  describe('caveats changes', () => {
    it('should update caveats array', () => {
      const { result } = renderHook(() => useUploadStateMachine());

      act(() => {
        result.current.actions.setCaveats(['NOFORN', 'ORCON']);
      });

      expect(result.current.state.formData.caveats).toEqual(['NOFORN', 'ORCON']);
    });

    it('should toggle caveat on and off', () => {
      const { result } = renderHook(() => useUploadStateMachine());

      act(() => {
        result.current.actions.toggleCaveat('NOFORN');
      });
      expect(result.current.state.formData.caveats).toContain('NOFORN');

      act(() => {
        result.current.actions.toggleCaveat('NOFORN');
      });
      expect(result.current.state.formData.caveats).not.toContain('NOFORN');
    });
  });

  describe('upload flow', () => {
    it('should transition through upload states', () => {
      const { result } = renderHook(() => useUploadStateMachine());

      act(() => {
        result.current.actions.startUpload();
      });
      expect(result.current.state.currentState).toBe('uploading');
      expect(result.current.state.uploadProgress).toBe(0);

      act(() => {
        result.current.actions.updateProgress(50, 'Encrypting...');
      });
      expect(result.current.state.uploadProgress).toBe(50);
      expect(result.current.state.uploadStep).toBe('Encrypting...');

      act(() => {
        result.current.actions.uploadSuccess();
      });
      expect(result.current.state.currentState).toBe('success');
      expect(result.current.state.uploadProgress).toBe(100);
    });

    it('should handle upload error', () => {
      const { result } = renderHook(() => useUploadStateMachine());

      act(() => {
        result.current.actions.startUpload();
      });

      act(() => {
        result.current.actions.uploadError('Network error');
      });

      expect(result.current.state.currentState).toBe('error');
      expect(result.current.state.errorMessage).toBe('Network error');
    });
  });

  describe('reset', () => {
    it('should reset to initial state', () => {
      const { result } = renderHook(() => useUploadStateMachine());
      const mockFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });

      act(() => {
        result.current.actions.setFile(mockFile);
        result.current.actions.setTitle('Test');
        result.current.actions.setClassification('SECRET');
      });

      act(() => {
        result.current.actions.reset();
      });

      expect(result.current.state.currentState).toBe('idle');
      expect(result.current.state.formData.file).toBeNull();
      expect(result.current.state.formData.title).toBe('');
      expect(result.current.state.formData.classification).toBe('UNCLASSIFIED');
    });
  });

  describe('visibility', () => {
    it('should show only file dropzone in idle state', () => {
      const { result } = renderHook(() => useUploadStateMachine());

      expect(result.current.visibility.fileDropzone).toBe(true);
      expect(result.current.visibility.metadata).toBe(false);
      expect(result.current.visibility.classification).toBe(false);
    });

    it('should show metadata card after file selection', () => {
      const { result } = renderHook(() => useUploadStateMachine());
      const mockFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });

      act(() => {
        result.current.actions.setFile(mockFile);
      });

      expect(result.current.visibility.metadata).toBe(true);
    });

    it('should show all cards when ready to upload', () => {
      const { result } = renderHook(() => useUploadStateMachine());
      const mockFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });

      act(() => {
        result.current.actions.setFile(mockFile);
        result.current.actions.setTitle('Test');
        result.current.actions.setClassification('SECRET');
        result.current.actions.setReleasability(['USA']);
      });

      expect(result.current.visibility.fileDropzone).toBe(true);
      expect(result.current.visibility.metadata).toBe(true);
      expect(result.current.visibility.classification).toBe(true);
      expect(result.current.visibility.releasability).toBe(true);
      expect(result.current.visibility.coi).toBe(true);
      expect(result.current.visibility.actions).toBe(true);
    });
  });

  describe('computed values', () => {
    it('should calculate canUpload correctly', () => {
      const { result } = renderHook(() => useUploadStateMachine());
      const mockFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });

      expect(result.current.computed.canUpload).toBe(false);

      act(() => {
        result.current.actions.setFile(mockFile);
        result.current.actions.setTitle('Test Document');
        result.current.actions.setReleasability(['USA']);
      });

      expect(result.current.computed.canUpload).toBe(true);
    });

    it('should calculate currentStep correctly', () => {
      const { result } = renderHook(() => useUploadStateMachine());
      const mockFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });

      expect(result.current.computed.currentStep).toBe(1);

      act(() => {
        result.current.actions.setFile(mockFile);
      });
      expect(result.current.computed.currentStep).toBe(2);

      act(() => {
        result.current.actions.setTitle('Test');
      });
      expect(result.current.computed.currentStep).toBe(3);
    });
  });
});
