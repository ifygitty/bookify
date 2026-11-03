import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { del, get } from "@vercel/blob";
import { Types } from "mongoose";
import { toFile } from "openai/uploads";
import { connectToDatabase } from "@/database/mongoose";
import Course from "@/database/models/course.model";
import { getOpenAIClient } from "@/lib/openai";
import { MAX_FILE_SIZE } from "@/lib/constants";
import { getBlobReadWriteToken } from "@/lib/blob";
import { COURSE_MATERIAL_MIME_TYPES, getCourseMaterialExtension } from "@/lib/course-material-types";
import { extractCourseMaterialText } from "@/lib/extract-course-material-text";
import { extractPdfVisualContent } from "@/lib/pdf-visual-content";

export const maxDuration = 180;

function isNotFoundError(error: unknown): boolean {
    return typeof error === "object" && error !== null && "status" in error && error.status === 404;
}

async function removeOpenAIFile(
    openai: ReturnType<typeof getOpenAIClient>,
    fileId: string,
    vectorStoreId?: string,
) {
    if (vectorStoreId) {
        try {
            await openai.vectorStores.files.delete(fileId, { vector_store_id: vectorStoreId });
        } catch (error) {
            if (!isNotFoundError(error)) throw error;
        }
    }
    try {
        await openai.files.delete(fileId);
    } catch (error) {
        if (!isNotFoundError(error)) throw error;
    }
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ courseId: string }> },
) {
    const { userId } = await auth();

    if (!userId) {
        return NextResponse.json({ error: "Sign in to add course materials." }, { status: 401 });
    }

    const { courseId } = await params;
    if (!Types.ObjectId.isValid(courseId)) {
        return NextResponse.json({ error: "Invalid course." }, { status: 400 });
    }

    let blobPathname: string | undefined;
    let openAIFileId: string | undefined;
    let visualOpenAIFileId: string | undefined;
    let indexedVectorStoreId: string | undefined;
    let materialRecordId: Types.ObjectId | undefined;
    let materialRecordSaved = false;
    let blobCleanupFailed = false;
    let openAICleanupFailed = false;
    const blobToken = getBlobReadWriteToken();

    try {
        await connectToDatabase();
        const course = await Course.findOne({ _id: courseId, clerkId: userId });

        if (!course) {
            return NextResponse.json({ error: "Course not found." }, { status: 404 });
        }
        const body: unknown = await request.json();
        const blobPathValue =
            typeof body === "object" && body !== null && "blobPathname" in body && typeof body.blobPathname === "string"
                ? body.blobPathname
                : "";
        const titleValue =
            typeof body === "object" && body !== null && "title" in body && typeof body.title === "string"
                ? body.title
                : "";
        const filename =
            typeof body === "object" && body !== null && "filename" in body && typeof body.filename === "string"
                ? body.filename
                : "";
        const extension = getCourseMaterialExtension(filename);
        if (!blobPathValue || !blobPathValue.startsWith(`${course._id.toString()}/`)) {
            return NextResponse.json({ error: "Invalid uploaded material location." }, { status: 400 });
        }
        if (!blobToken) {
            throw new Error("Vercel Blob storage is not configured.");
        }

        blobPathname = blobPathValue;
        if (!extension || filename.length > 255) {
            await del(blobPathname, { token: blobToken });
            blobPathname = undefined;
            return NextResponse.json(
                { error: "Upload a PDF, Word document, or Excel spreadsheet." },
                { status: 400 },
            );
        }

        const openai = getOpenAIClient();
        const storedBlob = await get(blobPathname, {
            access: "private",
            token: blobToken,
            useCache: false,
        });
        if (!storedBlob || storedBlob.statusCode !== 200) {
            throw new Error("Could not read the privately stored material.");
        }
        if (storedBlob.blob.size > MAX_FILE_SIZE) {
            throw new Error("Files must be smaller than 50 MB.");
        }
        const fileBytes = await new Response(storedBlob.stream).arrayBuffer();
        if (!fileBytes.byteLength || fileBytes.byteLength > MAX_FILE_SIZE) {
            throw new Error("Files must be smaller than 50 MB.");
        }
        const fileBuffer = Buffer.from(fileBytes);
        const header = fileBuffer.subarray(0, 8);
        const isValidSignature =
            extension === ".pdf"
                ? fileBuffer.subarray(0, 5).toString("ascii") === "%PDF-"
                : extension === ".doc" || extension === ".xls"
                  ? header.equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
                  : header.subarray(0, 2).toString("ascii") === "PK";
        if (!isValidSignature) {
            throw new Error("The uploaded file does not match its file extension.");
        }
        const title =
            typeof titleValue === "string" && titleValue.trim()
                ? titleValue.trim().slice(0, 150)
                : filename.replace(/\.[^.]+$/, "").slice(0, 150);
        const isPdf = extension === ".pdf";
        let contentToIndex = fileBuffer;
        let indexedFilename = filename;

        if (!isPdf) {
            try {
                const extractedText = await extractCourseMaterialText(fileBuffer, extension);
                contentToIndex = Buffer.from(extractedText, "utf8");
                indexedFilename = `${filename.replace(/\.[^.]+$/, "")}.txt`;
            } catch (error) {
                console.error("Failed to extract searchable text from course material:", error);
                throw new Error("This Office file could not be read. Check that it is valid and not password protected.");
            }
        }

        const uploadedFile = await openai.files.create({
            file: await toFile(contentToIndex, indexedFilename, {
                type: isPdf ? COURSE_MATERIAL_MIME_TYPES[".pdf"] : "text/plain",
            }),
            purpose: "assistants",
        });
        openAIFileId = uploadedFile.id;

        const materialId = new Types.ObjectId();
        materialRecordId = materialId;
        const courseVectorStoreId = course.vectorStoreId;
        indexedVectorStoreId = courseVectorStoreId;
        const indexedFile = await openai.vectorStores.files.createAndPoll(courseVectorStoreId, {
            file_id: uploadedFile.id,
            attributes: { material_id: materialId.toString() },
        });
        if (indexedFile.status !== "completed") {
            throw new Error(indexedFile.last_error?.message || "OpenAI could not index this material.");
        }

        const initialMaterial = await Course.updateOne(
            { _id: course._id, clerkId: userId },
            {
                $push: {
                    materials: {
                        _id: materialId,
                        title,
                        fileSize: fileBytes.byteLength,
                        openAIFileId: uploadedFile.id,
                        visualProcessingStatus: isPdf ? "processing" : "not-needed",
                        visualProcessingStartedAt: isPdf ? new Date() : undefined,
                        memorySummary: "",
                        originalBlobPathname: isPdf ? undefined : blobPathname,
                        originalFileName: filename,
                        contentType: COURSE_MATERIAL_MIME_TYPES[extension],
                    },
                },
            },
        );
        if (initialMaterial.modifiedCount !== 1) {
            throw new Error("Course was removed before the material could be saved.");
        }
        materialRecordSaved = true;

        let visualProcessingStatus: "not-needed" | "processing" | "complete" | "partial" | "failed" =
            isPdf ? "processing" : "not-needed";
        let visualProcessingMessage: string | undefined;
        if (isPdf) {
            try {
                const visualExtraction = await extractPdfVisualContent(fileBuffer, openai, { userClerkId: userId, courseId });
                if (visualExtraction.analyzedPageCount > 0 || visualExtraction.skippedPageCount > 0) {
                    visualProcessingStatus =
                        visualExtraction.skippedPageCount > 0 ? "partial" : "complete";
                }
                if (visualExtraction.skippedPageCount > 0) {
                    visualProcessingMessage =
                        `Visual analysis covered ${visualExtraction.analyzedPageCount} pages. ${visualExtraction.skippedPageCount} pages were not analyzed because this document reached the processing limit.`;
                }

                if (visualExtraction.text) {
                    const visualFile = await openai.files.create({
                        file: await toFile(
                            Buffer.from(visualExtraction.text, "utf8"),
                            `${title}-visual-notes.txt`,
                            { type: "text/plain" },
                        ),
                        purpose: "assistants",
                    });
                    visualOpenAIFileId = visualFile.id;

                    const visualIndex = await openai.vectorStores.files.createAndPoll(
                        courseVectorStoreId,
                        {
                            file_id: visualFile.id,
                            attributes: { material_id: materialId.toString() },
                        },
                    );
                    if (visualIndex.status !== "completed") {
                        throw new Error(
                            visualIndex.last_error?.message ||
                                "OpenAI could not index the visual notes.",
                        );
                    }
                }
            } catch (error) {
                console.error("Visual analysis of the uploaded PDF did not complete:", error);
                visualProcessingStatus = "failed";
                visualProcessingMessage =
                    "The PDF text is available, but some image-based content could not be analyzed. Handwriting, diagrams or scanned pages may be missing.";
                if (visualOpenAIFileId) {
                    try {
                        await removeOpenAIFile(openai, visualOpenAIFileId, courseVectorStoreId);
                        visualOpenAIFileId = undefined;
                    } catch (cleanupError) {
                        openAICleanupFailed = true;
                        console.error("Failed to clean up the visual-analysis file:", cleanupError);
                    }
                }
            }
        }

        if (isPdf) {
            await del(blobPathname, { token: blobToken });
            blobPathname = undefined;
        }

        const materialFields = {
            "materials.$.visualProcessingStatus": visualProcessingStatus,
            "materials.$.visualProcessingMessage": visualProcessingMessage,
        };
        const materialUpdate = visualOpenAIFileId
            ? {
                  $set: {
                      ...materialFields,
                      "materials.$.visualOpenAIFileId": visualOpenAIFileId,
                  },
              }
            : {
                  $set: materialFields,
                  $unset: { "materials.$.visualOpenAIFileId": "" },
              };
        const updatedCourse = await Course.updateOne(
            {
                _id: course._id,
                clerkId: userId,
                "materials._id": materialId,
            },
            materialUpdate,
        );

        if (updatedCourse.matchedCount !== 1) {
            throw new Error("Course was removed before the material could be saved.");
        }
        blobPathname = undefined;

        return NextResponse.json(
            {
                material: {
                    id: materialId.toString(),
                    title,
                    fileSize: fileBytes.byteLength,
                    visualProcessingStatus,
                    visualProcessingMessage,
                },
            },
            { status: 201 },
        );
    } catch (error) {
        console.error("Failed to add course material:", error);

        if (materialRecordSaved && materialRecordId) {
            try {
                await Course.updateOne(
                    { _id: courseId, clerkId: userId },
                    { $pull: { materials: { _id: materialRecordId } } },
                );
            } catch (cleanupError) {
                console.error("Failed to remove the pending material record after upload failure:", cleanupError);
            }
        }

        if (openAIFileId) {
            try {
                await removeOpenAIFile(getOpenAIClient(), openAIFileId, indexedVectorStoreId);
            } catch (cleanupError) {
                openAICleanupFailed = true;
                console.error("Failed to clean up the OpenAI file after upload failure:", cleanupError);
            }
        }

        if (visualOpenAIFileId) {
            try {
                await removeOpenAIFile(getOpenAIClient(), visualOpenAIFileId, indexedVectorStoreId);
            } catch (cleanupError) {
                openAICleanupFailed = true;
                console.error("Failed to clean up the visual-analysis file:", cleanupError);
            }
        }
        if (blobPathname && blobToken) {
            try {
                await del(blobPathname, { token: blobToken });
            } catch (cleanupError) {
                blobCleanupFailed = true;
                console.error("Failed to clean up the uploaded course material after indexing failure:", cleanupError);
            }
        }

        const isConfigError =
            error instanceof Error &&
            (error.message.includes("OPENAI_API_KEY") ||
                error.message.includes("Blob storage is not configured"));
        const isConflict = error instanceof Error && error.message.includes("maximum number");
        const isInvalidMaterial =
            error instanceof Error &&
            (error.message.includes("smaller than 50 MB") ||
                error.message.includes("does not match its file extension") ||
                error.message.includes("could not be read") ||
                error.message.includes("No readable text"));
        const isOpenAIRateLimit =
            error instanceof Error && "status" in error && error.status === 429;
        const status = isConfigError
            ? 503
            : isConflict
              ? 409
              : isInvalidMaterial
                ? 400
                : isOpenAIRateLimit
                  ? 429
                  : 500;
        const message = blobCleanupFailed
            ? "The upload failed, and the course material could not be cleaned up. Please contact support before retrying."
            : openAICleanupFailed
              ? "The upload failed, and OpenAI could not remove the temporary indexed file. Please contact support before retrying."
              : isConfigError
                ? error.message
                : isConflict
                  ? error.message
                  : isInvalidMaterial
                    ? error.message
                    : isOpenAIRateLimit
                      ? "OpenAI rejected the upload. Check your API billing and usage limits."
                      : "Could not process this study material. Check that it is readable and try again.";
        return NextResponse.json({ error: message }, { status });
    }
}
