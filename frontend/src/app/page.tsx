import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { IdpSelector } from "@/components/auth/idp-selector";

export default async function Home() {
  const session = await auth();
  
  // If already logged in, redirect to dashboard
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-[#001a1f] via-[#003844] to-[#005a6b]">
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
            {/* Header section with logo */}
            <div className="relative bg-gradient-to-br from-[#001a1f] via-[#003844] to-[#005a6b] px-8 py-8 overflow-hidden">
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
              
              {/* Flexbox Layout: Logo Left, Content Right */}
              <div className="relative flex flex-col md:flex-row items-center gap-6 md:gap-8">
                {/* Logo */}
                <div className="flex-shrink-0 animate-scale-in">
                  <div className="relative inline-block">
                    {/* Clean animated ring - no blur */}
                    <div className="absolute inset-0 border-4 border-[#79d85a] rounded-full opacity-30 animate-ping"></div>
                    <div className="absolute -inset-2 border-2 border-[#009ab3] rounded-full opacity-20 animate-pulse"></div>
                    <img 
                      src="/DIVE-Logo.png" 
                      alt="DIVE - Digital Interoperability Verification Experiment" 
                      className="relative h-40 w-40 md:h-48 md:w-48 drop-shadow-2xl animate-float-logo hover:scale-110 transition-transform duration-500 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 text-center md:text-left animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                  <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-2 tracking-tight">
                    DIVE V3
                  </h1>
                  <div className="inline-block px-4 py-2 bg-white/20 backdrop-blur-sm rounded-full border border-white/30 mb-3">
                    <p className="text-base md:text-lg text-white font-semibold">
                      Digital Interoperability Verification Experiment
                    </p>
                  </div>
                  <p className="text-white/90 text-sm md:text-base leading-relaxed mb-4">
                    USA/NATO Coalition Identity & Access Management
                  </p>
                  
                  {/* Feature badges */}
                  <div className="flex flex-wrap justify-center md:justify-start gap-2">
                    <span className="px-3 py-1.5 bg-white/10 backdrop-blur-sm rounded-full text-xs md:text-sm text-white border border-white/20 hover:bg-white/20 transition-all duration-300 hover:scale-105">
                      🔐 Federated Authentication
                    </span>
                    <span className="px-3 py-1.5 bg-white/10 backdrop-blur-sm rounded-full text-xs md:text-sm text-white border border-white/20 hover:bg-white/20 transition-all duration-300 hover:scale-105">
                      🛡️ Policy-Driven Authorization
                    </span>
                    <span className="px-3 py-1.5 bg-white/10 backdrop-blur-sm rounded-full text-xs md:text-sm text-white border border-white/20 hover:bg-white/20 transition-all duration-300 hover:scale-105">
                      📄 Secure Document Sharing
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Content section */}
            <div className="p-8 md:p-12">
              {/* Identity Provider Selection */}
              <div className="mb-8 animate-fade-in-up" style={{ animationDelay: '0.6s' }}>
                <div className="text-center mb-8">
                  <h2 className="text-3xl font-bold text-gray-900 mb-2">
                    Select Your Identity Provider
                  </h2>
                  <p className="text-gray-600">
                    Choose your organization to securely authenticate
                  </p>
                </div>
                
                <IdpSelector />
              </div>

              {/* Features grid */}
              <div className="border-t-2 border-gray-100 pt-10 mt-10 animate-fade-in-up" style={{ animationDelay: '0.8s' }}>
                <h3 className="text-2xl font-bold text-gray-900 mb-6 text-center">
                  Pilot Capabilities
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    { icon: "🌐", title: "Multi-IdP Federation", desc: "Seamless authentication across USA/NATO partners" },
                    { icon: "🎯", title: "ABAC Authorization", desc: "Attribute-based access control with OPA policies" },
                    { icon: "🔒", title: "Clearance-Based Access", desc: "UNCLASSIFIED to TOP_SECRET enforcement" },
                    { icon: "🌍", title: "Coalition Releasability", desc: "Country-based information sharing controls" },
                    { icon: "👥", title: "COI Management", desc: "Community of Interest tagging & access" },
                    { icon: "🔐", title: "Encrypted Documents", desc: "KAS-enabled policy-bound encryption" },
                  ].map((feature, idx) => (
                    <div 
                      key={idx}
                      className="group p-5 bg-gradient-to-br from-gray-50 to-white rounded-xl border-2 border-gray-200 hover:border-[#79d85a] transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
                      style={{ animationDelay: `${0.9 + idx * 0.1}s` }}
                    >
                      <div className="text-3xl mb-3 group-hover:scale-110 transition-transform duration-300">
                        {feature.icon}
                      </div>
                      <h4 className="font-bold text-gray-900 mb-2 group-hover:text-[#009ab3] transition-colors">
                        {feature.title}
                      </h4>
                      <p className="text-sm text-gray-600 leading-relaxed">
                        {feature.desc}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="text-center mt-12 pt-8 border-t border-gray-100 animate-fade-in-up" style={{ animationDelay: '1.5s' }}>
                <div className="flex items-center justify-center gap-3 text-sm text-gray-500">
                  <span className="inline-flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-[#009ab3] to-[#79d85a] text-white rounded-full font-semibold">
                    <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                    LIVE
                  </span>
                  <span>•</span>
                  <span>DIVE V3 Coalition Pilot</span>
                  <span>•</span>
                  <span>October 2025</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom accent */}
          <div className="mt-4 text-center">
            <p className="text-white/60 text-xs">
              Powered by Keycloak • Open Policy Agent • Next.js
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

