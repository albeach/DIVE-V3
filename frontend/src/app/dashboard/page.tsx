import { auth } from "@/auth";
import { redirect } from "next/navigation";
import PageLayout from "@/components/layout/page-layout";
import { DashboardModern } from "@/components/dashboard/dashboard-modern";

// Note: Server components can't use hooks directly
// Breadcrumb localization will be handled in PageLayout/Breadcrumbs component
export default async function DashboardPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <PageLayout
      user={session.user}
      breadcrumbs={[
        { label: 'dashboard.title', href: null, translate: true }
      ]}
    >
      <DashboardModern user={session.user as any} session={session as any} />
    </PageLayout>
  );
}
