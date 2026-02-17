import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { DashboardClient } from "@/components/dashboard/dashboard-client";

export default async function DashboardPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/login");
  }

  return <DashboardClient />;
}
