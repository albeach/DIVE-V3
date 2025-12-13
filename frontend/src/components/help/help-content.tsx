'use client';

/**
 * Help & Support Content
 * Provides helpful resources and contact information
 */

import { useState } from 'react';
import Link from 'next/link';
import { useInstanceTheme } from '@/components/ui/theme-provider';
import { 
  HelpCircle,
  Book,
  MessageCircle,
  Mail,
  FileText,
  Shield,
  Key,
  Users,
  ExternalLink,
  ChevronRight,
  Search,
  Lightbulb,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';

export function HelpContent() {
  const { theme, instanceCode } = useInstanceTheme();
  const [searchQuery, setSearchQuery] = useState('');

  const helpCategories = [
    {
      icon: Book,
      title: 'Getting Started',
      description: 'Learn the basics of DIVE V3',
      links: [
        { name: 'Quick Start Guide', href: '/docs/quickstart' },
        { name: 'Understanding Classifications', href: '/docs/classifications' },
        { name: 'Your First Document', href: '/docs/first-document' },
      ]
    },
    {
      icon: Shield,
      title: 'Security & Access',
      description: 'Access control and security information',
      links: [
        { name: 'Clearance Levels Explained', href: '/docs/clearance' },
        { name: 'Request Higher Access', href: '/resources/request' },
        { name: 'Security Best Practices', href: '/docs/security' },
      ]
    },
    {
      icon: FileText,
      title: 'Document Management',
      description: 'Upload, share, and manage documents',
      links: [
        { name: 'Uploading Documents', href: '/docs/upload' },
        { name: 'Document Encryption', href: '/docs/encryption' },
        { name: 'Sharing & Collaboration', href: '/docs/sharing' },
      ]
    },
    {
      icon: Key,
      title: 'Federation & Identity',
      description: 'Cross-coalition identity management',
      links: [
        { name: 'Federation Overview', href: '/integration/federation-vs-object' },
        { name: 'Identity Providers', href: '/docs/idp' },
        { name: 'Coalition Access', href: '/docs/coalition' },
      ]
    },
  ];

  const faqs = [
    {
      question: 'Why can\'t I access certain documents?',
      answer: 'Document access is controlled by your clearance level, country of affiliation, and community of interest (COI) memberships. If you need access to a document, you can submit an access request.',
      icon: AlertTriangle,
      color: 'text-amber-500'
    },
    {
      question: 'How do I upload a classified document?',
      answer: 'Navigate to the Upload page, select your file, choose the appropriate classification level and releasability, then click upload. Documents are automatically encrypted.',
      icon: Lightbulb,
      color: 'text-blue-500'
    },
    {
      question: 'What is a pseudonym and why is it shown?',
      answer: 'DIVE V3 uses pseudonyms instead of real names to comply with ACP-240 privacy requirements. Your pseudonym is consistent across the platform while protecting your identity.',
      icon: CheckCircle,
      color: 'text-emerald-500'
    },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div 
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: 'var(--instance-banner-bg)' }}
        >
          <HelpCircle className="w-7 h-7 text-white" strokeWidth={2} />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Help & Support</h1>
        <p className="text-gray-500 max-w-lg mx-auto">
          Find answers to common questions, browse documentation, or get in touch with support.
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-8">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search help articles..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-3 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-offset-1 focus:border-transparent transition-all"
          style={{ '--tw-ring-color': 'rgba(var(--instance-primary-rgb), 0.3)' } as React.CSSProperties}
        />
      </div>

      {/* Help Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
        {helpCategories.map((category, index) => {
          const Icon = category.icon;
          return (
            <div 
              key={category.title}
              className="bg-white border border-gray-100 rounded-xl p-5 hover:border-gray-200 hover:shadow-sm transition-all animate-fade-in"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-start gap-4">
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(var(--instance-primary-rgb), 0.1)' }}
                >
                  <Icon className="w-5 h-5" style={{ color: 'var(--instance-primary)' }} strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-gray-900 mb-1">{category.title}</h3>
                  <p className="text-xs text-gray-500 mb-3">{category.description}</p>
                  <div className="space-y-1">
                    {category.links.map(link => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="group flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors"
                      >
                        <ChevronRight className="w-3 h-3 text-gray-400 group-hover:translate-x-0.5 transition-transform" />
                        {link.name}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* FAQs */}
      <div className="mb-10">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Frequently Asked Questions</h2>
        <div className="space-y-3">
          {faqs.map((faq, index) => {
            const Icon = faq.icon;
            return (
              <div 
                key={index}
                className="bg-white border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition-all"
              >
                <div className="flex items-start gap-3">
                  <Icon className={`w-5 h-5 ${faq.color} flex-shrink-0 mt-0.5`} strokeWidth={2} />
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-1">{faq.question}</h3>
                    <p className="text-sm text-gray-600">{faq.answer}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Contact Support */}
      <div 
        className="rounded-xl p-6 text-center"
        style={{ background: 'linear-gradient(to br, rgba(var(--instance-primary-rgb), 0.05), rgba(var(--instance-secondary-rgb, var(--instance-primary-rgb)), 0.05))' }}
      >
        <h3 className="text-lg font-bold text-gray-900 mb-2">Still need help?</h3>
        <p className="text-sm text-gray-600 mb-4">
          Our support team is available to assist with any questions or issues.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="mailto:support@dive25.com"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-lg transition-all hover:shadow-md"
            style={{ background: 'var(--instance-banner-bg)' }}
          >
            <Mail className="w-4 h-4" />
            Email Support
          </a>
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Book className="w-4 h-4" />
            Browse Documentation
          </Link>
        </div>
      </div>

      {/* Instance Info */}
      <div className="mt-6 text-center text-xs text-gray-400">
        DIVE V3 • Instance: {instanceCode} • Version 3.0.0
      </div>
    </div>
  );
}












