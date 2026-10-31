export const COURSE_MATERIAL_MIME_TYPES = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;

export type CourseMaterialExtension = keyof typeof COURSE_MATERIAL_MIME_TYPES;

export function getCourseMaterialExtension(filename: string): CourseMaterialExtension | undefined {
    const extension = filename.slice(filename.lastIndexOf(".")).toLowerCase();
    return extension in COURSE_MATERIAL_MIME_TYPES
        ? (extension as CourseMaterialExtension)
        : undefined;
}
