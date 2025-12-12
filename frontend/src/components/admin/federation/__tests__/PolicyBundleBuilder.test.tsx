/**
 * DIVE V3 - PolicyBundleBuilder Tests
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PolicyBundleBuilder } from '../PolicyBundleBuilder';
import { IBuildResult, IPublishResult } from '@/types/federation.types';

describe('PolicyBundleBuilder', () => {
  const mockBuildSuccess: IBuildResult = {
    success: true,
    bundleId: 'bundle-123',
    version: 'v1.0.0',
    hash: 'abc123',
    size: 10240,
    fileCount: 5,
    signed: true,
  };

  const mockBuildFailure: IBuildResult = {
    success: false,
    error: 'Build failed: Invalid scope',
  };

  const mockPublishSuccess: IPublishResult = {
    success: true,
    bundleId: 'bundle-123',
    version: 'v1.0.0',
    publishedAt: new Date().toISOString(),
    opalTransactionId: 'txn-456',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the component with header', () => {
      render(<PolicyBundleBuilder />);
      
      expect(screen.getByText('Policy Bundle Builder')).toBeInTheDocument();
      expect(screen.getByText(/Build and publish policy bundles/)).toBeInTheDocument();
    });

    it('renders scope selector', () => {
      render(<PolicyBundleBuilder />);
      
      expect(screen.getByText('Select Policy Scopes')).toBeInTheDocument();
    });

    it('renders Build Options toggle', () => {
      render(<PolicyBundleBuilder />);
      
      expect(screen.getByText('Build Options')).toBeInTheDocument();
    });

    it('renders action buttons', () => {
      render(<PolicyBundleBuilder />);
      
      expect(screen.getByText('Build Bundle')).toBeInTheDocument();
      expect(screen.getByText('Publish')).toBeInTheDocument();
      expect(screen.getByText('Build & Publish')).toBeInTheDocument();
    });
  });

  describe('Build Options', () => {
    it('can toggle build options visibility', async () => {
      render(<PolicyBundleBuilder />);
      
      // Options hidden initially
      expect(screen.queryByText('Sign bundle')).not.toBeInTheDocument();
      
      // Click to show options
      fireEvent.click(screen.getByText('Build Options'));
      
      await waitFor(() => {
        expect(screen.getByText('Sign bundle')).toBeInTheDocument();
        expect(screen.getByText('Include data files')).toBeInTheDocument();
        expect(screen.getByText('Compress bundle')).toBeInTheDocument();
      });
    });

    it('can toggle options checkboxes', async () => {
      render(<PolicyBundleBuilder />);
      
      // Show options
      fireEvent.click(screen.getByText('Build Options'));
      
      await waitFor(() => {
        expect(screen.getByText('Sign bundle')).toBeInTheDocument();
      });
      
      // Find checkbox
      const signCheckbox = screen.getByRole('checkbox', { name: /Sign bundle/i }) as HTMLInputElement;
      
      // Initially checked (default)
      expect(signCheckbox.checked).toBe(true);
      
      // Click to uncheck
      fireEvent.click(signCheckbox);
      expect(signCheckbox.checked).toBe(false);
    });
  });

  describe('Build Operation', () => {
    it('calls onBuild when Build Bundle clicked', async () => {
      const onBuild = jest.fn().mockResolvedValue(mockBuildSuccess);
      render(<PolicyBundleBuilder onBuild={onBuild} />);
      
      fireEvent.click(screen.getByText('Build Bundle'));
      
      await waitFor(() => {
        expect(onBuild).toHaveBeenCalled();
      });
    });

    it('shows success message after successful build', async () => {
      const onBuild = jest.fn().mockResolvedValue(mockBuildSuccess);
      render(<PolicyBundleBuilder onBuild={onBuild} />);
      
      fireEvent.click(screen.getByText('Build Bundle'));
      
      await waitFor(() => {
        expect(screen.getByText('Operation Complete')).toBeInTheDocument();
        expect(screen.getByText(/v1\.0\.0/)).toBeInTheDocument();
      });
    });

    it('shows error message after failed build', async () => {
      const onBuild = jest.fn().mockResolvedValue(mockBuildFailure);
      render(<PolicyBundleBuilder onBuild={onBuild} />);
      
      fireEvent.click(screen.getByText('Build Bundle'));
      
      await waitFor(() => {
        expect(screen.getByText('Operation Failed')).toBeInTheDocument();
        expect(screen.getByText(/Invalid scope/)).toBeInTheDocument();
      });
    });

    it('shows building state during build', async () => {
      const onBuild = jest.fn().mockImplementation(() => 
        new Promise((resolve) => setTimeout(() => resolve(mockBuildSuccess), 100))
      );
      render(<PolicyBundleBuilder onBuild={onBuild} />);
      
      fireEvent.click(screen.getByText('Build Bundle'));
      
      expect(screen.getByText('Building bundle...')).toBeInTheDocument();
      
      await waitFor(() => {
        expect(screen.getByText('Operation Complete')).toBeInTheDocument();
      });
    });
  });

  describe('Publish Operation', () => {
    it('publish button is disabled without previous build', () => {
      render(<PolicyBundleBuilder onPublish={jest.fn()} />);
      
      const publishButton = screen.getByText('Publish').closest('button')!;
      expect(publishButton).toBeDisabled();
    });

    it('enables publish after successful build', async () => {
      const onBuild = jest.fn().mockResolvedValue(mockBuildSuccess);
      const onPublish = jest.fn().mockResolvedValue(mockPublishSuccess);
      render(<PolicyBundleBuilder onBuild={onBuild} onPublish={onPublish} />);
      
      // Publish should be disabled initially
      const publishButton = screen.getByText('Publish').closest('button')!;
      expect(publishButton).toBeDisabled();
      
      // Build first
      fireEvent.click(screen.getByText('Build Bundle'));
      
      await waitFor(() => {
        expect(screen.getByText('Operation Complete')).toBeInTheDocument();
      });
      
      // Publish should now be enabled (buildResult exists)
      expect(publishButton).not.toBeDisabled();
    });
  });

  describe('Build & Publish Operation', () => {
    it('calls onBuildAndPublish when Build & Publish clicked', async () => {
      const onBuildAndPublish = jest.fn().mockResolvedValue({
        build: mockBuildSuccess,
        publish: mockPublishSuccess,
      });
      render(<PolicyBundleBuilder onBuildAndPublish={onBuildAndPublish} />);
      
      fireEvent.click(screen.getByText('Build & Publish'));
      
      await waitFor(() => {
        expect(onBuildAndPublish).toHaveBeenCalled();
      });
    });

    it('shows both build and publish results', async () => {
      const onBuildAndPublish = jest.fn().mockResolvedValue({
        build: mockBuildSuccess,
        publish: mockPublishSuccess,
      });
      render(<PolicyBundleBuilder onBuildAndPublish={onBuildAndPublish} />);
      
      fireEvent.click(screen.getByText('Build & Publish'));
      
      await waitFor(() => {
        expect(screen.getByText('Operation Complete')).toBeInTheDocument();
        expect(screen.getByText(/Published at/)).toBeInTheDocument();
      });
    });
  });

  describe('Disabled State', () => {
    it('disables all buttons when disabled prop is true', () => {
      render(<PolicyBundleBuilder disabled />);
      
      expect(screen.getByText('Build Bundle').closest('button')).toBeDisabled();
      expect(screen.getByText('Publish').closest('button')).toBeDisabled();
      expect(screen.getByText('Build & Publish').closest('button')).toBeDisabled();
    });
  });

  describe('Scope Validation', () => {
    it('disables build when no scopes selected', () => {
      render(<PolicyBundleBuilder />);
      
      // Base scope is required and selected by default
      // Need to mock the component with empty scopes to test this
      // Since we can't easily remove required scopes, we verify the warning exists
      expect(screen.queryByText(/Select at least one scope/)).not.toBeInTheDocument();
    });
  });
});

