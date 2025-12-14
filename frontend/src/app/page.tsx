import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { IdpSelector } from "@/components/auth/idp-selector";
import { FeatureCarousel } from "@/components/ui/feature-carousel";
import { 
  InstanceHeroBadge, 
  IdpSectionHeader, 
  CoalitionPartnersFooter,
  LocalizedFeatureBadges,
  LocalizedPilotCapabilities 
} from "@/components/ui/instance-hero-badge";

export default async function Home() {
  // Add timeout wrapper for auth() to prevent hanging
  let session;
  try {
    const authPromise = auth();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Auth timeout')), 5000)
    );
    session = await Promise.race([authPromise, timeoutPromise]) as Awaited<ReturnType<typeof auth>>;
  } catch (error) {
    // If auth fails or times out, continue without session (show login page)
    console.warn('[Home] Auth check failed, showing login page:', error instanceof Error ? error.message : 'Unknown error');
    session = null;
  }
  
  // If already logged in, redirect to dashboard
  if (session && 'user' in session && session.user) {
    redirect("/dashboard");
  }

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
        <div className="absolute animate-slide-down" style={{ left: '25%', animationDuration: '20s', animationDelay: '2s' }}>
          01000001 01010101 01010100 01001000<br/>
          01001011 01000101 01011001 01000011<br/>
          01001100 01001111 01000001 01001011<br/>
        </div>
        <div className="absolute animate-slide-down" style={{ left: '50%', animationDuration: '18s', animationDelay: '4s' }}>
          01001111 01010000 01000001<br/>
          01010000 01001111 01001100 01001001 01000011 01011001<br/>
          01000001 01000010 01000001 01000011<br/>
        </div>
        <div className="absolute animate-slide-down" style={{ left: '75%', animationDuration: '22s', animationDelay: '1s' }}>
          01001110 01000001 01010100 01001111<br/>
          01000110 01000101 01000100<br/>
          01001001 01000100 01010000<br/>
        </div>
        <div className="absolute animate-slide-down" style={{ left: '90%', animationDuration: '17s', animationDelay: '3s' }}>
          01010011 01000101 01000011 01010101 01010010 01000101<br/>
          01000011 01001111 01001001<br/>
        </div>
      </div>

      {/* Circuit Lines */}
      <div className="absolute inset-0 opacity-10">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <line x1="0" y1="30%" x2="100%" y2="30%" stroke="#79d85a" strokeWidth="2" strokeDasharray="5,5">
            <animate attributeName="stroke-dashoffset" from="0" to="10" dur="1s" repeatCount="indefinite" />
          </line>
          <line x1="0" y1="60%" x2="100%" y2="60%" stroke="#009ab3" strokeWidth="2" strokeDasharray="5,5">
            <animate attributeName="stroke-dashoffset" from="0" to="10" dur="1.5s" repeatCount="indefinite" />
          </line>
          <circle cx="20%" cy="30%" r="4" fill="#79d85a">
            <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx="50%" cy="60%" r="4" fill="#009ab3">
            <animate attributeName="opacity" values="0.3;1;0.3" dur="2.5s" repeatCount="indefinite" />
          </circle>
          <circle cx="80%" cy="30%" r="4" fill="#79d85a">
            <animate attributeName="opacity" values="0.3;1;0.3" dur="3s" repeatCount="indefinite" />
          </circle>
        </svg>
      </div>

      {/* Floating Data Nodes */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-20 w-2 h-2 bg-[#79d85a] rounded-full opacity-60 animate-float"></div>
        <div className="absolute top-40 right-32 w-3 h-3 bg-[#009ab3] rounded-full opacity-60 animate-float" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-60 left-40 w-2 h-2 bg-[#79d85a] rounded-full opacity-60 animate-float" style={{ animationDelay: '2s' }}></div>
        <div className="absolute bottom-40 right-20 w-3 h-3 bg-[#009ab3] rounded-full opacity-60 animate-float" style={{ animationDelay: '3s' }}></div>
        <div className="absolute bottom-60 left-32 w-2 h-2 bg-[#79d85a] rounded-full opacity-60 animate-float" style={{ animationDelay: '4s' }}></div>
      </div>

      <div className="relative flex items-center justify-center min-h-screen p-4">
        <div className="max-w-6xl w-full">
          {/* Main content card with glassmorphism */}
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 overflow-hidden animate-fade-in-up">
            {/* Header section with logo - Compact version */}
            <div className="relative px-6 py-5 overflow-hidden" style={{ background: 'var(--instance-banner-bg, linear-gradient(135deg, #1a365d 0%, #2b6cb0 100%))' }}>
              {/* Digital Grid Pattern */}
              <div className="absolute inset-0 opacity-30" style={{
                backgroundImage: `
                  linear-gradient(rgba(0, 154, 179, 0.4) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(0, 154, 179, 0.4) 1px, transparent 1px)
                `,
                backgroundSize: '30px 30px'
              }}></div>

              {/* Animated Circuit Lines */}
              <div className="absolute inset-0 opacity-20">
                <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                  <line x1="0" y1="20%" x2="100%" y2="20%" stroke="#79d85a" strokeWidth="1" strokeDasharray="3,3">
                    <animate attributeName="stroke-dashoffset" from="0" to="6" dur="1s" repeatCount="indefinite" />
                  </line>
                  <line x1="0" y1="80%" x2="100%" y2="80%" stroke="#009ab3" strokeWidth="1" strokeDasharray="3,3">
                    <animate attributeName="stroke-dashoffset" from="0" to="6" dur="1.2s" repeatCount="indefinite" />
                  </line>
                  <circle cx="10%" cy="20%" r="3" fill="#79d85a">
                    <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" repeatCount="indefinite" />
                  </circle>
                  <circle cx="50%" cy="20%" r="3" fill="#009ab3">
                    <animate attributeName="opacity" values="0.3;1;0.3" dur="2.5s" repeatCount="indefinite" />
                  </circle>
                  <circle cx="90%" cy="20%" r="3" fill="#79d85a">
                    <animate attributeName="opacity" values="0.3;1;0.3" dur="1.8s" repeatCount="indefinite" />
                  </circle>
                </svg>
              </div>

              {/* Binary/Hex Code Snippets */}
              <div className="absolute inset-0 opacity-10 font-mono text-[#79d85a] text-xs overflow-hidden">
                <div className="absolute top-4 left-4">0x7F 0xA3</div>
                <div className="absolute top-4 right-4">0xC1 0x9E</div>
                <div className="absolute bottom-4 left-8">01010011 01000101</div>
                <div className="absolute bottom-4 right-8">01000011 01010101</div>
                <div className="absolute top-1/2 left-4">JWT:RS256</div>
                <div className="absolute top-1/2 right-4">OPA:REGO</div>
              </div>

              {/* Data Particles */}
              <div className="absolute inset-0 overflow-hidden">
                <div className="absolute top-10 left-10 w-1 h-1 bg-[#79d85a] rounded-full opacity-60 animate-pulse"></div>
                <div className="absolute top-16 right-20 w-1 h-1 bg-[#009ab3] rounded-full opacity-60 animate-pulse" style={{ animationDelay: '0.5s' }}></div>
                <div className="absolute bottom-10 left-20 w-1 h-1 bg-[#79d85a] rounded-full opacity-60 animate-pulse" style={{ animationDelay: '1s' }}></div>
                <div className="absolute bottom-16 right-10 w-1 h-1 bg-[#009ab3] rounded-full opacity-60 animate-pulse" style={{ animationDelay: '1.5s' }}></div>
              </div>
              
              {/* Animated accent lines */}
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#79d85a] to-transparent animate-shimmer"></div>
              <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#79d85a] to-transparent animate-shimmer" style={{ animationDelay: '1s' }}></div>
              
              {/* Flexbox Layout: Logo Left, Content Right - Compact */}
              <div className="relative flex flex-col md:flex-row items-center gap-4 md:gap-6">
                {/* Logo - Links to main DIVE25.COM portal */}
                <div className="flex-shrink-0 animate-scale-in">
                  <a href="https://dive25.com" title="Go to DIVE25 Portal" className="relative inline-block group">
                    {/* Clean animated ring - no blur */}
                    <div className="absolute inset-0 border-4 border-[#79d85a] rounded-full opacity-30 animate-ping"></div>
                    <div className="absolute -inset-2 border-2 border-[#009ab3] rounded-full opacity-20 animate-pulse group-hover:opacity-40 transition-opacity"></div>
                    <img 
                      src="/DIVE-Logo.png" 
                      alt="DIVE - Digital Interoperability Verification Experiment" 
                      className="relative h-40 w-40 md:h-48 md:w-48 drop-shadow-2xl animate-float-logo hover:scale-110 transition-transform duration-500 cursor-pointer"
                    />
                  </a>
                </div>

                {/* Content - Compact */}
                <div className="flex-1 text-center md:text-left animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                  {/* Instance Badge with Flag */}
                  <div className="mb-2">
                    <InstanceHeroBadge size="lg" className="justify-center md:justify-start" />
                  </div>
                  
                  <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-1 tracking-tight">
                    DIVE V3
                  </h1>
                  <div className="inline-block px-3 py-1.5 bg-white/20 backdrop-blur-sm rounded-full border border-white/30 mb-2">
                    <p className="text-sm md:text-base text-white font-semibold">
                      Digital Interoperability Verification Experiment
                    </p>
                  </div>
                  <p className="text-white/90 text-xs md:text-sm leading-relaxed mb-2">
                    Coalition Identity & Access Management Platform
                  </p>
                  
                  {/* Localized Feature badges */}
                  <LocalizedFeatureBadges />
                </div>
              </div>
            </div>

            {/* Content section */}
            <div className="p-8 md:p-12">
              {/* Identity Provider Selection */}
              <div className="mb-8 animate-fade-in-up" style={{ animationDelay: '0.6s' }}>
                <IdpSectionHeader />
                
                <IdpSelector />
              </div>

              {/* Features - Swipeable carousel on mobile, grid on desktop */}
              <div className="border-t border-gray-200 pt-8 mt-8 animate-fade-in-up" style={{ animationDelay: '0.8s' }}>
                <LocalizedPilotCapabilities />
                <FeatureCarousel />
              </div>

              {/* Footer with Coalition Partners */}
              <div className="mt-12 pt-8 border-t border-gray-100 animate-fade-in-up" style={{ animationDelay: '1.5s' }}>
                <CoalitionPartnersFooter />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

