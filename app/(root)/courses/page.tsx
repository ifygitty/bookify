import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Plus, BookOpen } from "lucide-react";
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
        <main className="container wrapper">
            <div className="mx-auto max-w-5xl">
                <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-[#663820]">
                            Your study space
                        </p>
                        <h1 className="page-title-xl">My courses</h1>
                        <p className="subtitle mt-3 max-w-2xl">
                            Bring your course study materials together and learn with Mentor AI.
                        </p>
                    </div>
                    <Link href="#create-course" className="btn-primary w-fit">
                        <Plus className="size-5" />
                        Add a course
                    </Link>
                </div>

                <CourseLibrary initialCourses={initialCourses} />

                {initialCourses.length === 0 && (
                    <div className="mt-8 rounded-2xl border border-dashed border-[#212a3b]/20 bg-white/70 px-6 py-12 text-center">
                        <BookOpen className="mx-auto mb-4 size-10 text-[#663820]" />
                        <h2 className="text-xl font-semibold">Start with your first subject</h2>
                        <p className="mt-2 text-[#3d485e]">
                            Create a course such as ACC 101, then add the materials you study from.
                        </p>
                    </div>
                )}
            </div>
        </main>
    );
}
