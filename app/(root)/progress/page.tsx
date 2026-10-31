import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import StudyProgressDashboard from "@/components/StudyProgressDashboard";

export const dynamic = "force-dynamic";

export default async function ProgressPage() {
    const { userId } = await auth();
    if (!userId) redirect("/sign-in");

    return <StudyProgressDashboard />;
}
