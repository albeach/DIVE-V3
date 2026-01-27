/**
 * Modern File Uploader - 2026 UI/UX
 *
 * Enhanced file dropzone with:
 * - Drag-and-drop support (react-dropzone)
 * - Paste-from-clipboard support
 * - Camera capture for mobile devices
 * - File preview thumbnails (images/PDFs)
 * - Framer Motion animations
 * - Skeleton loading states
 * - Haptic-style success feedback
 * - Full accessibility support
 */

'use client';

import { useCallback, useState, useEffect, useRef } from 'react';
import { useDropzone, FileRejection } from 'react-dropzone';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Upload,
  FileText,
  Image as ImageIcon,
  X,
  Camera,
  Clipboard,
  CheckCircle2,
  AlertCircle,
  File,
} from 'lucide-react';

interface FileUploaderProps {
  file: File | null;
  onFileSelect: (file: File | null) => void;
  disabled?: boolean;
  className?: string;
}

const ACCEPTED_FILE_TYPES = {
  // Documents
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/plain': ['.txt'],
  'text/markdown': ['.md'],
  'text/csv': ['.csv'],
  'application/json': ['.json'],
  'application/xml': ['.xml'],
  // Images
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/gif': ['.gif'],
  // Audio (STANAG 4774/4778 compliant)
  'audio/mpeg': ['.mp3'],
  'audio/mp4': ['.m4a'],
  'audio/x-m4a': ['.m4a'],  // M4A alternative MIME type
  'audio/wav': ['.wav'],
  'audio/x-wav': ['.wav'],
  'audio/webm': ['.webm'],
  'audio/ogg': ['.ogg'],
  // Video (STANAG 4774/4778 compliant)
  'video/mp4': ['.mp4'],
  'video/webm': ['.webm'],
  'video/ogg': ['.ogg'],
};

// 500MB max for multimedia files
const MAX_FILE_SIZE = 500 * 1024 * 1024;

// Animation variants
const dropzoneVariants = {
  idle: {
    scale: 1,
    borderColor: 'rgb(209, 213, 219)', // gray-300
  },
  hover: {
    scale: 1.01,
    borderColor: 'rgb(59, 130, 246)', // blue-500
    transition: { type: 'spring', stiffness: 400, damping: 25 },
  },
  active: {
    scale: 1.02,
    borderColor: 'rgb(34, 197, 94)', // green-500
    transition: { type: 'spring', stiffness: 400, damping: 25 },
  },
};

const fileCardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 300, damping: 25 },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.15 },
  },
};

const successPulseVariants = {
  initial: { scale: 0, opacity: 0 },
  animate: {
    scale: [0, 1.2, 1],
    opacity: [0, 1, 1],
    transition: { duration: 0.4, ease: 'easeOut' },
  },
};

export default function FileUploader({
  file,
  onFileSelect,
  disabled = false,
  className,
}: FileUploaderProps) {
  const shouldReduceMotion = useReducedMotion();
  const [preview, setPreview] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [pasteSupported, setPasteSupported] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Check for clipboard API support
  useEffect(() => {
    setPasteSupported(typeof navigator !== 'undefined' && 'clipboard' in navigator);
  }, []);

  // Generate preview for images
  useEffect(() => {
    if (file && file.type.startsWith('image/')) {
      const objectUrl = URL.createObjectURL(file);
      setPreview(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    }
    setPreview(null);
  }, [file]);

  // Handle file drop
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0 && !disabled) {
        onFileSelect(acceptedFiles[0]);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 1500);
      }
    },
    [onFileSelect, disabled]
  );

  // Handle paste from clipboard
  const handlePaste = useCallback(
    async (event: ClipboardEvent) => {
      if (disabled) return;

      const items = event.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.kind === 'file') {
          const pastedFile = item.getAsFile();
          if (pastedFile) {
            // Check if file type is accepted
            const isAccepted = Object.keys(ACCEPTED_FILE_TYPES).some(
              (type) =>
                pastedFile.type === type ||
                pastedFile.type.startsWith(type.split('/')[0] + '/')
            );
            if (isAccepted && pastedFile.size <= MAX_FILE_SIZE) {
              onFileSelect(pastedFile);
              setShowSuccess(true);
              setTimeout(() => setShowSuccess(false), 1500);
              event.preventDefault();
              return;
            }
          }
        }
      }
    },
    [onFileSelect, disabled]
  );

  // Setup paste listener
  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const { getRootProps, getInputProps, isDragActive, isDragAccept, isDragReject, fileRejections } =
    useDropzone({
      onDrop,
      accept: ACCEPTED_FILE_TYPES,
      maxSize: MAX_FILE_SIZE,
      maxFiles: 1,
      multiple: false,
      disabled,
    });

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFileSelect(null);
    setPreview(null);
  };

  const handleCameraCapture = () => {
    cameraInputRef.current?.click();
  };

  const handleCameraChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFileSelect(files[0]);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 1500);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) return <ImageIcon className="w-8 h-8" />;
    if (fileType.includes('pdf')) return <FileText className="w-8 h-8" />;
    return <File className="w-8 h-8" />;
  };

  const getDropzoneState = () => {
    if (isDragReject) return 'reject';
    if (isDragAccept || isDragActive) return 'active';
    return 'idle';
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Hidden camera input for mobile */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleCameraChange}
        aria-hidden="true"
      />

      {/* Drop Zone */}
      <AnimatePresence mode="wait">
        {!file && (
          <motion.div
            key="dropzone"
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <div {...getRootProps()}>
              <motion.div
                variants={shouldReduceMotion ? undefined : dropzoneVariants}
                initial="idle"
                animate={getDropzoneState()}
                whileHover={disabled ? undefined : 'hover'}
                className={cn(
                  'relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all',
                  'bg-gradient-to-br from-gray-50 to-white dark:from-gray-800 dark:to-gray-900',
                  isDragActive && 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20',
                  isDragReject && 'border-red-500 bg-red-50/50 dark:bg-red-900/20',
                  disabled && 'opacity-50 cursor-not-allowed',
                  !disabled && 'hover:bg-gray-50/80 dark:hover:bg-gray-800/80'
                )}
                role="button"
                aria-label="File upload dropzone. Click to select a file or drag and drop."
                tabIndex={disabled ? -1 : 0}
              >
              <input {...getInputProps()} aria-label="File input" />

              {/* Background Pattern */}
              <div className="absolute inset-0 opacity-5 pointer-events-none">
                <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
                      <path
                        d="M 32 0 L 0 0 0 32"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1"
                      />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid)" />
                </svg>
              </div>

              <div className="relative flex flex-col items-center">
                {/* Icon */}
                <motion.div
                  className={cn(
                    'w-16 h-16 rounded-2xl flex items-center justify-center mb-4',
                    'bg-gradient-to-br from-blue-500/10 to-indigo-500/10 dark:from-blue-500/20 dark:to-indigo-500/20'
                  )}
                  animate={
                    isDragActive && !shouldReduceMotion
                      ? {
                          scale: [1, 1.1, 1],
                          transition: { duration: 0.5, repeat: Infinity },
                        }
                      : {}
                  }
                >
                  <Upload
                    className={cn(
                      'w-8 h-8 transition-colors',
                      isDragActive
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-gray-400 dark:text-gray-500'
                    )}
                  />
                </motion.div>

                {/* Text */}
                {isDragActive ? (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-lg font-medium text-blue-600 dark:text-blue-400"
                  >
                    Drop file here...
                  </motion.p>
                ) : (
                  <>
                    <p className="text-lg font-medium text-gray-700 dark:text-gray-200 mb-2">
                      Drag and drop your file here
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                      or click to browse
                    </p>
                  </>
                )}

                {/* Action Buttons */}
                {!isDragActive && (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {/* Paste button */}
                    {pasteSupported && (
                      <motion.button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.read().then((items) => {
                            for (const item of items) {
                              const imageType = item.types.find((t) => t.startsWith('image/'));
                              if (imageType) {
                                item.getType(imageType).then((blob) => {
                                  const pastedFile = new (File as any)([blob], 'pasted-image.png', {
                                    type: imageType,
                                  });
                                  onFileSelect(pastedFile);
                                  setShowSuccess(true);
                                  setTimeout(() => setShowSuccess(false), 1500);
                                });
                                break;
                              }
                            }
                          });
                        }}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                          'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
                          'hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors'
                        )}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        aria-label="Paste from clipboard"
                      >
                        <Clipboard className="w-3.5 h-3.5" />
                        Paste
                      </motion.button>
                    )}

                    {/* Camera button (mobile) */}
                    <motion.button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCameraCapture();
                      }}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                        'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
                        'hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors',
                        'sm:hidden' // Only show on mobile
                      )}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      aria-label="Capture from camera"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      Camera
                    </motion.button>
                  </div>
                )}

                {/* File type info */}
                {!isDragActive && (
                  <div className="mt-4 text-xs text-gray-400 dark:text-gray-500">
                    <p>PDF, DOCX, TXT, Markdown, Images (PNG, JPG, GIF)</p>
                    <p className="mt-1">Maximum file size: 100 MB</p>
                  </div>
                )}
              </div>
            </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* File Rejections */}
      <AnimatePresence>
        {fileRejections.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4"
            role="alert"
            aria-live="polite"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-red-900 dark:text-red-100 mb-1">
                  File Rejected
                </h4>
                {fileRejections.map(({ file: rejectedFile, errors }: FileRejection) => (
                  <div key={rejectedFile.name} className="text-sm text-red-800 dark:text-red-200">
                    <p className="font-medium">{rejectedFile.name}</p>
                    <ul className="list-disc list-inside mt-1 text-xs">
                      {errors.map((error) => (
                        <li key={error.code}>
                          {error.code === 'file-too-large'
                            ? 'File is too large (max 100 MB)'
                            : error.code === 'file-invalid-type'
                            ? 'Invalid file type'
                            : error.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selected File Display */}
      <AnimatePresence mode="wait">
        {file && (
          <motion.div
            key="file-card"
            variants={shouldReduceMotion ? undefined : fileCardVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(
              'relative overflow-hidden rounded-2xl',
              'bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900',
              'border border-gray-200 dark:border-gray-700',
              'shadow-sm'
            )}
          >
            {/* Success pulse overlay */}
            <AnimatePresence>
              {showSuccess && (
                <motion.div
                  variants={shouldReduceMotion ? undefined : successPulseVariants}
                  initial="initial"
                  animate="animate"
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-green-500/10 flex items-center justify-center z-10"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="bg-green-500 rounded-full p-3"
                  >
                    <CheckCircle2 className="w-8 h-8 text-white" />
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="p-4">
              <div className="flex items-start gap-4">
                {/* Preview or Icon */}
                <div className="flex-shrink-0">
                  {preview ? (
                    <motion.div
                      className="relative w-16 h-16 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700"
                      layoutId="file-preview"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={preview}
                        alt="File preview"
                        className="w-full h-full object-cover"
                      />
                    </motion.div>
                  ) : (
                    <div
                      className={cn(
                        'w-16 h-16 rounded-xl flex items-center justify-center',
                        'bg-gradient-to-br from-blue-500/10 to-indigo-500/10 dark:from-blue-500/20 dark:to-indigo-500/20',
                        'text-blue-600 dark:text-blue-400'
                      )}
                    >
                      {getFileIcon(file.type)}
                    </div>
                  )}
                </div>

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {formatFileSize(file.size)} • {file.type || 'Unknown type'}
                      </p>
                    </div>

                    {/* Remove button */}
                    <motion.button
                      type="button"
                      onClick={handleRemove}
                      className={cn(
                        'flex-shrink-0 p-1.5 rounded-lg',
                        'text-gray-400 hover:text-red-500',
                        'hover:bg-red-50 dark:hover:bg-red-900/20',
                        'transition-colors'
                      )}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      aria-label="Remove file"
                    >
                      <X className="w-4 h-4" />
                    </motion.button>
                  </div>

                  {/* Status badges */}
                  <div className="flex items-center gap-2 mt-2">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                        'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      )}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      Ready to upload
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom accent bar */}
            <div className="h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Keyboard shortcut hint */}
      {!file && pasteSupported && (
        <p className="text-center text-xs text-gray-400 dark:text-gray-500">
          Tip: Press <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[10px] font-mono">Ctrl+V</kbd> to paste from clipboard
        </p>
      )}
    </div>
  );
}
