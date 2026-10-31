"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { BookOpen, FileText, Plus, LoaderCircle, Pencil, Trash2 } from "lucide-react";

export type CourseListItem = {
    id: string;
    name: string;
    slug: string;
    materials: { id: string; title: string; fileSize: number }[];
};

export default function CourseLibrary({ initialCourses }: { initialCourses: CourseListItem[] }) {
    const router = useRouter();
    const [name, setName] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState("");
    const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
    const [editedCourseName, setEditedCourseName] = useState("");
    const [busyCourseId, setBusyCourseId] = useState<string | null>(null);
    const [courseActionError, setCourseActionError] = useState("");

    const createCourse = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const cleanName = name.trim();
        if (!cleanName || isCreating) return;

        setError("");
        setIsCreating(true);
        try {
            const response = await fetch("/api/courses", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: cleanName }),
            });
            const result = await response.json();

            if (!response.ok) {
                setError(result.error || "Could not create your course.");
                return;
            }

            router.push(`/courses/${result.course.id}`);
            router.refresh();
        } catch (requestError) {
            console.error("Course creation request failed:", requestError);
            setError("Could not connect to the server. Please try again.");
        } finally {
            setIsCreating(false);
        }
    };

    const saveCourseName = async (event: FormEvent<HTMLFormElement>, courseId: string) => {
        event.preventDefault();
        const cleanName = editedCourseName.trim();
        if (!cleanName || busyCourseId) return;

        setCourseActionError("");
        setBusyCourseId(courseId);
        try {
            const response = await fetch(`/api/courses/${courseId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: cleanName }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Could not update the course.");

            setEditingCourseId(null);
            router.refresh();
        } catch (requestError) {
            console.error("Course rename request failed:", requestError);
            setCourseActionError(requestError instanceof Error ? requestError.message : "Could not update the course.");
        } finally {
            setBusyCourseId(null);
        }
    };

    const deleteCourse = async (courseId: string, courseName: string) => {
        if (busyCourseId || !window.confirm(`Delete "${courseName}" and all of its study materials and chat history? This cannot be undone.`)) {
            return;
        }

        setCourseActionError("");
        setBusyCourseId(courseId);
        try {
            const response = await fetch(`/api/courses/${courseId}`, { method: "DELETE" });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Could not delete the course.");
            router.refresh();
        } catch (requestError) {
            console.error("Course deletion request failed:", requestError);
            setCourseActionError(requestError instanceof Error ? requestError.message : "Could not delete the course.");
        } finally {
            setBusyCourseId(null);
        }
    };

    return (
        <div className="space-y-8">
            <section id="create-course" className="rounded-2xl border border-[#212a3b]/10 bg-white p-6 shadow-soft-sm sm:p-8">
                <div className="mb-5 flex items-start gap-4">
                    <div className="rounded-xl bg-[#f3e4c7] p-3 text-[#663820]">
                        <Plus className="size-5" />
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold">Create a course or subject</h2>
                        <p className="mt-1 text-sm text-[#3d485e]">For example, ACC 101 or Introduction to Economics.</p>
                    </div>
                </div>
                <form onSubmit={createCourse} className="flex flex-col gap-3 sm:flex-row">
                    <label htmlFor="course-name" className="sr-only">Course name</label>
                    <input
                        id="course-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        maxLength={100}
                        placeholder="Enter a course name"
                        className="min-h-12 min-w-0 flex-1 rounded-xl border border-[#212a3b]/15 bg-[#fffdf8] px-4 text-base outline-none transition focus:border-[#663820] focus:ring-2 focus:ring-[#663820]/15"
                        required
                    />
                    <button type="submit" disabled={isCreating || !name.trim()} className="btn-primary disabled:cursor-not-allowed disabled:opacity-60">
                        {isCreating ? <LoaderCircle className="size-5 animate-spin" /> : <Plus className="size-5" />}
                        Create course
                    </button>
                </form>
                {error && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{error}</p>}
            </section>

            {initialCourses.length > 0 && (
                <section>
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-2xl font-semibold">Your courses</h2>
                        <span className="text-sm text-[#3d485e]">{initialCourses.length} total</span>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        {initialCourses.map((course) => (
                            <article
                                key={course.id}
                                className="rounded-2xl border border-[#212a3b]/10 bg-white p-5 shadow-soft-sm transition hover:-translate-y-0.5 hover:shadow-soft"
                            >
                                <Link href={`/courses/${course.id}`} className="group block">
                                    <div className="mb-5 flex items-center justify-between">
                                        <div className="rounded-xl bg-[#f3e4c7] p-3 text-[#663820]">
                                            <BookOpen className="size-5" />
                                        </div>
                                        <span className="rounded-full bg-[#f8f4e9] px-3 py-1 text-xs font-semibold text-[#3d485e]">
                                            {course.materials.length} {course.materials.length === 1 ? "material" : "materials"}
                                        </span>
                                    </div>
                                    <h3 className="text-xl font-semibold group-hover:text-[#663820]">{course.name}</h3>
                                    <p className="mt-2 flex items-center gap-2 text-sm text-[#3d485e]">
                                        <FileText className="size-4" />
                                        {course.materials.length === 0
                                            ? "No materials added yet"
                                            : `${course.materials.length} ${course.materials.length === 1 ? "material" : "materials"}`}
                                    </p>
                                </Link>
                                {editingCourseId === course.id ? (
                                    <form onSubmit={(event) => saveCourseName(event, course.id)} className="mt-4 flex flex-col gap-2 sm:flex-row">
                                        <label htmlFor={`course-name-${course.id}`} className="sr-only">Edit course name</label>
                                        <input
                                            id={`course-name-${course.id}`}
                                            value={editedCourseName}
                                            onChange={(event) => setEditedCourseName(event.target.value)}
                                            maxLength={100}
                                            className="min-w-0 flex-1 rounded-lg border border-[#212a3b]/15 px-3 py-2 text-sm"
                                            required
                                            autoFocus
                                        />
                                        <button type="submit" disabled={busyCourseId !== null} className="rounded-lg bg-[#663820] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                                            {busyCourseId === course.id ? "Saving..." : "Save"}
                                        </button>
                                        <button type="button" onClick={() => setEditingCourseId(null)} disabled={busyCourseId !== null} className="rounded-lg border border-[#212a3b]/15 px-3 py-2 text-sm font-semibold disabled:opacity-50">
                                            Cancel
                                        </button>
                                    </form>
                                ) : (
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setCourseActionError("");
                                                setEditingCourseId(course.id);
                                                setEditedCourseName(course.name);
                                            }}
                                            disabled={busyCourseId !== null}
                                            aria-label={`Edit name of ${course.name}`}
                                            title="Edit name"
                                            className="icon-btn border border-[var(--navy-border)] disabled:opacity-50"
                                        >
                                            <Pencil className="size-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => deleteCourse(course.id, course.name)}
                                            disabled={busyCourseId !== null}
                                            aria-label={`Delete ${course.name}`}
                                            title="Delete course"
                                            className="icon-btn icon-btn-danger border border-[var(--navy-border)] disabled:opacity-50"
                                        >
                                            {busyCourseId === course.id ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                                        </button>
                                    </div>
                                )}
                            </article>
                        ))}
                    </div>
                    {courseActionError && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{courseActionError}</p>}
                </section>
            )}
        </div>
    );
}
