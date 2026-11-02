"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { BookOpen, FileText, Plus, LoaderCircle, Pencil, Trash2 } from "lucide-react";
import { useDialogs } from "@/components/dialogs/DialogProvider";

export type CourseListItem = {
    id: string;
    name: string;
    slug: string;
    materials: { id: string; title: string; fileSize: number }[];
};

export default function CourseLibrary({ initialCourses }: { initialCourses: CourseListItem[] }) {
    const router = useRouter();
    const { confirmDialog } = useDialogs();
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
        if (busyCourseId) return;

        setCourseActionError("");
        const deleted = await confirmDialog({
            title: "Delete this course?",
            description: `Are you sure you want to delete ${courseName} and its associated study materials and chat history? This action cannot be undone.`,
            confirmText: "Delete course",
            variant: "danger",
            onConfirm: async () => {
                setBusyCourseId(courseId);
                try {
                    const response = await fetch(`/api/courses/${courseId}`, { method: "DELETE" });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error || "Could not delete the course.");
                } catch (requestError) {
                    console.error("Course deletion request failed:", requestError);
                    throw requestError instanceof Error ? requestError : new Error("Could not delete the course.");
                } finally {
                    setBusyCourseId(null);
                }
            },
        });
        if (deleted) router.refresh();
    };

    return (
        <div className="space-y-8">
            <section id="create-course" className="glass glass-green border-light scroll-mt-28 rounded-3xl p-5 sm:p-8">
                <div className="mb-5 flex items-start gap-4">
                    <div className="icon-tile size-12 shrink-0">
                        <Plus className="size-5" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="mentor-title text-xl font-bold">Create a course or subject</h2>
                        <p className="mt-1 text-sm text-[var(--ink-soft)]">For example, ACC 101 or Introduction to Economics.</p>
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
                        className="mentor-input flex-1"
                        required
                    />
                    <button type="submit" disabled={isCreating || !name.trim()} className="mentor-cta disabled:cursor-not-allowed disabled:opacity-60">
                        {isCreating ? <LoaderCircle className="size-5 animate-spin" /> : <Plus className="size-5" />}
                        Create course
                    </button>
                </form>
                {error && <p role="alert" className="mt-3 text-sm font-medium text-red-500">{error}</p>}
            </section>

            {initialCourses.length > 0 && (
                <section>
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <h2 className="mentor-title text-2xl font-bold">Your courses</h2>
                        <span className="rounded-full border border-[var(--glass-border)] px-3 py-1 text-xs font-semibold text-[var(--ink-soft)]">{initialCourses.length} total</span>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        {initialCourses.map((course) => (
                            <article
                                key={course.id}
                                className="glass glass-green border-light course-card min-w-0 rounded-3xl p-5"
                            >
                                <Link href={`/courses/${course.id}`} className="group block">
                                    <div className="mb-5 flex items-center justify-between gap-3">
                                        <div className="icon-tile size-12 shrink-0">
                                            <BookOpen className="size-5" />
                                        </div>
                                        <span className="rounded-full border border-[var(--accent-gold)]/40 bg-[var(--accent-gold)]/10 px-3 py-1 text-xs font-semibold text-[var(--accent-gold)]">
                                            {course.materials.length} {course.materials.length === 1 ? "material" : "materials"}
                                        </span>
                                    </div>
                                    <h3 className="mentor-title break-words text-xl font-bold text-[var(--ink)] transition-colors group-hover:text-[var(--gold)]">{course.name}</h3>
                                    <p className="mt-2 flex items-center gap-2 text-sm text-[var(--ink-soft)]">
                                        <FileText className="size-4 shrink-0" />
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
                                            className="mentor-input flex-1 !min-h-11 !text-sm"
                                            required
                                            autoFocus
                                        />
                                        <button type="submit" disabled={busyCourseId !== null} className="mentor-cta !min-h-11 !rounded-xl !px-4 !py-2 !text-sm disabled:opacity-50">
                                            {busyCourseId === course.id ? "Saving..." : "Save"}
                                        </button>
                                        <button type="button" onClick={() => setEditingCourseId(null)} disabled={busyCourseId !== null} className="min-h-11 rounded-xl border border-[var(--glass-border)] px-4 py-2 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--gold)]/10 disabled:opacity-50">
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
                                            className="card-action"
                                        >
                                            <Pencil className="size-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => deleteCourse(course.id, course.name)}
                                            disabled={busyCourseId !== null}
                                            aria-label={`Delete ${course.name}`}
                                            title="Delete course"
                                            className="card-action card-action-danger"
                                        >
                                            {busyCourseId === course.id ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                                        </button>
                                    </div>
                                )}
                            </article>
                        ))}
                    </div>
                    {courseActionError && <p role="alert" className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">{courseActionError}</p>}
                </section>
            )}
        </div>
    );
}
