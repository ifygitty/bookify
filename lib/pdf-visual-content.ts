import { Canvas } from "@napi-rs/canvas";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type OpenAI from "openai";

const MAX_VISUAL_PAGES = 15;
const MAX_PDF_PAGES_TO_SCAN = 300;
const MAX_PAGE_IMAGE_EDGE = 1_800;
const PAGE_BATCH_SIZE = 3;
const NO_ADDITIONAL_VISUAL_CONTENT = "NO_ADDITIONAL_VISUAL_CONTENT";

export type PdfVisualExtraction = {
    pageCount: number;
    analyzedPageCount: number;
    skippedPageCount: number;
    text: string;
};

type CandidatePage = {
    pageNumber: number;
    textLayer: string;
    image: Buffer;
};

type PdfDocument = Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;
type PdfPage = Awaited<ReturnType<PdfDocument["getPage"]>>;

function getTextLayer(items: unknown[]): string {
    return items
        .flatMap((item) =>
            typeof item === "object" &&
            item !== null &&
            "str" in item &&
            typeof item.str === "string"
                ? [item.str]
                : [],
        )
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
}

function hasMeaningfulVisuals(
    operatorCodes: number[],
    textLength: number,
): boolean {
    const imageOperators = new Set<number>([
        pdfjs.OPS.paintImageXObject,
        pdfjs.OPS.paintInlineImageXObject,
        pdfjs.OPS.paintImageMaskXObject,
    ]);
    if (operatorCodes.some((code) => imageOperators.has(code))) return true;

    const vectorDrawingOperators = new Set<number>([
        pdfjs.OPS.constructPath,
        pdfjs.OPS.stroke,
        pdfjs.OPS.fill,
        pdfjs.OPS.eoFill,
        pdfjs.OPS.shadingFill,
    ]);
    const drawingCount = operatorCodes.reduce(
        (count, code) => count + Number(vectorDrawingOperators.has(code)),
        0,
    );
    return drawingCount >= 30 && textLength < 1_500;
}

async function renderPage(page: PdfPage): Promise<Buffer> {
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(1.8, MAX_PAGE_IMAGE_EDGE / Math.max(baseViewport.width, baseViewport.height));
    const viewport = page.getViewport({ scale });
    const canvas = new Canvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    const task = page.render({
        canvas: canvas as unknown as HTMLCanvasElement,
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport,
    });

    await task.promise;
    const image = canvas.toBuffer("image/jpeg", 78);
    canvas.width = 0;
    canvas.height = 0;
    return image;
}

async function analyzePageBatch(
    openai: OpenAI,
    pages: CandidatePage[],
): Promise<string> {
    const content = pages.flatMap((page) => [
        {
            type: "input_text" as const,
            text: [
                `PDF page ${page.pageNumber}.`,
                page.textLayer
                    ? `Selectable text already extracted from this page (avoid repeating it): ${page.textLayer.slice(0, 3_000)}`
                    : "No useful selectable text was extracted from this page; transcribe legible text from the image.",
            ].join("\n"),
        },
        {
            type: "input_image" as const,
            image_url: `data:image/jpeg;base64,${page.image.toString("base64")}`,
            detail: "high" as const,
        },
    ]);

    const response = await openai.responses.create({
        model: "gpt-4.1-mini",
        input: [
            {
                role: "user",
                content: [
                    {
                        type: "input_text",
                        text: [
                            "Analyze these academic PDF page images for information not already captured by the selectable text.",
                            "For each page, start with the exact heading `Page N — visual notes` using its supplied page number.",
                            "Transcribe legible handwriting, printed text embedded in images, math and accounting workings; describe diagrams, tables, charts and labelled illustrations, preserving relationships and values.",
                            "Do not repeat selectable text unless needed to explain a visual relationship. Do not guess unclear content; mark it as unreadable or uncertain.",
                            `If a page has no useful additional visual information, write exactly ${NO_ADDITIONAL_VISUAL_CONTENT} under that page heading.`,
                        ].join(" "),
                    },
                    ...content,
                ],
            },
        ],
        max_output_tokens: 4_000,
    });

    return response.output_text.trim();
}

export async function extractPdfVisualContent(
    file: Buffer,
    openai: OpenAI,
): Promise<PdfVisualExtraction> {
    const document = await pdfjs.getDocument({
        data: Uint8Array.from(file),
        useSystemFonts: true,
        verbosity: 0,
    }).promise;

    try {
        const candidates: CandidatePage[] = [];
        let detectedCandidateCount = 0;
        const pagesToScan = Math.min(document.numPages, MAX_PDF_PAGES_TO_SCAN);
        for (let pageNumber = 1; pageNumber <= pagesToScan; pageNumber++) {
            const page = await document.getPage(pageNumber);
            const textContent = await page.getTextContent();
            const textLayer = getTextLayer(textContent.items);
            const operators = await page.getOperatorList();
            if (!hasMeaningfulVisuals(operators.fnArray, textLayer.length)) {
                page.cleanup();
                continue;
            }

            detectedCandidateCount++;
            if (candidates.length < MAX_VISUAL_PAGES) {
                candidates.push({
                    pageNumber,
                    textLayer,
                    image: await renderPage(page),
                });
            }
            page.cleanup();
        }

        const extracted: string[] = [];
        for (let offset = 0; offset < candidates.length; offset += PAGE_BATCH_SIZE) {
            const batch = candidates.slice(offset, offset + PAGE_BATCH_SIZE);
            const result = await analyzePageBatch(openai, batch);
            const usefulContent = result
                .replace(/^\s*NO_ADDITIONAL_VISUAL_CONTENT\s*$/gim, "")
                .replace(/^Page \d+ [—-] visual notes\s*$/gim, "")
                .trim();
            if (usefulContent) {
                extracted.push(
                    `Visual content from PDF pages ${batch.map((page) => page.pageNumber).join(", ")}:\n${result.replace(/^\s*NO_ADDITIONAL_VISUAL_CONTENT\s*$/gim, "[No additional visual information]")}`,
                );
            }
        }

        const cappedPageCount =
            Math.max(0, detectedCandidateCount - candidates.length) +
            Math.max(0, document.numPages - pagesToScan);
        return {
            pageCount: document.numPages,
            analyzedPageCount: candidates.length,
            skippedPageCount: cappedPageCount,
            text: extracted.join("\n\n").trim(),
        };
    } finally {
        await document.destroy();
    }
}
