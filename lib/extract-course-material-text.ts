import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import * as XLSX from "@e965/xlsx";
import type { CourseMaterialExtension } from "@/lib/course-material-types";

type SpreadsheetCell = XLSX.CellObject;

type SpreadsheetEntry = {
    address: string;
    row: number;
    column: number;
    cell: SpreadsheetCell;
};

function hasCellContent(cell: SpreadsheetCell | undefined): cell is SpreadsheetCell {
    return Boolean(
        cell &&
            (cell.f !== undefined ||
                (cell.v !== undefined && cell.v !== null && cell.v !== "")),
    );
}

function getCellDisplayValue(cell: SpreadsheetCell): string {
    let value = "";
    if (cell.v !== undefined && cell.v !== null) {
        if (typeof cell.w === "string" && cell.w.length > 0) {
            value = cell.w;
        } else {
            try {
                value = XLSX.utils.format_cell(cell, cell.v);
            } catch {
                value = cell.v instanceof Date ? cell.v.toISOString() : String(cell.v);
            }
        }
    }

    if (cell.f !== undefined) {
        const formula = `formula: =${cell.f}`;
        return value
            ? `${value} [${formula}]`
            : `[${formula}; cached value unavailable]`;
    }

    return value;
}

function toMarkdownCell(value: string): string {
    return value.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
}

function columnName(column: number): string {
    return XLSX.utils.encode_col(column);
}

function getSpreadsheetEntries(sheet: XLSX.WorkSheet): SpreadsheetEntry[] {
    return Object.entries(sheet)
        .filter(([address]) => !address.startsWith("!"))
        .flatMap(([address, value]) => {
            const cell = value as SpreadsheetCell | undefined;
            if (!hasCellContent(cell)) return [];

            try {
                const { r: row, c: column } = XLSX.utils.decode_cell(address);
                return [{ address, row, column, cell }];
            } catch {
                return [];
            }
        })
        .sort((left, right) => left.row - right.row || left.column - right.column);
}

function getRowGroups(entries: SpreadsheetEntry[]): SpreadsheetEntry[][] {
    const groups: SpreadsheetEntry[][] = [];
    for (const entry of entries) {
        const current = groups.at(-1);
        if (!current || entry.row > current[current.length - 1].row + 1) {
            groups.push([entry]);
        } else {
            current.push(entry);
        }
    }
    return groups;
}

function getColumnGroups(entries: SpreadsheetEntry[]): number[][] {
    const columns = [...new Set(entries.map(({ column }) => column))].sort((a, b) => a - b);
    const groups: number[][] = [];

    for (const column of columns) {
        const current = groups.at(-1);
        if (!current || column > current[current.length - 1] + 1) {
            groups.push([column]);
        } else {
            current.push(column);
        }
    }
    return groups;
}

function isMergedHeadingRow(
    row: number,
    entries: SpreadsheetEntry[],
    merges: XLSX.Range[],
): boolean {
    return merges.some(
        (merge) =>
            merge.s.r === row &&
            merge.e.r === row &&
            merge.e.c > merge.s.c &&
            entries.length === 1 &&
            entries[0].column === merge.s.c,
    );
}

function getMergedHeadingLine(
    entry: SpreadsheetEntry,
    merges: XLSX.Range[],
): string | undefined {
    const merge = merges.find(
        (candidate) =>
            candidate.s.r === entry.row &&
            candidate.s.c === entry.column &&
            candidate.e.r === entry.row &&
            candidate.e.c > candidate.s.c,
    );
    return merge
        ? `Section: ${getCellDisplayValue(entry.cell)} (merged heading ${entry.address}:${XLSX.utils.encode_cell(merge.e)})`
        : undefined;
}

function getTableText(
    entries: SpreadsheetEntry[],
    columnGroup: number[],
    merges: XLSX.Range[],
): string {
    const regionEntries = entries.filter(({ column }) => columnGroup.includes(column));
    if (regionEntries.length === 0) return "";

    const regionRows = [...new Set(regionEntries.map(({ row }) => row))].sort((a, b) => a - b);
    const regionRowEntries = new Map<number, SpreadsheetEntry[]>();
    for (const entry of regionEntries) {
        const rowEntries = regionRowEntries.get(entry.row) ?? [];
        rowEntries.push(entry);
        regionRowEntries.set(entry.row, rowEntries);
    }

    const sectionLines = regionEntries
        .filter((entry) => entry.row <= regionRows[0])
        .flatMap((entry) => {
            const line = getMergedHeadingLine(entry, merges);
            return line ? [line] : [];
        });

    const dataRows = regionRows.filter(
        (row) => !isMergedHeadingRow(row, regionRowEntries.get(row) ?? [], merges),
    );
    if (dataRows.length === 0) return sectionLines.join("\n");

    const headerRow = dataRows.find((row, index) => {
        if (index === dataRows.length - 1) return false;
        const cells = regionRowEntries.get(row) ?? [];
        const textualCells = cells.filter(
            ({ cell }) => !cell.f && (cell.t === "s" || typeof cell.v === "string"),
        );
        return textualCells.length >= Math.min(2, columnGroup.length);
    });

    const headerEntries = headerRow === undefined
        ? []
        : regionRowEntries.get(headerRow) ?? [];
    const headers = columnGroup.map((column) => {
        const header = headerEntries.find((entry) => entry.column === column);
        return toMarkdownCell(header ? getCellDisplayValue(header.cell) : "") || `Column ${columnName(column)}`;
    });
    const outputRows = dataRows.filter((row) => row !== headerRow);
    const tableLines = [
        `Table (${columnName(columnGroup[0])}${regionRows[0] + 1}:${columnName(columnGroup[columnGroup.length - 1])}${regionRows[regionRows.length - 1] + 1}):`,
        `| ${headers.join(" | ")} |`,
        `| ${headers.map(() => "---").join(" | ")} |`,
        ...outputRows.map((row) => {
            const cells = regionRowEntries.get(row) ?? [];
            return `| ${columnGroup
                .map((column) => {
                    const entry = cells.find((item) => item.column === column);
                    return toMarkdownCell(entry ? getCellDisplayValue(entry.cell) : "");
                })
                .join(" | ")} |`;
        }),
    ];

    return [...sectionLines, ...tableLines].join("\n");
}

function extractSpreadsheetText(
    file: Buffer,
    extension: ".xls" | ".xlsx",
): string {
    const signature = extension === ".xls"
        ? Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
        : Buffer.from("PK");
    if (!file.subarray(0, signature.length).equals(signature)) {
        throw new Error("This is not a valid Excel workbook.");
    }

    const workbook = XLSX.read(file, {
        type: "buffer",
        cellDates: true,
        cellNF: true,
        cellStyles: true,
        cellText: true,
    });

    let hasAnyCellContent = false;
    const sheetsText = workbook.SheetNames.map((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const entries = getSpreadsheetEntries(sheet);
        hasAnyCellContent ||= entries.length > 0;
        if (entries.length === 0) return `Worksheet: ${sheetName}\n(empty sheet)`;

        const merges = sheet["!merges"] ?? [];
        const groups = getRowGroups(entries);
        const regions = groups.flatMap((group) => {
            const headingRows = new Set(
                group
                    .filter((entry) =>
                        isMergedHeadingRow(
                            entry.row,
                            group.filter((item) => item.row === entry.row),
                            merges,
                        ),
                    )
                    .map(({ row }) => row),
            );
            const contentEntries = group.filter(({ row }) => !headingRows.has(row));
            const tables = getColumnGroups(contentEntries).map((columns) =>
                getTableText(group, columns, merges),
            );
            if (tables.length > 0) return tables;
            return group.flatMap((entry) => {
                const line = getMergedHeadingLine(entry, merges);
                return line ? [line] : [];
            });
        }).filter(Boolean);

        return `Worksheet: ${sheetName}\n${regions.length > 0 ? regions.join("\n\n") : "(empty sheet)"}`;
    });

    if (!hasAnyCellContent) {
        throw new Error("No readable text was found in this file.");
    }

    return sheetsText.join("\n\n");
}

export async function extractCourseMaterialText(
    file: Buffer,
    extension: Exclude<CourseMaterialExtension, ".pdf">,
): Promise<string> {
    let text: string;

    switch (extension) {
        case ".docx": {
            const result = await mammoth.extractRawText({ buffer: file });
            text = result.value;
            break;
        }
        case ".doc": {
            const document = await new WordExtractor().extract(file);
            text = document.getBody();
            break;
        }
        case ".xlsx":
        case ".xls": {
            text = extractSpreadsheetText(file, extension);
            break;
        }
    }

    const cleanText = text.trim();
    if (!cleanText) {
        throw new Error("No readable text was found in this file.");
    }

    return cleanText;
}
