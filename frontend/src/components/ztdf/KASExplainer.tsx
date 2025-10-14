'use client';

import { useState } from 'react';

/**
 * KASExplainer Component
 * Educational panel explaining what KAS is and how it works
 * Week 3.4.3: Enhanced UX for users unfamiliar with KAS
 */

export default function KASExplainer() {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-6 mb-6">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-600 text-white rounded-full w-12 h-12 flex items-center justify-center text-2xl font-bold">
                        ?
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-blue-900">
                            What is KAS? (Key Access Service)
                        </h3>
                        <p className="text-sm text-blue-700">
                            Learn how Zero Trust Data Format protects your content
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                >
                    {isExpanded ? '▼ Show Less' : '▶ Learn More'}
                </button>
            </div>

            {/* Collapsed Summary */}
            {!isExpanded && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="bg-white rounded-lg p-3 border border-blue-200">
                        <div className="font-semibold text-blue-900 mb-1">🔐 Policy-Bound Encryption</div>
                        <p className="text-gray-600 text-xs">
                            Security policy travels with encrypted data
                        </p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-blue-200">
                        <div className="font-semibold text-blue-900 mb-1">🔑 Separate Key Storage</div>
                        <p className="text-gray-600 text-xs">
                            Encryption keys stored separately from data
                        </p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-blue-200">
                        <div className="font-semibold text-blue-900 mb-1">✓ Double Authorization</div>
                        <p className="text-gray-600 text-xs">
                            Policy checked twice: once at access, again at key release
                        </p>
                    </div>
                </div>
            )}

            {/* Expanded Explanation */}
            {isExpanded && (
                <div className="mt-6 space-y-6">
                    {/* What is KAS? */}
                    <div className="bg-white rounded-lg p-5 border border-blue-200">
                        <h4 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
                            <span className="text-2xl">🎯</span>
                            What is KAS?
                        </h4>
                        <p className="text-gray-700 mb-3">
                            <strong>Key Access Service (KAS)</strong> is a critical component of Zero Trust Data Format (ZTDF) 
                            that implements <strong>policy-bound encryption</strong>. Instead of just encrypting data and 
                            giving everyone with access the key, KAS enforces the security policy <strong>every time</strong> 
                            someone tries to decrypt the content.
                        </p>
                        <div className="bg-blue-50 border-l-4 border-blue-600 p-4 text-sm">
                            <p className="font-semibold text-blue-900 mb-2">Key Concept: Defense in Depth</p>
                            <p className="text-gray-700">
                                Even if someone gains access to encrypted data, they still need KAS to release the decryption 
                                key. KAS re-checks your clearance, country affiliation, and COI before releasing the key. 
                                This provides <strong>continuous enforcement</strong> of access control policies.
                            </p>
                        </div>
                    </div>

                    {/* How Does It Work? */}
                    <div className="bg-white rounded-lg p-5 border border-blue-200">
                        <h4 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
                            <span className="text-2xl">⚙️</span>
                            How Does KAS Work?
                        </h4>
                        <div className="space-y-3 text-sm">
                            <div className="flex gap-3">
                                <div className="flex-shrink-0 bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">1</div>
                                <div>
                                    <p className="font-semibold text-gray-900">Data Encryption</p>
                                    <p className="text-gray-600">
                                        When a document is created, it's encrypted with a random <strong>Data Encryption Key (DEK)</strong> 
                                        using AES-256-GCM (military-grade encryption).
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <div className="flex-shrink-0 bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">2</div>
                                <div>
                                    <p className="font-semibold text-gray-900">Key Separation</p>
                                    <p className="text-gray-600">
                                        The DEK is <strong>not</strong> stored with the encrypted data. Instead, it's wrapped (encrypted) 
                                        and stored in a <strong>Key Access Object (KAO)</strong> that includes the security policy.
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <div className="flex-shrink-0 bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">3</div>
                                <div>
                                    <p className="font-semibold text-gray-900">Policy Re-Evaluation</p>
                                    <p className="text-gray-600">
                                        When you try to view encrypted content, KAS <strong>re-checks</strong> your attributes 
                                        (clearance, country, COI) against the policy before releasing the DEK.
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <div className="flex-shrink-0 bg-green-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">✓</div>
                                <div>
                                    <p className="font-semibold text-gray-900">Key Release</p>
                                    <p className="text-gray-600">
                                        If all checks pass, KAS releases the DEK. Your browser decrypts the content and displays it. 
                                        If any check fails, KAS denies the request and tells you why.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Why Do We Need This? */}
                    <div className="bg-white rounded-lg p-5 border border-blue-200">
                        <h4 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
                            <span className="text-2xl">💡</span>
                            Why Do We Need This?
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div className="bg-green-50 border border-green-200 rounded p-3">
                                <p className="font-semibold text-green-900 mb-2">✅ With KAS (Zero Trust)</p>
                                <ul className="space-y-1 text-gray-700 text-xs">
                                    <li>• Policy enforced at encryption AND decryption</li>
                                    <li>• Keys released only to authorized users</li>
                                    <li>• User permissions can be revoked after encryption</li>
                                    <li>• Data remains protected even if stolen</li>
                                    <li>• Audit trail for every key access</li>
                                </ul>
                            </div>
                            <div className="bg-red-50 border border-red-200 rounded p-3">
                                <p className="font-semibold text-red-900 mb-2">❌ Without KAS (Traditional)</p>
                                <ul className="space-y-1 text-gray-700 text-xs">
                                    <li>• Policy only checked at initial access</li>
                                    <li>• Anyone with key can decrypt</li>
                                    <li>• Can't revoke access after sharing</li>
                                    <li>• Stolen encrypted data can be decrypted</li>
                                    <li>• No audit of actual decryption</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Real-World Example */}
                    <div className="bg-white rounded-lg p-5 border border-blue-200">
                        <h4 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
                            <span className="text-2xl">🌍</span>
                            Real-World Example
                        </h4>
                        <div className="bg-yellow-50 border border-yellow-200 rounded p-4 text-sm">
                            <p className="font-semibold text-gray-900 mb-2">Scenario: French analyst transferred to different unit</p>
                            <div className="space-y-2 text-gray-700">
                                <p>
                                    <strong>Day 1:</strong> Jean (France, NATO-COSMIC COI) accesses a NATO document. 
                                    ✅ Authorized → KAS releases key → Content decrypts.
                                </p>
                                <p>
                                    <strong>Day 7:</strong> Jean transfers to a new unit and loses NATO-COSMIC COI membership.
                                </p>
                                <p>
                                    <strong>Day 8:</strong> Jean tries to access the same document again. 
                                    ❌ KAS re-checks policy → COI mismatch → Key denied.
                                </p>
                                <p className="text-blue-800 font-semibold mt-3">
                                    Result: Even though Jean accessed the document before, KAS prevents access now because 
                                    his attributes changed. <strong>This is continuous enforcement!</strong>
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* The 6 Steps Explained */}
                    <div className="bg-white rounded-lg p-5 border border-blue-200">
                        <h4 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
                            <span className="text-2xl">📋</span>
                            The 6 Steps Explained
                        </h4>
                        <div className="space-y-3 text-sm">
                            {[
                                {
                                    num: 1,
                                    name: 'Resource Access Request',
                                    desc: 'You click to view an encrypted document. The system receives your request.',
                                    why: 'Initiates the secure access flow'
                                },
                                {
                                    num: 2,
                                    name: 'OPA Policy Evaluation',
                                    desc: 'The main policy engine (OPA) checks if you\'re generally authorized to access this document.',
                                    why: 'First authorization check - if you fail here, request stops immediately'
                                },
                                {
                                    num: 3,
                                    name: 'Key Request to KAS',
                                    desc: 'Your browser contacts the Key Access Service and says "I need the decryption key for this document."',
                                    why: 'Initiates the key release process'
                                },
                                {
                                    num: 4,
                                    name: 'KAS Policy Re-evaluation',
                                    desc: 'KAS independently re-checks your clearance, country, and COI against the document\'s requirements.',
                                    why: 'Defense in depth - KAS doesn\'t trust the first check, it verifies again'
                                },
                                {
                                    num: 5,
                                    name: 'Key Release',
                                    desc: 'If all checks pass, KAS releases the Data Encryption Key (DEK) to your browser.',
                                    why: 'The actual moment you receive permission to decrypt'
                                },
                                {
                                    num: 6,
                                    name: 'Content Decryption',
                                    desc: 'Your browser uses the DEK to decrypt the encrypted content and displays it to you.',
                                    why: 'Final step - you see the actual document content'
                                }
                            ].map((step) => (
                                <div key={step.num} className="flex gap-3 bg-gray-50 rounded p-3 border border-gray-200">
                                    <div className="flex-shrink-0">
                                        <div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold">
                                            {step.num}
                                        </div>
                                    </div>
                                    <div className="flex-grow">
                                        <p className="font-semibold text-gray-900 mb-1">{step.name}</p>
                                        <p className="text-gray-700 text-xs mb-2">{step.desc}</p>
                                        <p className="text-blue-700 text-xs italic">
                                            💡 Why this matters: {step.why}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Why Re-Request After Navigation? */}
                    <div className="bg-white rounded-lg p-5 border border-blue-200">
                        <h4 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
                            <span className="text-2xl">🔄</span>
                            Why Do I Need to Re-Request the Key After Navigation?
                        </h4>
                        <div className="text-sm text-gray-700 space-y-2">
                            <p>
                                When you navigate away from a decrypted document, the decrypted content is <strong>removed from memory</strong> 
                                for security reasons. This is intentional:
                            </p>
                            <ul className="list-disc list-inside space-y-1 ml-4">
                                <li>Prevents decrypted content from staying in browser memory</li>
                                <li>Reduces risk if someone accesses your unlocked computer</li>
                                <li>Ensures each access is audited (compliance requirement)</li>
                                <li>Re-validates your permissions haven't changed</li>
                            </ul>
                            <div className="bg-blue-50 border border-blue-200 rounded p-3 mt-3">
                                <p className="font-semibold text-blue-900 mb-1">
                                    🔒 Security First Approach
                                </p>
                                <p className="text-xs text-gray-600">
                                    This behavior follows <strong>NATO ACP-240</strong> guidelines for data-centric security. 
                                    In production, you might cache the DEK in secure session storage for a limited time (e.g., 5 minutes), 
                                    but the pilot implements the most secure approach: re-validate every time.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Common Questions */}
                    <div className="bg-white rounded-lg p-5 border border-blue-200">
                        <h4 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
                            <span className="text-2xl">❓</span>
                            Common Questions
                        </h4>
                        <div className="space-y-4 text-sm">
                            <div>
                                <p className="font-semibold text-gray-900">Q: Can't someone just steal the encrypted data and decrypt it offline?</p>
                                <p className="text-gray-700 mt-1">
                                    <strong>A:</strong> No! Even if they steal the encrypted file, they can't decrypt it without asking KAS for the key. 
                                    KAS will check their attributes and deny the request if they're not authorized.
                                </p>
                            </div>
                            <div>
                                <p className="font-semibold text-gray-900">Q: What if KAS is unavailable?</p>
                                <p className="text-gray-700 mt-1">
                                    <strong>A:</strong> You won't be able to decrypt the content (fail-closed security). This ensures the 
                                    policy is always enforced - better to deny access temporarily than allow unauthorized access.
                                </p>
                            </div>
                            <div>
                                <p className="font-semibold text-gray-900">Q: Why does it check the policy twice (OPA and KAS)?</p>
                                <p className="text-gray-700 mt-1">
                                    <strong>A:</strong> <strong>Defense in depth.</strong> The first check (OPA) determines if you can see metadata. 
                                    The second check (KAS) determines if you can decrypt content. If your permissions change between these 
                                    two checks, KAS catches it.
                                </p>
                            </div>
                            <div>
                                <p className="font-semibold text-gray-900">Q: What's the difference between encrypted and unencrypted resources?</p>
                                <p className="text-gray-700 mt-1">
                                    <strong>A:</strong> Unencrypted resources only need the first policy check (OPA). Encrypted resources 
                                    with KAS require both checks. Higher classification documents (SECRET, TOP SECRET) typically use 
                                    KAS for additional protection.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Technical Details */}
                    <div className="bg-white rounded-lg p-5 border border-blue-200">
                        <h4 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
                            <span className="text-2xl">🔧</span>
                            Technical Details
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                            <div>
                                <p className="font-semibold text-gray-900 mb-2">Encryption Standards:</p>
                                <ul className="space-y-1 text-gray-700">
                                    <li>• <strong>Algorithm:</strong> AES-256-GCM</li>
                                    <li>• <strong>Key Size:</strong> 256 bits (32 bytes)</li>
                                    <li>• <strong>Mode:</strong> Galois/Counter Mode (authenticated)</li>
                                    <li>• <strong>IV:</strong> 96-bit random initialization vector</li>
                                    <li>• <strong>Auth Tag:</strong> 128-bit for integrity</li>
                                </ul>
                            </div>
                            <div>
                                <p className="font-semibold text-gray-900 mb-2">Policy Standards:</p>
                                <ul className="space-y-1 text-gray-700">
                                    <li>• <strong>STANAG 4774:</strong> NATO security labeling</li>
                                    <li>• <strong>STANAG 4778:</strong> Cryptographic binding</li>
                                    <li>• <strong>ACP-240:</strong> Attribute-based access control</li>
                                    <li>• <strong>ISO 3166-1:</strong> Country codes (alpha-3)</li>
                                    <li>• <strong>Fail-Closed:</strong> Deny on any error</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* For More Information */}
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg p-4 text-sm">
                        <p className="font-semibold mb-2">📚 For More Information</p>
                        <p className="text-blue-100">
                            See <code className="bg-white/20 px-2 py-1 rounded">docs/USE-CASES-ZTDF-KAS.md</code> for 
                            detailed use cases showing KAS in action, or explore the ZTDF Inspector tabs to see the 
                            security policy and encryption details for this document.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

