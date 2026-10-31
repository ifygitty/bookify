import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { Types } from "mongoose";
import { connectToDatabase } from "@/database/mongoose";
import Course, { type CourseMaterialRecord } from "@/database/models/course.model";
import CourseStudyPage from "@/components/CourseStudyPage";

export const dynamic = "force-dynamic";

export default async function CoursePage({
    params,
}: {
    params: Promise<{ courseId: string }>;
}) {
    const { userId } = await auth();
    if (!userId) redirect("/sign-in");

    const { courseId } = await params;
    if (!Types.ObjectId.isValid(courseId)) notFound();
    

    await connectToDatabase();
    const course = await Course.findOne({ _id: courseId, clerkId: userId })
        .select("name materials._id materials.title materials.fileSize materials.originalFileName")
        .lean();

    if (!course) notFound();

    const courseData = {
        id: course._id.toString(),
        name: course.name,
        materials: course.materials.map((material: CourseMaterialRecord) => ({
            id: material._id.toString(),
            title: material.title,
            fileSize: material.fileSize,
            fileType: material.originalFileName?.split(".").at(-1)?.toUpperCase() ?? "PDF",
        })),
    };

    return (
        <div className="pt-[var(--navbar-height)]">
            <CourseStudyPage course={courseData} />
        </div>
    );
}
