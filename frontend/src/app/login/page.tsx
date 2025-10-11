import { LoginButton } from "@/components/auth/login-button";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import Link from "next/link";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; idp?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;

  if (session) {
    redirect(params.callbackUrl || "/dashboard");
  }

  // If IdP hint provided, redirect directly
  const idpHint = params.idp;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-lg">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">Sign In</h2>
          <p className="mt-2 text-sm text-gray-600">
            Authenticate with your Identity Provider
          </p>
          {idpHint && (
            <p className="mt-2 text-xs text-blue-600">
              Selected: {idpHint.replace('-idp', '').toUpperCase()}
            </p>
          )}
        </div>
        
        <div className="mt-8">
          <LoginButton idpHint={idpHint} />
        </div>
        
        <div className="mt-6 text-center">
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Back to IdP selection
          </Link>
        </div>
      </div>
    </div>
  );
}

