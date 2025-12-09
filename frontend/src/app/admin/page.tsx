import { redirect } from 'next/navigation';

/**
 * Admin Index Page
 * 
 * Redirects to the admin dashboard.
 */
export default function AdminPage() {
  redirect('/admin/dashboard');
}




