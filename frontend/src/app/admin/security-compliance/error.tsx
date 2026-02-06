'use client';

import ErrorFallback from '@/components/admin/shared/error-fallback';

export default function SecurityComplianceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorFallback error={error} reset={reset} />;
}
