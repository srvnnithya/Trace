import { DeltaApp } from '@/components/delta-app';
import { getDashboard, type DashboardData } from '@/lib/delta-service';

export const dynamic = 'force-dynamic';

export default async function Home() {
  let initialData: DashboardData | null = null;
  try {
    initialData = await getDashboard();
  } catch {
    // The client shows a resilient loading/error state if storage is unavailable.
  }
  return <DeltaApp initialData={initialData} />;
}
