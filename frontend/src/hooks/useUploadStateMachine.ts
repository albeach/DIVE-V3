/**
 * Upload State Machine Hook - 2026 Modern UX
 *
 * Manages the progressive disclosure state machine for the upload form:
 * - idle → file_selected → metadata_complete → classification_set → ready_to_upload → uploading → success
 * - Provides visibility flags for each section
 * - Handles state transitions and validation
 * - Supports undo/redo through state history
 */

import { useCallback, useMemo, useReducer } from 'react';

// State types
export type UploadState =
  | 'idle'
  | 'file_selected'
  | 'metadata_complete'
  | 'classification_set'
  | 'ready_to_upload'
  | 'uploading'
  | 'success'
  | 'error';

// Form data interface
export interface UploadFormData {
  file: File | null;
  title: string;
  description: string;
  classification: string;
  releasabilityTo: string[];
  COI: string[];
  caveats: string[];
}

// State machine state
export interface UploadMachineState {
  currentState: UploadState;
  formData: UploadFormData;
  uploadProgress: number;
  uploadStep: string;
  errorMessage: string | null;
  stateHistory: UploadState[];
}

// Action types
type UploadAction =
  | { type: 'SET_FILE'; payload: File | null }
  | { type: 'SET_TITLE'; payload: string }
  | { type: 'SET_DESCRIPTION'; payload: string }
  | { type: 'SET_CLASSIFICATION'; payload: string }
  | { type: 'SET_RELEASABILITY'; payload: string[] }
  | { type: 'TOGGLE_COUNTRY'; payload: string }
  | { type: 'SET_COI'; payload: string[] }
  | { type: 'TOGGLE_COI'; payload: string }
  | { type: 'SET_CAVEATS'; payload: string[] }
  | { type: 'TOGGLE_CAVEAT'; payload: string }
  | { type: 'START_UPLOAD' }
  | { type: 'UPDATE_PROGRESS'; payload: { progress: number; step: string } }
  | { type: 'UPLOAD_SUCCESS' }
  | { type: 'UPLOAD_ERROR'; payload: string }
  | { type: 'RESET' }
  | { type: 'GO_TO_STATE'; payload: UploadState };

// Initial state
const initialState: UploadMachineState = {
  currentState: 'idle',
  formData: {
    file: null,
    title: '',
    description: '',
    classification: 'UNCLASSIFIED',
    releasabilityTo: [],
    COI: [],
    caveats: [],
  },
  uploadProgress: 0,
  uploadStep: '',
  errorMessage: null,
  stateHistory: ['idle'],
};

// State hierarchy for comparison
const stateHierarchy: Record<UploadState, number> = {
  idle: 0,
  file_selected: 1,
  metadata_complete: 2,
  classification_set: 3,
  ready_to_upload: 4,
  uploading: 5,
  success: 6,
  error: -1,
};

// Calculate the appropriate state based on form data
function calculateState(formData: UploadFormData): UploadState {
  if (!formData.file) {
    return 'idle';
  }

  if (!formData.title.trim()) {
    return 'file_selected';
  }

  if (formData.classification === 'UNCLASSIFIED' && formData.releasabilityTo.length === 0) {
    return 'metadata_complete';
  }

  if (formData.releasabilityTo.length === 0) {
    return 'classification_set';
  }

  return 'ready_to_upload';
}

// Reducer function
function uploadReducer(state: UploadMachineState, action: UploadAction): UploadMachineState {
  switch (action.type) {
    case 'SET_FILE': {
      const newFormData = { ...state.formData, file: action.payload };
      const newState = calculateState(newFormData);
      return {
        ...state,
        formData: newFormData,
        currentState: newState,
        stateHistory:
          newState !== state.currentState
            ? [...state.stateHistory, newState]
            : state.stateHistory,
        errorMessage: null,
      };
    }

    case 'SET_TITLE': {
      const newFormData = { ...state.formData, title: action.payload };
      const newState = calculateState(newFormData);
      return {
        ...state,
        formData: newFormData,
        currentState: newState,
        stateHistory:
          newState !== state.currentState
            ? [...state.stateHistory, newState]
            : state.stateHistory,
      };
    }

    case 'SET_DESCRIPTION': {
      return {
        ...state,
        formData: { ...state.formData, description: action.payload },
      };
    }

    case 'SET_CLASSIFICATION': {
      const newFormData = { ...state.formData, classification: action.payload };
      const newState = calculateState(newFormData);
      return {
        ...state,
        formData: newFormData,
        currentState: newState,
        stateHistory:
          newState !== state.currentState
            ? [...state.stateHistory, newState]
            : state.stateHistory,
      };
    }

    case 'SET_RELEASABILITY': {
      const newFormData = { ...state.formData, releasabilityTo: action.payload };
      const newState = calculateState(newFormData);
      return {
        ...state,
        formData: newFormData,
        currentState: newState,
        stateHistory:
          newState !== state.currentState
            ? [...state.stateHistory, newState]
            : state.stateHistory,
      };
    }

    case 'TOGGLE_COUNTRY': {
      const currentCountries = state.formData.releasabilityTo;
      const newCountries = currentCountries.includes(action.payload)
        ? currentCountries.filter((c) => c !== action.payload)
        : [...currentCountries, action.payload];
      const newFormData = { ...state.formData, releasabilityTo: newCountries };
      const newState = calculateState(newFormData);
      return {
        ...state,
        formData: newFormData,
        currentState: newState,
        stateHistory:
          newState !== state.currentState
            ? [...state.stateHistory, newState]
            : state.stateHistory,
      };
    }

    case 'SET_COI': {
      return {
        ...state,
        formData: { ...state.formData, COI: action.payload },
      };
    }

    case 'TOGGLE_COI': {
      const currentCOI = state.formData.COI;
      const newCOI = currentCOI.includes(action.payload)
        ? currentCOI.filter((c) => c !== action.payload)
        : [...currentCOI, action.payload];
      return {
        ...state,
        formData: { ...state.formData, COI: newCOI },
      };
    }

    case 'SET_CAVEATS': {
      return {
        ...state,
        formData: { ...state.formData, caveats: action.payload },
      };
    }

    case 'TOGGLE_CAVEAT': {
      const currentCaveats = state.formData.caveats;
      const newCaveats = currentCaveats.includes(action.payload)
        ? currentCaveats.filter((c) => c !== action.payload)
        : [...currentCaveats, action.payload];
      return {
        ...state,
        formData: { ...state.formData, caveats: newCaveats },
      };
    }

    case 'START_UPLOAD': {
      return {
        ...state,
        currentState: 'uploading',
        uploadProgress: 0,
        uploadStep: 'Preparing upload...',
        stateHistory: [...state.stateHistory, 'uploading'],
        errorMessage: null,
      };
    }

    case 'UPDATE_PROGRESS': {
      return {
        ...state,
        uploadProgress: action.payload.progress,
        uploadStep: action.payload.step,
      };
    }

    case 'UPLOAD_SUCCESS': {
      return {
        ...state,
        currentState: 'success',
        uploadProgress: 100,
        uploadStep: 'Upload complete!',
        stateHistory: [...state.stateHistory, 'success'],
      };
    }

    case 'UPLOAD_ERROR': {
      return {
        ...state,
        currentState: 'error',
        errorMessage: action.payload,
        uploadProgress: 0,
        uploadStep: '',
        stateHistory: [...state.stateHistory, 'error'],
      };
    }

    case 'RESET': {
      return {
        ...initialState,
        stateHistory: ['idle'],
      };
    }

    case 'GO_TO_STATE': {
      return {
        ...state,
        currentState: action.payload,
        stateHistory: [...state.stateHistory, action.payload],
      };
    }

    default:
      return state;
  }
}

// Visibility configuration based on state
interface VisibilityConfig {
  fileDropzone: boolean;
  metadata: boolean;
  classification: boolean;
  releasability: boolean;
  coi: boolean;
  caveats: boolean;
  preview: boolean;
  actions: boolean;
  progress: boolean;
}

// Hook return type
interface UseUploadStateMachineReturn {
  state: UploadMachineState;
  visibility: VisibilityConfig;
  actions: {
    setFile: (file: File | null) => void;
    setTitle: (title: string) => void;
    setDescription: (description: string) => void;
    setClassification: (classification: string) => void;
    setReleasability: (countries: string[]) => void;
    toggleCountry: (country: string) => void;
    setCOI: (coi: string[]) => void;
    toggleCOI: (coi: string) => void;
    setCaveats: (caveats: string[]) => void;
    toggleCaveat: (caveat: string) => void;
    startUpload: () => void;
    updateProgress: (progress: number, step: string) => void;
    uploadSuccess: () => void;
    uploadError: (message: string) => void;
    reset: () => void;
  };
  computed: {
    canUpload: boolean;
    currentStep: number;
    totalSteps: number;
    stepLabels: string[];
    isUploading: boolean;
    isSuccess: boolean;
    hasError: boolean;
  };
}

/**
 * Upload State Machine Hook
 *
 * @param defaultCountry - Default country to pre-select in releasability (user's country)
 */
export function useUploadStateMachine(defaultCountry?: string): UseUploadStateMachineReturn {
  // Initialize with default country if provided
  const initialStateWithDefaults = useMemo(() => {
    if (defaultCountry) {
      return {
        ...initialState,
        formData: {
          ...initialState.formData,
          releasabilityTo: [defaultCountry],
        },
      };
    }
    return initialState;
  }, [defaultCountry]);

  const [state, dispatch] = useReducer(uploadReducer, initialStateWithDefaults);

  // Calculate visibility based on current state
  const visibility = useMemo<VisibilityConfig>(() => {
    const stateLevel = stateHierarchy[state.currentState];

    return {
      fileDropzone: true, // Always visible
      metadata: stateLevel >= stateHierarchy.file_selected,
      classification: stateLevel >= stateHierarchy.metadata_complete,
      releasability: stateLevel >= stateHierarchy.classification_set,
      coi: stateLevel >= stateHierarchy.classification_set,
      caveats: stateLevel >= stateHierarchy.classification_set,
      preview: true, // Always visible in sidebar
      actions: stateLevel >= stateHierarchy.file_selected,
      progress: state.currentState === 'uploading' || state.currentState === 'success',
    };
  }, [state.currentState]);

  // Action creators
  const actions = useMemo(
    () => ({
      setFile: (file: File | null) => dispatch({ type: 'SET_FILE', payload: file }),
      setTitle: (title: string) => dispatch({ type: 'SET_TITLE', payload: title }),
      setDescription: (description: string) =>
        dispatch({ type: 'SET_DESCRIPTION', payload: description }),
      setClassification: (classification: string) =>
        dispatch({ type: 'SET_CLASSIFICATION', payload: classification }),
      setReleasability: (countries: string[]) =>
        dispatch({ type: 'SET_RELEASABILITY', payload: countries }),
      toggleCountry: (country: string) => dispatch({ type: 'TOGGLE_COUNTRY', payload: country }),
      setCOI: (coi: string[]) => dispatch({ type: 'SET_COI', payload: coi }),
      toggleCOI: (coi: string) => dispatch({ type: 'TOGGLE_COI', payload: coi }),
      setCaveats: (caveats: string[]) => dispatch({ type: 'SET_CAVEATS', payload: caveats }),
      toggleCaveat: (caveat: string) => dispatch({ type: 'TOGGLE_CAVEAT', payload: caveat }),
      startUpload: () => dispatch({ type: 'START_UPLOAD' }),
      updateProgress: (progress: number, step: string) =>
        dispatch({ type: 'UPDATE_PROGRESS', payload: { progress, step } }),
      uploadSuccess: () => dispatch({ type: 'UPLOAD_SUCCESS' }),
      uploadError: (message: string) => dispatch({ type: 'UPLOAD_ERROR', payload: message }),
      reset: () => dispatch({ type: 'RESET' }),
    }),
    []
  );

  // Computed values
  const computed = useMemo(() => {
    const stepLabels = ['Select File', 'Metadata', 'Classification', 'Releasability', 'Upload'];

    const stepMap: Record<UploadState, number> = {
      idle: 1,
      file_selected: 2,
      metadata_complete: 3,
      classification_set: 4,
      ready_to_upload: 5,
      uploading: 5,
      success: 5,
      error: 5,
    };

    const canUpload =
      state.formData.file !== null &&
      state.formData.title.trim() !== '' &&
      state.formData.releasabilityTo.length > 0 &&
      state.currentState !== 'uploading' &&
      state.currentState !== 'success';

    return {
      canUpload,
      currentStep: stepMap[state.currentState],
      totalSteps: stepLabels.length,
      stepLabels,
      isUploading: state.currentState === 'uploading',
      isSuccess: state.currentState === 'success',
      hasError: state.currentState === 'error',
    };
  }, [state.currentState, state.formData]);

  return {
    state,
    visibility,
    actions,
    computed,
  };
}

export default useUploadStateMachine;
