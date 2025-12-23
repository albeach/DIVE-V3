'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ShieldCheckIcon, DevicePhoneMobileIcon, KeyIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

export default function MFASetupPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const [setupMethod, setSetupMethod] = useState<'otp' | 'webauthn' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otpSecret, setOtpSecret] = useState<string>('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [otpCode, setOtpCode] = useState<string>('');

  const user = session?.user as any;
  const clearance = user?.clearance;
  const requiresAAL3 = clearance === 'TOP_SECRET';

  useEffect(() => {
    // Redirect if not logged in
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }

    // Check if MFA is already configured
    const hasMFA = user?.amr && Array.isArray(user.amr) &&
      (user.amr.includes('otp') || user.amr.includes('hwk') || user.amr.includes('webauthn'));

    if (hasMFA) {
      // MFA already configured, redirect to dashboard
      router.push('/dashboard');
      return;
    }

    // Auto-select setup method based on clearance
    if (requiresAAL3) {
      setSetupMethod('webauthn');
    }
  }, [status, user, router, requiresAAL3]);

  const initiateOTPSetup = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/otp/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (response.ok) {
        setOtpSecret(data.secret);
        setQrCodeUrl(data.qrCodeUrl);
        setSetupMethod('otp');
      } else {
        setError(data.error || 'Failed to initiate OTP setup');
      }
    } catch (err) {
      setError('Network error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const verifyOTPSetup = async () => {
    if (!otpCode || otpCode.length !== 6) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: otpCode }),
      });

      const data = await response.json();

      if (response.ok) {
        // Success - refresh session and redirect
        await update();
        router.push('/dashboard');
      } else {
        setError(data.error || 'Invalid OTP code');
      }
    } catch (err) {
      setError('Network error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const initiateWebAuthnSetup = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // WebAuthn setup would go here
      // For now, just show an error that it's not implemented
      setError('WebAuthn setup is not yet implemented. Please use OTP for now.');
    } catch (err) {
      setError('Failed to initiate WebAuthn setup');
    } finally {
      setIsLoading(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <ShieldCheckIcon className="mx-auto h-12 w-12 text-blue-600" />
          <h2 className="mt-6 text-3xl font-bold text-gray-900 dark:text-white">
            Multi-Factor Authentication Setup
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Your security clearance requires additional authentication factors
          </p>
          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>Clearance:</strong> {clearance}<br/>
              <strong>Required AAL:</strong> {requiresAAL3 ? 'AAL3 (WebAuthn)' : 'AAL2 (OTP)'}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {!setupMethod ? (
          <div className="space-y-4">
            <div className="p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Choose Setup Method
              </h3>

              <div className="space-y-3">
                {!requiresAAL3 && (
                  <button
                    onClick={initiateOTPSetup}
                    disabled={isLoading}
                    className="w-full flex items-center justify-between p-4 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-center">
                      <DevicePhoneMobileIcon className="h-6 w-6 text-blue-600 mr-3" />
                      <div className="text-left">
                        <p className="font-semibold text-gray-900 dark:text-white">TOTP (Time-based One-Time Password)</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Use an authenticator app like Google Authenticator</p>
                      </div>
                    </div>
                    {setupMethod === 'otp' && <CheckCircleIcon className="h-5 w-5 text-green-600" />}
                  </button>
                )}

                <button
                  onClick={initiateWebAuthnSetup}
                  disabled={isLoading}
                  className="w-full flex items-center justify-between p-4 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center">
                    <KeyIcon className="h-6 w-6 text-green-600 mr-3" />
                    <div className="text-left">
                      <p className="font-semibold text-gray-900 dark:text-white">WebAuthn (Hardware Security Key)</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Use a YubiKey or similar hardware token</p>
                    </div>
                  </div>
                  {setupMethod === 'webauthn' && <CheckCircleIcon className="h-5 w-5 text-green-600" />}
                </button>
              </div>
            </div>
          </div>
        ) : setupMethod === 'otp' ? (
          <div className="space-y-6">
            <div className="p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Set Up TOTP Authentication
              </h3>

              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Scan this QR code with your authenticator app:
                  </p>
                  {qrCodeUrl && (
                    <img
                      src={qrCodeUrl}
                      alt="TOTP QR Code"
                      className="mx-auto mb-4"
                    />
                  )}
                  {otpSecret && (
                    <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded font-mono text-sm">
                      {otpSecret}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
                    Enter verification code:
                  </label>
                  <input
                    type="text"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-offset-0 outline-none"
                    placeholder="000000"
                    maxLength={6}
                  />
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={() => setSetupMethod(null)}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Back
                  </button>
                  <button
                    onClick={verifyOTPSetup}
                    disabled={isLoading || otpCode.length !== 6}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? 'Verifying...' : 'Verify & Complete'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : setupMethod === 'webauthn' ? (
          <div className="p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              WebAuthn Setup (Coming Soon)
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Hardware security key setup is not yet implemented. Please use TOTP for now.
            </p>
            <button
              onClick={() => setSetupMethod(null)}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700"
            >
              Choose Different Method
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
