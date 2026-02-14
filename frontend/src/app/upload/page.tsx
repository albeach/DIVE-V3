/**
 * Modern Upload Page - 2026 Bento Grid Design
 *
 * Complete redesign with:
 * - Bento Grid layout with progressive disclosure
 * - Framer Motion animations
 * - Command palette (Cmd+K)
 * - Auto-save drafts to LocalStorage
 * - Undo/redo system
 * - Multi-step upload progress with celebration
 * - Full accessibility (WCAG 2.2 AAA)
 * - Real-time validation with Sonner toasts
 */

'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import PageLayout from '@/components/layout/page-layout';
import FileUploader from '@/components/upload/file-uploader';
import SecurityLabelForm from '@/components/upload/security-label-form';
import { useTranslation } from '@/hooks/useTranslation';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';
import {
  BentoCard,
  BentoCardHeader,
  BentoCardContent,
  BentoStepIndicator,
} from '@/components/upload/bento-upload-layout';
import { ValidationToaster, uploadToast } from '@/components/upload/validation-toast';
import { useUploadDraft } from '@/hooks/useUploadDraft';
import { useUploadHistory } from '@/hooks/useUploadHistory';
import { useUploadKeyboardShortcuts } from '@/components/upload/upload-command-palette';
import { simulateUploadProgress } from '@/components/upload/upload-progress-steps';
import {
  Upload,
  FileText,
  Shield,
  Globe,
  Eye,
  Clock,
  AlertTriangle,
  X,
  Keyboard,
  RefreshCw,
  Undo2,
  Redo2,
  Command,
} from 'lucide-react';

// Dynamic imports for code splitting
const UploadCommandPalette = dynamic(
  () => import('@/components/upload/upload-command-palette'),
  { ssr: false }
);
const UploadProgressSteps = dynamic(
  () => import('@/components/upload/upload-progress-steps'),
  { ssr: false }
);
const MarkingPreview = dynamic(
  () => import('@/components/upload/MarkingPreview').then((mod) => mod.MarkingPreview),
  { ssr: false }
);

// Classification colors
const classificationColors: Record<string, string> = {
  UNCLASSIFIED: 'bg-green-100 text-green-800 border-green-300',
  RESTRICTED: 'bg-blue-100 text-blue-800 border-blue-300',
  CONFIDENTIAL: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  SECRET: 'bg-orange-100 text-orange-800 border-orange-300',
  TOP_SECRET: 'bg-red-100 text-red-800 border-red-300',
};

// National classification lookups — SSOT via clearance-localization.ts
// Fetches from backend MongoDB via /api/admin/clearance/mappings
import { getLocalizedClearance } from '@/utils/clearance-localization';

const CURRENT_INSTANCE = process.env.NEXT_PUBLIC_INSTANCE || 'USA';

export default function UploadPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useTranslation('resources');
  const { locale } = useLocale();
  const shouldReduceMotion = useReducedMotion();

  // User info (needs to be before form state for initialization)
  const userClearance = session?.user?.clearance || 'UNCLASSIFIED';
  const userCountry = session?.user?.countryOfAffiliation || CURRENT_INSTANCE;
  const userCOI = (session?.user as any)?.acpCOI || [];

  // Form state
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [classification, setClassification] = useState('UNCLASSIFIED');
  const [releasabilityTo, setReleasabilityTo] = useState<string[]>([userCountry]);
  const [COI, setCOI] = useState<string[]>([]);
  const [caveats, setCaveats] = useState<string[]>([]);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [resourceId, setResourceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Draft management
  const { hasDraft, draftAge, saveDraft, restoreDraft, clearDraft, dismissDraft, isSaving } =
    useUploadDraft();

  // History management
  const history = useUploadHistory({
    onUndo: (action) => uploadToast.undone(action),
    onRedo: (action) => uploadToast.redone(action),
  });

  // Auto-select user's country in releasability when session loads
  useEffect(() => {
    if (session && userCountry && !releasabilityTo.includes(userCountry)) {
      setReleasabilityTo(prev => {
        // Only update if the current value is just the default instance
        if (prev.length === 1 && prev[0] === CURRENT_INSTANCE && prev[0] !== userCountry) {
          return [userCountry];
        }
        return prev;
      });
    }
  }, [session, userCountry]);

  // Calculate current step for progress indicator
  const currentStep = useMemo(() => {
    if (!file) return 1;
    if (!title.trim()) return 2;
    if (releasabilityTo.length === 0) return 3;
    return 4;
  }, [file, title, releasabilityTo]);

  const stepLabels = ['File', 'Details', 'Security', 'Review'];

  // Auto-save draft
  useEffect(() => {
    if (!file && !title && !description) return;

    saveDraft({
      title,
      description,
      classification,
      releasabilityTo,
      COI,
      caveats,
      fileName: file?.name,
      fileSize: file?.size,
      fileType: file?.type,
    });
  }, [title, description, classification, releasabilityTo, COI, caveats, file, saveDraft]);

  // Push state to history on significant changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.history.pushState({
        classification,
        releasabilityTo,
        COI,
        caveats,
      }, '', window.location.href);
    }
  }, [classification, releasabilityTo, COI, caveats]);

  // Restore draft handler
  const handleRestoreDraft = useCallback(() => {
    const draft = restoreDraft();
    if (draft) {
      setTitle(draft.title);
      setDescription(draft.description);
      setClassification(draft.classification);
      setReleasabilityTo(draft.releasabilityTo);
      setCOI(draft.COI);
      setCaveats(draft.caveats);
      uploadToast.draftRestored();
    }
  }, [restoreDraft]);

  // Handle undo
  const handleUndo = useCallback(() => {
    const prevState = history.undo();
    if (prevState) {
      setClassification(prevState.classification);
      setReleasabilityTo(prevState.releasabilityTo);
      setCOI(prevState.COI);
      setCaveats(prevState.caveats);
    }
  }, [history]);

  // Handle redo
  const handleRedo = useCallback(() => {
    const nextState = history.redo();
    if (nextState) {
      setClassification(nextState.classification);
      setReleasabilityTo(nextState.releasabilityTo);
      setCOI(nextState.COI);
      setCaveats(nextState.caveats);
    }
  }, [history]);

  // Handle file selection trigger
  const handleSelectFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Handle clear form
  const handleClearForm = useCallback(() => {
    setFile(null);
    setTitle('');
    setDescription('');
    setClassification('UNCLASSIFIED');
    setReleasabilityTo([userCountry]);
    setCOI([]);
    setCaveats([]);
    setError(null);
    history.clearHistory();
    clearDraft();
    uploadToast.info('Form cleared');
  }, [userCountry, history, clearDraft]);

  // Handle view preview
  const handleViewPreview = useCallback(() => {
    previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Handle preset selection
  const handleSelectPreset = useCallback(
    (preset: 'user' | 'fvey' | 'nato') => {
      switch (preset) {
        case 'user':
          setReleasabilityTo([userCountry]);
          break;
        case 'fvey':
          setReleasabilityTo(['USA', 'GBR', 'CAN', 'AUS', 'NZL']);
          break;
        case 'nato':
          setReleasabilityTo(['USA', 'GBR', 'CAN', 'AUS', 'NZL', 'FRA', 'DEU', 'ESP', 'ITA', 'POL']);
          break;
      }
    },
    [userCountry]
  );

  // Keyboard shortcuts
  useUploadKeyboardShortcuts({
    onOpenPalette: () => setCommandPaletteOpen(true),
    onUploadFile: handleSelectFile,
    onClearForm: handleClearForm,
    onViewPreview: handleViewPreview,
    onUndo: handleUndo,
    onRedo: handleRedo,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    disabled: uploading,
  });

  // Generate display marking
  const displayMarking = useMemo(() => {
    const nationalLabel = getLocalizedClearance(classification, userCountry);
    const isDifferent = nationalLabel !== classification;

    const classificationPart = isDifferent
      ? `${nationalLabel} / ${classification} (${userCountry})`
      : classification;

    const parts = [classificationPart];
    if (releasabilityTo.length > 0 && releasabilityTo.length <= 3) {
      parts.push(`REL TO ${releasabilityTo.join(', ')}`);
    }
    if (COI.length > 0) {
      parts.push(COI.join('//'));
    }
    if (caveats.length > 0) {
      parts.push(caveats.join('//'));
    }
    return parts.join('//');
  }, [classification, releasabilityTo, COI, caveats, userCountry]);

  // Handle upload
  const handleUpload = async () => {
    if (!file) {
      uploadToast.error('Please select a file');
      return;
    }

    if (!title.trim()) {
      uploadToast.error('Please enter a document title');
      return;
    }

    if (releasabilityTo.length === 0) {
      uploadToast.error('Please select at least one country');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      // Simulate upload progress
      await simulateUploadProgress((progress, step) => {
        setUploadProgress(progress);
      });

      // Prepare form data
      const formData = new FormData();
      formData.append('file', file);
      formData.append('classification', classification);
      formData.append('releasabilityTo', JSON.stringify(releasabilityTo));
      formData.append('COI', JSON.stringify(COI));
      formData.append('caveats', JSON.stringify(caveats));
      formData.append('title', title.trim());
      if (description.trim()) {
        formData.append('description', description.trim());
      }

      const nationalLabel = getLocalizedClearance(classification, userCountry);
      formData.append('originalClassification', nationalLabel);
      formData.append('originalCountry', userCountry);

      // Upload via server API route
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Upload failed');
      }

      const result = await response.json();
      setResourceId(result.resourceId);
      setUploadComplete(true);
      clearDraft();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
      uploadToast.error(message);
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleUploadComplete = useCallback(() => {
    if (resourceId) {
      router.push(`/resources/${resourceId}`);
    }
  }, [resourceId, router]);

  const canUpload = file && title.trim() && releasabilityTo.length > 0 && !uploading;

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status !== 'loading' && !session) {
      router.push('/login');
    }
  }, [status, session, router]);

  // Loading state
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <PageLayout
      user={session.user}
      breadcrumbs={[{ label: 'Upload', href: null }]}
    >
      {/* Toaster */}
      <ValidationToaster />

      {/* Command Palette */}
      <UploadCommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onSelectFile={handleSelectFile}
        onSetClassification={setClassification}
        onToggleCountry={(country) =>
          setReleasabilityTo((prev) =>
            prev.includes(country) ? prev.filter((c) => c !== country) : [...prev, country]
          )
        }
        onSelectPreset={handleSelectPreset}
        onClearForm={handleClearForm}
        onViewPreview={handleViewPreview}
        onUndo={handleUndo}
        onRedo={handleRedo}
        currentClassification={classification}
        selectedCountries={releasabilityTo}
        userCountry={userCountry}
        userClearance={userClearance}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
      />

      {/* Upload Progress Overlay */}
      <AnimatePresence>
        {(uploading || uploadComplete) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          >
            <UploadProgressSteps
              progress={uploadProgress}
              isComplete={uploadComplete}
              onComplete={handleUploadComplete}
              redirectUrl={resourceId ? `/resources/${resourceId}` : undefined}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <motion.div
          className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-gradient-to-br from-blue-100/30 to-indigo-100/30 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-full blur-3xl"
          animate={
            shouldReduceMotion
              ? {}
              : {
                  scale: [1, 1.1, 1],
                  opacity: [0.3, 0.4, 0.3],
                }
          }
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-1/3 left-1/4 w-[400px] h-[400px] bg-gradient-to-br from-emerald-100/30 to-teal-100/30 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-full blur-3xl"
          animate={
            shouldReduceMotion
              ? {}
              : {
                  scale: [1, 1.15, 1],
                  opacity: [0.2, 0.35, 0.2],
                }
          }
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const selectedFile = e.target.files?.[0];
          if (selectedFile) setFile(selectedFile);
        }}
        accept=".pdf,.doc,.docx,.txt,.md,.csv,.png,.jpg,.jpeg,.gif,.json,.xml,.mp3,.m4a,.wav,.ogg,.webm,.mp4"
      />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Upload Classified Document
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Automatic ZTDF encryption and ACP-240 compliance
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCommandPaletteOpen(true)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium',
                'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
                'hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors'
              )}
            >
              <Command className="w-4 h-4" />
              <kbd className="text-[10px] px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">K</kbd>
            </button>

            <button
              onClick={handleUndo}
              disabled={!history.canUndo}
              className={cn(
                'p-2 rounded-lg transition-colors',
                history.canUndo
                  ? 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
              )}
              title="Undo (Cmd+Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>

            <button
              onClick={handleRedo}
              disabled={!history.canRedo}
              className={cn(
                'p-2 rounded-lg transition-colors',
                history.canRedo
                  ? 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
              )}
              title="Redo (Cmd+Shift+Z)"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Security badges */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-xs font-medium">
            <Shield className="w-3.5 h-3.5 mr-1.5" />
            ACP-240 Compliant
          </span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 text-xs font-medium">
            ZTDF Format
          </span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 text-xs font-medium">
            Auto Encryption
          </span>
        </div>
      </motion.div>

      {/* Draft Restore Banner */}
      <AnimatePresence>
        {hasDraft && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-blue-500" />
                <div>
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    Unsaved draft found
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300">{draftAge}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRestoreDraft}
                  className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Restore
                </button>
                <button
                  onClick={dismissDraft}
                  className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-800/30 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Step Indicator */}
      <BentoStepIndicator currentStep={currentStep} totalSteps={4} stepLabels={stepLabels} />

      {/* Error Display */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-red-900 dark:text-red-100">
                  Upload Error
                </h4>
                <p className="text-sm text-red-800 dark:text-red-200 mt-1">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-red-500 hover:text-red-700 dark:hover:text-red-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bento Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Column (2/3 width) */}
        <div className="lg:col-span-2 space-y-4">
          {/* File Dropzone */}
          <BentoCard id="file-dropzone" label="File selection" colSpan={2} delay={0} visible>
            <BentoCardHeader
              icon={<Upload className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
              title="Select File"
              subtitle="Drag and drop or click to browse"
              badge={file && <span className="text-xs text-green-600 font-medium">Selected</span>}
            />
            <BentoCardContent>
              <FileUploader file={file} onFileSelect={setFile} disabled={uploading} />
            </BentoCardContent>
          </BentoCard>

          {/* Document Metadata */}
          <AnimatePresence>
            {file && (
              <BentoCard
                id="metadata"
                label="Document metadata"
                colSpan={2}
                delay={1}
                visible={!!file}
              >
                <BentoCardHeader
                  icon={<FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
                  title="Document Information"
                  subtitle="Title and description"
                />
                <BentoCardContent>
                  <div className="space-y-4">
                    <div>
                      <label
                        htmlFor="title"
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                      >
                        Document Title <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="title"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g., NATO Operational Brief - Exercise Eagle"
                        className={cn(
                          'block w-full px-4 py-2.5 rounded-xl border',
                          'border-gray-200 dark:border-gray-700',
                          'bg-white dark:bg-gray-800',
                          'focus:outline-none focus:ring-2 focus:ring-blue-500',
                          'text-gray-900 dark:text-gray-100',
                          'placeholder:text-gray-400 dark:placeholder:text-gray-500'
                        )}
                        disabled={uploading}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="description"
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                      >
                        Description <span className="text-gray-400">(Optional)</span>
                      </label>
                      <textarea
                        id="description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Brief description of document contents..."
                        rows={3}
                        className={cn(
                          'block w-full px-4 py-2.5 rounded-xl border',
                          'border-gray-200 dark:border-gray-700',
                          'bg-white dark:bg-gray-800',
                          'focus:outline-none focus:ring-2 focus:ring-blue-500',
                          'text-gray-900 dark:text-gray-100',
                          'placeholder:text-gray-400 dark:placeholder:text-gray-500'
                        )}
                        disabled={uploading}
                      />
                    </div>
                  </div>
                </BentoCardContent>
              </BentoCard>
            )}
          </AnimatePresence>

          {/* Security Classification */}
          <AnimatePresence>
            {file && title.trim() && (
              <BentoCard
                id="security"
                label="Security classification"
                colSpan={2}
                delay={2}
                visible={!!file && !!title.trim()}
              >
                <BentoCardHeader
                  icon={<Shield className="w-5 h-5 text-orange-600 dark:text-orange-400" />}
                  title="Security Classification"
                  subtitle="Classification, releasability, and caveats"
                />
                <BentoCardContent>
                  <SecurityLabelForm
                    userClearance={userClearance}
                    userCountry={userCountry}
                    userCOI={userCOI}
                    classification={classification}
                    releasabilityTo={releasabilityTo}
                    COI={COI}
                    caveats={caveats}
                    onClassificationChange={setClassification}
                    onReleasabilityChange={setReleasabilityTo}
                    onCOIChange={setCOI}
                    onCaveatsChange={setCaveats}
                    disabled={uploading}
                  />
                </BentoCardContent>
              </BentoCard>
            )}
          </AnimatePresence>

          {/* Upload Actions */}
          <AnimatePresence>
            {file && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <Link
                    href="/resources"
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </Link>
                  <button
                    onClick={handleClearForm}
                    className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                    disabled={uploading}
                  >
                    Clear
                  </button>
                </div>

                <button
                  onClick={handleUpload}
                  disabled={!canUpload}
                  className={cn(
                    'flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all',
                    canUpload
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md hover:shadow-lg hover:from-blue-700 hover:to-indigo-700'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  )}
                >
                  <Upload className="w-4 h-4" />
                  {uploading ? 'Uploading...' : 'Upload Document'}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Column - Preview (sticky) */}
        <div ref={previewRef} className="lg:col-span-1">
          <div className="sticky top-4 space-y-4">
            {/* Live Preview */}
            <BentoCard id="preview" label="Upload preview" delay={0} visible>
              <BentoCardHeader
                icon={<Eye className="w-5 h-5 text-purple-600 dark:text-purple-400" />}
                title="Upload Preview"
                subtitle="Real-time preview"
              />
              <BentoCardContent>
                <div className="space-y-4">
                  {/* File Info */}
                  <div>
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      File
                    </dt>
                    <dd className="text-sm text-gray-900 dark:text-gray-100">
                      {file ? (
                        <span className="font-medium text-green-700 dark:text-green-300">
                          {file.name}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">No file selected</span>
                      )}
                    </dd>
                  </div>

                  {/* Title */}
                  <div>
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Title
                    </dt>
                    <dd className="text-sm text-gray-900 dark:text-gray-100">
                      {title.trim() || <span className="text-gray-400 italic">Not set</span>}
                    </dd>
                  </div>

                  {/* Display Marking */}
                  <div>
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      STANAG 4774 Marking
                    </dt>
                    <dd>
                      <div
                        className={cn(
                          'inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold border-2',
                          classificationColors[classification]
                        )}
                      >
                        <Shield className="w-3.5 h-3.5 mr-1.5" />
                        <span className="font-mono">{displayMarking}</span>
                      </div>
                    </dd>
                  </div>

                  {/* Releasability */}
                  <div>
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Releasable To
                    </dt>
                    <dd className="text-sm font-mono text-gray-900 dark:text-gray-100">
                      {releasabilityTo.length > 0 ? releasabilityTo.join(', ') : 'None'}
                    </dd>
                  </div>

                  {/* COI */}
                  {COI.length > 0 && (
                    <div>
                      <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Communities of Interest
                      </dt>
                      <dd className="text-sm font-mono text-gray-900 dark:text-gray-100">
                        {COI.join(', ')}
                      </dd>
                    </div>
                  )}

                  {/* Caveats */}
                  {caveats.length > 0 && (
                    <div>
                      <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Handling Caveats
                      </dt>
                      <dd className="flex flex-wrap gap-1">
                        {caveats.map((caveat) => (
                          <span
                            key={caveat}
                            className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 text-xs font-mono font-bold rounded"
                          >
                            {caveat}
                          </span>
                        ))}
                      </dd>
                    </div>
                  )}

                  {/* Encryption */}
                  <div>
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Encryption
                    </dt>
                    <dd className="flex items-center gap-2 text-sm">
                      <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 text-xs font-semibold rounded">
                        ZTDF
                      </span>
                      <span className="text-xs text-gray-600 dark:text-gray-400">AES-256-GCM</span>
                    </dd>
                  </div>
                </div>
              </BentoCardContent>
            </BentoCard>

            {/* User Permissions */}
            <BentoCard id="permissions" label="Your permissions" delay={1} visible>
              <BentoCardHeader
                icon={<Globe className="w-5 h-5 text-green-600 dark:text-green-400" />}
                title={t('upload.permissions.title')}
                subtitle={t('upload.permissions.subtitle')}
              />
              <BentoCardContent>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-600 dark:text-gray-400">{t('upload.permissions.yourClearance')}:</dt>
                    <dd className="font-mono font-semibold text-gray-900 dark:text-gray-100">
                      {getLocalizedClearance(userClearance, userCountry)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-600 dark:text-gray-400">{t('upload.permissions.yourCountry')}:</dt>
                    <dd className="font-mono font-semibold text-gray-900 dark:text-gray-100">
                      {userCountry}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-600 dark:text-gray-400">{t('upload.permissions.maxClassification')}:</dt>
                    <dd className="font-mono font-semibold text-gray-900 dark:text-gray-100">
                      {getLocalizedClearance(userClearance, userCountry)}
                    </dd>
                  </div>
                </dl>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
                  {t('upload.permissions.warning')}
                </p>
              </BentoCardContent>
            </BentoCard>

            {/* Keyboard Shortcuts */}
            <BentoCard id="shortcuts" label="Keyboard shortcuts" delay={2} visible>
              <BentoCardHeader
                icon={<Keyboard className="w-5 h-5 text-gray-600 dark:text-gray-400" />}
                title="Keyboard Shortcuts"
              />
              <BentoCardContent>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">Command Palette</span>
                    <kbd className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded font-mono">
                      ⌘K
                    </kbd>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">Upload File</span>
                    <kbd className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded font-mono">
                      ⌘U
                    </kbd>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">Undo</span>
                    <kbd className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded font-mono">
                      ⌘Z
                    </kbd>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">Redo</span>
                    <kbd className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded font-mono">
                      ⌘⇧Z
                    </kbd>
                  </div>
                </div>
              </BentoCardContent>
            </BentoCard>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
