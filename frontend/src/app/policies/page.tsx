import { auth } from "@/auth";
import { redirect } from "next/navigation";
import PageLayout from "@/components/layout/page-layout";
import PoliciesPageClient from "./policies-client";
import type { IPolicyHierarchy } from "@/types/policy.types";

async function getPolicyHierarchy(): Promise<IPolicyHierarchy | null> {
  const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';

  try {
    const response = await fetch(`${backendUrl}/api/policies/hierarchy`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error('Failed to fetch policy hierarchy:', response.status);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching policy hierarchy:', error);
    return null;
  }
}

export default async function PoliciesPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const hierarchy = await getPolicyHierarchy();

  return (
    <PageLayout
      user={session.user}
      breadcrumbs={[
        { label: 'Policies', href: null }
      ]}
      noPadding
    >
      <PoliciesPageClient hierarchy={hierarchy} />
    </PageLayout>
  );
}
