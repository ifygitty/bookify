import { auth } from "@clerk/nextjs/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getBlobReadWriteToken } from "@/lib/blob";
import { COURSE_MATERIAL_MIME_TYPES, getCourseMaterialExtension } from "@/lib/course-material-types";
import { MAX_FILE_SIZE } from "@/lib/constants";

export async function POST(request: Request) {
    try {
        const body = (await request.json()) as HandleUploadBody;
        const response = await handleUpload({
            token: getBlobReadWriteToken(),
            body,
            request,
            onBeforeGenerateToken: async (pathname) => {
                const { userId } = await auth();
                if (!userId) {
                    throw new Error("Unauthorized: User not authenticated");
                }

                const extension = getCourseMaterialExtension(pathname);
                const materialMimeType =
                    extension && extension !== ".pdf" ? COURSE_MATERIAL_MIME_TYPES[extension] : null;

                return {
                    allowedContentTypes: [
                        COURSE_MATERIAL_MIME_TYPES[".pdf"],
                        ...(materialMimeType ? [materialMimeType] : []),
                    ],
                    addRandomSuffix: true,
                    maximumSizeInBytes: MAX_FILE_SIZE,
                };
            },
        });

        return NextResponse.json(response);
    } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown error occurred";
        const status = message.includes("Unauthorized") ? 401 : 500;
        console.error("Course material upload token request failed:", error);
        return NextResponse.json(
            { error: status === 401 ? "Unauthorized" : "Upload failed" },
            { status },
        );
    }
}
