'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

interface FileUploaderProps {
  file: File | null;
  onFileSelect: (file: File | null) => void;
}

const ACCEPTED_FILE_TYPES = {
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/plain': ['.txt'],
  'text/markdown': ['.md'],
  'text/csv': ['.csv'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/gif': ['.gif']
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default function FileUploader({ file, onFileSelect }: FileUploaderProps) {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      onFileSelect(acceptedFiles[0]);
    }
  }, [onFileSelect]);

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: ACCEPTED_FILE_TYPES,
    maxSize: MAX_FILE_SIZE,
    maxFiles: 1,
    multiple: false
  });

  const handleRemove = () => {
    onFileSelect(null);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      {!file && (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragActive
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 hover:border-gray-400 bg-white'
          }`}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center">
            <svg
              className="w-12 h-12 text-gray-400 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            {isDragActive ? (
              <p className="text-lg text-blue-600 font-medium">Drop file here...</p>
            ) : (
              <>
                <p className="text-lg text-gray-700 font-medium mb-2">
                  📁 Drag and drop file here
                </p>
                <p className="text-sm text-gray-500 mb-4">or click to browse</p>
                <p className="text-xs text-gray-400">
                  Accepted: PDF, DOCX, TXT, Markdown, Images (PNG, JPG, GIF)
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Maximum file size: 10 MB
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* File Rejections */}
      {fileRejections.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-red-900 mb-2">
            ⚠️ File Rejected
          </h4>
          {fileRejections.map(({ file, errors }) => (
            <div key={file.name} className="text-sm text-red-800">
              <p className="font-medium">{file.name}</p>
              <ul className="list-disc list-inside mt-1">
                {errors.map(error => (
                  <li key={error.code}>
                    {error.code === 'file-too-large'
                      ? 'File is too large (max 10 MB)'
                      : error.code === 'file-invalid-type'
                      ? 'Invalid file type'
                      : error.message}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Selected File Display */}
      {file && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                {file.type.startsWith('image/') ? (
                  <span className="text-3xl">🖼️</span>
                ) : file.type.includes('pdf') ? (
                  <span className="text-3xl">📄</span>
                ) : (
                  <span className="text-3xl">📝</span>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{file.name}</p>
                <p className="text-xs text-gray-500">
                  {formatFileSize(file.size)} • {file.type}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRemove}
              className="text-red-600 hover:text-red-800 text-sm font-medium"
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

