"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { X, Copy, Check } from "lucide-react";
import { getPseudonymFromUser } from "@/lib/pseudonym-generator";
import { jwtDecode } from "jwt-decode";

interface IdentityUser {
  uniqueID?: string | null;
  clearance?: string | null;
  countryOfAffiliation?: string | null;
  acpCOI?: string[] | null;
}

export function IdentityDrawer({ open, onClose, user }: { open: boolean; onClose: () => void; user?: IdentityUser }) {
  const { data: session } = useSession();
  const [copied, setCopied] = useState(false);

  const decoded = useMemo(() => {
    if (!session?.idToken) return null as null | Record<string, any>;
    try {
      return jwtDecode(session.idToken) as Record<string, any>;
    } catch {
      return null;
    }
  }, [session?.idToken]);

  if (!open) return null;

  const pseudonym = getPseudonymFromUser((user || {}) as any);
  const authTime: string | null = decoded?.auth_time ? new Date(decoded.auth_time * 1000).toLocaleString() : null;
  const acr: string | null = decoded?.acr || null;
  const amr: string | null = Array.isArray(decoded?.amr) ? decoded!.amr.join(" + ") : decoded?.amr || null;
  const missingClaims: string[] = [];
  if (!decoded?.auth_time) missingClaims.push('auth_time');
  if (!decoded?.acr) missingClaims.push('acr');
  if (!decoded?.amr || (Array.isArray(decoded?.amr) && decoded!.amr.length === 0)) missingClaims.push('amr');

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute top-0 right-0 h-full w-full sm:w-[420px] bg-white shadow-2xl border-l border-gray-200 animate-slide-left" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#4497ac] via-[#5ca3b5] to-[#90d56a] flex items-center justify-center text-white font-black">
              {(pseudonym || "U").charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900">{pseudonym}</div>
              <div className="text-xs text-gray-600">Identity overview</div>
            </div>
          </div>
          <button className="text-gray-500 hover:text-gray-700" onClick={onClose} aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Pseudonym with copy */}
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-900">Pseudonym</div>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(pseudonym);
                setCopied(true);
                setTimeout(() => setCopied(false), 1000);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="text-base font-mono bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">{pseudonym}</div>

          {/* Claims */}
          <div className="grid grid-cols-1 gap-3">
            <Claim label="uniqueID" value={user?.uniqueID || "N/A"} />
            <Claim label="clearance" value={user?.clearance || "UNCLASSIFIED"} color={clearanceColor(user?.clearance)} />
            <Claim label="countryOfAffiliation" value={user?.countryOfAffiliation || "N/A"} />
            {Array.isArray(user?.acpCOI) && user!.acpCOI!.length > 0 && (
              <Claim label="acpCOI" value={user!.acpCOI!.join(", ")} />
            )}
            <Claim label="auth_time" value={authTime || "N/A"} />
            <Claim label="acr (AAL)" value={acr?.toUpperCase() || "N/A"} />
            <Claim label="amr" value={amr || "N/A"} />
          </div>

          {/* Privacy note */}
          <div className="mt-6 rounded-lg bg-teal-50 border border-teal-200 p-3 text-xs text-teal-900">
            We use a pseudonym instead of your real name to meet ACP-240 Section 6.2 PII minimization. Only your `uniqueID` is used in logs and authorization inputs.
          </div>

          {/* Dev-only: guidance when claims are missing */}
          {process.env.NODE_ENV === 'development' && missingClaims.length > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
              Missing claims in idToken: {missingClaims.join(', ')}. Ensure Keycloak mappers are configured. See <a href="/KEYCLOAK-CLAIMS-MAPPERS-CHECKLIST.md" className="underline font-semibold">Keycloak claims checklist</a>.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function clearanceColor(level: string | null | undefined): "red" | "orange" | "blue" | "gray" {
  switch ((level || "UNCLASSIFIED").toUpperCase()) {
    case "TOP_SECRET":
      return "red";
    case "SECRET":
      return "orange";
    case "CONFIDENTIAL":
      return "blue";
    default:
      return "gray";
  }
}

function Claim({ label, value, color }: { label: string; value: string; color?: "red" | "orange" | "blue" | "gray" }) {
  const chipClasses = color === "red"
    ? "bg-red-50 text-red-800 border-red-200"
    : color === "orange"
    ? "bg-orange-50 text-orange-800 border-orange-200"
    : color === "blue"
    ? "bg-blue-50 text-blue-800 border-blue-200"
    : "bg-gray-50 text-gray-800 border-gray-200";
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
      <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</div>
      <div className={`text-xs font-bold px-2 py-1 rounded-md border ${chipClasses}`}>{value}</div>
    </div>
  );
}


