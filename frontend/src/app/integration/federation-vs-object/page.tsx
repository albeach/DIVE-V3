import { auth } from "@/auth";
import { redirect } from "next/navigation";
import PageLayout from "@/components/layout/page-layout";
import IntegrationContent from "./content";

/**
 * Integration Page: Federation (ADatP-5663) × Object (ACP-240)
 * 
 * Now integrated with main navigation and compliance/testing section
 */
export default async function FederationVsObjectPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <PageLayout 
      user={session.user}
      breadcrumbs={[
        { label: 'Compliance & Testing', href: '/compliance' },
        { label: 'Integration Guide', href: null }
      ]}
    >
      <IntegrationContent />
    </PageLayout>
  );
}
