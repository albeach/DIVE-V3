import { auth } from "@/auth";
import { redirect } from "next/navigation";
import PageLayout from "@/components/layout/page-layout";
import { DashboardModern } from "@/components/dashboard/dashboard-modern";

export default async function DashboardPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <PageLayout 
      user={session.user}
      breadcrumbs={[
        { label: 'Dashboard', href: null }
      ]}
    >
      <DashboardModern user={session.user as any} session={session as any} />
    </PageLayout>
  );
}

