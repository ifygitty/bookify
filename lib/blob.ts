export function getBlobReadWriteToken(): string | undefined {
    return (
        process.env.BOOKIFY_PRIVATE_READ_WRITE_TOKEN ??
        process.env.BLOB_READ_WRITE_TOKEN ??
        process.env.VERCEL_BLOB_READ_WRITE_TOKEN
    );
}
