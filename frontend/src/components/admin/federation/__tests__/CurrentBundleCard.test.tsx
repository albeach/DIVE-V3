/**
 * DIVE V3 - CurrentBundleCard Tests
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CurrentBundleCard } from '../CurrentBundleCard';
import { IBundleMetadata } from '@/types/federation.types';

// Mock navigator.clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: jest.fn().mockResolvedValue(undefined),
  },
});

describe('CurrentBundleCard', () => {
  const mockBundle: IBundleMetadata = {
    bundleId: 'bundle-123456789abcdef',
    version: 'v1.2.3',
    hash: 'abc123def456789012345678',
    scopes: ['policy:base', 'policy:usa', 'policy:fvey'],
    size: 24576,
    signedAt: new Date().toISOString(),
    signedBy: 'DIVE Hub',
    manifest: {
      revision: 'v1.2.3',
      roots: ['dive'],
      files: [
        { path: 'dive/authorization.rego', hash: 'abc123', size: 4096 },
        { path: 'dive/data.json', hash: 'def456', size: 2048 },
      ],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Loading State', () => {
    it('renders loading skeleton when loading', () => {
      const { container } = render(<CurrentBundleCard bundle={null} loading />);
      
      expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('shows empty state when no bundle', () => {
      render(<CurrentBundleCard bundle={null} />);
      
      expect(screen.getByText('No Bundle Available')).toBeInTheDocument();
      expect(screen.getByText(/Build a bundle to see its details/)).toBeInTheDocument();
    });
  });

  describe('Bundle Display', () => {
    it('displays bundle version', () => {
      render(<CurrentBundleCard bundle={mockBundle} />);
      
      expect(screen.getByText(/v1\.2\.3/)).toBeInTheDocument();
    });

    it('displays signature status when signed', () => {
      render(<CurrentBundleCard bundle={mockBundle} />);
      
      expect(screen.getByText('Cryptographically Signed')).toBeInTheDocument();
    });

    it('displays not signed warning when unsigned', () => {
      const unsignedBundle = { ...mockBundle, signedAt: undefined };
      render(<CurrentBundleCard bundle={unsignedBundle} />);
      
      expect(screen.getByText('Not Signed')).toBeInTheDocument();
    });

    it('displays bundle ID (truncated)', () => {
      render(<CurrentBundleCard bundle={mockBundle} />);
      
      expect(screen.getByText('Bundle ID')).toBeInTheDocument();
      // Bundle ID is truncated to first 16 chars + "..."
      expect(screen.getByText(/bundle-12345678/)).toBeInTheDocument();
    });

    it('displays content hash (truncated)', () => {
      render(<CurrentBundleCard bundle={mockBundle} />);
      
      expect(screen.getByText('Content Hash')).toBeInTheDocument();
      expect(screen.getByText(/abc123def4567890/)).toBeInTheDocument();
    });

    it('displays bundle size formatted', () => {
      render(<CurrentBundleCard bundle={mockBundle} />);
      
      expect(screen.getByText('Bundle Size')).toBeInTheDocument();
      expect(screen.getByText('24 KB')).toBeInTheDocument();
    });

    it('displays file count', () => {
      render(<CurrentBundleCard bundle={mockBundle} />);
      
      expect(screen.getByText('Files')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('displays included scopes', () => {
      render(<CurrentBundleCard bundle={mockBundle} />);
      
      expect(screen.getByText('Included Scopes')).toBeInTheDocument();
      expect(screen.getByText('base')).toBeInTheDocument();
      expect(screen.getByText('usa')).toBeInTheDocument();
      expect(screen.getByText('fvey')).toBeInTheDocument();
    });

    it('displays signer information', () => {
      render(<CurrentBundleCard bundle={mockBundle} />);
      
      expect(screen.getByText('DIVE Hub')).toBeInTheDocument();
    });
  });

  describe('File Manifest', () => {
    it('can toggle file manifest visibility', async () => {
      render(<CurrentBundleCard bundle={mockBundle} />);
      
      // File list should be hidden initially
      expect(screen.queryByText('dive/authorization.rego')).not.toBeInTheDocument();
      
      // Click to show files
      fireEvent.click(screen.getByText(/Show File Manifest/));
      
      // Files should now be visible
      await waitFor(() => {
        expect(screen.getByText('dive/authorization.rego')).toBeInTheDocument();
        expect(screen.getByText('dive/data.json')).toBeInTheDocument();
      });
      
      // Click to hide
      fireEvent.click(screen.getByText(/Hide File Manifest/));
      
      await waitFor(() => {
        expect(screen.queryByText('dive/authorization.rego')).not.toBeInTheDocument();
      });
    });
  });

  describe('Copy Functionality', () => {
    it('copies bundle ID to clipboard', async () => {
      render(<CurrentBundleCard bundle={mockBundle} />);
      
      // Find and click copy button for bundle ID
      const bundleIdSection = screen.getByText('Bundle ID').closest('div')!.parentElement!;
      const copyButton = bundleIdSection.querySelector('button')!;
      
      fireEvent.click(copyButton);
      
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockBundle.bundleId);
    });
  });

  describe('Refresh', () => {
    it('calls onRefresh when refresh button clicked', () => {
      const onRefresh = jest.fn();
      render(<CurrentBundleCard bundle={mockBundle} onRefresh={onRefresh} />);
      
      fireEvent.click(screen.getByText('Refresh'));
      
      expect(onRefresh).toHaveBeenCalled();
    });
  });
});

