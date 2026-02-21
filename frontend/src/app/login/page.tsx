import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AutoSignIn } from "@/components/auth/auto-sign-in";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; idp?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;

  // If already logged in, redirect to dashboard
  if (session) {
    redirect(params.callbackUrl || "/dashboard");
  }

  // Auto-trigger Keycloak sign-in (no intermediate button page)
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-lg">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">Authenticating</h2>
          <p className="mt-2 text-sm text-gray-600">
            Please wait while we redirect you to your Identity Provider
          </p>
        </div>

        <div className="mt-8 flex justify-center">
          <AutoSignIn
            idpHint={params.idp}
            callbackUrl={params.callbackUrl || '/dashboard'}
          />
        </div>
      </div>
    </div>
  );
}
