'use client';

export function InformationPanel() {
  return (
    <div className="rounded-xl bg-gradient-to-br from-gray-50 to-white p-6 border border-gray-200 shadow-md">
      <div className="flex items-center mb-5">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#4396ac] to-[#90d56a] flex items-center justify-center mr-3 shadow-sm">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-base font-bold text-gray-900 uppercase tracking-wide">
          Information & Support
        </h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* About Your Profile */}
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-blue-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="text-xs font-bold text-blue-900 uppercase tracking-wide mb-1">About Your Profile</p>
              <p className="text-sm text-gray-700 leading-relaxed">
                These attributes determine your access to classified resources based on <strong>clearance level</strong>, <strong>country affiliation</strong>, and <strong>COI membership</strong>.
              </p>
            </div>
          </div>
        </div>

        {/* Read-Only Values */}
        <div className="bg-gray-100 border-l-4 border-gray-500 p-4 rounded-r-lg">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-gray-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-1">Read-Only Values</p>
              <p className="text-sm text-gray-700 leading-relaxed">
                Values are managed by your IdP administrator and cannot be changed here.
              </p>
            </div>
          </div>
        </div>

        {/* Contact Support */}
        <div className="flex items-center justify-center">
          <button className="w-full px-4 py-3 bg-gradient-to-r from-[#4396ac] to-[#90d56a] text-white font-bold rounded-lg shadow-md hover:shadow-lg hover:scale-105 transition-all duration-300 flex items-center justify-center group">
            <svg className="w-5 h-5 mr-2 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Contact Support
          </button>
        </div>
      </div>
    </div>
  );
}
