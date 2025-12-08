/**
 * Recent Activity Page
 * 
 * Shows user's recent activity including:
 * - Document views
 * - Downloads
 * - Access requests
 * - Authorization decisions
 * - Upload history
 */

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import PageLayout from "@/components/layout/page-layout";
import { ActivityPageContent } from "@/components/activity/activity-page-content";

export default async function ActivityPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <PageLayout 
      user={session.user}
      breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Activity', href: null }
      ]}
    >
      <ActivityPageContent user={session.user as any} />
    </PageLayout>
  );
}







