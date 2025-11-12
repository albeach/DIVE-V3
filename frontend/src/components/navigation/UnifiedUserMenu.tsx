'use client';

import { useMemo, useState } from 'react';
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
    ArrowRight
} from 'lucide-react';
import { getPseudonymFromUser } from '@/lib/pseudonym-generator';
import { jwtDecode } from 'jwt-decode';
import { SecureLogoutButton } from '@/components/auth/secure-logout-button';

interface IdentityUser {
    uniqueID?: string | null;
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
    const [activeTab, setActiveTab] = useState<'profile' | 'actions' | 'admin'>('profile');
    const [copied, setCopied] = useState(false);

    const isSuperAdmin = user?.roles?.includes('super_admin') || false;

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

    // Quick action items for all users
    const quickActions = [
        { name: 'Browse Documents', href: '/resources', icon: FileText, description: 'View all documents' },
        { name: 'Upload Document', href: '/upload', icon: Upload, description: 'Upload new content' },
        { name: 'Recent Activity', href: '/dashboard?view=activity', icon: Clock, description: 'View your history' },
        { name: 'Saved Items', href: '/resources?filter=favorites', icon: Star, description: 'Your favorites' },
        { name: 'Notifications', href: '/dashboard?view=notifications', icon: Bell, description: 'Alerts & updates' },
        { name: 'Help & Support', href: '/help', icon: HelpCircle, description: 'Get assistance' },
    ];

    // Admin items
    const adminItems = [
        { name: 'Admin Dashboard', href: '/admin/dashboard', icon: Settings, description: 'Admin overview' },
        { name: 'SP Registry', href: '/admin/sp-registry', icon: Shield, description: 'Manage Service Providers' },
        { name: 'IdP Management', href: '/admin/idp', icon: Shield, description: 'Configure identity providers' },
        { name: 'Audit Logs', href: '/admin/logs', icon: FileText, description: 'View audit trail' },
    ];

    const handleCopy = async () => {
        await navigator.clipboard.writeText(pseudonym);
        setCopied(true);
        setTimeout(() => setCopied(false), 1000);
    };

    return (
        <div className="absolute top-full mt-3 right-0 w-96 origin-top-right animate-fade-in z-50">
            {/* Glow effect */}
            <div className="absolute -inset-2 bg-gradient-to-r from-[#4497ac] to-[#90d56a] rounded-2xl opacity-20 blur-xl" />
            
            <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
                {/* Header with user info */}
                <div className="px-6 py-6 bg-gradient-to-r from-[#4497ac]/5 via-[#5ca3b5]/5 to-[#90d56a]/5 border-b border-gray-200">
                    <div className="flex items-start gap-4">
                        <div className="relative flex-shrink-0">
                            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#4497ac] via-[#5ca3b5] to-[#90d56a] flex items-center justify-center shadow-lg">
                                <span className="text-2xl font-black text-white drop-shadow-md">
                                    {(pseudonym || 'U').charAt(0).toUpperCase()}
                                </span>
                            </div>
                            <div className="absolute -inset-0.5 bg-gradient-to-r from-[#4497ac] to-[#90d56a] rounded-full opacity-20 blur-md animate-pulse" />
                        </div>
                        <div className="flex-1 min-w-0 pt-1">
                            <h3 className="text-2xl font-black text-gray-900 mb-3 truncate leading-tight">
                                {pseudonym}
                            </h3>
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-bold bg-gradient-to-r from-[#4497ac]/20 to-[#90d56a]/20 text-[#4497ac] border border-[#4497ac]/30 shadow-sm">
                                    {getNationalClearance(user?.clearance, user?.countryOfAffiliation)}
                                </span>
                                <span className="text-sm font-bold text-gray-700 px-3 py-1.5 bg-gray-100 rounded-lg">
                                    {user?.countryOfAffiliation || 'USA'}
                                </span>
                                {Array.isArray(user?.acpCOI) && user.acpCOI.length > 0 && (
                                    <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-bold bg-purple-50 text-purple-800 border border-purple-200">
                                        COI: {user.acpCOI[0]}{user.acpCOI.length > 1 ? ` +${user.acpCOI.length - 1}` : ''}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tabbed Navigation - Modern 2025 Pattern */}
                <div className="border-b border-gray-200 bg-gray-50/50">
                    <div className="flex items-center px-2 pt-2">
                        <button
                            onClick={() => setActiveTab('profile')}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-t-xl transition-all duration-200 ${
                                activeTab === 'profile'
                                    ? 'bg-white text-[#4497ac] border-t-2 border-x border-[#4497ac] shadow-sm'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/50'
                            }`}
                        >
                            <User className="w-4 h-4" strokeWidth={2.5} />
                            <span>Profile</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('actions')}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-t-xl transition-all duration-200 ${
                                activeTab === 'actions'
                                    ? 'bg-white text-[#4497ac] border-t-2 border-x border-[#4497ac] shadow-sm'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/50'
                            }`}
                        >
                            <FileText className="w-4 h-4" strokeWidth={2.5} />
                            <span>Actions</span>
                        </button>
                        {isSuperAdmin && (
                            <button
                                onClick={() => setActiveTab('admin')}
                                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-t-xl transition-all duration-200 ${
                                    activeTab === 'admin'
                                        ? 'bg-white text-[#4497ac] border-t-2 border-x border-[#4497ac] shadow-sm'
                                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/50'
                                }`}
                            >
                                <Settings className="w-4 h-4" strokeWidth={2.5} />
                                <span>Admin</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Tab Content - Scrollable */}
                <div className="max-h-[400px] overflow-y-auto">
                    {/* Profile Tab - Identity Information */}
                    {activeTab === 'profile' && (
                        <div className="p-5 space-y-4">
                            {/* Pseudonym with copy */}
                            <div className="flex items-center justify-between">
                                <div className="text-sm font-semibold text-gray-900">Pseudonym</div>
                                <button
                                    onClick={handleCopy}
                                    className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                                >
                                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                    {copied ? 'Copied' : 'Copy'}
                                </button>
                            </div>
                            <div className="text-sm font-mono bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
                                {pseudonym}
                            </div>

                            {/* Identity Claims */}
                            <div className="space-y-2">
                                <Claim label="uniqueID" value={user?.uniqueID || 'N/A'} />
                                <Claim 
                                    label="clearance" 
                                    value={user?.clearance || 'UNCLASSIFIED'} 
                                    color={clearanceColor(user?.clearance)} 
                                />
                                <Claim label="countryOfAffiliation" value={user?.countryOfAffiliation || 'N/A'} />
                                {Array.isArray(user?.acpCOI) && user!.acpCOI!.length > 0 && (
                                    <Claim label="acpCOI" value={user!.acpCOI!.join(', ')} />
                                )}
                                <Claim label="auth_time" value={authTime || 'N/A'} />
                                <Claim label="acr (AAL)" value={acr?.toUpperCase() || 'N/A'} />
                                <Claim label="amr" value={amr || 'N/A'} />
                            </div>

                            {/* Privacy note */}
                            <div className="rounded-lg bg-teal-50 border border-teal-200 p-3 text-xs text-teal-900">
                                <p className="font-semibold mb-1">🔒 Privacy Notice</p>
                                We use a pseudonym instead of your real name to meet ACP-240 Section 6.2 PII minimization requirements.
                            </div>
                        </div>
                    )}

                    {/* Actions Tab - Quick Actions */}
                    {activeTab === 'actions' && (
                        <div className="p-2">
                            <div className="px-3 py-2 mb-2">
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Quick Actions</p>
                            </div>
                            {quickActions.map((action, idx) => {
                                const active = isActive(action.href);
                                return (
                                    <Link
                                        key={action.href}
                                        href={action.href}
                                        onClick={onClose}
                                        className="group relative block px-3 py-3 rounded-xl transition-all duration-200 mb-0.5"
                                        style={{ animationDelay: `${idx * 30}ms` }}
                                    >
                                        <div className={`absolute inset-0 rounded-xl transition-all duration-200 ${
                                            active
                                                ? 'bg-gradient-to-r from-[#4497ac]/10 to-[#90d56a]/10 shadow-sm'
                                                : 'bg-transparent group-hover:bg-gradient-to-r group-hover:from-gray-50 group-hover:to-gray-100/50'
                                        }`} />
                                        
                                        <div className="relative flex items-center justify-between">
                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                <action.icon className={`w-5 h-5 transition-all duration-200 ${
                                                    active ? 'scale-110 drop-shadow-sm text-[#4497ac]' : 'text-gray-500 group-hover:scale-110 group-hover:text-[#4497ac]'
                                                }`} strokeWidth={2.5} />
                                                <div className="flex-1 min-w-0">
                                                    <div className={`font-bold text-sm transition-colors duration-200 ${
                                                        active
                                                            ? 'bg-gradient-to-r from-[#4497ac] to-[#90d56a] bg-clip-text text-transparent'
                                                            : 'text-gray-700 group-hover:text-gray-900'
                                                    }`}>
                                                        {action.name}
                                                    </div>
                                                    <p className="text-xs text-gray-500 mt-0.5">{action.description}</p>
                                                </div>
                                            </div>
                                            
                                            <ArrowRight 
                                                className={`w-4 h-4 text-gray-400 transition-all duration-200 ${
                                                    active ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0'
                                                }`}
                                                strokeWidth={2}
                                            />
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    )}

                    {/* Admin Tab - Admin Actions */}
                    {activeTab === 'admin' && isSuperAdmin && (
                        <div className="p-2">
                            <div className="px-3 py-2 mb-2">
                                <p className="text-xs font-bold uppercase tracking-wide bg-gradient-to-r from-[#4497ac] to-[#90d56a] bg-clip-text text-transparent">
                                    Admin Portal
                                </p>
                            </div>
                            {adminItems.map((item, idx) => {
                                const active = isActive(item.href);
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        onClick={onClose}
                                        className="group relative block px-3 py-3 rounded-xl transition-all duration-200 mb-0.5"
                                        style={{ animationDelay: `${idx * 30}ms` }}
                                    >
                                        <div className={`absolute inset-0 rounded-xl transition-all duration-200 ${
                                            active
                                                ? 'bg-gradient-to-r from-[#4497ac]/10 to-[#90d56a]/10 shadow-sm'
                                                : 'bg-transparent group-hover:bg-gradient-to-r group-hover:from-gray-50 group-hover:to-gray-100/50'
                                        }`} />
                                        
                                        <div className="relative flex items-center justify-between">
                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                <item.icon className={`w-5 h-5 transition-all duration-200 ${
                                                    active ? 'scale-110 drop-shadow-sm text-[#4497ac]' : 'text-gray-500 group-hover:scale-110 group-hover:text-[#4497ac]'
                                                }`} strokeWidth={2.5} />
                                                <div className="flex-1 min-w-0">
                                                    <div className={`font-bold text-sm transition-colors duration-200 ${
                                                        active
                                                            ? 'bg-gradient-to-r from-[#4497ac] to-[#90d56a] bg-clip-text text-transparent'
                                                            : 'text-gray-700 group-hover:text-gray-900'
                                                    }`}>
                                                        {item.name}
                                                    </div>
                                                    <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                                                </div>
                                            </div>
                                            
                                            <ArrowRight 
                                                className={`w-4 h-4 text-gray-400 transition-all duration-200 ${
                                                    active ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0'
                                                }`}
                                                strokeWidth={2}
                                            />
                                        </div>
                                        
                                        {active && (
                                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-[#4497ac] to-[#90d56a] rounded-r-full shadow-lg shadow-[#4497ac]/50" />
                                        )}
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer with sign out - Always visible */}
                <div className="border-t border-gray-200 p-4 bg-gray-50/50">
                    <SecureLogoutButton />
                </div>
            </div>
        </div>
    );
}

function clearanceColor(level: string | null | undefined): 'red' | 'orange' | 'blue' | 'gray' {
    switch ((level || 'UNCLASSIFIED').toUpperCase()) {
        case 'TOP_SECRET':
            return 'red';
        case 'SECRET':
            return 'orange';
        case 'CONFIDENTIAL':
            return 'blue';
        default:
            return 'gray';
    }
}

function Claim({ label, value, color }: { label: string; value: string; color?: 'red' | 'orange' | 'blue' | 'gray' }) {
    const chipClasses = color === 'red'
        ? 'bg-red-50 text-red-800 border-red-200'
        : color === 'orange'
        ? 'bg-orange-50 text-orange-800 border-orange-200'
        : color === 'blue'
        ? 'bg-blue-50 text-blue-800 border-blue-200'
        : 'bg-gray-50 text-gray-800 border-gray-200';
    
    return (
        <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 bg-white">
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</div>
            <div className={`text-xs font-bold px-2.5 py-1 rounded-md border ${chipClasses}`}>{value}</div>
        </div>
    );
}

