'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteBook } from "@/lib/actions/book.actions";
import { useDialogs } from "@/components/dialogs/DialogProvider";

type DeleteBookButtonProps = {
    slug: string;
    title: string;
    compact?: boolean;
    redirectAfterDelete?: boolean;
};

const DeleteBookButton = ({
    slug,
    title,
    compact = false,
    redirectAfterDelete = false,
}: DeleteBookButtonProps) => {
    const [isDeleting, setIsDeleting] = useState(false);
    const router = useRouter();
    const { confirmDialog } = useDialogs();
    const handleDelete = async () => {
        const confirmed = await confirmDialog({
            title: "Delete this book?",
            description: `Are you sure you want to delete "${title}" from your collection? This action cannot be undone.`,
            confirmText: "Delete book",
            variant: "danger",
        });
        if (!confirmed) return;

        setIsDeleting(true);

        try {
            const result = await deleteBook(slug);

            if (!result.success) {
                toast.error(result.error);
                return;
            }

            if (result.warning) {
                toast.warning(result.warning);
            } else {
                toast.success(`"${title}" was deleted.`);
            }

            if (redirectAfterDelete) {
                router.replace("/");
            } else {
                router.refresh();
            }
        } catch (error) {
            console.error("Failed to delete book:", error);
            toast.error("Failed to delete the book. Please try again.");
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            aria-label={`Delete ${title}`}
            title={`Delete ${title}`}
            className={compact
                ? "absolute right-2 top-2 z-10 inline-flex size-9 items-center justify-center rounded-full bg-white/95 text-red-700 shadow transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                : "inline-flex items-center justify-center gap-2 rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"}
        >
            <Trash2 className="size-4" aria-hidden="true" />
            {!compact && (isDeleting ? "Deleting..." : "Delete book")}
        </button>
    );
};

export default DeleteBookButton;
