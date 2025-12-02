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
    LucideIcon
} from 'lucide-react';

// National classification mappings (ACP-240 Section 4.3)
export const NATIONAL_CLASSIFICATIONS: Record<string, Record<string, string>> = {
    'USA': { 'UNCLASSIFIED': 'UNCLASSIFIED', 'CONFIDENTIAL': 'CONFIDENTIAL', 'SECRET': 'SECRET', 'TOP_SECRET': 'TOP SECRET' },
    'GBR': { 'UNCLASSIFIED': 'OFFICIAL', 'CONFIDENTIAL': 'CONFIDENTIAL', 'SECRET': 'SECRET', 'TOP_SECRET': 'TOP SECRET' },
    'FRA': { 'UNCLASSIFIED': 'NON CLASSIFIÉ', 'CONFIDENTIAL': 'CONFIDENTIEL DÉFENSE', 'SECRET': 'SECRET DÉFENSE', 'TOP_SECRET': 'TRÈS SECRET DÉFENSE' },
    'CAN': { 'UNCLASSIFIED': 'UNCLASSIFIED', 'CONFIDENTIAL': 'CONFIDENTIAL', 'SECRET': 'SECRET', 'TOP_SECRET': 'TOP SECRET' },
    'DEU': { 'UNCLASSIFIED': 'OFFEN', 'CONFIDENTIAL': 'VS-VERTRAULICH', 'SECRET': 'GEHEIM', 'TOP_SECRET': 'STRENG GEHEIM' },
    'AUS': { 'UNCLASSIFIED': 'UNCLASSIFIED', 'CONFIDENTIAL': 'CONFIDENTIAL', 'SECRET': 'SECRET', 'TOP_SECRET': 'TOP SECRET' },
    'NZL': { 'UNCLASSIFIED': 'UNCLASSIFIED', 'CONFIDENTIAL': 'CONFIDENTIAL', 'SECRET': 'SECRET', 'TOP_SECRET': 'TOP SECRET' },
    'ESP': { 'UNCLASSIFIED': 'NO CLASIFICADO', 'CONFIDENTIAL': 'CONFIDENCIAL', 'SECRET': 'SECRETO', 'TOP_SECRET': 'ALTO SECRETO' },
    'ITA': { 'UNCLASSIFIED': 'NON CLASSIFICATO', 'CONFIDENTIAL': 'CONFIDENZIALE', 'SECRET': 'SEGRETO', 'TOP_SECRET': 'SEGRETISSIMO' },
    'POL': { 'UNCLASSIFIED': 'NIEJAWNE', 'CONFIDENTIAL': 'POUFNE', 'SECRET': 'TAJNE', 'TOP_SECRET': 'ŚCIŚLE TAJNE' }
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
        name: 'Dashboard',
        shortName: 'Home',  // Shorter label for lg breakpoint
        href: '/dashboard',
        icon: LayoutDashboard,
        description: 'Overview and quick stats',
        hasMegaMenu: false
    },
    {
        name: 'Documents',
        shortName: 'Docs',  // Shorter label for lg breakpoint
        href: '/resources',
        icon: FileText,
        description: 'Classified resource library',
        hasMegaMenu: true,
        megaMenuItems: [
            {
                category: 'Browse',
                items: [
                    { name: 'All Documents', href: '/resources', icon: Library },
                    { name: 'Recent', href: '/resources?sort=recent', icon: Clock },
                    { name: 'Favorites', href: '/resources?filter=favorites', icon: Star },
                ]
            },
            {
                category: 'Actions',
                items: [
                    { name: 'My Activity', href: '/activity', icon: Clock },
                    { name: 'Request Access', href: '/resources/request', icon: Unlock },
                ]
            }
        ]
    },
    {
        name: 'Upload',
        shortName: 'Upload',  // Same - already short
        href: '/upload',
        icon: ArrowUpCircle,
        description: 'Upload classified documents',
        hasMegaMenu: false
    },
    {
        name: 'Policy Tools',
        shortName: 'Policies',  // Shorter label for lg breakpoint
        href: '/policies',
        icon: Settings,
        description: 'Authorization policies and compliance',
        hasMegaMenu: true,
        megaMenuItems: [
            {
                category: 'Policy Management',
                items: [
                    { name: 'Browse Policies', href: '/policies', icon: ScrollText },
                    { name: 'Policy Editor', href: '/policies/editor', icon: FileEdit },
                    { name: 'Policy Lab', href: '/policies/lab', icon: FlaskConical },
                ]
            },
            {
                category: 'Lab Workspaces',
                items: [
                    { name: 'Evaluate', href: '/policies/lab?tab=evaluate', icon: ScrollText },
                    { name: 'Compare', href: '/policies/lab?tab=compare', icon: CheckCircle2 },
                    { name: 'Upload Policy', href: '/policies/lab?tab=upload', icon: ArrowUpCircle },
                ]
            },
            {
                category: 'Compliance',
                items: [
                    { name: 'Standards & Compliance', href: '/compliance', icon: CheckCircle2 },
                ]
            },
        ]
    },
];

// Admin menu items
export const adminItems = [
    {
        name: 'Dashboard',
        href: '/admin/dashboard',
        icon: BarChart3,
        badge: null,
        description: 'Admin overview'
    },
    {
        name: 'SP Registry',
        href: '/admin/sp-registry',
        icon: Building2,
        badge: null,
        description: 'Manage Service Providers'
    },
    {
        name: 'Certificates',
        href: '/admin/certificates',
        icon: FileCheck,
        badge: null,
        description: 'Manage PKI certs'
    },
    {
        name: 'IdP Governance',
        href: '/admin/analytics',
        icon: Settings,
        badge: null,
        description: 'Identity governance'
    },
    {
        name: 'IdP Management',
        href: '/admin/idp',
        icon: Key,
        badge: null,
        description: 'Configure identity providers'
    },
    {
        name: 'Approvals',
        href: '/admin/approvals',
        icon: CheckSquare,
        badge: '3',
        description: 'Pending approvals'
    },
    {
        name: 'Audit Logs',
        href: '/admin/logs',
        icon: ScrollText,
        badge: null,
        description: 'View audit trail'
    },
    {
        name: 'OPA Policy',
        href: '/admin/opa-policy',
        icon: Settings,
        badge: 'DEMO',
        description: 'Real-time policy editing'
    },
    {
        name: 'Integration Guide',
        href: '/integration/federation-vs-object',
        icon: BookOpen,
        badge: 'NEW',
        description: '5663 × 240 Interactive Tutorial'
    },
];


