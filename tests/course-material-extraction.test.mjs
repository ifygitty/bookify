import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "@e965/xlsx";
import { extractCourseMaterialText } from "../lib/extract-course-material-text.ts";

function createWorkbookBuffer() {
    const workbook = XLSX.utils.book_new();

    const costing = XLSX.utils.aoa_to_sheet([
        ["Inventory costing", null, null, null, "Tax rates"],
        ["Item", "Quantity", "Unit cost", null, "Tax", "Rate"],
        ["Widget", 2, 1250.5, null, "VAT", 0.075],
        ["Total", null, { t: "n", f: "B3*C3", v: 2501, z: "$#,##0.00" }, null, "Sales tax", 0.1],
        [],
        [],
        ["Account", "Debit", "Credit"],
        ["Cash", 500, 0],
    ]);
    costing["!merges"] = [
        XLSX.utils.decode_range("A1:C1"),
        XLSX.utils.decode_range("E1:F1"),
    ];
    costing.F3.z = "0.0%";
    costing.F4.z = "0.0%";
    costing.C3.z = "$#,##0.00";
    costing.B8.z = "$#,##0.00;($#,##0.00)";
    costing.C8.z = "$#,##0.00;($#,##0.00)";
    XLSX.utils.book_append_sheet(workbook, costing, "Costing");

    const revision = XLSX.utils.aoa_to_sheet([
        ["Date", "Balance"],
        [new Date(Date.UTC(2026, 0, 5)), -35.5],
    ]);
    revision.A2.z = "yyyy-mm-dd";
    revision.B2.z = "$#,##0.00;($#,##0.00)";
    XLSX.utils.book_append_sheet(workbook, revision, "Revision");
    XLSX.utils.book_append_sheet(workbook, {}, "Empty");

    return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

test("extracts worksheets as separate readable tables with headings and formats", async () => {
    const text = await extractCourseMaterialText(createWorkbookBuffer(), ".xlsx");

    assert.match(text, /Worksheet: Costing/);
    assert.match(text, /Section: Inventory costing \(merged heading A1:C1\)/);
    assert.match(text, /\| Item \| Quantity \| Unit cost \|/);
    assert.match(text, /\| Widget \| 2 \| \$1,250\.50 \|/);
    assert.match(text, /\$2,501\.00 \[formula: =B3\*C3\]/);
    assert.match(text, /Section: Tax rates \(merged heading E1:F1\)/);
    assert.match(text, /\| Tax \| Rate \|/);
    assert.match(text, /\| VAT \| 7\.5% \|/);
    assert.match(text, /\| Account \| Debit \| Credit \|/);
    assert.match(text, /Worksheet: Revision/);
    assert.match(text, /2026-01-05/);
    assert.match(text, /\(\$35\.50\)/);
    assert.match(text, /Worksheet: Empty\n\(empty sheet\)/);
});

test("retains formulas when no cached result is present and reports empty workbooks", async () => {
    const workbook = XLSX.read(createWorkbookBuffer(), {
        type: "buffer",
        cellDates: true,
        cellNF: true,
        cellStyles: true,
        cellText: true,
    });
    workbook.Sheets.Costing.D3 = { t: "n", f: "1+1" };
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const text = await extractCourseMaterialText(buffer, ".xlsx");

    assert.match(text, /formula: =1\+1; cached value unavailable/);

    await assert.rejects(
        (async () => {
            const emptyWorkbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(emptyWorkbook, {}, "Empty");
            return extractCourseMaterialText(
                XLSX.write(emptyWorkbook, { type: "buffer", bookType: "xlsx" }),
                ".xlsx",
            );
        })(),
        /No readable text was found/,
    );
});

test("continues extracting legacy XLS spreadsheets", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([["Topic", "Hours"], ["Revision", 3]]),
        "Plan",
    );
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xls" });

    const text = await extractCourseMaterialText(buffer, ".xls");
    assert.match(text, /\| Topic \| Hours \|/);
    assert.match(text, /\| Revision \| 3 \|/);
});

test("reports unreadable spreadsheet input with the existing extraction error", async () => {
    await assert.rejects(
        extractCourseMaterialText(Buffer.from("not an Excel workbook"), ".xlsx"),
        /not a valid Excel workbook/,
    );
});
