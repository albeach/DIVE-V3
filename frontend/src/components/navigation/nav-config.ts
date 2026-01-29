import {
    LayoutDashboard,
    FileText,
    ScrollText,
    CheckCircle2,
    Library,
    Clock,
    Star,
    Shield,
    ShieldAlert,
    ShieldCheck,
    ShieldQuestion,
    ArrowUpCircle,
    Unlock,
    Settings,
    BarChart3,
    Key,
    CheckSquare,
    FileCheck,
    BookOpen,
    FlaskConical,
    Building2,
    FileEdit,
    Sparkles,
    Hammer,
    FolderOpen,
    Users,
    Layers,
    LucideIcon
} from 'lucide-react';

// National classification mappings (ACP-240 Section 4.3)
export const NATIONAL_CLASSIFICATIONS: Record<string, Record<string, string>> = {
    'USA': { 'UNCLASSIFIED': 'UNCLASSIFIED', 'RESTRICTED': 'RESTRICTED', 'CONFIDENTIAL': 'CONFIDENTIAL', 'SECRET': 'SECRET', 'TOP_SECRET': 'TOP SECRET' },
    'GBR': { 'UNCLASSIFIED': 'OFFICIAL', 'RESTRICTED': 'OFFICIAL-SENSITIVE', 'CONFIDENTIAL': 'CONFIDENTIAL', 'SECRET': 'SECRET', 'TOP_SECRET': 'TOP SECRET' },
    'FRA': {
        'UNCLASSIFIED': 'NON CLASSIFIÉ',
        'RESTRICTED': 'RESTREINT',
        'CONFIDENTIAL': 'CONFIDENTIEL',
        'SECRET': 'SECRET',
        'TOP_SECRET': 'TRÈS SECRET'
    },
    'CAN': { 'UNCLASSIFIED': 'UNCLASSIFIED', 'RESTRICTED': 'PROTECTED A', 'CONFIDENTIAL': 'CONFIDENTIAL', 'SECRET': 'SECRET', 'TOP_SECRET': 'TOP SECRET' },
    'DEU': { 'UNCLASSIFIED': 'OFFEN', 'RESTRICTED': 'VS-NFD', 'CONFIDENTIAL': 'VS-VERTRAULICH', 'SECRET': 'GEHEIM', 'TOP_SECRET': 'STRENG GEHEIM' },
    'AUS': { 'UNCLASSIFIED': 'UNCLASSIFIED', 'RESTRICTED': 'RESTRICTED', 'CONFIDENTIAL': 'CONFIDENTIAL', 'SECRET': 'SECRET', 'TOP_SECRET': 'TOP SECRET' },
    'NZL': { 'UNCLASSIFIED': 'UNCLASSIFIED', 'RESTRICTED': 'RESTRICTED', 'CONFIDENTIAL': 'CONFIDENTIAL', 'SECRET': 'SECRET', 'TOP_SECRET': 'TOP SECRET' },
    'ESP': { 'UNCLASSIFIED': 'NO CLASIFICADO', 'RESTRICTED': 'DIFUSIÓN LIMITADA', 'CONFIDENTIAL': 'CONFIDENCIAL', 'SECRET': 'SECRETO', 'TOP_SECRET': 'ALTO SECRETO' },
    'ITA': { 'UNCLASSIFIED': 'NON CLASSIFICATO', 'RESTRICTED': 'USO UFFICIALE', 'CONFIDENTIAL': 'CONFIDENZIALE', 'SECRET': 'SEGRETO', 'TOP_SECRET': 'SEGRETISSIMO' },
    'POL': { 'UNCLASSIFIED': 'NIEJAWNE', 'RESTRICTED': 'UŻYTEK SŁUŻBOWY', 'CONFIDENTIAL': 'POUFNE', 'SECRET': 'TAJNE', 'TOP_SECRET': 'ŚCIŚLE TAJNE' }
};

// Helper to get national classification label
export function getNationalClearance(natoLevel: string | null | undefined, country: string | null | undefined): string {
    if (!natoLevel) return 'UNCLASS';
    if (!country) return natoLevel;
    return NATIONAL_CLASSIFICATIONS[country]?.[natoLevel] || natoLevel;
}

// Helper to get COUNTRY name from code
export function getCountryName(code: string | null | undefined): string {
    const countryNames: Record<string, string> = {
        'USA': 'United States', 'GBR': 'United Kingdom', 'FRA': 'France', 'CAN': 'Canada',
        'DEU': 'Germany', 'AUS': 'Australia', 'NZL': 'New Zealand', 'ESP': 'Spain',
        'ITA': 'Italy', 'POL': 'Poland', 'NLD': 'Netherlands'
    };
    return countryNames[code || ''] || code || 'Unknown';
}

// Clearance color mapping (chips)
export function clearanceColor(level: string | null | undefined): 'red' | 'orange' | 'blue' | 'gray' {
    switch ((level || 'UNCLASSIFIED').toUpperCase()) {
        case 'TOP_SECRET':
            return 'red';
        case 'SECRET':
            return 'orange';
        case 'CONFIDENTIAL':
        case 'RESTRICTED':
            return 'blue';
        default:
            return 'gray';
    }
}

// Navigation items structure
export interface NavMegaMenuItem {
    category: string;
    items: Array<{
        name: string;
        href: string;
        icon: LucideIcon;
    }>;
}

export interface NavItem {
    name: string;
    shortName?: string;  // Optional shorter label for responsive display
    href: string;
    icon: LucideIcon;
    description: string;
    hasMegaMenu: boolean;
    megaMenuItems?: NavMegaMenuItem[];
}

// PHASE 1.3: Consolidated navigation items (6→4 items) to fit 1024px viewport
// PHASE 2: Added shortName for responsive display at lg breakpoint
// Width calculation: 4 items × ~80px = 320px + logo (200px) + user menu (80px) = 600px → Fits comfortably!
export const navItems: NavItem[] = [
    {
        name: 'nav.dashboard',
        shortName: 'nav.home',  // Shorter label for lg breakpoint
        href: '/dashboard',
        icon: LayoutDashboard,
        description: 'nav.dashboard.description',
        hasMegaMenu: false
    },
    {
        name: 'nav.documents.name',
        shortName: 'nav.documents.shortName',  // Shorter label for lg breakpoint
        href: '/resources',
        icon: FileText,
        description: 'nav.documents.description',
        hasMegaMenu: true,
        megaMenuItems: [
            {
                category: 'nav.documents.browse',
                items: [
                    { name: 'nav.documents.allDocuments', href: '/resources', icon: Library },
                    { name: 'nav.documents.recent', href: '/resources?sort=recent', icon: Clock },
                    { name: 'nav.documents.favorites', href: '/resources?filter=favorites', icon: Star },
                ]
            },
            {
                category: 'nav.documents.actions',
                items: [
                    { name: 'nav.documents.myActivity', href: '/activity', icon: Clock },
                    { name: 'nav.documents.requestAccess', href: '/resources/request', icon: Unlock },
                ]
            }
        ]
    },
    {
        name: 'nav.upload.name',
        shortName: 'nav.upload.shortName',  // Same - already short
        href: '/upload',
        icon: ArrowUpCircle,
        description: 'nav.upload.description',
        hasMegaMenu: false
    },
    {
        name: 'nav.policyTools.name',
        shortName: 'nav.policyTools.shortName',  // Shorter label "Policy" for lg breakpoint
        href: '/policies',
        icon: Settings,
        description: 'nav.policyTools.description',
        hasMegaMenu: true,
        megaMenuItems: [
            {
                category: 'nav.policyTools.explore',
                items: [
                    { name: 'nav.policyTools.policyLibrary', href: '/policies', icon: Library },
                    { name: 'nav.policyTools.policySandbox', href: '/policies/sandbox', icon: Sparkles },
                ]
            },
            {
                category: 'nav.policyTools.sandboxWorkspaces',
                items: [
                    { name: 'nav.policyTools.builder', href: '/policies/sandbox?tab=builder', icon: Hammer },
                    { name: 'nav.policyTools.myPolicies', href: '/policies/sandbox?tab=policies', icon: FolderOpen },
                    { name: 'nav.policyTools.test', href: '/policies/sandbox?tab=test', icon: FlaskConical },
                    { name: 'nav.policyTools.reference', href: '/policies/sandbox?tab=reference', icon: BookOpen },
                ]
            },
        ]
    },
    {
        name: 'nav.compliance.name',
        shortName: 'nav.compliance.shortName',  // Shorter label for lg breakpoint
        href: '/compliance',
        icon: CheckCircle2,
        description: 'nav.compliance.description',
        hasMegaMenu: true,
        megaMenuItems: [
            {
                category: 'nav.compliance.standards',
                items: [
                    { name: 'nav.compliance.standardsCompliance', href: '/compliance', icon: CheckCircle2 },
                ]
            },
            {
                category: 'nav.compliance.security',
                items: [
                    { name: 'nav.compliance.kas', href: '/compliance/multi-kas', icon: Key },
                    { name: 'nav.compliance.cois', href: '/compliance/coi-keys', icon: Users },
                    { name: 'nav.compliance.pki', href: '/compliance/certificates', icon: FileCheck },
                    { name: 'nav.compliance.classifications', href: '/compliance/classifications', icon: Layers },
                ]
            },
        ]
    },
];

// Admin menu items - Re-export from unified admin navigation
// IMPORTANT: This is now a compatibility layer. New code should import from @/config/admin-navigation.ts
export { ADMIN_NAVIGATION, getAdminNavigation, type AdminNavItem } from '@/config/admin-navigation';

// Legacy adminItems format for backwards compatibility
// TODO: Migrate consuming components to use ADMIN_NAVIGATION directly
import { ADMIN_NAVIGATION } from '@/config/admin-navigation';

export const adminItems = ADMIN_NAVIGATION
    .filter(item => !item.children) // Top-level items only for legacy compat
    .map(item => ({
        name: item.label,
        href: item.href,
        icon: item.icon,
        badge: item.badge || null,
        description: item.description
    }));
