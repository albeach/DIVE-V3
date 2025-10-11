import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();
  
  // If already logged in, redirect to dashboard
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
      <div className="max-w-4xl w-full space-y-8 p-8 bg-white rounded-lg shadow-2xl">
        <div className="text-center">
          <div className="mb-4">
            <div className="inline-block p-4 bg-blue-600 rounded-full mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
          </div>
          
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            DIVE V3 Coalition Pilot
          </h1>
          <p className="text-xl text-gray-600 mb-6">
            USA/NATO Identity & Access Management Demonstration
          </p>
          <p className="text-sm text-gray-500 mb-8">
            Federated Authentication • Policy-Driven Authorization • Secure Document Sharing
          </p>
        </div>

        <div className="border-t border-gray-200 pt-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-6 text-center">
            Select Your Identity Provider
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* U.S. DoD IdP */}
            <Link
              href="/login?idp=us-idp"
              className="group p-6 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-lg transition-all duration-200"
            >
              <div className="flex items-center space-x-4">
                <div className="text-4xl">🇺🇸</div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600">
                    U.S. DoD
                  </h3>
                  <p className="text-sm text-gray-500">
                    Department of Defense
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    OIDC • CAC/PKI
                  </p>
                </div>
              </div>
            </Link>

            {/* France IdP */}
            <Link
              href="/login?idp=france-idp"
              className="group p-6 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-lg transition-all duration-200"
            >
              <div className="flex items-center space-x-4">
                <div className="text-4xl">🇫🇷</div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600">
                    France
                  </h3>
                  <p className="text-sm text-gray-500">
                    Ministry of Defense
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    SAML • FranceConnect
                  </p>
                </div>
              </div>
            </Link>

            {/* Canada IdP */}
            <Link
              href="/login?idp=canada-idp"
              className="group p-6 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-lg transition-all duration-200"
            >
              <div className="flex items-center space-x-4">
                <div className="text-4xl">🇨🇦</div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600">
                    Canada
                  </h3>
                  <p className="text-sm text-gray-500">
                    Dep't of National Defence
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    OIDC • GCKey
                  </p>
                </div>
              </div>
            </Link>

            {/* Industry Partner IdP */}
            <Link
              href="/login?idp=industry-idp"
              className="group p-6 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-lg transition-all duration-200"
            >
              <div className="flex items-center space-x-4">
                <div className="text-4xl">🏢</div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600">
                    Industry Partner
                  </h3>
                  <p className="text-sm text-gray-500">
                    Approved Contractors
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    OIDC • Azure AD / Okta
                  </p>
                </div>
              </div>
            </Link>
          </div>
          
          <div className="mt-6 text-center">
            <Link
              href="/login"
              className="text-blue-600 hover:text-blue-800 text-sm underline"
            >
              Continue without selecting (auto-detect)
            </Link>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-6 mt-8">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">
            Pilot Features:
          </h3>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 text-gray-600">
            <li className="flex items-start space-x-2">
              <span className="text-green-500 mt-1">✓</span>
              <span>Federated Multi-IdP Authentication</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-green-500 mt-1">✓</span>
              <span>Policy-Driven ABAC Authorization</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-green-500 mt-1">✓</span>
              <span>Clearance-Based Access Control</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-green-500 mt-1">✓</span>
              <span>Coalition Releasability Enforcement</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-green-500 mt-1">✓</span>
              <span>COI (Communities of Interest)</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-green-500 mt-1">✓</span>
              <span>Secure Document Sharing</span>
            </li>
          </ul>
        </div>
        
        <div className="text-center text-xs text-gray-400 pt-4">
          DIVE V3 • Coalition ICAM Pilot • October 2025
        </div>
      </div>
    </div>
  );
}

