/**
 * Custom Sign-In Page - DIVE V3 Themed
 * 
 * Matches the DIVE V3 theme and redirects directly to Keycloak.
 * This page is only shown if someone navigates directly to /api/auth/signin.
 * Normal flow goes: Homepage (/) → Keycloak (port 8443) with custom theme.
 */

'use client';

import { useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Globe2, Shield, Lock } from 'lucide-react';
import { InstanceHeroBadge } from '@/components/ui/instance-hero-badge';

export default function SignInPage() {
    const router = useRouter();

    useEffect(() => {
        // Auto-redirect to Keycloak since we only have one provider
        // Small delay to show the page briefly (better UX than instant redirect)
        const timer = setTimeout(() => {
            signIn('keycloak', {
                callbackUrl: '/dashboard',
                redirect: true,
            });
        }, 500);

        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="min-h-screen relative overflow-hidden" style={{ background: 'var(--instance-banner-bg, linear-gradient(135deg, #1a365d 0%, #2b6cb0 100%))' }}>
            {/* Digital Grid Background */}
            <div className="absolute inset-0 opacity-20">
                <div className="absolute inset-0" style={{
                    backgroundImage: `
                        linear-gradient(rgba(0, 154, 179, 0.3) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(0, 154, 179, 0.3) 1px, transparent 1px)
                    `,
                    backgroundSize: '50px 50px'
                }}></div>
            </div>

            {/* Animated Binary Code Rain */}
            <div className="absolute inset-0 overflow-hidden opacity-10 font-mono text-[#79d85a] text-xs">
                <div className="absolute animate-slide-down" style={{ left: '10%', animationDuration: '15s', animationDelay: '0s' }}>
                    01001000 01100101 01101100 01101100 01101111<br/>
                    01000100 01001001 01010110 01000101<br/>
                    01010110 00110011<br/>
                </div>
            </div>

            <div className="relative flex items-center justify-center min-h-screen p-4">
                <div className="max-w-md w-full">
                    {/* Main content card with glassmorphism */}
                    <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 overflow-hidden animate-fade-in-up">
                        {/* Header section */}
                        <div className="relative px-6 py-5 overflow-hidden" style={{ background: 'var(--instance-banner-bg, linear-gradient(135deg, #1a365d 0%, #2b6cb0 100%))' }}>
                            <div className="relative flex flex-col items-center gap-4">
                                {/* Logo */}
                                <div className="flex-shrink-0 animate-scale-in">
                                    <img 
                                        src="/DIVE-Logo.png" 
                                        alt="DIVE - Digital Interoperability Verification Experiment" 
                                        className="h-32 w-32 drop-shadow-2xl animate-float-logo"
                                    />
                                </div>

                                {/* Content */}
                                <div className="flex-1 text-center animate-fade-in-up">
                                    <div className="mb-2">
                                        <InstanceHeroBadge size="lg" className="justify-center" />
                                    </div>
                                    
                                    <h1 className="text-3xl font-bold text-white mb-1 tracking-tight">
                                        DIVE V3
                                    </h1>
                                    <p className="text-white/90 text-sm leading-relaxed">
                                        Coalition Identity & Access Management Platform
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Content section */}
                        <div className="p-8">
                            <div className="text-center mb-6">
                                <h2 className="text-2xl font-bold text-gray-900 mb-2">Sign In</h2>
                                <p className="text-sm text-gray-600">
                                    Redirecting to your Identity Provider...
                                </p>
                            </div>

                            {/* Loading spinner */}
                            <div className="flex justify-center mb-6">
                                <div className="relative">
                                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200 border-t-[#009ab3]"></div>
                                    <div className="absolute inset-0 rounded-full border-4 border-transparent border-b-[#79d85a] animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1s' }}></div>
                                </div>
                            </div>

                            {/* Provider Card */}
                            <div className="bg-gradient-to-br from-[#009ab3]/5 to-[#79d85a]/5 rounded-xl p-6 border-2 border-[#009ab3] hover:border-[#79d85a] transition-all duration-300">
                                <div className="flex items-center gap-4 mb-4">
                                    <div className="flex-shrink-0">
                                        <div className="w-12 h-12 bg-gradient-to-br from-[#009ab3] to-[#79d85a] rounded-lg flex items-center justify-center">
                                            <Shield className="h-6 w-6 text-white" />
                                        </div>
                                    </div>
                                    <div className="flex-1 text-left">
                                        <h3 className="font-semibold text-gray-900">Keycloak</h3>
                                        <p className="text-xs text-gray-600">Secure authentication</p>
                                    </div>
                                </div>

                                <button
                                    onClick={() => signIn('keycloak', { callbackUrl: '/dashboard', redirect: true })}
                                    className="w-full px-4 py-3 bg-gradient-to-r from-[#009ab3] to-[#79d85a] text-white font-medium rounded-lg hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
                                >
                                    Continue to Sign In
                                </button>
                            </div>

                            {/* Security badges */}
                            <div className="mt-6 grid grid-cols-3 gap-4 text-center">
                                <div className="flex flex-col items-center gap-2">
                                    <Lock className="h-5 w-5 text-[#009ab3]" />
                                    <span className="text-xs text-gray-600">Encrypted</span>
                                </div>
                                <div className="flex flex-col items-center gap-2">
                                    <Shield className="h-5 w-5 text-[#79d85a]" />
                                    <span className="text-xs text-gray-600">Secure</span>
                                </div>
                                <div className="flex flex-col items-center gap-2">
                                    <Globe2 className="h-5 w-5 text-[#009ab3]" />
                                    <span className="text-xs text-gray-600">Federated</span>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="mt-8 pt-6 border-t border-gray-200 text-center">
                                <p className="text-xs text-gray-500">
                                    Need help? Contact your administrator
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}


