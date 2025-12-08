'use client';

import { useMemo, useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { 
    User, 
    Settings, 
    Copy, 
    Check, 
    FileText, 
    Upload, 
    Shield,
    Clock,
    Star,
    Bell,
    HelpCircle,
    ArrowRight,
    ChevronRight,
    Fingerprint,
    Globe,
    Lock,
    Building
} from 'lucide-react';
import { getPseudonymFromUser } from '@/lib/pseudonym-generator';
import { jwtDecode } from 'jwt-decode';
import { SecureLogoutButton } from '@/components/auth/secure-logout-button';
import { useInstanceTheme } from '@/components/ui/theme-provider';

interface IdentityUser {
    uniqueID?: string | null;
    email?: string | null;
    clearance?: string | null;
    countryOfAffiliation?: string | null;
    acpCOI?: string[] | null;
    acr?: string | null;
    amr?: string[] | null;
    auth_time?: number | null;
    roles?: string[];
}

interface UnifiedUserMenuProps {
    user: IdentityUser;
    onClose: () => void;
    isActive: (href: string) => boolean;
    getNationalClearance: (clearance: string | null | undefined, country: string | null | undefined) => string;
    getCountryName: (code: string | null | undefined) => string;
}

export function UnifiedUserMenu({ user, onClose, isActive, getNationalClearance, getCountryName }: UnifiedUserMenuProps) {
    const { data: session } = useSession();
    const { instanceCode, theme } = useInstanceTheme();
    const [activeTab, setActiveTab] = useState<'profile' | 'actions' | 'admin'>('actions');
    const [copied, setCopied] = useState(false);
    const [otpConfigured, setOtpConfigured] = useState<boolean | null>(null);
    const [webAuthnConfigured, setWebAuthnConfigured] = useState<boolean | null>(null);

    const isSuperAdmin = (() => {
        const hasRole = user?.roles?.includes('super_admin') || 
                       user?.roles?.includes('admin') || 
                       user?.roles?.includes('dive-admin') ||  // Spoke admin role
                       user?.roles?.includes('broker_super_admin') || false;
        // Debug logging (remove in production)
        if (process.env.NODE_ENV === 'development') {
            console.log('[UnifiedUserMenu] Admin check:', {
                hasRole,
                roles: user?.roles,
                user: user?.uniqueID || user?.email
            });
        }
        return hasRole;
    })();

    const decoded = useMemo(() => {
        if (!session?.idToken) return null as null | Record<string, any>;
        try {
            return jwtDecode(session.idToken) as Record<string, any>;
        } catch {
            return null;
        }
    }, [session?.idToken]);

    const pseudonym = getPseudonymFromUser(user as any);
    const authTime: string | null = user?.auth_time 
        ? new Date(user.auth_time * 1000).toLocaleString() 
        : (decoded?.auth_time ? new Date(decoded.auth_time * 1000).toLocaleString() : null);
    const acr: string | null = user?.acr || decoded?.acr || null;
    const amr: string | null = Array.isArray(user?.amr) 
        ? user!.amr.join(' + ') 
        : (Array.isArray(decoded?.amr) ? decoded!.amr.join(' + ') : decoded?.amr || null);
    
    // Convert ACR to readable AAL level
    const getAALDisplay = (acrValue: string | null): string => {
        if (!acrValue) return 'N/A';
        const acrNum = parseInt(acrValue, 10);
        if (isNaN(acrNum)) {
            // Handle string formats like "aal1", "aal2", "aal3"
            const acrLower = acrValue.toLowerCase();
            if (acrLower.includes('aal3') || acrLower.includes('gold') || acrLower === '3') return 'AAL3';
            if (acrLower.includes('aal2') || acrLower.includes('silver') || acrLower === '2') return 'AAL2';
            if (acrLower.includes('aal1') || acrLower.includes('bronze') || acrLower === '1' || acrLower === '0') return 'AAL1';
            return acrValue.toUpperCase();
        }
        // Numeric format: Keycloak Level 1 => acr=1 (password), Level 2 => acr=2 (OTP), Level 3 => acr=3 (WebAuthn)
        if (acrNum >= 3) return 'AAL3';
        if (acrNum === 2) return 'AAL2';
        return 'AAL1'; // acr 0 or 1 -> treat as AAL1 (password/SSO)
    };
    
    // Check if user has MFA configured (OTP or WebAuthn)
    const hasMFA = (): boolean | null => {
        // If both are null, we're still checking
        if (otpConfigured === null && webAuthnConfigured === null) {
            // Fallback: Check AMR directly from token (immediate, no API wait)
            const amrArray = Array.isArray(user?.amr) ? user.amr : 
                            (Array.isArray(decoded?.amr) ? decoded.amr : 
                            (decoded?.amr ? [decoded.amr] : []));
            const hasWebAuthnInAMR = amrArray.some((m: string) => 
                m.toLowerCase().includes('hwk') || 
                m.toLowerCase().includes('webauthn') || 
                m.toLowerCase().includes('passkey')
            );
            const hasOTPInAMR = amrArray.some((m: string) => 
                m.toLowerCase().includes('otp') || 
                m.toLowerCase().includes('totp')
            );
            // If AMR shows MFA, return true immediately (don't wait for API)
            if (hasWebAuthnInAMR || hasOTPInAMR) {
                return true;
            }
            // No MFA factors in AMR; treat as not set rather than "Checking"
            return false;
        }
        // Use configured status (from API or AMR)
        return (otpConfigured === true) || (webAuthnConfigured === true);
    };

    // Check MFA status (OTP and WebAuthn) when profile tab is active
    useEffect(() => {
        if (activeTab === 'profile' && (otpConfigured === null || webAuthnConfigured === null) && user?.uniqueID) {
            // First, check AMR from token immediately (no API call needed)
            const amrArray = Array.isArray(user?.amr) ? user.amr : 
                            (Array.isArray(decoded?.amr) ? decoded.amr : 
                            (decoded?.amr ? [decoded.amr] : []));
            const hasWebAuthnInAMR = amrArray.some((m: string) => 
                m.toLowerCase().includes('hwk') || 
                m.toLowerCase().includes('webauthn') || 
                m.toLowerCase().includes('passkey')
            );
            const hasOTPInAMR = amrArray.some((m: string) => 
                m.toLowerCase().includes('otp') || 
                m.toLowerCase().includes('totp')
            );

            // Set initial state from AMR (immediate, no waiting)
            if (hasWebAuthnInAMR && webAuthnConfigured === null) {
                setWebAuthnConfigured(true);
            }
            if (hasOTPInAMR && otpConfigured === null) {
                setOtpConfigured(true);
            }

            // Then fetch detailed status from API (for users who haven't logged in with MFA yet)
            // Only fetch if we don't have definitive answer from AMR
            if ((!hasWebAuthnInAMR && !hasOTPInAMR) || (otpConfigured === null || webAuthnConfigured === null)) {
                const idpAlias = decoded?.idpAlias || decoded?.iss?.split('/').pop() || 'us-idp';
                const username = user.uniqueID.split('@')[0] || user.uniqueID;

                fetch('/api/auth/otp/status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ idpAlias, username }),
                    credentials: 'include',
                })
                    .then(res => res.ok ? res.json() : null)
                    .then(data => {
                        if (data?.data) {
                            // Update with API response (more accurate than AMR for configured credentials)
                            if (data.data.hasOTP !== undefined) {
                                setOtpConfigured(data.data.hasOTP);
                            }
                            if (data.data.hasWebAuthn !== undefined) {
                                setWebAuthnConfigured(data.data.hasWebAuthn);
                            }
                        }
                    })
                    .catch(() => {
                        // Silently fail - MFA status is optional
                        // Keep AMR-based values if API fails
                        if (otpConfigured === null) {
                            setOtpConfigured(hasOTPInAMR);
                        }
                        if (webAuthnConfigured === null) {
                            setWebAuthnConfigured(hasWebAuthnInAMR);
                        }
                    });
            }
        }
    }, [activeTab, otpConfigured, webAuthnConfigured, user?.uniqueID, decoded]);

    const [unreadCount, setUnreadCount] = useState<number>(0);

    const fetchUnread = async () => {
        try {
            const res = await fetch('/api/notifications-count', { cache: 'no-store' });
            if (!res.ok) return;
            const data = await res.json();
            if (typeof data?.unreadCount === 'number') {
                setUnreadCount(data.unreadCount);
            }
        } catch {
            // ignore errors; badge is best-effort
        }
    };

    useEffect(() => {
        fetchUnread();
    }, []);

    useEffect(() => {
        const handler = () => fetchUnread();
        if (typeof window !== 'undefined') {
            window.addEventListener('notifications-updated', handler);
            return () => window.removeEventListener('notifications-updated', handler);
        }
    }, []);

    // Quick action items - streamlined
    const quickActions = [
        { name: 'Browse Documents', href: '/resources', icon: FileText },
        { name: 'Upload Document', href: '/upload', icon: Upload },
        { name: 'Recent Activity', href: '/activity', icon: Clock },
        { name: 'Saved Items', href: '/resources?filter=favorites', icon: Star },
        { name: 'Notifications', href: '/notifications', icon: Bell, badge: unreadCount },
        { name: 'Help & Support', href: '/help', icon: HelpCircle },
    ];

    // Admin items - streamlined
    const adminItems = [
        { name: 'Admin Dashboard', href: '/admin/dashboard', icon: Settings },
        { name: 'SP Registry', href: '/admin/sp-registry', icon: Shield },
        { name: 'IdP Management', href: '/admin/idp', icon: Shield },
        { name: 'Audit Logs', href: '/admin/logs', icon: FileText },
    ];

    const handleCopy = async () => {
        await navigator.clipboard.writeText(pseudonym);
        setCopied(true);
        setTimeout(() => setCopied(false), 1000);
    };

    // Clearance abbreviation
    const clearanceAbbrev = (level: string | null | undefined): string => {
        const l = (level || 'UNCLASSIFIED').toUpperCase();
        if (l === 'TOP_SECRET' || l === 'TOP SECRET') return 'TS';
        if (l === 'SECRET') return 'S';
        if (l === 'CONFIDENTIAL') return 'C';
        return 'U';
    };

    return (
        <div className="absolute top-full mt-2 right-0 w-80 origin-top-right animate-fade-in z-[9999]">
            {/* Solid background wrapper for better visibility */}
            <div 
                className="relative bg-white rounded-xl overflow-hidden border-2 border-gray-300"
                style={{ 
                    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2), 0 4px 12px rgba(0, 0, 0, 0.1)'
                }}
            >
                {/* Compact Header - solid background for visibility */}
                <div 
                    className="px-4 py-3 border-b-2 border-gray-200 bg-gray-50"
                >
                    <div className="flex items-center gap-3">
                        {/* Small Avatar */}
                        <div 
                            className="w-10 h-10 rounded-lg flex items-center justify-center shadow-sm flex-shrink-0"
                            style={{ background: 'var(--instance-banner-bg)' }}
                        >
                            <span className="text-sm font-black text-white">
                                {(pseudonym || 'U').charAt(0).toUpperCase()}
                            </span>
                        </div>
                        
                        {/* Compact Info */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-bold text-gray-900 truncate">
                                    {pseudonym}
                                </h3>
                                <button
                                    onClick={handleCopy}
                                    className="p-0.5 rounded hover:bg-gray-100 transition-colors"
                                    title="Copy pseudonym"
                                >
                                    {copied ? (
                                        <Check className="w-3 h-3 text-green-600" />
                                    ) : (
                                        <Copy className="w-3 h-3 text-gray-400" />
                                    )}
                                </button>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <span 
                                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold"
                                    style={{
                                        background: 'rgba(var(--instance-primary-rgb), 0.1)',
                                        color: 'var(--instance-primary)'
                                    }}
                                >
                                    {clearanceAbbrev(user?.clearance)}
                                </span>
                                <span className="text-[10px] font-medium text-gray-500">
                                    {user?.countryOfAffiliation || 'USA'}
                                </span>
                                {Array.isArray(user?.acpCOI) && user.acpCOI.length > 0 && (
                                    <span className="text-[10px] font-medium text-purple-600">
                                        +{user.acpCOI.length} COI
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Compact Tabs - solid background */}
                <div className="flex border-b-2 border-gray-200 bg-gray-100">
                    <button
                        onClick={() => setActiveTab('actions')}
                        className={`flex-1 px-3 py-2 text-xs font-semibold transition-all ${
                            activeTab === 'actions'
                                ? 'text-gray-900 border-b-2 bg-white'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                        style={activeTab === 'actions' ? { borderColor: 'var(--instance-primary)' } : undefined}
                    >
                        Actions
                    </button>
                    <button
                        onClick={() => setActiveTab('profile')}
                        className={`flex-1 px-3 py-2 text-xs font-semibold transition-all ${
                            activeTab === 'profile'
                                ? 'text-gray-900 border-b-2 bg-white'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                        style={activeTab === 'profile' ? { borderColor: 'var(--instance-primary)' } : undefined}
                    >
                        Profile
                    </button>
                    {isSuperAdmin && (
                        <button
                            onClick={() => setActiveTab('admin')}
                            className={`flex-1 px-3 py-2 text-xs font-semibold transition-all ${
                                activeTab === 'admin'
                                    ? 'text-gray-900 border-b-2 bg-white'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                            style={activeTab === 'admin' ? { borderColor: 'var(--instance-primary)' } : undefined}
                        >
                            Admin
                        </button>
                    )}
                </div>

                {/* Tab Content - Compact */}
                <div className="max-h-[280px] overflow-y-auto">
                    {/* Actions Tab */}
                    {activeTab === 'actions' && (
                        <div className="py-2 px-3">
                            <div className="grid grid-cols-2 gap-2">
                                {quickActions.map((action) => (
                                    <Link
                                        key={action.href}
                                        href={action.href}
                                        onClick={onClose}
                                        className="group flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:border-gray-300 bg-white transition-colors"
                                    >
                                        <action.icon 
                                            className="w-4 h-4 text-gray-400 group-hover:text-[var(--instance-primary)] transition-colors"
                                            strokeWidth={2}
                                        />
                                        <span className="text-[13px] font-semibold text-gray-700 group-hover:text-gray-900 truncate">
                                            {action.name}
                                        </span>
                                        {action.badge ? (
                                            <span className="ml-auto inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 text-white text-[10px] px-1.5">
                                                {action.badge > 99 ? '99+' : action.badge}
                                            </span>
                                        ) : (
                                            <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-400" />
                                        )}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Profile Tab - Compact Identity Info */}
                    {activeTab === 'profile' && (
                        <div className="p-3 space-y-2">
                            {/* Identity Claims - Compact Grid */}
                            <div className="space-y-1.5">
                                <CompactClaim 
                                    icon={Fingerprint} 
                                    label="ID" 
                                    value={user?.uniqueID || 'N/A'} 
                                    truncate 
                                />
                                <CompactClaim 
                                    icon={Lock} 
                                    label="Clearance" 
                                    value={getNationalClearance(user?.clearance, user?.countryOfAffiliation)} 
                                    highlight
                                />
                                <CompactClaim 
                                    icon={Globe} 
                                    label="Country" 
                                    value={getCountryName(user?.countryOfAffiliation)} 
                                />
                                {Array.isArray(user?.acpCOI) && user.acpCOI.length > 0 && (
                                    <CompactClaim 
                                        icon={Building} 
                                        label="COI" 
                                        value={user.acpCOI.join(', ')} 
                                    />
                                )}
                                <CompactClaim 
                                    icon={Shield} 
                                    label="AAL" 
                                    value={getAALDisplay(acr)} 
                                    highlight={acr === '2' || acr === '3'} // Highlight AAL3
                                />
                                <CompactClaim 
                                    icon={Lock} 
                                    label="MFA" 
                                    value={
                                        hasMFA() === null 
                                            ? 'Checking...' 
                                            : hasMFA() 
                                                ? '✅ Configured' 
                                                : '❌ Not Set'
                                    }
                                    highlight={hasMFA() === true}
                                />
                                <CompactClaim 
                                    icon={Clock} 
                                    label="Auth" 
                                    value={authTime || 'N/A'} 
                                    small
                                />
                            </div>

                            {/* Privacy Note - Compact */}
                            <div 
                                className="mt-3 p-2 rounded-lg text-[10px] leading-relaxed"
                                style={{
                                    background: 'rgba(var(--instance-primary-rgb), 0.05)',
                                    color: 'var(--instance-primary)'
                                }}
                            >
                                <span className="font-bold">🔒 ACP-240 Privacy:</span> Pseudonym protects your identity
                            </div>
                        </div>
                    )}

                    {/* Admin Tab */}
                    {activeTab === 'admin' && isSuperAdmin && (
                        <div className="py-1">
                            <div className="px-4 py-1.5">
                                <span 
                                    className="text-[10px] font-bold uppercase tracking-wider"
                                    style={{ color: 'var(--instance-primary)' }}
                                >
                                    Admin Portal
                                </span>
                            </div>
                            {adminItems.map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={onClose}
                                    className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-gray-50"
                                >
                                    <item.icon 
                                        className="w-4 h-4 transition-colors"
                                        style={{ color: 'var(--instance-primary)' }}
                                        strokeWidth={2}
                                    />
                                    <span className="flex-1 text-sm font-medium text-gray-700 group-hover:text-gray-900">
                                        {item.name}
                                    </span>
                                    <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-400" />
                                </Link>
                            ))}
                        </div>
                    )}
                </div>

                {/* Compact Footer - solid background */}
                <div className="border-t-2 border-gray-200 p-3 bg-gray-100">
                    <SecureLogoutButton compact />
                </div>
            </div>
        </div>
    );
}

// Compact Claim Display Component
function CompactClaim({ 
    icon: Icon, 
    label, 
    value, 
    truncate = false,
    highlight = false,
    small = false
}: { 
    icon: React.ElementType; 
    label: string; 
    value: string;
    truncate?: boolean;
    highlight?: boolean;
    small?: boolean;
}) {
    return (
        <div className="flex items-center gap-2 py-1 px-2 rounded-md bg-gray-50/50 hover:bg-gray-50 transition-colors">
            <Icon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" strokeWidth={2} />
            <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide w-16 flex-shrink-0">
                {label}
            </span>
            <span 
                className={`flex-1 font-medium text-right ${
                    truncate ? 'truncate' : ''
                } ${highlight ? 'text-gray-900' : 'text-gray-600'} ${small ? 'text-[10px]' : 'text-xs'}`}
                title={truncate ? value : undefined}
            >
                {value}
            </span>
        </div>
    );
}
