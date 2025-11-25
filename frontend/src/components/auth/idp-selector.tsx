"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { getFlagComponent } from "../ui/flags";

/**
 * IdP Selector Component - Dynamic with Enable/Disable Support
 * 
 * Fetches enabled IdPs from Keycloak and displays them dynamically.
 * When admin enables/disables IdPs, this list updates automatically.
 * 
 * 🥚 EASTER EGG: Super Admin access hidden behind secret triggers
 * 
 * ✅ SECURITY: Uses local SVG flags only - no external CDN dependencies
 * This ensures CSP compliance and works in air-gapped environments
 */

interface IdPOption {
  alias: string;
  displayName: string;
  protocol: string;
  enabled: boolean;
}

/**
 * FlagIcon Component - Uses local SVG flags for CSP compliance
 * 
 * BEST PRACTICE: No external image loading, no CDN fallbacks
 * All flags are self-contained SVG components from flags.tsx
 */
const FlagIcon = ({ alias, size = 48 }: { alias: string; size?: number }) => {
  const FlagComponent = getFlagComponent(alias);
  return <FlagComponent size={size} className="inline-block" />;
};

/**
 * StatusIndicator - Subtle stoplight-style status dot
 * 
 * Classic traffic light metaphor:
 * - Green: Active/Online
 * - Yellow: Degraded/Warning  
 * - Red: Offline/Error
 */
const StatusIndicator = ({ status = 'active' }: { status?: 'active' | 'warning' | 'offline' }) => {
  const colors = {
    active: {
      bg: 'bg-emerald-500',
      glow: 'shadow-emerald-500/50',
      ring: 'ring-emerald-400/30',
    },
    warning: {
      bg: 'bg-amber-500',
      glow: 'shadow-amber-500/50',
      ring: 'ring-amber-400/30',
    },
    offline: {
      bg: 'bg-red-500',
      glow: 'shadow-red-500/50',
      ring: 'ring-red-400/30',
    },
  };

  const c = colors[status];
  
  return (
    <span className="relative flex h-3 w-3" title={status.charAt(0).toUpperCase() + status.slice(1)}>
      {/* Outer pulse ring */}
      <span className={`absolute inline-flex h-full w-full rounded-full ${c.bg} opacity-40 animate-ping`} />
      {/* Inner solid dot with glow */}
      <span className={`relative inline-flex h-3 w-3 rounded-full ${c.bg} shadow-lg ${c.glow} ring-2 ${c.ring}`} />
    </span>
  );
};

export function IdpSelector() {
  const router = useRouter();
  const [idps, setIdps] = useState<IdPOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 🥚 Easter egg state
  const [eggActive, setEggActive] = useState(false);
  const [eggUnlocking, setEggUnlocking] = useState(false);
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [eggCount, setEggCount] = useState(0);
  const konamiBuffer = useRef<number[]>([]);
  const logoClickCount = useRef(0);
  const logoClickTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchEnabledIdPs();
    
    // Load easter egg counter from localStorage
    const count = parseInt(localStorage.getItem('dive-egg-count') || '0', 10);
    setEggCount(count);
    
    // Set up easter egg listeners
    setupEasterEgg();
  }, []);

  const fetchEnabledIdPs = async () => {
    try {
      // Fetch public list of enabled IdPs from backend
      // Use NEXT_PUBLIC_API_URL or NEXT_PUBLIC_BACKEND_URL (both should be set in docker-compose)
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 
                        process.env.NEXT_PUBLIC_API_URL || 
                        'https://localhost:4000';
      console.log('[IdP Selector] Fetching from:', `${backendUrl}/api/idps/public`);
      
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch(`${backendUrl}/api/idps/public`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch IdPs: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('[IdP Selector] Received IdPs:', data);
      
      // Filter to only enabled IdPs
      const enabledIdps = data.idps?.filter((idp: IdPOption) => idp.enabled) || [];
      setIdps(enabledIdps);
      setError(null); // Clear any previous errors
    } catch (err) {
      console.error('[IdP Selector] Error fetching IdPs:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unable to load identity providers';
      setError(errorMessage);
      
      // Fallback to hardcoded IdPs if fetch fails
      // NOTE: No "Industry Partners" IdP - contractors authenticate via their nation's IdP
      // with userType: contractor attribute. OPA policies handle authorization.
      console.warn('[IdP Selector] Using fallback IdPs');
      setIdps([
        { alias: 'usa-realm-broker', displayName: 'United States', protocol: 'oidc', enabled: true },
        { alias: 'can-realm-broker', displayName: 'Canada', protocol: 'oidc', enabled: true },
        { alias: 'fra-realm-broker', displayName: 'France', protocol: 'oidc', enabled: true },
        { alias: 'gbr-realm-broker', displayName: 'United Kingdom', protocol: 'oidc', enabled: true },
        { alias: 'deu-realm-broker', displayName: 'Germany', protocol: 'oidc', enabled: true },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleIdpClick = async (idp: IdPOption) => {
    // Option 3: Custom Keycloak Theme - Use NextAuth signIn with kc_idp_hint
    // This ensures state cookie is properly set before redirecting to Keycloak
    const { signIn } = await import('next-auth/react');
    await signIn('keycloak', {
      callbackUrl: '/dashboard',
    }, {
      kc_idp_hint: idp.alias,  // Trigger federation to specific national realm
    });
  };

  // 🥚 Easter egg setup
  const setupEasterEgg = () => {
    const konami = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65]; // up up down down left right left right B A
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement as HTMLElement)?.isContentEditable) return;

      // Shortcut: Ctrl+Shift+A (Admin)
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        triggerEasterEgg();
        return;
      }

      // Konami code tracking
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
    
    // Terminal boot sequence
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
          
          // Increment counter
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

  // Triple-click logo handler (attach to logo in parent page.tsx)
  const handleLogoClick = () => {
    logoClickCount.current++;
    
    if (logoClickTimer.current) {
      clearTimeout(logoClickTimer.current);
    }
    
    if (logoClickCount.current === 3) {
      triggerEasterEgg();
      logoClickCount.current = 0;
    } else {
      logoClickTimer.current = setTimeout(() => {
        logoClickCount.current = 0;
      }, 600);
    }
  };

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

  if (idps.length === 0) {
    return (
      <div className="text-center py-12 px-6 bg-gray-50 rounded-xl border-2 border-gray-200">
        <div className="text-4xl mb-4">🔒</div>
        <p className="text-gray-700 font-semibold mb-2">No identity providers are currently available.</p>
        <p className="text-sm text-gray-500">Please contact your administrator.</p>
      </div>
    );
  }

  return (
    <>
      {/* Federated Identity Providers - Compact View */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {idps
          // Filter out "Industry Partners" - contractors authenticate via their nation's IdP
          // A Lockheed engineer uses USA IdP, a Thales employee uses France IdP, etc.
          // Contractor status is an ATTRIBUTE (userType: contractor), not a separate IdP
          .filter(idp => !idp.alias.toLowerCase().includes('industry'))
          .map((idp) => (
          <button
            key={idp.alias}
            onClick={() => handleIdpClick(idp)}
            className="group p-3 border-2 border-gray-200 rounded-xl hover:border-[#79d85a] hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 text-left bg-gradient-to-br from-white to-gray-50"
          >
            <div className="flex items-center gap-3">
              {/* Flag */}
              <div className="flex-shrink-0 group-hover:scale-105 transition-transform duration-300">
                <FlagIcon alias={idp.alias} size={44} />
              </div>
              
              {/* Country Name + Status */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-semibold text-gray-900 group-hover:text-[#009ab3] transition-colors truncate">
                    {/* Extract just the country name, remove parenthetical */}
                    {idp.displayName.split('(')[0].trim()}
                  </h3>
                  <StatusIndicator status={idp.enabled ? 'active' : 'offline'} />
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* 🥚 Easter Egg: Terminal Unlock Animation */}
      {eggUnlocking && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 backdrop-blur-sm animate-fade-in"
          aria-live="polite"
          aria-label="Secret admin access unlocking"
        >
          <div className="w-full max-w-3xl mx-4">
            {/* Terminal Window */}
            <div className="bg-black border-2 border-[#00ff41] rounded-lg shadow-[0_0_50px_rgba(0,255,65,0.5)] overflow-hidden">
              {/* Terminal Header */}
              <div className="bg-gradient-to-r from-gray-900 to-black border-b border-[#00ff41] px-4 py-2 flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <div className="w-3 h-3 rounded-full bg-[#00ff41]"></div>
                </div>
                <span className="text-[#00ff41] text-sm font-mono ml-2">root@dive-v3-admin</span>
              </div>
              
              {/* Terminal Content */}
              <div className="p-6 font-mono text-sm">
                {terminalLines.map((line, idx) => (
                  <div 
                    key={idx}
                    className="text-[#00ff41] mb-2 animate-terminal-line"
                    style={{ 
                      textShadow: '0 0 10px rgba(0,255,65,0.8)',
                      animationDelay: `${idx * 0.1}s`
                    }}
                  >
                    {line}
                  </div>
                ))}
                <div className="text-[#00ff41] inline-block animate-pulse">▊</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🥚 Easter Egg: Super Admin Access Revealed */}
      {eggActive && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-md animate-fade-in"
          onClick={(e) => e.target === e.currentTarget && closeEasterEgg()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="egg-title"
        >
          {/* Matrix Rain Background Effect */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className="absolute top-0 font-mono text-[#00ff41] text-xs animate-matrix-rain whitespace-pre"
                style={{
                  left: `${i * 5}%`,
                  animationDelay: `${Math.random() * 2}s`,
                  animationDuration: `${5 + Math.random() * 5}s`
                }}
              >
                {Array(30).fill(0).map(() => String.fromCharCode(33 + Math.floor(Math.random() * 94))).join('\n')}
              </div>
            ))}
          </div>

          {/* Admin Access Card */}
          <div className="relative max-w-2xl w-full mx-4">
            {/* Glitch effect background */}
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/20 to-purple-500/20 rounded-2xl blur-xl animate-glitch-1"></div>
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-2xl blur-xl animate-glitch-2"></div>
            
            {/* Main Card */}
            <div className="relative bg-gradient-to-br from-gray-900 via-black to-gray-900 border-2 border-[#00ff41] rounded-2xl shadow-[0_0_80px_rgba(0,255,65,0.6)] overflow-hidden backdrop-blur-xl">
              {/* Animated scan lines */}
              <div className="absolute inset-0 pointer-events-none opacity-10">
                <div className="w-full h-full bg-gradient-to-b from-transparent via-[#00ff41] to-transparent animate-scan-line"></div>
              </div>

              {/* Close Button */}
              <button
                onClick={closeEasterEgg}
                className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-red-500/20 border border-red-500 text-red-400 hover:bg-red-500 hover:text-white transition-all duration-300 hover:scale-110 hover:rotate-90"
                aria-label="Close"
              >
                ✕
              </button>

              {/* Content */}
              <div className="p-8 md:p-12">
                {/* Header */}
                <div className="text-center mb-8">
                  <div className="inline-block mb-4 animate-float">
                    <div className="relative">
                      <div className="absolute inset-0 animate-ping">
                        <span className="text-7xl filter drop-shadow-[0_0_20px_rgba(0,255,65,1)]">👑</span>
                      </div>
                      <span className="relative text-7xl filter drop-shadow-[0_0_30px_rgba(0,255,65,1)]">👑</span>
                    </div>
                  </div>
                  
                  <h2 
                    id="egg-title"
                    className="text-4xl font-bold mb-3 bg-gradient-to-r from-[#00ff41] via-cyan-400 to-[#00ff41] bg-clip-text text-transparent animate-gradient-x"
                    style={{ textShadow: '0 0 20px rgba(0,255,65,0.5)' }}
                  >
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

                {/* Admin Button */}
                <button
                  onClick={() => {
                    closeEasterEgg();
                    handleIdpClick({ alias: 'dive-v3-broker', displayName: 'Super Admin', protocol: 'oidc', enabled: true });
                  }}
                  className="group relative w-full p-6 border-2 border-[#00ff41] bg-gradient-to-br from-[#00ff41]/10 to-cyan-500/10 rounded-xl hover:border-cyan-400 hover:shadow-[0_0_40px_rgba(0,255,65,0.8)] transition-all duration-300 hover:scale-[1.02] overflow-hidden"
                >
                  {/* Animated background */}
                  <div className="absolute inset-0 bg-gradient-to-r from-[#00ff41]/0 via-[#00ff41]/20 to-[#00ff41]/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                  
                  <div className="relative flex items-center justify-center space-x-4">
                    <div className="text-5xl group-hover:scale-110 group-hover:rotate-12 transition-transform duration-300 filter drop-shadow-[0_0_10px_rgba(0,255,65,1)]">
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

                {/* Secret Hint */}
                <div className="mt-8 pt-6 border-t border-[#00ff41]/30">
                  <details className="text-center">
                    <summary className="text-xs text-gray-500 hover:text-[#00ff41] cursor-pointer transition-colors font-mono">
                      How did I get here?
                    </summary>
                    <div className="mt-4 text-xs text-gray-400 font-mono space-y-1">
                      <p>🎮 Konami Code: ↑ ↑ ↓ ↓ ← → ← → B A</p>
                      <p>⌨️ Keyboard: Ctrl + Shift + A</p>
                      <p>🖱️ Mouse: Triple-click the DIVE logo (if implemented)</p>
                    </div>
                  </details>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer - show filtered count (excluding Industry IdP) */}
      <div className="mt-4 text-center text-xs text-gray-400">
        <p>{idps.filter(idp => !idp.alias.toLowerCase().includes('industry')).length} coalition partners</p>
      </div>
    </>
  );
}

