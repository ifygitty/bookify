import type { Metadata } from "next";
import "@/components/landing.css";
import "@/components/mentor-ui.css";
import "@/components/admin/admin.css";
import { ConcentricCircles, FlowingCurves, GlowOrb, OrbitalRings } from "@/components/LandingDecor";
import AdminNav from "@/components/admin/AdminNav";
import { requireAdminPage } from "@/lib/admin.server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin · Mentor", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    await requireAdminPage();

    return (
        <main className="mentor-page wrapper !max-w-none !px-0 !pb-16 !pt-28 sm:!pt-32">
            <ConcentricCircles className="-right-40 -top-32 size-[30rem] opacity-50" />
            <FlowingCurves className="inset-x-0 top-24 h-56 w-full opacity-40" />
            <OrbitalRings className="-left-48 bottom-10 size-[28rem] opacity-30" />
            <GlowOrb className="left-1/3 top-40 size-72" />
            <div className="mentor-page-content mx-auto max-w-7xl px-4 sm:px-6">
                <div className="admin-shell">
                    <AdminNav />
                    <div className="min-w-0">{children}</div>
                </div>
            </div>
        </main>
    );
}
