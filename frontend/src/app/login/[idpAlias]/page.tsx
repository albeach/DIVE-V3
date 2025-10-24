/**
 * Custom Login Page (Dynamic Route)
 * 
 * Enhanced themeable login page with:
 * - Split layout: Sign In (left) + Custom Description (right)
 * - Customizable backgrounds via /public/login-backgrounds/
 * - Configuration via /public/login-config.json
 * - Country-specific color schemes
 * - Multi-language support (EN/FR)
 * - Glassmorphism design
 * - MFA prompt support
 * - Fully customizable CSS
 * 
 * To customize:
 * 1. Add background images to /public/login-backgrounds/[idpAlias].jpg
 * 2. Edit /public/login-config.json for text/colors
 * 3. Override CSS via custom stylesheets
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { EyeIcon, EyeOff, ShieldCheckIcon, CheckCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import LanguageToggle from '@/components/ui/LanguageToggle';
import { useTranslation } from '@/hooks/useTranslation';
import { useLocale } from '@/contexts/LocaleContext';
import type { Locale } from '@/i18n/config';

// ============================================
// Types
// ============================================

interface LoginFormData {
    username: string;
    password: string;
    otp?: string;
}

interface LoginConfig {
    displayName: string;
    description: {
        title: string;
        subtitle: string;
        content: string;
        features: Array<{
            icon: string;
            text: string;
        }>;
    };
    theme: {
        primary: string;
        accent: string;
        background: string;
    };
    backgroundImage?: string;
    logo?: string;
}

interface ThemeData {
    enabled: boolean;
    colors: {
        primary: string;
        secondary: string;
        accent: string;
        background: string;
        text: string;
    };
    background: {
        type: 'image' | 'gradient';
        imageUrl?: string;
        blur: number;
        overlayOpacity: number;
    };
    logo: {
        url: string;
        position: string;
    };
    layout: {
        formPosition: 'left' | 'center' | 'right';
        formWidth: string;
        cardStyle: 'glassmorphism' | 'solid' | 'bordered' | 'floating';
        buttonStyle: 'rounded' | 'square' | 'pill';
        inputStyle: 'outlined' | 'filled' | 'underlined';
    };
    localization: {
        defaultLanguage: string;
        enableToggle: boolean;
        supportedLanguages: string[];
    };
}

// ============================================
// Component
// ============================================

export default function CustomLoginPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { t } = useTranslation('auth');
    const { locale } = useLocale(); // Get current locale from global context

    const idpAlias = params.idpAlias as string;
    const redirectUri = searchParams.get('redirect_uri') || '/';

    const [config, setConfig] = useState<LoginConfig | null>(null);
    const [theme, setTheme] = useState<ThemeData | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [showMFA, setShowMFA] = useState(false);
    const [showOTPSetup, setShowOTPSetup] = useState(false);
    const [otpSecret, setOtpSecret] = useState<string>('');
    const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
    const [userId, setUserId] = useState<string>('');
    const [formData, setFormData] = useState<LoginFormData>({
        username: '',
        password: '',
        otp: ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [shake, setShake] = useState(false);
    const [loginAttempts, setLoginAttempts] = useState(0);
    const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);

    // Reload configuration when locale changes
    useEffect(() => {
        loadConfiguration();
    }, [idpAlias, locale]); // Add locale as dependency

    // Helper function to trigger shake animation on error
    const triggerShake = () => {
        setShake(true);
        setTimeout(() => setShake(false), 500);
    };

    // Helper function to show error with shake
    const showErrorWithShake = (message: string) => {
        setError(message);
        triggerShake();
    };

    const loadConfiguration = async () => {
        try {
            // Try to load custom configuration
            let rawConfig: any = null;
            
            try {
                const response = await fetch('/login-config.json');
                if (response.ok) {
                    const allConfigs = await response.json();
                    rawConfig = allConfigs[idpAlias] || null;
                }
            } catch (err) {
                console.log('No custom config found, using defaults');
            }

            // Extract localized content if available
            let customConfig: LoginConfig | null = null;
            if (rawConfig) {
                // Check if description and displayName are locale-specific objects
                const localizedDisplayName = typeof rawConfig.displayName === 'object' 
                    ? (rawConfig.displayName[locale] || rawConfig.displayName['en'] || 'Identity Provider')
                    : rawConfig.displayName;
                
                const localizedDescription = typeof rawConfig.description === 'object' && rawConfig.description[locale]
                    ? rawConfig.description[locale]
                    : (rawConfig.description['en'] || rawConfig.description);

                customConfig = {
                    displayName: localizedDisplayName,
                    description: localizedDescription,
                    theme: rawConfig.theme,
                    backgroundImage: rawConfig.backgroundImage,
                    logo: rawConfig.logo
                };
            }

            // Fallback to default configuration
            let primary, accent, displayName, backgroundImage;
            
            if (idpAlias.includes('usa') || idpAlias.includes('us-')) {
                primary = '#B22234';
                accent = '#3C3B6E';
                displayName = 'United States';
                backgroundImage = '/login-backgrounds/usa-idp.jpg';
            } else if (idpAlias.includes('fra') || idpAlias.includes('france')) {
                primary = '#0055A4';
                accent = '#EF4135';
                displayName = 'France';
                backgroundImage = '/login-backgrounds/france-idp.jpg';
            } else if (idpAlias.includes('can') || idpAlias.includes('canada')) {
                primary = '#FF0000';
                accent = '#FFFFFF';
                displayName = 'Canada';
                backgroundImage = '/login-backgrounds/canada-idp.jpg';
            } else if (idpAlias.includes('deu') || idpAlias.includes('germany')) {
                primary = '#000000';
                accent = '#DD0000';
                displayName = 'Germany (Bundeswehr)';
                backgroundImage = '/login-backgrounds/germany-flag.jpg';
            } else if (idpAlias.includes('gbr') || idpAlias.includes('uk')) {
                primary = '#012169';
                accent = '#C8102E';
                displayName = 'United Kingdom (MOD)';
                backgroundImage = '/login-backgrounds/uk-flag.jpg';
            } else if (idpAlias.includes('ita') || idpAlias.includes('italy')) {
                primary = '#009246';
                accent = '#CE2B37';
                displayName = 'Italy (Ministero della Difesa)';
                backgroundImage = '/login-backgrounds/italy-flag.jpg';
            } else if (idpAlias.includes('esp') || idpAlias.includes('spain')) {
                primary = '#AA151B';
                accent = '#F1BF00';
                displayName = 'Spain (Ministerio de Defensa)';
                backgroundImage = '/login-backgrounds/spain-flag.jpg';
            } else if (idpAlias.includes('pol') || idpAlias.includes('poland')) {
                primary = '#DC143C';
                accent = '#FFFFFF';
                displayName = 'Poland (Ministerstwo Obrony Narodowej)';
                backgroundImage = '/login-backgrounds/poland-flag.jpg';
            } else if (idpAlias.includes('nld') || idpAlias.includes('netherlands')) {
                primary = '#21468B';
                accent = '#AE1C28';
                displayName = 'Netherlands (Ministerie van Defensie)';
                backgroundImage = '/login-backgrounds/netherlands-flag.jpg';
            } else if (idpAlias === 'dive-v3-broker') {
                primary = '#6B46C1';
                accent = '#F59E0B';
                displayName = 'DIVE V3 Super Administrator';
                backgroundImage = '/login-backgrounds/dive-v3-broker.jpg';
            } else {
                primary = '#6B46C1';
                accent = '#9333EA';
                displayName = 'Identity Provider';
                backgroundImage = '/login-backgrounds/default.jpg';
            }

            const finalConfig: LoginConfig = customConfig || {
                displayName,
                description: {
                    title: `Welcome to ${displayName}`,
                    subtitle: 'Secure Authentication Portal',
                    content: 'Access classified resources with your authorized credentials. All access is monitored and logged in accordance with security policies.',
                    features: [
                        { icon: '🔐', text: 'Multi-Factor Authentication' },
                        { icon: '🛡️', text: 'NATO ACP-240 Compliant' },
                        { icon: '⚡', text: 'Real-Time Authorization' }
                    ]
                },
                theme: {
                    primary,
                    accent,
                    background: '#F9FAFB'
                },
                backgroundImage
            };

            setConfig(finalConfig);

            // Convert to theme data
            const themeData: ThemeData = {
                enabled: true,
                colors: {
                    primary: finalConfig.theme.primary,
                    secondary: '#FFFFFF',
                    accent: finalConfig.theme.accent,
                    background: finalConfig.theme.background,
                    text: '#111827'
                },
                background: {
                    type: finalConfig.backgroundImage ? 'image' : 'gradient',
                    imageUrl: finalConfig.backgroundImage,
                    blur: 0,
                    overlayOpacity: 0.5
                },
                logo: {
                    url: finalConfig.logo || '',
                    position: 'top-center'
                },
                layout: {
                    formPosition: 'left',
                    formWidth: '1400px',
                    cardStyle: 'glassmorphism',
                    buttonStyle: 'rounded',
                    inputStyle: 'outlined'
                },
                localization: {
                    defaultLanguage: 'en',
                    enableToggle: true,
                    supportedLanguages: ['en', 'fr']
                }
            };

            setTheme(themeData);
        } catch (error) {
            console.error('Failed to load configuration:', error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            // Step 1: Authenticate with backend (includes OTP if MFA is active)
            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
            const response = await fetch(`${backendUrl}/api/auth/custom-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    idpAlias,
                    username: formData.username,
                    password: formData.password,
                    otp: formData.otp || undefined // Include OTP if provided
                })
            });

            const result = await response.json();

            if (result.success) {
                // Step 2: Create NextAuth session with tokens
                const sessionResponse = await fetch('/api/auth/custom-session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        accessToken: result.data.accessToken,
                        refreshToken: result.data.refreshToken,
                        idToken: result.data.accessToken, // Use access token as ID token for now
                        expiresIn: result.data.expiresIn
                    })
                });

                const sessionResult = await sessionResponse.json();

                if (sessionResult.success) {
                    // Session created successfully - redirect to dashboard
                    router.push(redirectUri);
                } else {
                    showErrorWithShake('Failed to create session. Please try again.');
                }
            } else if (result.mfaRequired) {
                // Check if OTP setup is required
                if (result.mfaSetupRequired) {
                    // Initiate OTP setup flow
                    await initiateOTPSetup();
                } else {
                    // Show MFA prompt - this happens after username/password are validated
                    setShowMFA(true);
                    if (result.error) {
                        showErrorWithShake(result.error); // Show error if OTP was invalid
                        setLoginAttempts(prev => prev + 1);
                        
                        // Try to extract remaining attempts from error message
                        const attemptMatch = result.error.match(/(\d+)\s+attempts?\s+remaining/i);
                        if (attemptMatch) {
                            setRemainingAttempts(parseInt(attemptMatch[1]));
                        }
                    }
                }
            } else {
                showErrorWithShake(result.error || 'Invalid username or password');
                setLoginAttempts(prev => prev + 1);
                
                // Try to extract remaining attempts from error message
                const attemptMatch = (result.error || '').match(/(\d+)\s+attempts?\s+remaining/i);
                if (attemptMatch) {
                    setRemainingAttempts(parseInt(attemptMatch[1]));
                }
            }
        } catch (error) {
            console.error('Login error:', error);
            setError('Server error. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const initiateOTPSetup = async () => {
        try {
            setIsLoading(true);
            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
            const response = await fetch(`${backendUrl}/api/auth/otp/setup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    idpAlias,
                    username: formData.username,
                    password: formData.password
                })
            });

            const result = await response.json();

            if (result.success) {
                setOtpSecret(result.data.secret);
                setQrCodeUrl(result.data.qrCodeUrl);
                setUserId(result.data.userId);
                setShowOTPSetup(true);
                setError(null);
            } else {
                setError(result.error || 'Failed to initiate OTP setup');
            }
        } catch (error) {
            console.error('OTP setup error:', error);
            setError('Failed to initiate OTP setup');
        } finally {
            setIsLoading(false);
        }
    };

    const verifyOTPSetup = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        
        // Validate OTP is exactly 6 digits
        if (!formData.otp || formData.otp.length !== 6) {
            showErrorWithShake('Please enter a 6-digit code from your authenticator app.');
            return;
        }
        
        setIsLoading(true);

        try {
            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
            const response = await fetch(`${backendUrl}/api/auth/otp/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    idpAlias,
                    username: formData.username,
                    password: formData.password,
                    otp: formData.otp,
                    secret: otpSecret,
                    userId
                })
            });

            const result = await response.json();

            // Check for success regardless of HTTP status code
            // Backend may return 401 for invalid OTP but still include JSON
            if (result.success) {
                // OTP setup complete - now authenticate with the OTP
                // Wait a moment for Keycloak to sync the credential
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Now authenticate with username + password + OTP
                const loginResponse = await fetch(`${backendUrl}/api/auth/custom-login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        idpAlias,
                        username: formData.username,
                        password: formData.password,
                        otp: formData.otp
                    })
                });

                const loginResult = await loginResponse.json();

                if (loginResult.success && loginResult.data) {
                    // Create NextAuth session
                    const sessionResponse = await fetch('/api/auth/custom-session', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            accessToken: loginResult.data.accessToken,
                            refreshToken: loginResult.data.refreshToken,
                            idToken: loginResult.data.accessToken,
                            expiresIn: loginResult.data.expiresIn
                        })
                    });

                    const sessionResult = await sessionResponse.json();

                    if (sessionResult.success) {
                        // Success! Redirect to dashboard
                        router.push(redirectUri);
                    } else {
                        showErrorWithShake('Failed to create session. Please try again.');
                        setShowOTPSetup(false);
                        setShowMFA(false);
                        setFormData({ ...formData, otp: '' });
                    }
                } else {
                    showErrorWithShake(loginResult.error || 'Login failed after OTP setup. Please try again.');
                    setShowOTPSetup(false);
                    setShowMFA(false);
                    setFormData({ ...formData, otp: '' });
                }
            } else {
                // Show error and keep the OTP setup screen open
                showErrorWithShake(result.error || 'Invalid OTP code. Please try again.');
                // Clear the OTP input so user can try again
                setFormData({ ...formData, otp: '' });
                setLoginAttempts(prev => prev + 1);
            }
        } catch (error) {
            console.error('OTP verification error:', error);
            showErrorWithShake('Failed to verify OTP. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    if (!theme || !config) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mb-4" />
                    <p className="text-gray-600 dark:text-gray-400">Loading login page...</p>
                </div>
            </div>
        );
    }

    return (
        <div
            className="min-h-screen relative flex items-center justify-center overflow-hidden"
            style={{ backgroundColor: theme.colors.background }}
        >
            {/* Background Image with Overlay */}
            {theme.background.imageUrl && (
                <>
                    <div
                        className="absolute inset-0 bg-cover bg-center"
                        style={{
                            backgroundImage: `url(${theme.background.imageUrl})`,
                            filter: `blur(${theme.background.blur}px)`
                        }}
                    />
                    <div 
                        className="absolute inset-0 bg-gradient-to-r from-black/60 to-black/40"
                        style={{ opacity: theme.background.overlayOpacity }}
                    />
                </>
            )}

            {/* Language Toggle */}
            {theme.localization.enableToggle && (
                <div className="absolute top-6 right-6 z-20">
                    <LanguageToggle />
                </div>
            )}

            {/* Split Layout Container */}
            <div
                className="relative z-10 w-full px-4 lg:px-8 max-w-7xl mx-auto"
            >
                <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center">
                    {/* LEFT: Sign In Form */}
                    <motion.div
                        initial={{ opacity: 0, x: -50 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.6 }}
                        className="w-full max-w-md mx-auto lg:mx-0"
                    >
                        <div 
                            className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl p-8 md:p-10 border border-white/20"
                        >
                            {/* Logo */}
                            {theme.logo.url && (
                                <div className="text-center mb-6 pb-6 border-b border-gray-200">
                                    <img
                                        src={theme.logo.url}
                                        alt="Logo"
                                        className="mx-auto max-h-24 w-auto max-w-[280px] object-contain"
                                        style={{ minHeight: '60px' }}
                                    />
                                </div>
                            )}

                            {/* Title */}
                            <div className="mb-8">
                                <h1
                                    className="text-3xl font-bold mb-2"
                                    style={{ color: theme.colors.primary }}
                                >
                                    {t('login.title')}
                                </h1>
                                <p className="text-sm text-gray-600">
                                    {config.displayName}
                                </p>
                            </div>

                            {/* Error Message - Global (not during MFA/OTP) */}
                            <AnimatePresence>
                                {error && !showMFA && !showOTPSetup && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className={`mb-6 p-4 bg-red-50 border border-red-200 rounded-xl ${shake ? 'animate-shake' : ''}`}
                                    >
                                        <p className="text-sm text-red-800 font-semibold">{error}</p>
                                        {remainingAttempts !== null && remainingAttempts > 0 && (
                                            <p className="text-xs text-red-600 mt-2">
                                                ⚠️ {remainingAttempts} {remainingAttempts === 1 ? 'attempt' : 'attempts'} remaining before temporary lockout
                                            </p>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Login Form */}
                            <form onSubmit={handleSubmit} className="space-y-5">
                                {/* Username - Hidden during MFA/OTP Setup */}
                                {!showMFA && !showOTPSetup && (
                                    <div>
                                        <label
                                            className="block text-sm font-semibold mb-2 text-gray-700"
                                        >
                                            {t('login.username')}
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.username}
                                            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                            className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 focus:ring-2 focus:ring-offset-0 outline-none transition-all"
                                            placeholder={t('login.username')}
                                            required
                                            disabled={isLoading}
                                        />
                                    </div>
                                )}

                                {/* Password - Hidden during MFA/OTP Setup */}
                                {!showMFA && !showOTPSetup && (
                                    <div>
                                        <label
                                            className="block text-sm font-semibold mb-2 text-gray-700"
                                        >
                                            {t('login.password')}
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                value={formData.password}
                                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                                className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-xl text-gray-900 focus:ring-2 focus:ring-offset-0 outline-none transition-all"
                                                placeholder={t('login.password')}
                                                required
                                                disabled={isLoading}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                                disabled={isLoading}
                                            >
                                                {showPassword ? (
                                                    <EyeOff className="h-5 w-5" />
                                                ) : (
                                                    <EyeIcon className="h-5 w-5" />
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* MFA (if required) */}
                                <AnimatePresence>
                                    {showMFA && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -20 }}
                                            transition={{ duration: 0.3 }}
                                            className="space-y-3"
                                        >
                                            <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl">
                                                <ShieldCheckIcon className="h-5 w-5 text-blue-600" />
                                                <p className="text-sm text-blue-800 flex-1">
                                                    {t('login.mfaRequired')}
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowMFA(false)}
                                                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
                                                    disabled={isLoading}
                                                >
                                                    Back
                                                </button>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-semibold mb-2 text-gray-700">
                                                    {t('login.enterOTP')}
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formData.otp}
                                                    onChange={(e) => setFormData({ ...formData, otp: e.target.value })}
                                                    placeholder={t('login.otpPlaceholder')}
                                                    maxLength={6}
                                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 text-center font-mono text-lg tracking-widest focus:ring-2 focus:ring-offset-0 outline-none transition-all"
                                                    autoFocus
                                                    required
                                                    disabled={isLoading}
                                                />
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* OTP Setup (if required) */}
                                <AnimatePresence>
                                    {showOTPSetup && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -20 }}
                                            transition={{ duration: 0.3 }}
                                            className="space-y-4"
                                        >
                                            <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
                                                <div className="flex items-start gap-3 mb-4">
                                                    <ShieldCheckIcon className="h-6 w-6 text-purple-600 flex-shrink-0 mt-1" />
                                                    <div className="flex-1">
                                                        <h3 className="font-bold text-purple-900 mb-1">
                                                            Multi-Factor Authentication Setup Required
                                                        </h3>
                                                        <p className="text-sm text-purple-700">
                                                            Due to your security clearance level, you must configure an authenticator app.
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setShowOTPSetup(false);
                                                            setFormData({ ...formData, otp: '' });
                                                        }}
                                                        className="text-xs text-purple-600 hover:text-purple-800 font-semibold"
                                                        disabled={isLoading}
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>

                                                {/* QR Code */}
                                                <div className="bg-white p-4 rounded-lg border border-purple-200 mb-4">
                                                    <p className="text-sm font-semibold text-gray-700 mb-3 text-center">
                                                        Scan this QR code with your authenticator app:
                                                    </p>
                                                    <div className="flex justify-center mb-3 p-4 bg-gray-50 rounded-lg">
                                                        <QRCodeSVG
                                                            value={qrCodeUrl}
                                                            size={200}
                                                            level="H"
                                                            includeMargin={true}
                                                            bgColor="#FFFFFF"
                                                            fgColor="#000000"
                                                        />
                                                    </div>
                                                    <p className="text-xs text-gray-600 text-center mb-2">
                                                        Compatible with: Google Authenticator, Authy, Microsoft Authenticator
                                                    </p>
                                                    <details className="text-xs text-gray-500">
                                                        <summary className="cursor-pointer font-semibold text-center hover:text-gray-700">
                                                            Can't scan? Enter manually
                                                        </summary>
                                                        <div className="mt-2 p-2 bg-gray-50 rounded border border-gray-200">
                                                            <p className="font-mono break-all text-center">{otpSecret}</p>
                                                        </div>
                                                    </details>
                                                </div>

                                                {/* OTP Input */}
                                                <div>
                                                    <label className="block text-sm font-semibold mb-2 text-gray-700">
                                                        Enter 6-digit code from your app:
                                                    </label>
                                                    
                                                    {/* Error Message - Show here when in OTP setup */}
                                                    {error && showOTPSetup && (
                                                        <div className={`mb-3 p-3 bg-red-50 border border-red-200 rounded-lg ${shake ? 'animate-shake' : ''}`}>
                                                            <p className="text-sm text-red-800 font-semibold">{error}</p>
                                                            {loginAttempts >= 2 && (
                                                                <p className="text-xs text-red-600 mt-1">
                                                                    💡 Tip: Make sure you're entering the current 6-digit code from your authenticator app. Codes refresh every 30 seconds.
                                                                </p>
                                                            )}
                                                        </div>
                                                    )}
                                                    
                                                    <input
                                                        type="text"
                                                        value={formData.otp}
                                                        onChange={(e) => setFormData({ ...formData, otp: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                                                        placeholder="000000"
                                                        maxLength={6}
                                                        className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 text-center font-mono text-2xl tracking-widest focus:ring-2 focus:ring-offset-0 outline-none transition-all"
                                                        autoFocus
                                                        disabled={isLoading}
                                                    />
                                                </div>

                                                {/* Verify Button */}
                                                <button
                                                    type="button"
                                                    onClick={verifyOTPSetup}
                                                    disabled={isLoading || (formData.otp?.length || 0) !== 6}
                                                    className="w-full px-6 py-3 bg-purple-600 text-white font-bold rounded-xl transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg mt-3"
                                                >
                                                    {isLoading ? (
                                                        <div className="flex items-center justify-center gap-2">
                                                            <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                            <span>Verifying...</span>
                                                        </div>
                                                    ) : (
                                                        'Verify & Complete Setup'
                                                    )}
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Sign In Button */}
                                {!showOTPSetup && (
                                    <button
                                        type="submit"
                                        disabled={isLoading}
                                        className="w-full px-6 py-3.5 text-white font-bold rounded-xl transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg"
                                        style={{
                                            backgroundColor: theme.colors.primary
                                        }}
                                    >
                                        {isLoading ? (
                                            <div className="flex items-center justify-center gap-2">
                                                <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                <span>{t('login.button')}...</span>
                                            </div>
                                        ) : (
                                            t('login.button')
                                        )}
                                    </button>
                                )}

                                {/* Forgot Password Link */}
                                <div className="text-center pt-2">
                                    <a
                                        href="#"
                                        className="text-sm font-medium hover:underline transition-colors"
                                        style={{ color: theme.colors.primary }}
                                    >
                                        {t('login.forgotPassword')}
                                    </a>
                                </div>
                            </form>

                            {/* Footer */}
                            <div className="mt-8 pt-6 border-t border-gray-200 text-center text-xs text-gray-500">
                                <p>DIVE V3 - Coalition-Friendly ICAM</p>
                            </div>
                        </div>
                    </motion.div>

                    {/* RIGHT: Custom Description Area */}
                    <motion.div
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="hidden lg:block text-white"
                    >
                        <div className="space-y-6">
                            {/* Title */}
                            <div>
                                <h2 className="text-4xl md:text-5xl font-bold mb-3 drop-shadow-lg">
                                    {config.description.title}
                                </h2>
                                <p className="text-xl text-white/90 font-medium drop-shadow">
                                    {config.description.subtitle}
                                </p>
                            </div>

                            {/* Content */}
                            <p className="text-lg text-white/80 leading-relaxed drop-shadow max-w-2xl">
                                {config.description.content}
                            </p>

                            {/* Features List */}
                            <div className="grid gap-4 pt-4">
                                {config.description.features.map((feature, idx) => (
                                    <motion.div
                                        key={idx}
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ duration: 0.4, delay: 0.4 + idx * 0.1 }}
                                        className="flex items-center gap-4 bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20"
                                    >
                                        <div className="text-3xl">{feature.icon}</div>
                                        <div className="flex-1">
                                            <p className="text-white font-semibold text-lg drop-shadow">
                                                {feature.text}
                                            </p>
                                        </div>
                                        <CheckCircle className="w-6 h-6 text-green-400" />
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </div>
    );
}

