import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Navigation from "@/components/navigation";
import Link from "next/link";

interface IResource {
  resourceId: string;
  title: string;
  classification: string;
  releasabilityTo: string[];
  COI: string[];
  encrypted: boolean;
  creationDate?: string;
  displayMarking?: string; // ACP-240 STANAG 4774 display marking
  ztdfVersion?: string;
}

async function getResources(): Promise<IResource[]> {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
  
  try {
    const response = await fetch(`${backendUrl}/api/resources`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch resources');
    }

    const data = await response.json();
    return data.resources || [];
  } catch (error) {
    console.error('Error fetching resources:', error);
    return [];
  }
}

const classificationColors: Record<string, string> = {
  'UNCLASSIFIED': 'bg-green-100 text-green-800 border-green-300',
  'CONFIDENTIAL': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  'SECRET': 'bg-orange-100 text-orange-800 border-orange-300',
  'TOP_SECRET': 'bg-red-100 text-red-800 border-red-300',
};

export default async function ResourcesPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const resources = await getResources();

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation user={session.user} />

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              Classified Documents
            </h2>
            <p className="text-gray-600">
              Click on a document to request access. Authorization will be determined by your clearance level, 
              country affiliation, and communities of interest.
            </p>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span className="inline-flex items-center px-2 py-1 rounded-md bg-blue-100 text-blue-800 font-semibold">
                🛡️ ACP-240 Compliant
              </span>
              <span className="text-gray-600">
                NATO Data-Centric Security | STANAG 4774 Labels | ZTDF Encryption
              </span>
            </div>
          </div>

          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <ul className="divide-y divide-gray-200">
              {resources.length === 0 ? (
                <li className="px-6 py-8 text-center text-gray-500">
                  No resources available
                </li>
              ) : (
                resources.map((resource) => (
                  <li key={resource.resourceId}>
                    <Link
                      href={`/resources/${resource.resourceId}`}
                      className="block hover:bg-gray-50 transition-colors"
                    >
                      <div className="px-6 py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            {/* ACP-240 STANAG 4774 Display Marking (Prominent) */}
                            {resource.displayMarking && (
                              <div className={`inline-flex items-center px-4 py-2 rounded-md text-sm font-bold border-2 mb-3 ${
                                classificationColors[resource.classification] || 'bg-gray-100 text-gray-800 border-gray-300'
                              }`}>
                                <span className="mr-2">🛡️</span>
                                <span className="font-mono tracking-wide">{resource.displayMarking}</span>
                                {resource.ztdfVersion && (
                                  <span className="ml-3 text-xs opacity-75">(ZTDF v{resource.ztdfVersion})</span>
                                )}
                              </div>
                            )}
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="text-lg font-semibold text-gray-900 truncate">
                                {resource.title}
                              </h3>
                              {!resource.displayMarking && (
                                <span
                                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${
                                    classificationColors[resource.classification] || 'bg-gray-100 text-gray-800 border-gray-300'
                                  }`}
                                >
                                  {resource.classification}
                                </span>
                              )}
                              {resource.encrypted && (
                                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800">
                                  🔐 ZTDF Encrypted
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-gray-600">
                              <div>
                                <span className="font-medium">ID:</span>{' '}
                                <span className="font-mono">{resource.resourceId}</span>
                              </div>
                              <div>
                                <span className="font-medium">Releasable to:</span>{' '}
                                {resource.releasabilityTo.length > 0
                                  ? resource.releasabilityTo.join(', ')
                                  : 'None'}
                              </div>
                              {resource.COI && resource.COI.length > 0 && (
                                <div>
                                  <span className="font-medium">COI:</span>{' '}
                                  {resource.COI.join(', ')}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="ml-4 flex-shrink-0">
                            <svg
                              className="h-5 w-5 text-gray-400"
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">
              🔐 Your Access Level
            </h3>
            <dl className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <dt className="text-blue-700 mb-1">Clearance</dt>
                <dd className="font-mono font-semibold text-blue-900">
                  {session.user?.clearance || 'Not Set'}
                </dd>
              </div>
              <div>
                <dt className="text-blue-700 mb-1">Country</dt>
                <dd className="font-mono font-semibold text-blue-900">
                  {session.user?.countryOfAffiliation || 'Not Set'}
                </dd>
              </div>
              <div>
                <dt className="text-blue-700 mb-1">Communities</dt>
                <dd className="font-mono text-xs text-blue-900">
                  {session.user?.acpCOI && session.user.acpCOI.length > 0
                    ? session.user.acpCOI.join(', ')
                    : 'None'}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </main>
    </div>
  );
}

