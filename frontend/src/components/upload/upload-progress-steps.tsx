/**
 * Upload Progress Steps - 2026 Modern UX
 *
 * Multi-step upload progress indicator with:
 * - Step 1: Uploading (0-30%)
 * - Step 2: Encrypting with ZTDF (30-60%)
 * - Step 3: Generating labels (60-90%)
 * - Step 4: KAS binding (90-100%)
 *
 * Each step shows:
 * - Icon (animated spinner or checkmark)
 * - Step name
 * - Estimated time remaining
 *
 * Celebration animation on 100%:
 * - Confetti burst
 * - Success checkmark with scale-in animation
 * - "Redirecting..." with countdown
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import {
  Upload,
  Lock,
  FileText,
  Key,
  CheckCircle2,
  Loader2,
  ArrowRight,
} from 'lucide-react';

// Dynamically import confetti to reduce initial bundle
const ReactConfetti = dynamic(() => import('react-confetti'), {
  ssr: false,
  loading: () => null,
});

// Upload steps configuration
const UPLOAD_STEPS = [
  {
    id: 'uploading',
    name: 'Uploading',
    description: 'Sending file to secure server',
    icon: Upload,
    startProgress: 0,
    endProgress: 30,
    estimatedDuration: 2000, // 2s
  },
  {
    id: 'encrypting',
    name: 'Encrypting',
    description: 'AES-256-GCM encryption with ZTDF',
    icon: Lock,
    startProgress: 30,
    endProgress: 60,
    estimatedDuration: 3000, // 3s
  },
  {
    id: 'labeling',
    name: 'Generating Labels',
    description: 'STANAG 4774/4778 security labels',
    icon: FileText,
    startProgress: 60,
    endProgress: 90,
    estimatedDuration: 2000, // 2s
  },
  {
    id: 'binding',
    name: 'KAS Binding',
    description: 'Creating policy object',
    icon: Key,
    startProgress: 90,
    endProgress: 100,
    estimatedDuration: 1000, // 1s
  },
];

interface UploadProgressStepsProps {
  progress: number;
  isComplete: boolean;
  onComplete?: () => void;
  redirectUrl?: string;
  redirectDelay?: number;
  className?: string;
}

// Animation variants
const containerVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.3,
      staggerChildren: 0.1,
    },
  },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
};

const stepVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0 },
};

const successVariants = {
  hidden: { scale: 0, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 20,
    },
  },
};

const pulseVariants = {
  pulse: {
    scale: [1, 1.05, 1],
    transition: {
      duration: 1,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

export default function UploadProgressSteps({
  progress,
  isComplete,
  onComplete,
  redirectUrl,
  redirectDelay = 2000,
  className,
}: UploadProgressStepsProps) {
  const shouldReduceMotion = useReducedMotion();
  const [showConfetti, setShowConfetti] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(redirectDelay / 1000);
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });

  // Track window size for confetti
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Calculate current step based on progress
  const currentStep = useMemo(() => {
    for (let i = UPLOAD_STEPS.length - 1; i >= 0; i--) {
      if (progress >= UPLOAD_STEPS[i].startProgress) {
        return UPLOAD_STEPS[i];
      }
    }
    return UPLOAD_STEPS[0];
  }, [progress]);

  // Show confetti on complete
  useEffect(() => {
    if (isComplete && !shouldReduceMotion) {
      setShowConfetti(true);
      // Stop confetti after 4 seconds
      const timer = setTimeout(() => setShowConfetti(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [isComplete, shouldReduceMotion]);

  // Countdown for redirect
  useEffect(() => {
    if (!isComplete) return;

    const interval = setInterval(() => {
      setRedirectCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          // Schedule navigation after state update completes
          setTimeout(() => onComplete?.(), 0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isComplete, onComplete]);

  // Calculate step progress within current step
  const stepProgress = useMemo(() => {
    if (isComplete) return 100;
    const stepRange = currentStep.endProgress - currentStep.startProgress;
    const progressInStep = progress - currentStep.startProgress;
    return Math.min((progressInStep / stepRange) * 100, 100);
  }, [progress, currentStep, isComplete]);

  return (
    <>
      {/* Confetti */}
      <AnimatePresence>
        {showConfetti && windowSize.width > 0 && (
          <ReactConfetti
            width={windowSize.width}
            height={windowSize.height}
            recycle={false}
            numberOfPieces={300}
            gravity={0.2}
            colors={['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444']}
          />
        )}
      </AnimatePresence>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className={cn(
          'bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4',
          className
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-progress-title"
        aria-describedby="upload-progress-description"
      >
        {/* Header */}
        <div className="text-center mb-6">
          <AnimatePresence mode="wait">
            {isComplete ? (
              <motion.div
                key="success"
                variants={successVariants}
                initial="hidden"
                animate="visible"
                className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-4"
              >
                <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
              </motion.div>
            ) : (
              <motion.div
                key="progress"
                variants={pulseVariants}
                animate={shouldReduceMotion ? undefined : 'pulse'}
                className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-4"
              >
                <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
              </motion.div>
            )}
          </AnimatePresence>

          <h2
            id="upload-progress-title"
            className="text-lg font-semibold text-gray-900 dark:text-gray-100"
          >
            {isComplete ? 'Upload Complete!' : 'Uploading Document'}
          </h2>
          <p
            id="upload-progress-description"
            className="text-sm text-gray-500 dark:text-gray-400 mt-1"
          >
            {isComplete
              ? `Redirecting in ${redirectCountdown}s...`
              : currentStep.description}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-gray-600 dark:text-gray-400">{currentStep.name}</span>
            <span className="font-mono text-gray-900 dark:text-gray-100">{Math.round(progress)}%</span>
          </div>
          <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <motion.div
              className={cn(
                'h-full rounded-full',
                isComplete
                  ? 'bg-gradient-to-r from-green-400 to-green-600'
                  : 'bg-gradient-to-r from-blue-400 via-indigo-500 to-purple-500'
              )}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Steps List */}
        <div className="space-y-3">
          {UPLOAD_STEPS.map((step, index) => {
            const StepIcon = step.icon;
            const isActive = currentStep.id === step.id && !isComplete;
            const isCompleted = progress >= step.endProgress || isComplete;
            const isPending = progress < step.startProgress && !isComplete;

            return (
              <motion.div
                key={step.id}
                variants={stepVariants}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-xl transition-colors',
                  isActive && 'bg-blue-50 dark:bg-blue-900/20',
                  isCompleted && !isActive && 'bg-green-50/50 dark:bg-green-900/10',
                  isPending && 'opacity-50'
                )}
              >
                {/* Step Icon */}
                <div
                  className={cn(
                    'flex items-center justify-center w-10 h-10 rounded-xl transition-colors',
                    isCompleted && 'bg-green-100 dark:bg-green-900/30',
                    isActive && 'bg-blue-100 dark:bg-blue-900/30',
                    isPending && 'bg-gray-100 dark:bg-gray-700'
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle2
                      className={cn(
                        'w-5 h-5',
                        isCompleted && 'text-green-600 dark:text-green-400'
                      )}
                    />
                  ) : isActive ? (
                    <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
                  ) : (
                    <StepIcon className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                  )}
                </div>

                {/* Step Info */}
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      'text-sm font-medium',
                      isCompleted && 'text-green-700 dark:text-green-300',
                      isActive && 'text-blue-700 dark:text-blue-300',
                      isPending && 'text-gray-500 dark:text-gray-400'
                    )}
                  >
                    {step.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {step.description}
                  </p>
                </div>

                {/* Step Status */}
                <div className="flex-shrink-0">
                  {isCompleted && (
                    <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                      Done
                    </span>
                  )}
                  {isActive && (
                    <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                      {Math.round(stepProgress)}%
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Security Standards */}
        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex flex-wrap gap-2 justify-center">
            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-medium rounded-full">
              ACP-240
            </span>
            <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-[10px] font-medium rounded-full">
              ZTDF v1.2
            </span>
            <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-[10px] font-medium rounded-full">
              STANAG 4774
            </span>
            <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-[10px] font-medium rounded-full">
              AES-256-GCM
            </span>
          </div>
        </div>

        {/* Complete Actions */}
        <AnimatePresence>
          {isComplete && redirectUrl && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-4"
            >
              <a
                href={redirectUrl}
                className={cn(
                  'flex items-center justify-center gap-2 w-full px-4 py-2',
                  'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700',
                  'text-white font-medium rounded-xl',
                  'transition-all shadow-md hover:shadow-lg'
                )}
              >
                View Document
                <ArrowRight className="w-4 h-4" />
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
}

// Hook to simulate upload progress
export function useUploadProgress() {
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [currentStep, setCurrentStep] = useState('');

  const startUpload = () => {
    setIsUploading(true);
    setIsComplete(false);
    setProgress(0);
  };

  const updateProgress = (newProgress: number, step: string) => {
    setProgress(newProgress);
    setCurrentStep(step);
    if (newProgress >= 100) {
      setIsComplete(true);
      setIsUploading(false);
    }
  };

  const reset = () => {
    setProgress(0);
    setIsUploading(false);
    setIsComplete(false);
    setCurrentStep('');
  };

  return {
    progress,
    isUploading,
    isComplete,
    currentStep,
    startUpload,
    updateProgress,
    reset,
  };
}

// Simulate realistic upload progress
export async function simulateUploadProgress(
  onProgress: (progress: number, step: string) => void
): Promise<void> {
  const steps = [
    { progress: 10, step: 'Uploading file...', delay: 300 },
    { progress: 20, step: 'Uploading file...', delay: 400 },
    { progress: 30, step: 'Uploading complete', delay: 200 },
    { progress: 40, step: 'Encrypting with ZTDF...', delay: 500 },
    { progress: 50, step: 'Encrypting with ZTDF...', delay: 600 },
    { progress: 60, step: 'Encryption complete', delay: 200 },
    { progress: 70, step: 'Generating security labels...', delay: 400 },
    { progress: 80, step: 'Applying STANAG 4774...', delay: 500 },
    { progress: 90, step: 'Labels complete', delay: 200 },
    { progress: 95, step: 'Creating KAS binding...', delay: 300 },
    { progress: 100, step: 'Upload complete!', delay: 0 },
  ];

  for (const step of steps) {
    onProgress(step.progress, step.step);
    if (step.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, step.delay));
    }
  }
}
