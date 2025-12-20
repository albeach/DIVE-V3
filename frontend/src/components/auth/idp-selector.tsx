"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { getFlagComponent } from "../ui/flags";
import { useInstanceTheme } from "../ui/theme-provider";
import { IdpSearchBar } from "./idp-search-bar";
import { IdpFilterPills, filterIdPsByRegion, type FilterRegion } from "./idp-filter-pills";
import { IdpSmartSuggestions, saveRecentIdP } from "./idp-smart-suggestions";
import { EnhancedIdpCard, type IdPStatus } from "./enhanced-idp-card";

/**
 * IdP Selector Component 2025 - Modern Federation-First Design
 *
 * Features:
 * - 3-tiered visual hierarchy (direct login, suggestions, full grid)
 * - Smart search with autocomplete
 * - Regional filtering (FVEY, EU, Baltics, etc.)
 * - Geo-detection and recently used IdPs
 * - 3D card effects with status indicators
 * - Responsive design (mobile-first)
 * - Accessibility support (keyboard navigation, ARIA)
 *
 * 🥚 EASTER EGG: Super Admin access hidden behind secret triggers
 *
 * ✅ SECURITY: Uses local SVG flags only - no external CDN dependencies
 */

interface IdPOption {
  alias: string;
  displayName: string;
  protocol: string;
  enabled: boolean;
}

export function IdpSelector() {
  const router = useRouter();
  const { instanceCode, instanceName } = useInstanceTheme();
  const [idps, setIdps] = useState<IdPOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [idpStatuses, setIdpStatuses] = useState<Record<string, IdPStatus>>({});

  // Filter and search state
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterRegion>('all');

  // 🥚 Easter egg state
  const [eggActive, setEggActive] = useState(false);
  const [eggUnlocking, setEggUnlocking] = useState(false);
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [eggCount, setEggCount] = useState(0);
  const konamiBuffer = useRef<number[]>([]);
  const logoClickCount = useRef(0);
  const logoClickTimer = useRef<NodeJS.Timeout | null>(null);

  // Check health of all IdPs
  const checkIdpHealth = async (idpList: IdPOption[]) => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ||
                      process.env.NEXT_PUBLIC_API_URL ||
                      'https://localhost:4000';

    // Initialize all to checking
    const initialStatuses: Record<string, IdPStatus> = {};
    idpList.forEach(idp => {
      initialStatuses[idp.alias] = 'checking';
    });
    setIdpStatuses(initialStatuses);

    // Check each IdP in parallel
    const healthChecks = idpList.map(async (idp) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(`${backendUrl}/api/idps/${idp.alias}/health`, {
          method: 'GET',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          return {
            alias: idp.alias,
            status: data.healthy ? 'active' : (data.degraded ? 'warning' : 'offline') as IdPStatus
          };
        } else if (response.status === 503) {
          return { alias: idp.alias, status: 'warning' as IdPStatus };
        } else {
          return { alias: idp.alias, status: 'offline' as IdPStatus };
        }
      } catch (err) {
        return { alias: idp.alias, status: 'offline' as IdPStatus };
      }
    });

    const results = await Promise.all(healthChecks);
    const newStatuses: Record<string, IdPStatus> = {};
    results.forEach(r => {
      newStatuses[r.alias] = r.status;
    });
    setIdpStatuses(newStatuses);
  };

  useEffect(() => {
    fetchEnabledIdPs();

    // Load easter egg counter
    const count = parseInt(localStorage.getItem('dive-egg-count') || '0', 10);
    setEggCount(count);

    // Set up easter egg listeners
    setupEasterEgg();
  }, []);

  const fetchEnabledIdPs = async () => {
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ||
                        process.env.NEXT_PUBLIC_API_URL ||
                        'https://localhost:4000';

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${backendUrl}/api/idps/public`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to fetch IdPs: ${response.status}`);
      }

      const data = await response.json();
      const enabledIdps = data.idps?.filter((idp: IdPOption) => idp.enabled) || [];
      setIdps(enabledIdps);
      setError(null);

      if (enabledIdps.length > 0) {
        checkIdpHealth(enabledIdps);
      }
    } catch (err) {
      console.error('[IdP Selector] Error fetching IdPs:', err);
      setError(err instanceof Error ? err.message : 'Unable to load identity providers');

      // Fallback IdPs
      const fallbackIdps: IdPOption[] = [
        { alias: 'fra-realm-broker', displayName: 'France', protocol: 'oidc', enabled: true },
        { alias: 'gbr-realm-broker', displayName: 'United Kingdom', protocol: 'oidc', enabled: true },
        { alias: 'deu-realm-broker', displayName: 'Germany', protocol: 'oidc', enabled: true },
      ];
      setIdps(fallbackIdps);
      checkIdpHealth(fallbackIdps);
    } finally {
      setLoading(false);
    }
  };

  const handleIdpClick = async (idp: IdPOption) => {
    const idpHint = idp.alias;

    console.log(`[IdP Selector] Federation: ${instanceCode} → ${idp.displayName}`);
    console.log(`[IdP Selector] Using kc_idp_hint: ${idpHint}`);

    // Save to recent IdPs
    saveRecentIdP(idp.alias);

    // Trigger NextAuth signIn
    const { signIn } = await import('next-auth/react');
    await signIn(
      'keycloak',
      { callbackUrl: '/' },
      { kc_idp_hint: idpHint }
    );
  };

  // 🥚 Easter egg setup
  const setupEasterEgg = () => {
    const konami = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65];

    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement as HTMLElement)?.isContentEditable) return;

      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        triggerEasterEgg();
        return;
      }

      konamiBuffer.current.push(e.keyCode);
      if (konamiBuffer.current.length > konami.length) konamiBuffer.current.shift();
      if (konamiBuffer.current.join(',') === konami.join(',')) {
        triggerEasterEgg();
        konamiBuffer.current = [];
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && eggActive) {
        closeEasterEgg();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keydown', handleEscape);
    };
  };

  const triggerEasterEgg = () => {
    if (eggActive || eggUnlocking) return;

    setEggUnlocking(true);

    const lines = [
      '> INITIALIZING SECURE CHANNEL...',
      '> AUTHENTICATING CREDENTIALS...',
      '> BYPASSING STANDARD PROTOCOLS...',
      '> ACCESSING ADMINISTRATIVE INTERFACE...',
      '> CLEARANCE LEVEL: COSMIC TOP SECRET',
      '> WELCOME, OPERATOR',
      '> ADMIN ACCESS GRANTED ✓'
    ];

    let currentLine = 0;
    const typingInterval = setInterval(() => {
      if (currentLine < lines.length) {
        setTerminalLines(prev => [...prev, lines[currentLine]]);
        currentLine++;
      } else {
        clearInterval(typingInterval);
        setTimeout(() => {
          setEggUnlocking(false);
          setEggActive(true);

          const newCount = eggCount + 1;
          setEggCount(newCount);
          localStorage.setItem('dive-egg-count', newCount.toString());
        }, 500);
      }
    }, 200);
  };

  const closeEasterEgg = () => {
    setEggActive(false);
    setEggUnlocking(false);
    setTerminalLines([]);
  };

  const handleDirectLogin = async () => {
    const { signIn } = await import('next-auth/react');
    await signIn('keycloak', { callbackUrl: '/' });
  };

  // Filter IdPs based on search and region filter
  const getFilteredIdPs = (): IdPOption[] => {
    let filtered = idps;

    // Apply regional filter
    if (activeFilter !== 'all') {
      filtered = filterIdPsByRegion(filtered, activeFilter);
    }

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(idp =>
        idp.displayName.toLowerCase().includes(query) ||
        idp.alias.toLowerCase().includes(query)
      );
    }

    // Exclude "Industry Partners" IdP
    filtered = filtered.filter(idp => !idp.alias.toLowerCase().includes('industry'));

    return filtered;
  };

  const filteredIdps = getFilteredIdPs();

  // Loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center py-16">
        <div className="relative">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200 border-t-[#009ab3]"></div>
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-b-[#79d85a] animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1s' }}></div>
        </div>
        <p className="ml-4 text-gray-600 font-medium">Loading identity providers...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="text-center py-12 px-6 bg-red-50 rounded-xl border-2 border-red-200">
        <div className="text-4xl mb-4">⚠️</div>
        <p className="text-red-600 font-semibold mb-4">{error}</p>
        <button
          onClick={fetchEnabledIdPs}
          className="px-6 py-3 bg-gradient-to-r from-[#009ab3] to-[#79d85a] text-white font-bold rounded-lg hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="idp-selector-2025">
      {/* Hero Tier: Direct Login for Current Instance */}
      <div className="mb-4 animate-fade-in-up relative z-10" style={{ animationDelay: '0.1s' }}>
        <DirectLoginButton
          instanceCode={instanceCode}
          instanceName={instanceName}
          status={idpStatuses['local'] || 'active'}
          onClick={handleDirectLogin}
        />
      </div>

      {/* Search Bar - Prominent - HIGHEST Z-INDEX */}
      <div className="animate-fade-in-up relative z-[100]" style={{ animationDelay: '0.2s' }}>
        <IdpSearchBar
          idps={idps}
          onSelect={handleIdpClick}
          onSearchChange={setSearchQuery}
        />
      </div>

      {/* Discovery Tier: Full Grid with Filters - LOWER Z-INDEX */}
      <div className="animate-fade-in-up relative z-[5]" style={{ animationDelay: '0.3s' }}>
        {/* Section Header - Compact */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Federation Partners
          </h3>
          <p className="text-xs text-gray-400">
            Or authenticate from partner nation
          </p>
        </div>

        {/* Regional Filters - Compact */}
        <div className="mb-4">
          <IdpFilterPills
            idps={idps}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
          />
        </div>

        {/* IdP Grid - Compact */}
        {filteredIdps.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 relative" style={{ zIndex: 1 }}>
            {filteredIdps.map((idp, index) => (
              <EnhancedIdpCard
                key={idp.alias}
                idp={idp}
                status={idpStatuses[idp.alias] || 'checking'}
                onClick={() => handleIdpClick(idp)}
                index={index}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 px-6 bg-gray-50 rounded-xl border border-gray-200">
            <div className="text-4xl mb-2">🔍</div>
            <p className="text-gray-600 font-medium mb-1">No partners found</p>
            <p className="text-xs text-gray-400">Try adjusting your filters or search</p>
            <button
              onClick={() => {
                setSearchQuery('');
                setActiveFilter('all');
              }}
              className="mt-4 text-sm text-[#009ab3] hover:text-[#79d85a] font-medium transition-colors"
            >
              Clear all filters →
            </button>
          </div>
        )}

        {/* Results count */}
        <div className="mt-6 text-center text-xs text-gray-400">
          <p>
            {searchQuery || activeFilter !== 'all'
              ? `Showing ${filteredIdps.length} of ${idps.filter(i => !i.alias.toLowerCase().includes('industry')).length} partners`
              : `${idps.filter(i => !i.alias.toLowerCase().includes('industry')).length} coalition partners available`
            }
          </p>
        </div>
      </div>

      {/* 🥚 Easter Egg Components (unchanged) */}
      {eggUnlocking && <EasterEggTerminal terminalLines={terminalLines} />}
      {eggActive && (
        <EasterEggModal
          eggCount={eggCount}
          onClose={closeEasterEgg}
          onAdminLogin={handleDirectLogin}
        />
      )}
    </div>
  );
}

/**
 * Direct Login Button Component
 */
function DirectLoginButton({
  instanceCode,
  instanceName,
  status,
  onClick
}: {
  instanceCode: string;
  instanceName: string;
  status: IdPStatus;
  onClick: () => void;
}) {
  const FlagComponent = getFlagComponent(instanceCode.toLowerCase());

  return (
    <button
      onClick={onClick}
      data-testid="direct-login-button"
      className="w-full group p-4 border-2 border-[#009ab3] rounded-xl hover:border-[#79d85a] hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 text-left bg-gradient-to-br from-[#009ab3]/5 to-[#79d85a]/5 relative overflow-hidden"
    >
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#009ab3]/10 to-[#79d85a]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      {/* Glow effect */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-[#009ab3] to-[#79d85a] opacity-0 group-hover:opacity-20 blur rounded-xl transition-opacity duration-300" />

      <div className="relative flex items-center gap-4">
        {/* Flag */}
        <div className="flex-shrink-0 group-hover:scale-110 transition-transform duration-300">
          <FlagComponent size={56} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {/* Status */}
            <span className={`flex h-2 w-2 ${status === 'active' ? 'animate-pulse' : ''}`}>
              <span className={`absolute inline-flex h-2 w-2 rounded-full ${status === 'active' ? 'bg-emerald-500' : 'bg-gray-400'} opacity-40`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${status === 'active' ? 'bg-emerald-500' : 'bg-gray-400'}`} />
            </span>
            <h3 className="text-xl font-bold text-gray-900 group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:bg-clip-text group-hover:from-[#009ab3] group-hover:to-[#79d85a] transition-all truncate">
              Login as {instanceName} User
            </h3>
          </div>
          <p className="text-sm text-gray-600 mb-1.5">
            Authenticate directly with DIVE credentials
          </p>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-white/80 rounded-full text-xs font-medium text-gray-600 border border-gray-200">
              🏠 Home Instance
            </span>
            <span className="px-2 py-0.5 bg-emerald-50 rounded-full text-xs font-medium text-emerald-600 border border-emerald-200">
              ⚡ Fastest
            </span>
          </div>
        </div>

        {/* Arrow */}
        <div className="text-[#009ab3] group-hover:text-[#79d85a] group-hover:translate-x-1 transition-all duration-300 flex-shrink-0">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </div>
      </div>
    </button>
  );
}

/**
 * Easter Egg Terminal Animation
 */
function EasterEggTerminal({ terminalLines }: { terminalLines: string[] }) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 backdrop-blur-sm animate-fade-in"
      aria-live="polite"
    >
      <div className="w-full max-w-3xl mx-4">
        <div className="bg-black border-2 border-[#00ff41] rounded-lg shadow-[0_0_50px_rgba(0,255,65,0.5)] overflow-hidden">
          <div className="bg-gradient-to-r from-gray-900 to-black border-b border-[#00ff41] px-4 py-2 flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div className="w-3 h-3 rounded-full bg-[#00ff41]"></div>
            </div>
            <span className="text-[#00ff41] text-sm font-mono ml-2">root@dive-v3-admin</span>
          </div>
          <div className="p-6 font-mono text-sm">
            {terminalLines.map((line, idx) => (
              <div
                key={idx}
                className="text-[#00ff41] mb-2 animate-terminal-line"
                style={{ textShadow: '0 0 10px rgba(0,255,65,0.8)', animationDelay: `${idx * 0.1}s` }}
              >
                {line}
              </div>
            ))}
            <div className="text-[#00ff41] inline-block animate-pulse">▊</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Easter Egg Modal
 */
function EasterEggModal({
  eggCount,
  onClose,
  onAdminLogin
}: {
  eggCount: number;
  onClose: () => void;
  onAdminLogin: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-md animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div className="relative max-w-2xl w-full mx-4">
        <div className="relative bg-gradient-to-br from-gray-900 via-black to-gray-900 border-2 border-[#00ff41] rounded-2xl shadow-[0_0_80px_rgba(0,255,65,0.6)] overflow-hidden backdrop-blur-xl">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-red-500/20 border border-red-500 text-red-400 hover:bg-red-500 hover:text-white transition-all duration-300 hover:scale-110 hover:rotate-90"
          >
            ✕
          </button>

          <div className="p-8 md:p-12">
            <div className="text-center mb-8">
              <div className="inline-block mb-4 animate-float">
                <span className="text-7xl filter drop-shadow-[0_0_30px_rgba(0,255,65,1)]">👑</span>
              </div>

              <h2 className="text-4xl font-bold mb-3 bg-gradient-to-r from-[#00ff41] via-cyan-400 to-[#00ff41] bg-clip-text text-transparent animate-gradient-x">
                ACCESS GRANTED
              </h2>

              <p className="text-[#00ff41] text-lg font-mono mb-2">
                ▸ CLEARANCE: COSMIC TOP SECRET
              </p>
              <p className="text-cyan-400 text-sm font-mono">
                ▸ AUTHORIZATION CODE: {eggCount.toString().padStart(4, '0')}-ALPHA-{Math.random().toString(36).substr(2, 6).toUpperCase()}
              </p>

              {eggCount > 1 && (
                <p className="text-yellow-400 text-xs font-mono mt-2 animate-pulse">
                  🎉 Easter egg discovered {eggCount} times
                </p>
              )}
            </div>

            <button
              onClick={() => {
                onClose();
                onAdminLogin();
              }}
              className="group relative w-full p-6 border-2 border-[#00ff41] bg-gradient-to-br from-[#00ff41]/10 to-cyan-500/10 rounded-xl hover:border-cyan-400 hover:shadow-[0_0_40px_rgba(0,255,65,0.8)] transition-all duration-300 hover:scale-[1.02] overflow-hidden"
            >
              <div className="relative flex items-center justify-center space-x-4">
                <div className="text-5xl group-hover:scale-110 group-hover:rotate-12 transition-transform duration-300">
                  🔓
                </div>
                <div>
                  <h3 className="text-xl font-bold text-[#00ff41] group-hover:text-cyan-400 transition-colors">
                    Enter Super Administrator Portal
                  </h3>
                  <p className="text-sm text-cyan-400/80 mt-1 font-mono">
                    {'>'} Click to authenticate with maximum privileges
                  </p>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default IdpSelector;
