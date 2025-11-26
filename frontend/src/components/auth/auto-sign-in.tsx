'use client';

import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';

interface AutoSignInProps {
  idpHint?: string;
  callbackUrl?: string;
}

/**
 * AutoSignIn Component
 * 
 * Automatically triggers Keycloak sign-in on mount.
 * This makes the login flow seamless - users don't see an intermediate page.
 */
export function AutoSignIn({ idpHint, callbackUrl = '/dashboard' }: AutoSignInProps) {
  const [triggered, setTriggered] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Prevent double-trigger in React Strict Mode
    if (triggered) return;
    
    const triggerSignIn = async () => {
      setTriggered(true);
      
      try {
        // Build sign-in options
        const options: Record<string, string> = {};
        
        // Add kc_idp_hint for Keycloak broker IdP selection
        if (idpHint) {
          options.kc_idp_hint = idpHint;
        }
        
        // Trigger sign-in - this will redirect to Keycloak
        await signIn('keycloak', { 
          callbackUrl,
          redirect: true,
        }, options);
      } catch (err) {
        console.error('[AutoSignIn] Error:', err);
        setError('Failed to initiate sign-in. Please try again.');
      }
    };

    // Small delay to ensure component is mounted
    const timer = setTimeout(triggerSignIn, 100);
    
    return () => clearTimeout(timer);
  }, [triggered, idpHint, callbackUrl]);

  // Show loading state while redirecting
  return (
    <div className="flex flex-col items-center justify-center space-y-4">
      {error ? (
        <div className="text-red-500 text-center">
          <p>{error}</p>
          <button 
            onClick={() => { setTriggered(false); setError(null); }}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="text-gray-600">Redirecting to authentication...</p>
          {idpHint && (
            <p className="text-sm text-gray-400">
              Provider: {idpHint.replace(/-realm-broker|-federation|-idp/g, '').toUpperCase()}
            </p>
          )}
        </>
      )}
    </div>
  );
}


