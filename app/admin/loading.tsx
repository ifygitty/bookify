export default function AdminLoading() {
    return (
        <div aria-busy="true" aria-label="Loading admin data" className="grid gap-4">
            <div className="admin-skeleton" style={{ minHeight: "4rem", maxWidth: "24rem" }} />
            <div className="admin-grid">
                {Array.from({ length: 8 }, (_, index) => (
                    <div key={index} className="admin-skeleton" />
                ))}
            </div>
            <div className="admin-grid-2">
                <div className="admin-skeleton" style={{ minHeight: "15rem" }} />
                <div className="admin-skeleton" style={{ minHeight: "15rem" }} />
            </div>
        </div>
    );
}
