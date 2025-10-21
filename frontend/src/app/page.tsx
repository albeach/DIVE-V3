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
          {/* Super Admin Quick Access Banner */}
          <div className="mb-6 bg-gradient-to-r from-yellow-50 via-orange-50 to-yellow-50 border-2 border-yellow-400 rounded-lg p-4 shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="text-2xl">👑</div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Super Administrator Access</h3>
                  <p className="text-xs text-gray-600 mt-1">
                    <span className="font-semibold text-green-700">Broker:</span> <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-gray-300">admin-dive</span> / <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-gray-300">DiveAdmin2025!</span>
                    <span className="mx-2 text-gray-400">•</span>
                    <span className="font-semibold text-yellow-700">Legacy:</span> <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-gray-300">testuser-us</span> / <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-gray-300">Password123!</span>
                  </p>
                </div>
              </div>
              <div className="text-xs text-gray-500">
                <div className="bg-white px-3 py-1.5 rounded-full border border-yellow-400">
                  🔓 Direct Login
                </div>
              </div>
            </div>
          </div>
          
          <h2 className="text-2xl font-semibold text-gray-800 mb-6 text-center">
            Select Your Identity Provider
          </h2>
          
          <IdpSelector />
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

