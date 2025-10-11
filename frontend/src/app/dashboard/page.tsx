import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { SecureLogoutButton } from "@/components/auth/secure-logout-button";
import { UserInfo } from "@/components/auth/user-info";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-8">
              <h1 className="text-xl font-bold text-gray-900">DIVE V3 Dashboard</h1>
              <Link
                href="/resources"
                className="text-gray-600 hover:text-gray-900 font-medium"
              >
                Documents
              </Link>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">
                {session.user?.uniqueID || session.user?.email}
              </div>
              <SecureLogoutButton />
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Welcome to the Coalition Pilot!
            </h2>
            <p className="text-gray-600">
              You have successfully authenticated through your Identity Provider.
              Your attributes have been normalized and will be used for authorization decisions.
            </p>
          </div>

          <UserInfo />

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <Link
              href="/resources"
              className="p-6 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                📄 Browse Documents
              </h3>
              <p className="text-sm text-gray-600">
                Access classified documents based on your clearance level and country affiliation
              </p>
            </Link>
            
            <div className="p-6 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="text-lg font-semibold text-blue-900 mb-2">
                🔐 Your Access Level
              </h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-blue-700">Clearance:</dt>
                  <dd className="font-mono font-semibold text-blue-900">
                    {session.user?.clearance || 'Not Set'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-blue-700">Country:</dt>
                  <dd className="font-mono font-semibold text-blue-900">
                    {session.user?.countryOfAffiliation || 'Not Set'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-blue-700">COI:</dt>
                  <dd className="font-mono text-xs text-blue-900">
                    {session.user?.acpCOI && session.user.acpCOI.length > 0 
                      ? session.user.acpCOI.join(', ')
                      : 'None'}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {process.env.NODE_ENV === 'development' && (
            <div className="mt-8 p-4 bg-gray-100 border border-gray-300 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-2">
                Session Details (Dev Only)
              </h3>
              <pre className="text-xs text-gray-800 overflow-auto max-h-96">
                {JSON.stringify(session, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

