import { auth } from "@/auth";
import { redirect } from "next/navigation";
import PageLayout from "@/components/layout/page-layout";
import PoliciesPageClient from "./policies-client";
import type { IPolicyHierarchy } from "@/types/policy.types";

async function getPolicyHierarchy(): Promise<IPolicyHierarchy | null> {
  try {
    const response = await fetch('/api/policies/hierarchy', {
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
        { label: 'nav.policyTools.name', href: null, translate: true, namespace: 'common' }
      ]}
      noPadding
    >
      <PoliciesPageClient hierarchy={hierarchy} />
    </PageLayout>
  );
}
