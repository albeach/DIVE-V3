'use client';

/**
 * Classification Equivalency Mapping
 * 
 * Interactive visualization of 12-nation classification systems
 * Shows cross-nation classification mapping for coalition interoperability
 */

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import PageLayout from '@/components/layout/page-layout';
import { 
  Globe, 
  Shield, 
  CheckCircle2, 
  Flag,
  Search,
  Filter
} from 'lucide-react';

interface ClassificationMapping {
  country: string;
  localLevel: string;
  localAbbrev: string;
}

interface ClassificationLevel {
  canonicalLevel: string;
  displayName: string;
  numericValue: number;
  color: string;
  mappings: ClassificationMapping[];
}

interface ClassificationData {
  title: string;
  description: string;
  supportedNations: number;
  levels: ClassificationLevel[];
  useCases: Array<{
    title: string;
    description: string;
    example: string;
  }>;
  validationRules: string[];
}

export default function ClassificationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [classificationsData, setClassificationsData] = useState<ClassificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCountry, setFilterCountry] = useState<string>('ALL');

  useEffect(() => {
    if (status === 'loading') return;
    
    if (!session) {
      router.push('/login');
      return;
    }

    async function fetchClassificationsData() {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
      
      try {
        const response = await fetch(`${backendUrl}/api/compliance/classifications`, {
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error('Failed to fetch classifications data');
        }

        const data = await response.json();
        setClassificationsData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load classifications data');
        console.error('Error fetching classifications:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchClassificationsData();
  }, [session, status, router]);

  if (status === 'loading' || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading classification mappings...</p>
        </div>
      </div>
    );
  }

  if (!session || !classificationsData) {
    return null;
  }

  const selectedLevelData = selectedLevel ? classificationsData.levels.find(l => l.canonicalLevel === selectedLevel) : null;

  // Get unique countries
  const allCountries = Array.from(
    new Set(classificationsData.levels.flatMap(level => level.mappings.map(m => m.country)))
  ).sort();

  // Filter mappings based on search and country filter
  const getFilteredMappings = (mappings: ClassificationMapping[]) => {
    let filtered = mappings;
    
    if (filterCountry !== 'ALL') {
      filtered = filtered.filter(m => m.country === filterCountry);
    }
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(m => 
        m.country.toLowerCase().includes(query) ||
        m.localLevel.toLowerCase().includes(query) ||
        m.localAbbrev.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  };

  return (
    <PageLayout
      user={session.user}
      breadcrumbs={[
        { label: 'Compliance', href: '/compliance' },
        { label: 'Classifications', href: null }
      ]}
    >
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-br from-green-600 via-emerald-600 to-teal-700 rounded-2xl p-8 md:p-12 mb-8 shadow-2xl">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 50% 50%, white 2px, transparent 2px)`,
            backgroundSize: '40px 40px'
          }} />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-4 bg-white/20 backdrop-blur-sm rounded-2xl">
              <Globe className="w-10 h-10 text-white" />
            </div>
            <div>
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">
                {classificationsData.title}
              </h1>
              <p className="text-green-100 text-lg max-w-3xl">
                {classificationsData.description}
              </p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
              <p className="text-white/80 text-sm font-medium mb-1">Nations Supported</p>
              <p className="text-3xl font-bold text-white">{classificationsData.supportedNations}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
              <p className="text-white/80 text-sm font-medium mb-1">Classification Levels</p>
              <p className="text-3xl font-bold text-white">{classificationsData.levels.length}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
              <p className="text-white/80 text-sm font-medium mb-1">Total Mappings</p>
              <p className="text-3xl font-bold text-white">
                {classificationsData.levels.reduce((sum, level) => sum + level.mappings.length, 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Search and Filter */}
      <div className="mb-6 bg-white rounded-xl p-6 border-2 border-gray-200 shadow-md">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search classifications, countries, abbreviations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <select
              value={filterCountry}
              onChange={(e) => setFilterCountry(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 appearance-none"
            >
              <option value="ALL">All Countries</option>
              {allCountries.map(country => (
                <option key={country} value={country}>{country}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Interactive Classification Equivalency Matrix (12x4) */}
      <div className="mb-8 bg-white rounded-xl border-2 border-gray-200 shadow-lg overflow-hidden">
        <div className="p-6 bg-gradient-to-r from-blue-600 to-indigo-600">
          <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-3">
            <Globe className="w-7 h-7" />
            Interactive Equivalency Matrix (ACP-240 Section 4.3)
          </h2>
          <p className="text-blue-100 text-sm">
            12 nations × 4 classification levels - Hover over cells to see national classification names
          </p>
        </div>

        <div className="p-6 overflow-x-auto">
          <table className="w-full border-collapse min-w-[800px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-gray-100 p-3 text-left font-bold text-gray-700 border border-gray-300">
                  Nation
                </th>
                {classificationsData.levels.map((level) => (
                  <th 
                    key={level.canonicalLevel}
                    className="p-3 text-center font-bold text-white border border-gray-300"
                    style={{ backgroundColor: level.color }}
                  >
                    <div className="text-sm">{level.displayName}</div>
                    <div className="text-xs font-mono opacity-80">{level.canonicalLevel}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allCountries.map((country) => {
                const isUserCountry = country === (session?.user as any)?.countryOfAffiliation;
                return (
                  <tr 
                    key={country}
                    className={`transition-all ${
                      isUserCountry
                        ? 'bg-green-50 ring-2 ring-green-400 ring-inset'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className={`sticky left-0 z-10 p-3 font-bold border border-gray-300 ${
                      isUserCountry ? 'bg-green-100 text-green-900' : 'bg-gray-50 text-gray-900'
                    }`}>
                      <div className="flex items-center gap-2">
                        <Flag className="w-4 h-4" />
                        {country}
                        {isUserCountry && (
                          <span className="ml-2 px-2 py-0.5 bg-green-600 text-white text-xs rounded-full font-bold">
                            YOU
                          </span>
                        )}
                      </div>
                    </td>
                    {classificationsData.levels.map((level) => {
                      const mapping = level.mappings.find(m => m.country === country);
                      return (
                        <td 
                          key={`${country}-${level.canonicalLevel}`}
                          className="p-3 text-center border border-gray-300 hover:bg-blue-50 hover:shadow-inner transition-all cursor-help"
                          title={mapping ? `${mapping.localLevel} (${mapping.localAbbrev})` : 'No mapping'}
                        >
                          {mapping ? (
                            <div>
                              <div className="text-sm font-bold text-gray-900">
                                {mapping.localLevel.replace(/_/g, ' ')}
                              </div>
                              <div className="text-xs font-mono text-gray-600 bg-gray-100 px-2 py-1 rounded mt-1 inline-block">
                                {mapping.localAbbrev}
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-6 pb-6">
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900 font-medium mb-2">
              📊 How to use this matrix:
            </p>
            <ul className="text-xs text-blue-800 space-y-1 ml-4 list-disc">
              <li><strong>Rows:</strong> Represent nations (12 total)</li>
              <li><strong>Columns:</strong> Represent NATO classification levels (4 total)</li>
              <li><strong>Cells:</strong> Show the national classification equivalent for each nation-level combination</li>
              <li><strong>Hover:</strong> See tooltip with full classification name and abbreviation</li>
              <li><strong>Your country</strong> is highlighted in green for easy reference</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Classification Levels */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-3">
          <Shield className="w-7 h-7 text-green-600" />
          Classification Levels
        </h2>
        <div className="space-y-6">
          {classificationsData.levels.map((level) => {
            const filteredMappings = getFilteredMappings(level.mappings);
            
            if (filteredMappings.length === 0 && (searchQuery || filterCountry !== 'ALL')) {
              return null; // Hide level if no mappings match filter
            }

            return (
              <div 
                key={level.canonicalLevel}
                className={`bg-white rounded-xl border-2 shadow-md hover:shadow-xl transition-all ${
                  selectedLevel === level.canonicalLevel
                    ? 'ring-4 ring-green-100 border-green-500'
                    : 'border-gray-200'
                }`}
              >
                {/* Level Header */}
                <div 
                  className="p-6 cursor-pointer"
                  onClick={() => setSelectedLevel(selectedLevel === level.canonicalLevel ? null : level.canonicalLevel)}
                  style={{ backgroundColor: `${level.color}15` }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div 
                        className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg"
                        style={{ backgroundColor: level.color }}
                      >
                        {level.numericValue}
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold text-gray-900">{level.displayName}</h3>
                        <p className="text-sm font-mono text-gray-600 uppercase">{level.canonicalLevel}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-bold" style={{ color: level.color }}>
                        {filteredMappings.length}
                      </p>
                      <p className="text-sm text-gray-600">Nation Mappings</p>
                    </div>
                  </div>
                </div>

                {/* Mappings Table */}
                <div className="p-6 pt-0">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {filteredMappings.map((mapping) => (
                      <div 
                        key={`${level.canonicalLevel}-${mapping.country}`}
                        className="bg-gray-50 rounded-lg p-4 border-2 border-gray-200 hover:border-green-400 hover:shadow-md transition-all"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <Flag className="w-4 h-4 text-gray-500" />
                          <span className="font-bold text-gray-900 text-sm">{mapping.country}</span>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-gray-600">Local Level:</p>
                          <p className="text-sm font-semibold text-gray-900">{mapping.localLevel.replace(/_/g, ' ')}</p>
                          <p className="text-xs font-mono text-gray-700 bg-white px-2 py-1 rounded border border-gray-300">
                            {mapping.localAbbrev}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {filteredMappings.length === 0 && (searchQuery || filterCountry !== 'ALL') && (
                    <p className="text-center text-gray-500 py-4">No mappings match your search criteria</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Use Cases */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-3">
          <CheckCircle2 className="w-7 h-7 text-blue-600" />
          Real-World Use Cases
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {classificationsData.useCases.map((useCase, idx) => (
            <div key={idx} className="bg-gradient-to-br from-white to-blue-50 rounded-xl p-6 border-2 border-blue-200 shadow-md hover:shadow-xl hover:scale-105 transition-all">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold">
                  {idx + 1}
                </div>
                <h3 className="font-bold text-gray-900 text-sm">{useCase.title}</h3>
              </div>
              <p className="text-sm text-gray-600 mb-3">{useCase.description}</p>
              <div className="bg-white rounded-lg p-3 border border-blue-300">
                <p className="text-xs font-mono text-blue-800">{useCase.example}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Validation Rules */}
      <div className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-xl p-6 border-2 border-yellow-200 shadow-lg">
        <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-3">
          <Shield className="w-6 h-6 text-yellow-600" />
          Authorization Validation Rules
        </h3>
        <ul className="space-y-3">
          {classificationsData.validationRules.map((rule, idx) => (
            <li key={idx} className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-white font-bold text-sm">
                {idx + 1}
              </div>
              <p className="flex-1 text-sm text-gray-700 font-medium pt-1">{rule}</p>
            </li>
          ))}
        </ul>
      </div>
    </PageLayout>
  );
}


