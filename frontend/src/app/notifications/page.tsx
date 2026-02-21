/**
 * Notifications Page
 */

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import PageLayout from "@/components/layout/page-layout";
import { NotificationsContent } from "@/components/notifications/notifications-content";

export default async function NotificationsPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <PageLayout
      user={session.user}
      breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Notifications', href: null }
      ]}
    >
      <NotificationsContent user={session.user as any} />
    </PageLayout>
  );
}

