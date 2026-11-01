type DecorProps = { className?: string };

export function ConcentricCircles({ className = "" }: DecorProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 400 400" fill="none" className={`deco ${className}`}>
            <circle cx="200" cy="200" r="195" stroke="var(--gold)" strokeOpacity="0.28" strokeWidth="1" />
            <circle cx="200" cy="200" r="150" stroke="var(--gold)" strokeOpacity="0.2" strokeWidth="1" />
            <circle cx="200" cy="200" r="105" stroke="var(--accent-gold)" strokeOpacity="0.4" strokeWidth="1" />
            <circle cx="200" cy="200" r="60" stroke="var(--gold)" strokeOpacity="0.16" strokeWidth="1" />
        </svg>
    );
}

export function CagePattern({ className = "" }: DecorProps) {
    const horizontal = Array.from({ length: 12 }, (_, i) => i * 26);
    const vertical = Array.from({ length: 12 }, (_, i) => i * 36);
    return (
        <svg aria-hidden="true" viewBox="0 0 400 300" fill="none" preserveAspectRatio="xMidYMid slice" className={`deco ${className}`}>
            <g stroke="var(--gold)" strokeOpacity="0.22" strokeWidth="0.8">
                {horizontal.map((y) => (
                    <path key={`h${y}`} d={`M0 ${y} C 130 ${y - 60}, 270 ${y + 60}, 400 ${y}`} />
                ))}
                {vertical.map((x) => (
                    <path key={`v${x}`} d={`M${x} 0 C ${x - 50} 100, ${x + 50} 200, ${x} 300`} />
                ))}
            </g>
        </svg>
    );
}

export function FlowingCurves({ className = "" }: DecorProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 1200 220" fill="none" preserveAspectRatio="none" className={`deco ${className}`}>
            {[0, 1, 2, 3, 4].map((i) => (
                <path
                    key={i}
                    d={`M0 ${110 + i * 8} C 200 ${20 + i * 14}, 400 ${210 - i * 12}, 600 ${110 + i * 6} S 1000 ${10 + i * 18}, 1200 ${100 + i * 8}`}
                    stroke={i === 2 ? "var(--accent-gold)" : "var(--gold)"}
                    strokeOpacity={i === 2 ? 0.45 : 0.2}
                    strokeWidth="1"
                />
            ))}
        </svg>
    );
}

export function OrbitalRings({ className = "" }: DecorProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 400 400" fill="none" className={`deco ${className}`}>
            <g className="deco-spin" style={{ transformOrigin: "200px 200px" }}>
                <ellipse cx="200" cy="200" rx="190" ry="70" transform="rotate(-24 200 200)" stroke="var(--gold)" strokeOpacity="0.3" />
                <ellipse cx="200" cy="200" rx="150" ry="150" stroke="var(--gold)" strokeOpacity="0.16" />
                <ellipse cx="200" cy="200" rx="170" ry="50" transform="rotate(38 200 200)" stroke="var(--accent-gold)" strokeOpacity="0.35" />
                <circle cx="33" cy="127" r="4" fill="var(--gold)" />
                <circle cx="352" cy="262" r="3.5" fill="var(--accent-gold)" />
                <circle cx="200" cy="50" r="3" fill="var(--gold)" fillOpacity="0.7" />
            </g>
        </svg>
    );
}

export function GlowOrb({ className = "", gold = false }: DecorProps & { gold?: boolean }) {
    return <div aria-hidden="true" className={`deco deco-orb ${gold ? "deco-orb-gold" : ""} ${className}`} />;
}
