'use client';

/**
 * DIVE V3 - API Documentation Page
 *
 * Interactive Swagger UI for exploring and testing DIVE V3 API endpoints.
 * Supports JWT authentication and live endpoint testing.
 *
 * Note: swagger-ui-react uses legacy React lifecycle methods (UNSAFE_componentWillReceiveProps)
 * which triggers warnings in React 18 strict mode. This is a known issue with the library.
 * We suppress these specific warnings since they don't affect functionality and we can't
 * modify third-party code.
 *
 * @version 1.0.1
 * @date 2025-12-30
 */

import { useEffect, useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  ArrowLeft,
  Code,
  Shield,
  Zap,
  Lock,
  Globe,
  Terminal,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react';

// Suppress React strict mode warnings for third-party swagger-ui-react library
// This is a known issue: https://github.com/swagger-api/swagger-ui/issues/8245
if (typeof window !== 'undefined') {
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    // Filter out the specific deprecation warning from swagger-ui-react
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('UNSAFE_componentWillReceiveProps') ||
        args[0].includes('ParameterRow'))
    ) {
      return; // Suppress this specific warning
    }
    originalConsoleError.apply(console, args);
  };
}

// Dynamically import SwaggerUI to avoid SSR issues
const SwaggerUI = dynamic(
  () => import('swagger-ui-react'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    ),
  }
);

// Import SwaggerUI styles
import 'swagger-ui-react/swagger-ui.css';

interface QuickStartExample {
  title: string;
  language: string;
  code: string;
}

const quickStartExamples: QuickStartExample[] = [
  {
    title: 'cURL',
    language: 'bash',
    code: `# Get resources with authentication
curl -X GET "https://localhost:4000/api/resources" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -H "Content-Type: application/json"`,
  },
  {
    title: 'TypeScript',
    language: 'typescript',
    code: `// Fetch resources with async/await
const response = await fetch('/api/resources', {
  method: 'GET',
  headers: {
    'Authorization': \`Bearer \${accessToken}\`,
    'Content-Type': 'application/json',
  },
});

const { resources } = await response.json();`,
  },
  {
    title: 'Python',
    language: 'python',
    code: `import requests

response = requests.get(
    "https://localhost:4000/api/resources",
    headers={
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
)

resources = response.json()["resources"]`,
  },
];

export default function APIDocsPage() {
  const { data: session, status } = useSession();
  const [showQuickStart, setShowQuickStart] = useState(true);
  const [selectedExample, setSelectedExample] = useState(0);
  const [copied, setCopied] = useState(false);
  const [swaggerSpec, setSwaggerSpec] = useState<object | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const swaggerInitialized = useRef(false);

  // Fetch access token from session
  useEffect(() => {
    const fetchToken = async () => {
      if (status === 'authenticated') {
        try {
          // Fetch the access token from our API endpoint
          // Note: Using /api/access-token instead of /api/auth/token to avoid NextAuth route interception
          const response = await fetch('/api/access-token');
          if (response.ok) {
            const data = await response.json();
            setAccessToken(data.accessToken);
          }
        } catch (error) {
          console.error('Failed to fetch access token:', error);
        }
      }
    };
    fetchToken();
  }, [status]);

  // Fetch OpenAPI spec via local proxy to avoid CORS
  useEffect(() => {
    const fetchSpec = async () => {
      try {
        // Try local proxy first, then fall back to direct backend
        const response = await fetch('/api/openapi');
        if (response.ok) {
          const spec = await response.json();
          setSwaggerSpec(spec);
        } else {
          // Fallback to direct backend URL
          const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';
          const directResponse = await fetch(`${backendUrl}/api-docs/json`);
          if (directResponse.ok) {
            const spec = await directResponse.json();
            setSwaggerSpec(spec);
          }
        }
      } catch (error) {
        console.error('Failed to fetch OpenAPI spec:', error);
      }
    };
    fetchSpec();
  }, []);

  // Request interceptor to automatically add JWT token to all Swagger requests
  const requestInterceptor = async (req: Request): Promise<Request> => {
    if (accessToken) {
      // Clone the request and add authorization header
      const headers = new Headers(req.headers);
      headers.set('Authorization', `Bearer ${accessToken}`);
      return new Request(req.url, {
        ...req,
        headers,
      });
    }
    return req;
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const apiStats = [
    { label: 'Endpoints', value: '50+', icon: <Terminal className="w-5 h-5" /> },
    { label: 'Categories', value: '8', icon: <Globe className="w-5 h-5" /> },
    { label: 'Auth Methods', value: 'JWT', icon: <Lock className="w-5 h-5" /> },
    { label: 'OpenAPI', value: '3.0', icon: <Code className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-purple-50/20">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="font-medium">Dashboard</span>
              </Link>
              <div className="h-6 w-px bg-slate-300" />
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                  <Code className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">API Documentation</h1>
                  <p className="text-xs text-slate-500">Interactive REST API Reference</p>
                </div>
              </div>
            </div>

            {/* Auth Status */}
            <div className="flex items-center gap-4">
              {status === 'authenticated' && accessToken ? (
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-50 border border-green-200">
                  <Shield className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-green-700">Auto-Authorized</span>
                </div>
              ) : status === 'authenticated' ? (
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-sm font-medium text-amber-700">Loading token...</span>
                </div>
              ) : (
                <Link
                  href="/login"
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-colors"
                >
                  <Lock className="w-4 h-4 text-indigo-600" />
                  <span className="text-sm font-medium text-indigo-700">Sign in to test endpoints</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 p-8 text-white shadow-xl overflow-hidden relative">
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-10">
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.3) 1px, transparent 1px)`,
                  backgroundSize: '20px 20px',
                }}
              />
            </div>

            <div className="relative z-10">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-3xl font-bold mb-2">DIVE V3 REST API</h2>
                  <p className="text-indigo-100 max-w-2xl">
                    Explore the complete API for coalition identity and access management.
                    Test endpoints directly, view request/response schemas, and integrate with your applications.
                  </p>
                </div>
                <a
                  href="/api-docs/json"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-sm transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span className="font-medium">OpenAPI JSON</span>
                </a>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
                {apiStats.map((stat, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/10 backdrop-blur-sm"
                  >
                    <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                      {stat.icon}
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{stat.value}</p>
                      <p className="text-xs text-indigo-200">{stat.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Quick Start Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <div className="rounded-2xl bg-white border border-slate-200 shadow-lg overflow-hidden">
            <button
              onClick={() => setShowQuickStart(!showQuickStart)}
              className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <div className="text-left">
                  <h3 className="text-lg font-bold text-slate-900">Quick Start</h3>
                  <p className="text-sm text-slate-500">Code examples to get started</p>
                </div>
              </div>
              {showQuickStart ? (
                <ChevronUp className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-slate-400" />
              )}
            </button>

            {showQuickStart && (
              <div className="border-t border-slate-200 p-6">
                {/* Language Tabs */}
                <div className="flex gap-2 mb-4">
                  {quickStartExamples.map((example, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedExample(idx)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        selectedExample === idx
                          ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {example.title}
                    </button>
                  ))}
                </div>

                {/* Code Block */}
                <div className="relative">
                  <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 text-sm overflow-x-auto">
                    <code>{quickStartExamples[selectedExample].code}</code>
                  </pre>
                  <button
                    onClick={() => copyToClipboard(quickStartExamples[selectedExample].code)}
                    className="absolute top-3 right-3 p-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-slate-300" />
                    )}
                  </button>
                </div>

                {/* Authentication Note */}
                {accessToken ? (
                  <div className="mt-4 flex items-start gap-3 p-4 rounded-xl bg-green-50 border border-green-200">
                    <Shield className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-green-900">Auto-Authorized ✓</p>
                      <p className="text-xs text-green-700 mt-1">
                        Your JWT token is automatically applied to all API requests.
                        You can test any endpoint directly - no manual authorization needed.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
                    <Shield className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-900">Authentication Required</p>
                      <p className="text-xs text-amber-700 mt-1">
                        Most endpoints require a valid JWT token. <Link href="/login" className="underline font-medium hover:text-amber-900">Sign in</Link> to auto-authorize,
                        or manually enter a token using the <code className="px-1 py-0.5 rounded bg-amber-100">Authorize</code> button.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>

        {/* Swagger UI */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl bg-white border border-slate-200 shadow-lg overflow-hidden"
        >
          <div className="border-b border-slate-200 p-4 bg-slate-50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                <Terminal className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Interactive API Explorer</h3>
                <p className="text-xs text-slate-500">Click on an endpoint to expand and test it</p>
              </div>
            </div>
          </div>

          <div className="swagger-wrapper">
            {swaggerSpec ? (
              <SwaggerUI
                spec={swaggerSpec}
                docExpansion="none"
                filter={true}
                persistAuthorization={true}
                displayRequestDuration={true}
                tryItOutEnabled={true}
                requestInterceptor={requestInterceptor as any}
                // Auto-authorize when token is available
                onComplete={(swaggerUI) => {
                  if (accessToken && swaggerUI && !swaggerInitialized.current) {
                    swaggerInitialized.current = true;
                    // Pre-authorize with the JWT token
                    swaggerUI.preauthorizeApiKey('bearerAuth', accessToken);
                  }
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-96">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                  <p className="text-slate-600">Loading API specification...</p>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* API Categories */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {[
            { name: 'Resources', desc: 'Document CRUD operations', color: 'blue', count: 12 },
            { name: 'Federation', desc: 'Cross-instance operations', color: 'emerald', count: 15 },
            { name: 'Policies', desc: 'OPA policy management', color: 'purple', count: 8 },
            { name: 'KAS', desc: 'Key Access Service', color: 'rose', count: 5 },
            { name: 'Authentication', desc: 'Token management', color: 'amber', count: 6 },
            { name: 'Admin', desc: 'System management', color: 'slate', count: 10 },
            { name: 'Compliance', desc: 'Audit and logging', color: 'violet', count: 4 },
            { name: 'Health', desc: 'System status', color: 'green', count: 5 },
          ].map((category, idx) => (
            <div
              key={idx}
              className="p-4 rounded-xl bg-white border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`px-2 py-1 rounded-lg text-xs font-bold bg-${category.color}-100 text-${category.color}-700`}>
                  {category.count} endpoints
                </span>
              </div>
              <h4 className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                {category.name}
              </h4>
              <p className="text-sm text-slate-500">{category.desc}</p>
            </div>
          ))}
        </motion.div>
      </main>

      {/* Custom Swagger Styles */}
      <style jsx global>{`
        .swagger-wrapper .swagger-ui {
          font-family: inherit;
        }
        .swagger-wrapper .swagger-ui .topbar {
          display: none;
        }
        .swagger-wrapper .swagger-ui .info {
          margin: 20px 0;
        }
        .swagger-wrapper .swagger-ui .info .title {
          color: #4338ca;
        }
        .swagger-wrapper .swagger-ui .btn.authorize {
          background: linear-gradient(135deg, #4396ac 0%, #90d56a 100%);
          border-color: #4396ac;
          color: white;
        }
        .swagger-wrapper .swagger-ui .btn.authorize:hover {
          background: linear-gradient(135deg, #3a8599 0%, #7dc45a 100%);
        }
        .swagger-wrapper .swagger-ui .opblock.opblock-get .opblock-summary-method {
          background: #4396ac;
        }
        .swagger-wrapper .swagger-ui .opblock.opblock-post .opblock-summary-method {
          background: #90d56a;
        }
        .swagger-wrapper .swagger-ui .opblock.opblock-put .opblock-summary-method {
          background: #f59e0b;
        }
        .swagger-wrapper .swagger-ui .opblock.opblock-delete .opblock-summary-method {
          background: #ef4444;
        }
        .swagger-wrapper .swagger-ui .opblock-tag {
          font-size: 1.1rem;
          border-bottom: 1px solid #e2e8f0;
        }
        .swagger-wrapper .swagger-ui .opblock {
          border-radius: 12px;
          margin-bottom: 8px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .swagger-wrapper .swagger-ui .opblock .opblock-summary {
          border-radius: 12px;
        }
        .swagger-wrapper .swagger-ui section.models {
          border-radius: 12px;
        }
        .swagger-wrapper .swagger-ui .model-box {
          border-radius: 8px;
        }
      `}</style>
    </div>
  );
}
