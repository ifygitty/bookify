import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Plus, GraduationCap } from "lucide-react";
import "@/components/landing.css";
import "@/components/mentor-ui.css";
import { ConcentricCircles, FlowingCurves, GlowOrb, OrbitalRings } from "@/components/LandingDecor";
import { connectToDatabase } from "@/database/mongoose";
import Course, { type CourseMaterialRecord } from "@/database/models/course.model";
import CourseLibrary from "@/components/CourseLibrary";

export const dynamic = "force-dynamic";

export default async function CoursesPage() {
    const { userId } = await auth();
    if (!userId) redirect("/sign-in");

    await connectToDatabase();
    const courses = await Course.find({ clerkId: userId })
        .select("name slug materials._id materials.title materials.fileSize createdAt")
        .sort({ createdAt: -1 })
        .lean();

    const initialCourses = courses.map((course) => ({
        id: course._id.toString(),
        name: course.name,
        slug: course.slug,
        materials: course.materials.map((material: CourseMaterialRecord) => ({
            id: material._id.toString(),
            title: material.title,
            fileSize: material.fileSize,
        })),
    }));
   

    return (
        <main className="mentor-page wrapper !max-w-none !px-0 !pb-16 !pt-28 sm:!pt-32">
            <ConcentricCircles className="-right-40 -top-32 size-[30rem] opacity-60" />
            <FlowingCurves className="inset-x-0 top-24 h-56 w-full opacity-50" />
            <OrbitalRings className="-left-48 bottom-10 size-[28rem] opacity-40" />
            <GlowOrb className="left-1/3 top-40 size-72" />

            <div className="mentor-page-content mx-auto max-w-5xl px-4 sm:px-6">
                <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-gold)] sm:text-sm">
                            Your study space
                        </p>
                        <h1 className="mentor-title text-4xl font-extrabold sm:text-5xl">My Courses</h1>
                        <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--ink-soft)]">
                            Bring your course study materials together and learn with Mentor AI.
                        </p>
                    </div>
                    <Link href="#create-course" className="mentor-cta w-full sm:w-fit">
                        <Plus className="size-5" />
                        Add a course
                    </Link>
                </div>

                <CourseLibrary initialCourses={initialCourses} />

                {initialCourses.length === 0 && (
                    <div className="glass glass-green mt-8 rounded-3xl px-6 py-12 text-center">
                        <span className="icon-tile mx-auto mb-4 size-16">
                            <GraduationCap className="size-8" />
                        </span>
                        <h2 className="mentor-title text-xl font-bold">Start with your first subject</h2>
                        <p className="mt-2 text-[var(--ink-soft)]">
                            Create a course such as ACC 101, then add the materials you study from.
                        </p>
                    </div>
                )}
            </div>
        </main>
    );
}
