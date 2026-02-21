'use client';

import { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Copy,
  Check,
  Download,
  ChevronUp,
  ChevronDown,
  Search,
  X,
  FileCode,
  Info,
  Maximize2,
  Minimize2
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface RegoCodeEditorProps {
  source: string;
  onChange: (source: string) => void;
  readOnly?: boolean;
  minHeight?: string;
  maxHeight?: string;
  showLineNumbers?: boolean;
  showMinimap?: boolean;
  showHeader?: boolean;
  filename?: string;
  highlightLine?: number | null;
  onLineClick?: (lineNumber: number) => void;
  className?: string;
}

interface TokenMatch {
  index: number;
  length: number;
  className: string;
}

// ============================================================================
// SYNTAX HIGHLIGHTING CONFIG
// ============================================================================

// Rego keywords
const KEYWORDS = new Set([
  'package', 'import', 'default', 'if', 'else', 'not', 'as', 'with',
  'some', 'every', 'in', 'contains', 'null', 'true', 'false'
]);

// OPA built-in functions
const BUILTINS = new Set([
  'count', 'sum', 'product', 'max', 'min', 'sort', 'all', 'any',
  'abs', 'round', 'ceil', 'floor', 'rem',
  'concat', 'contains', 'endswith', 'format_int', 'indexof', 'lower',
  'replace', 'split', 'sprintf', 'startswith', 'substring', 'trim',
  'trim_left', 'trim_prefix', 'trim_right', 'trim_suffix', 'trim_space', 'upper',
  'base64', 'urlquery', 'json', 'yaml', 'http', 'net', 'rego', 'uuid',
  'regex', 'glob', 'semver', 'time', 'crypto', 'io', 'print', 'trace'
]);

// Token patterns
const PATTERNS = {
  comment: /#.*/g,
  string: /"(?:[^"\\]|\\.)*"|`[^`]*`/g,
  number: /\b\d+(?:\.\d+)?\b/g,
  operator: /:=|==|!=|<=|>=|<|>|\+|-|\*|\/|%|&|\|/g,
  bracket: /[\[\]{}()]/g,
  keyword: /\b(?:package|import|default|if|else|not|as|with|some|every|in|contains|null|true|false)\b/g,
  builtin: /\b(?:count|sum|product|max|min|sort|all|any|abs|round|ceil|floor|rem|concat|contains|endswith|format_int|indexof|lower|replace|split|sprintf|startswith|substring|trim|trim_left|trim_prefix|trim_right|trim_suffix|trim_space|upper|base64|urlquery|json|yaml|http|net|rego|uuid|regex|glob|semver|time|crypto|io|print|trace)\b/g,
  variable: /\binput\b|\bdata\b/g,
  constant: /\b[A-Z][A-Z0-9_]+\b/g
};

// Token class mappings
const TOKEN_CLASSES = {
  comment: 'text-gray-500 italic',
  string: 'text-emerald-400',
  number: 'text-amber-400',
  operator: 'text-pink-400',
  bracket: 'text-gray-400',
  keyword: 'text-purple-400 font-medium',
  builtin: 'text-cyan-400',
  variable: 'text-cyan-300',
  constant: 'text-amber-300'
};

// ============================================================================
// SYNTAX HIGHLIGHTING FUNCTION
// ============================================================================

function tokenizeLine(line: string): React.ReactNode[] {
  if (!line.trim()) {
    return [<span key="empty">&nbsp;</span>];
  }

  // Check for comment first (takes precedence)
  if (line.trim().startsWith('#')) {
    return [<span key="comment" className={TOKEN_CLASSES.comment}>{line}</span>];
  }

  const tokens: TokenMatch[] = [];

  // Find all token matches
  Object.entries(PATTERNS).forEach(([type, pattern]) => {
    if (type === 'comment') return; // Handle comments separately

    const regex = new RegExp(pattern.source, 'g');
    let match;
    while ((match = regex.exec(line)) !== null) {
      tokens.push({
        index: match.index,
        length: match[0].length,
        className: TOKEN_CLASSES[type as keyof typeof TOKEN_CLASSES]
      });
    }
  });

  // Sort tokens by index, then by length (longer matches first for overlaps)
  tokens.sort((a, b) => a.index - b.index || b.length - a.length);

  // Remove overlapping tokens (keep the first one)
  const filteredTokens: TokenMatch[] = [];
  let lastEnd = 0;
  for (const token of tokens) {
    if (token.index >= lastEnd) {
      filteredTokens.push(token);
      lastEnd = token.index + token.length;
    }
  }

  // Build result with highlighted tokens
  const result: React.ReactNode[] = [];
  let currentIndex = 0;

  filteredTokens.forEach((token, idx) => {
    // Add text before this token
    if (token.index > currentIndex) {
      result.push(
        <span key={`text-${idx}`} className="text-gray-200">
          {line.slice(currentIndex, token.index)}
        </span>
      );
    }

    // Add the token
    result.push(
      <span key={`token-${idx}`} className={token.className}>
        {line.slice(token.index, token.index + token.length)}
      </span>
    );

    currentIndex = token.index + token.length;
  });

  // Add remaining text
  if (currentIndex < line.length) {
    result.push(
      <span key="remaining" className="text-gray-200">
        {line.slice(currentIndex)}
      </span>
    );
  }

  return result.length > 0 ? result : [<span key="default" className="text-gray-200">{line}</span>];
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function RegoCodeEditor({
  source,
  onChange,
  readOnly = false,
  minHeight = '400px',
  maxHeight = '700px',
  showLineNumbers = true,
  showMinimap = false,
  showHeader = true,
  filename = 'policy.rego',
  highlightLine = null,
  onLineClick,
  className = ''
}: RegoCodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<number[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });

  // Parse lines
  const lines = useMemo(() => source.split('\n'), [source]);

  // Update cursor position
  const handleSelectionChange = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      const beforeCursor = source.slice(0, textarea.selectionStart);
      const lineNumber = beforeCursor.split('\n').length;
      const lastNewline = beforeCursor.lastIndexOf('\n');
      const column = textarea.selectionStart - lastNewline;
      setCursorPosition({ line: lineNumber, column });
    }
  }, [source]);

  // Sync scroll between textarea, preview, and line numbers
  const handleScroll = useCallback(() => {
    const textarea = textareaRef.current;
    const preview = previewRef.current;
    const lineNumbers = lineNumbersRef.current;

    if (textarea) {
      // Sync preview horizontal and vertical scroll
      if (preview) {
        preview.scrollTop = textarea.scrollTop;
        preview.scrollLeft = textarea.scrollLeft;
      }
      // Sync line numbers vertical scroll only
      if (lineNumbers) {
        lineNumbers.scrollTop = textarea.scrollTop;
      }
    }
  }, []);

  // Search functionality
  useEffect(() => {
    if (!searchTerm) {
      setSearchResults([]);
      return;
    }

    const results: number[] = [];
    lines.forEach((line, idx) => {
      if (line.toLowerCase().includes(searchTerm.toLowerCase())) {
        results.push(idx + 1);
      }
    });
    setSearchResults(results);
    setCurrentSearchIndex(0);
  }, [searchTerm, lines]);

  const handleNextSearch = () => {
    if (searchResults.length === 0) return;
    setCurrentSearchIndex((prev) => (prev + 1) % searchResults.length);
  };

  const handlePrevSearch = () => {
    if (searchResults.length === 0) return;
    setCurrentSearchIndex((prev) => (prev - 1 + searchResults.length) % searchResults.length);
  };

  // Copy to clipboard
  const handleCopy = async () => {
    await navigator.clipboard.writeText(source);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download as file
  const handleDownload = () => {
    const blob = new Blob([source], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
      }
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false);
        setSearchTerm('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSearch]);

  // Scroll to search result
  useEffect(() => {
    if (searchResults.length > 0 && previewRef.current) {
      const lineNumber = searchResults[currentSearchIndex];
      const lineElement = previewRef.current.querySelector(`[data-line="${lineNumber}"]`);
      if (lineElement) {
        lineElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentSearchIndex, searchResults]);

  return (
    <div
      className={`
        relative rounded-2xl overflow-hidden
        bg-[#0d1117] border border-slate-700/50
        ${isFullscreen ? 'fixed inset-4 z-50' : ''}
        ${className}
      `}
    >
      {/* Header */}
      {showHeader && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800/50 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            {/* Traffic lights */}
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-500 transition-colors cursor-pointer" />
              <div className="w-3 h-3 rounded-full bg-amber-500/80 hover:bg-amber-500 transition-colors cursor-pointer" />
              <div className="w-3 h-3 rounded-full bg-emerald-500/80 hover:bg-emerald-500 transition-colors cursor-pointer" />
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-500">
              <FileCode className="w-3.5 h-3.5" />
              <span className="font-mono">{filename}</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Search toggle */}
            <button
              onClick={() => setShowSearch(!showSearch)}
              className={`p-1.5 rounded-md transition-colors ${
                showSearch ? 'bg-slate-700 text-cyan-400' : 'text-gray-500 hover:text-gray-300 hover:bg-slate-800'
              }`}
              title="Search (⌘F)"
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Copy */}
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-md text-gray-500 hover:text-gray-300 hover:bg-slate-800 transition-colors"
              title="Copy"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>

            {/* Download */}
            <button
              onClick={handleDownload}
              className="p-1.5 rounded-md text-gray-500 hover:text-gray-300 hover:bg-slate-800 transition-colors"
              title="Download"
            >
              <Download className="w-4 h-4" />
            </button>

            {/* Fullscreen */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded-md text-gray-500 hover:text-gray-300 hover:bg-slate-800 transition-colors"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/30 border-b border-slate-700/50">
              <Search className="w-4 h-4 text-gray-500 flex-shrink-0" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search in code..."
                className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-500 focus:outline-none"
                autoFocus
              />
              {searchResults.length > 0 && (
                <span className="text-xs text-gray-500">
                  {currentSearchIndex + 1} of {searchResults.length}
                </span>
              )}
              <button
                onClick={handlePrevSearch}
                disabled={searchResults.length === 0}
                className="p-1 rounded hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronUp className="w-4 h-4 text-gray-400" />
              </button>
              <button
                onClick={handleNextSearch}
                disabled={searchResults.length === 0}
                className="p-1 rounded hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
              <button
                onClick={() => {
                  setShowSearch(false);
                  setSearchTerm('');
                }}
                className="p-1 rounded hover:bg-slate-700"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Editor Content - Fixed height container */}
      <div
        className="flex overflow-hidden"
        style={{
          height: isFullscreen ? 'calc(100vh - 150px)' : maxHeight,
          minHeight: isFullscreen ? 'calc(100vh - 150px)' : minHeight
        }}
      >
        {/* Line Numbers - Synced to textarea scroll */}
        {showLineNumbers && (
          <div
            ref={lineNumbersRef}
            className="flex-shrink-0 py-4 pr-2 bg-slate-900/50 select-none text-right border-r border-slate-800/50 overflow-hidden"
          >
            {lines.map((_, idx) => {
              const lineNum = idx + 1;
              const isHighlighted = lineNum === highlightLine;
              const isSearchMatch = searchResults.includes(lineNum);
              const isCurrentSearch = searchResults[currentSearchIndex] === lineNum;

              return (
                <div
                  key={lineNum}
                  data-line={lineNum}
                  onClick={() => onLineClick?.(lineNum)}
                  className={`
                    px-3 text-xs font-mono leading-6 cursor-pointer
                    transition-colors
                    ${isCurrentSearch
                      ? 'bg-amber-500/30 text-amber-300'
                      : isSearchMatch
                        ? 'bg-amber-500/10 text-amber-400/80'
                        : isHighlighted
                          ? 'bg-cyan-500/20 text-cyan-400'
                          : 'text-gray-600 hover:text-gray-400'
                    }
                  `}
                >
                  {lineNum}
                </div>
              );
            })}
          </div>
        )}

        {/* Code Area - Textarea is the scroll source */}
        <div className="relative flex-1 min-w-0">
          {/* Syntax-highlighted preview (positioned behind textarea, receives scroll sync) */}
          <div
            ref={previewRef}
            className="absolute inset-0 py-4 px-4 overflow-hidden pointer-events-none z-0"
            aria-hidden="true"
          >
            <pre className="font-mono text-sm leading-6">
              {lines.map((line, idx) => {
                const lineNum = idx + 1;
                const isHighlighted = lineNum === highlightLine;
                const isSearchMatch = searchResults.includes(lineNum);
                const isCurrentSearch = searchResults[currentSearchIndex] === lineNum;

                return (
                  <div
                    key={idx}
                    data-line={lineNum}
                    className={`
                      min-h-[1.5rem] transition-colors whitespace-pre
                      ${isCurrentSearch
                        ? 'bg-amber-500/20 -mx-4 px-4'
                        : isSearchMatch
                          ? 'bg-amber-500/5 -mx-4 px-4'
                          : isHighlighted
                            ? 'bg-cyan-500/10 -mx-4 px-4'
                            : ''
                      }
                    `}
                  >
                    {tokenizeLine(line)}
                  </div>
                );
              })}
            </pre>
          </div>

          {/* Actual textarea - THIS IS THE SCROLL SOURCE (z-10 to ensure it's on top) */}
          <textarea
            ref={textareaRef}
            value={source}
            onChange={(e) => onChange(e.target.value)}
            onScroll={handleScroll}
            onSelect={handleSelectionChange}
            onKeyUp={handleSelectionChange}
            onClick={handleSelectionChange}
            readOnly={readOnly}
            spellCheck={false}
            className={`
              absolute inset-0 w-full h-full z-10
              py-4 px-4
              font-mono text-sm leading-6
              bg-transparent text-transparent caret-cyan-400
              resize-none overflow-auto
              focus:outline-none
              ${readOnly ? 'cursor-default' : ''}
            `}
            style={{
              caretColor: '#22d3ee'
            }}
          />
        </div>

        {/* Minimap (optional) */}
        {showMinimap && (
          <div className="hidden xl:block w-24 flex-shrink-0 border-l border-slate-800/50 bg-slate-900/50 overflow-hidden">
            <div className="p-1 transform scale-[0.15] origin-top-left">
              <pre className="font-mono text-[10px] leading-3 whitespace-pre text-gray-600">
                {source}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800/30 border-t border-slate-700/50 text-xs">
        <div className="flex items-center gap-4 text-gray-500">
          <span>
            Ln {cursorPosition.line}, Col {cursorPosition.column}
          </span>
          <span>•</span>
          <span>{lines.length} lines</span>
          <span>•</span>
          <span>{source.length.toLocaleString()} chars</span>
        </div>

        <div className="flex items-center gap-2 text-gray-500">
          <span className="font-mono text-cyan-400/80">rego v1</span>
          <Info className="w-3 h-3" />
        </div>
      </div>
    </div>
  );
}

