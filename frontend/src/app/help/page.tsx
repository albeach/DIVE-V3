/**
 * Help & Support Page
 */

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import PageLayout from "@/components/layout/page-layout";
import { HelpContent } from "@/components/help/help-content";

export default async function HelpPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <PageLayout 
      user={session.user}
      breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Help & Support', href: null }
      ]}
    >
      <HelpContent />
    </PageLayout>
  );
}





