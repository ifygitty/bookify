import { createElement, useMemo, type ReactNode } from "react";
import "./markdown-message.css";

type Align = "left" | "center" | "right" | undefined;
type ListKind = "ul" | "num" | "alpha";
type ListItem = {
    kind: ListKind;
    start: number;
    upper: boolean;
    text: string;
    eff: number;
    children: ListItem[];
};

const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([^`\s]*).*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/;
const HR = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const LIST = /^(\s*)(?:([-*+•])|(\d{1,3})[.)]|([A-Za-z])[.)])\s+(\S.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
const NUMERIC =
    /^[(\[]?[-−–+]?\s*[$₦£€¥]?\s*[-−–+]?\d[\d,]*(?:\.\d+)?\s*%?[)\]]?$|^[-—–]$|^(?:NGN|USD|GBP|EUR|N)\s?[\d,.()]+$/;
const TOTAL_ROW = /^\**\s*(?:sub-?total|grand total|total|net\b)/i;
const CALLOUT_TAG = /^\[!([A-Za-z ]+)\]\s*(.*)$/;
const CALLOUT_LABELLED =
    /^\*{0,2}\s*(?:key\s+)?(definition|formula|(?:exam(?:ination)?\s+)?tips?|warning|common\s+mistakes?|caution|final\s+answer|answer|conclusion|takeaways?|points?|important|note|remember)\s*(?::\*{0,2}|\*{0,2}:)/i;
const INLINE =
    /(`+)([\s\S]+?)\1|\\\((.+?)\\\)|\$\$(.+?)\$\$|\$(?!\s)([^$\n]*[^$\s\n])\$(?!\d)|\*\*(?=\S)([\s\S]*?\S)\*\*|~~(?=\S)([\s\S]*?\S)~~|\*(?=[^\s*])([\s\S]*?[^\s*])\*|\[([^\]]+)\]\(([^)\s]+)\)|\\([\\`*_{}[\]()#+\-.!|$~>])/;

const SYMBOLS: Record<string, string> = {
    times: "×", div: "÷", cdot: "·", approx: "≈", neq: "≠", ne: "≠", leq: "≤", le: "≤",
    geq: "≥", ge: "≥", pm: "±", Delta: "Δ", delta: "δ", alpha: "α", beta: "β", gamma: "γ",
    mu: "μ", sigma: "σ", pi: "π", theta: "θ", lambda: "λ", rho: "ρ", sum: "Σ", infty: "∞",
    rightarrow: "→", Rightarrow: "⇒", to: "→", ldots: "…", dots: "…", cdots: "⋯",
    quad: " ", qquad: "  ", implies: "⇒",
};

const CALLOUT_LABELS: Record<string, string> = {
    definition: "Definition",
    formula: "Formula",
    tip: "Tip",
    warning: "Watch out",
    answer: "Answer",
    note: "Note",
};

function calloutKind(word: string) {
    const w = word.toLowerCase();
    if (/definition/.test(w)) return "definition";
    if (/formula/.test(w)) return "formula";
    if (/warning|mistake|caution|pitfall/.test(w)) return "warning";
    if (/answer|correct|result|conclusion/.test(w)) return "answer";
    if (/tip|remember|takeaway|point|important/.test(w)) return "tip";
    return "note";
}

function readArg(s: string, from: number): [string, number] | null {
    let i = from;
    while (s[i] === " ") i++;
    if (s[i] !== "{") return null;
    let depth = 0;
    for (let j = i; j < s.length; j++) {
        if (s[j] === "{") depth++;
        else if (s[j] === "}" && --depth === 0) return [s.slice(i + 1, j), j + 1];
    }
    return null;
}

const wrap = (s: string) => (/^[\w.,]+$/.test(s.trim()) ? s.trim() : `(${s.trim()})`);

// Converts common LaTeX into readable text; sup/sub are handled afterwards.
function simplifyTex(src: string): string {
    let s = src
        .replace(/\\(begin|end)\{[a-z*]+\}/g, "")
        .replace(/\\(?:left|right|bigg?|Bigg?)(?![a-zA-Z])\s*/g, "");
    for (let guard = 0; guard < 60; guard++) {
        const m = /\\(frac|dfrac|tfrac|sqrt|text|textbf|textit|mathrm|mathbf|operatorname|boxed)(?![a-zA-Z])/.exec(s);
        if (!m) break;
        const start = m.index;
        const first = readArg(s, start + m[0].length);
        if (!first) {
            s = s.slice(0, start) + s.slice(start + m[0].length);
            continue;
        }
        let replacement = first[0];
        let end = first[1];
        if (m[1].endsWith("frac")) {
            const second = readArg(s, first[1]);
            if (second) {
                replacement = `${wrap(first[0])}/${wrap(second[0])}`;
                end = second[1];
            }
        } else if (m[1] === "sqrt") {
            replacement = `√${wrap(first[0])}`;
        }
        s = s.slice(0, start) + replacement + s.slice(end);
    }
    return s
        .replace(/\\([A-Za-z]+)/g, (_, name: string) => SYMBOLS[name] ?? name)
        .replace(/\\[,;:! ]/g, " ")
        .replace(/\\([%$&#_{}])/g, "$1")
        .replace(/&/g, " ");
}

function texToNodes(expr: string, key: string): ReactNode[] {
    const s = simplifyTex(expr);
    const out: ReactNode[] = [];
    const re = /([\^_])(?:\{([^{}]*)\}|(\d+|[A-Za-z]|\S))/g;
    let last = 0;
    let n = 0;
    const clean = (t: string) => t.replace(/[{}]/g, "");
    for (let m = re.exec(s); m; m = re.exec(s)) {
        if (m.index > last) out.push(clean(s.slice(last, m.index)));
        out.push(createElement(m[1] === "^" ? "sup" : "sub", { key: `${key}-s${n++}` }, clean(m[2] ?? m[3] ?? "")));
        last = m.index + m[0].length;
    }
    if (last < s.length) out.push(clean(s.slice(last)));
    return out;
}

function safeHref(url: string) {
    return /^(https?:\/\/|mailto:)/i.test(url) ? url : null;
}

function renderInline(text: string, key: string): ReactNode[] {
    const out: ReactNode[] = [];
    const re = new RegExp(INLINE.source, "g");
    let last = 0;
    let n = 0;
    // An unmatched ** (for example while a reply is still being written) is never shown.
    const pushText = (t: string) => {
        const clean = t.replace(/\*\*/g, "");
        if (clean) out.push(clean);
    };
    for (let m = re.exec(text); m; m = re.exec(text)) {
        if (m.index > last) pushText(text.slice(last, m.index));
        last = m.index + m[0].length;
        const k = `${key}-${n++}`;
        if (m[2] !== undefined) {
            out.push(<code key={k} className="md-code-inline">{m[2].trim()}</code>);
        } else if (m[3] !== undefined || m[4] !== undefined) {
            out.push(<span key={k} className="md-math">{texToNodes((m[3] ?? m[4]) as string, k)}</span>);
        } else if (m[5] !== undefined) {
            if (/[\\^_={}]/.test(m[5])) {
                out.push(<span key={k} className="md-math">{texToNodes(m[5], k)}</span>);
            } else {
                pushText(m[0]);
            }
        } else if (m[6] !== undefined) {
            out.push(<strong key={k}>{renderInline(m[6], k)}</strong>);
        } else if (m[7] !== undefined) {
            out.push(<s key={k}>{renderInline(m[7], k)}</s>);
        } else if (m[8] !== undefined) {
            out.push(<em key={k}>{renderInline(m[8], k)}</em>);
        } else if (m[9] !== undefined) {
            const href = safeHref(m[10]);
            out.push(
                href ? (
                    <a key={k} href={href} target="_blank" rel="noreferrer noopener">{renderInline(m[9], k)}</a>
                ) : (
                    <span key={k}>{renderInline(m[9], k)}</span>
                ),
            );
        } else if (m[11] !== undefined) {
            out.push(m[11]);
        }
    }
    if (last < text.length) pushText(text.slice(last));
    return out;
}

function splitRow(line: string): string[] {
    let s = line.trim();
    if (s.startsWith("|")) s = s.slice(1);
    if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
    const cells: string[] = [];
    let current = "";
    for (let i = 0; i < s.length; i++) {
        if (s[i] === "\\" && s[i + 1] === "|") {
            current += "|";
            i++;
        } else if (s[i] === "|") {
            cells.push(current.trim());
            current = "";
        } else {
            current += s[i];
        }
    }
    cells.push(current.trim());
    return cells;
}

function isTableStart(lines: string[], i: number) {
    const next = lines[i + 1];
    return (
        next !== undefined &&
        lines[i].includes("|") &&
        next.includes("|") &&
        next.includes("-") &&
        TABLE_SEP.test(next)
    );
}

function startsBlock(lines: string[], i: number) {
    const line = lines[i];
    const t = line.trim();
    return (
        FENCE.test(line) ||
        HEADING.test(line) ||
        HR.test(line) ||
        t.startsWith(">") ||
        t.startsWith("$$") ||
        t.startsWith("\\[") ||
        isTableStart(lines, i)
    );
}

function renderCell(text: string, key: string): ReactNode[] {
    return text.split(/<br\s*\/?>/i).flatMap((part, idx) => [
        idx > 0 ? <br key={`${key}-br${idx}`} /> : null,
        ...renderInline(part, `${key}-${idx}`),
    ]);
}

function renderTable(head: string[], aligns: Align[], rows: string[][], key: string): ReactNode {
    const plain = (cell: string) => cell.replace(/[*`_]/g, "").trim();
    const resolved: Align[] = head.map((_, c) => {
        if (aligns[c]) return aligns[c];
        const filled = rows.filter((r) => r[c]);
        return filled.length > 0 && filled.every((r) => NUMERIC.test(plain(r[c]))) ? "right" : undefined;
    });
    const alignClass = (c: number) => (resolved[c] ? `md-${resolved[c]}` : undefined);
    return (
        <div key={key} className="md-table-wrap">
            <table>
                <thead>
                    <tr>
                        {head.map((cell, c) => (
                            <th key={c} className={alignClass(c)}>{renderCell(cell, `${key}-h${c}`)}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, r) => (
                        <tr key={r} className={TOTAL_ROW.test(row[0] ?? "") ? "md-total" : undefined}>
                            {head.map((_, c) => (
                                <td
                                    key={c}
                                    className={[alignClass(c), NUMERIC.test(plain(row[c] ?? "")) ? "md-num" : ""]
                                        .filter(Boolean)
                                        .join(" ") || undefined}
                                >
                                    {renderCell(row[c] ?? "", `${key}-${r}-${c}`)}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function renderItems(items: ListItem[], key: string): ReactNode[] {
    const groups: ListItem[][] = [];
    for (const item of items) {
        const group = groups[groups.length - 1];
        if (group && group[0].kind === item.kind && group[0].upper === item.upper) group.push(item);
        else groups.push([item]);
    }
    return groups.map((group, g) => {
        const gk = `${key}-g${g}`;
        const lis = group.map((item, idx) => (
            <li key={`${gk}-${idx}`}>
                {renderInline(item.text, `${gk}-${idx}`)}
                {item.children.length > 0 && renderItems(item.children, `${gk}-${idx}`)}
            </li>
        ));
        if (group[0].kind === "ul") return <ul key={gk}>{lis}</ul>;
        return (
            <ol
                key={gk}
                start={group[0].start}
                type={group[0].kind === "alpha" ? (group[0].upper ? "A" : "a") : undefined}
            >
                {lis}
            </ol>
        );
    });
}

function parseList(lines: string[], from: number, key: string): [ReactNode[], number] {
    const raw: { indent: number; item: ListItem }[] = [];
    let i = from;
    while (i < lines.length) {
        const line = lines[i];
        if (!line.trim()) {
            let j = i + 1;
            while (j < lines.length && !lines[j].trim()) j++;
            const nextLine = lines[j];
            if (
                nextLine !== undefined &&
                ((LIST.test(nextLine) && !HR.test(nextLine)) ||
                    (/^\s{2,}\S/.test(nextLine) && !startsBlock(lines, j)))
            ) {
                i = j;
                continue;
            }
            break;
        }
        const m = HR.test(line) ? null : LIST.exec(line);
        if (m) {
            const kind: ListKind = m[2] ? "ul" : m[3] ? "num" : "alpha";
            raw.push({
                indent: m[1].length,
                item: {
                    kind,
                    start: m[3] ? parseInt(m[3], 10) : m[4] ? m[4].toLowerCase().charCodeAt(0) - 96 : 1,
                    upper: !!m[4] && m[4] === m[4].toUpperCase(),
                    text: m[5],
                    eff: m[1].length,
                    children: [],
                },
            });
            i++;
            continue;
        }
        if (raw.length === 0 || startsBlock(lines, i)) break;
        raw[raw.length - 1].item.text += ` ${line.trim()}`;
        i++;
    }

    // A lettered item directly after a numbered item at the same indent belongs under it.
    const lastKindAt = new Map<number, string>();
    const root: ListItem[] = [];
    const stack: ListItem[] = [];
    for (const { indent, item } of raw) {
        const previous = lastKindAt.get(indent);
        const promoted = item.kind === "alpha" && (previous === "num" || previous === "alphaP");
        item.eff = promoted ? indent + 0.5 : indent;
        lastKindAt.set(indent, promoted ? "alphaP" : item.kind);
        while (stack.length > 0 && stack[stack.length - 1].eff >= item.eff) stack.pop();
        const parent = stack[stack.length - 1];
        (parent ? parent.children : root).push(item);
        stack.push(item);
    }
    return [renderItems(root, key), i];
}

function parseBlocks(lines: string[], key: string): ReactNode[] {
    const out: ReactNode[] = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();
        const k = `${key}-${out.length}`;
        if (!trimmed) {
            i++;
            continue;
        }

        const fence = FENCE.exec(line);
        if (fence) {
            const marker = fence[1];
            const body: string[] = [];
            i++;
            while (i < lines.length) {
                const t = lines[i].trim();
                if (t.length >= marker.length && /^(`+|~+)$/.test(t) && t[0] === marker[0]) break;
                body.push(lines[i]);
                i++;
            }
            i++;
            out.push(<pre key={k} className="md-pre"><code>{body.join("\n")}</code></pre>);
            continue;
        }

        const open = trimmed.startsWith("$$") ? "$$" : trimmed.startsWith("\\[") ? "\\[" : null;
        if (open) {
            const close = open === "$$" ? "$$" : "\\]";
            let body = trimmed.slice(open.length);
            const sameLine = body.indexOf(close);
            if (sameLine >= 0) {
                body = body.slice(0, sameLine);
                i++;
            } else {
                const parts = [body];
                i++;
                while (i < lines.length) {
                    const at = lines[i].indexOf(close);
                    if (at >= 0) {
                        parts.push(lines[i].slice(0, at));
                        i++;
                        break;
                    }
                    parts.push(lines[i]);
                    i++;
                }
                body = parts.join(" ");
            }
            out.push(
                <div key={k} className="md-formula">
                    {body.split(/\\\\/).filter((part) => part.trim()).map((part, idx) => (
                        <div key={idx}>{texToNodes(part.trim(), `${k}-${idx}`)}</div>
                    ))}
                </div>,
            );
            continue;
        }

        const heading = HEADING.exec(line);
        if (heading) {
            const level = heading[1].length;
            out.push(
                createElement(
                    `h${Math.min(level + 1, 6)}`,
                    { key: k, className: `md-h md-h${level}` },
                    renderInline(heading[2], k),
                ),
            );
            i++;
            continue;
        }

        if (HR.test(line)) {
            out.push(<hr key={k} className="md-hr" />);
            i++;
            continue;
        }

        if (isTableStart(lines, i)) {
            const head = splitRow(line);
            const aligns: Align[] = splitRow(lines[i + 1]).map((cell) =>
                cell.startsWith(":") && cell.endsWith(":") ? "center" : cell.endsWith(":") ? "right" : cell.startsWith(":") ? "left" : undefined,
            );
            const rows: string[][] = [];
            i += 2;
            while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
                rows.push(splitRow(lines[i]));
                i++;
            }
            out.push(renderTable(head, aligns, rows, k));
            continue;
        }

        if (trimmed.startsWith(">")) {
            const quote: string[] = [];
            while (i < lines.length && lines[i].trim().startsWith(">")) {
                quote.push(lines[i].replace(/^\s*>\s?/, ""));
                i++;
            }
            const first = quote.find((q) => q.trim()) ?? "";
            const tag = CALLOUT_TAG.exec(first.trim());
            const labelled = tag ? null : CALLOUT_LABELLED.exec(first.trim());
            if (tag) {
                const idx = quote.indexOf(first);
                const kind = calloutKind(tag[1]);
                const body = [tag[2], ...quote.slice(idx + 1)];
                const label = /^(definition|formula|tip|warning|answer|note)$/i.test(tag[1].trim())
                    ? CALLOUT_LABELS[kind]
                    : tag[1].trim().replace(/\b\w/g, (c) => c.toUpperCase());
                out.push(
                    <div key={k} className={`md-callout md-callout-${kind}`}>
                        <p className="md-callout-label">{label}</p>
                        {parseBlocks(body, k)}
                    </div>,
                );
            } else if (labelled) {
                out.push(
                    <div key={k} className={`md-callout md-callout-${calloutKind(labelled[1])}`}>
                        {parseBlocks(quote, k)}
                    </div>,
                );
            } else {
                out.push(<blockquote key={k} className="md-quote">{parseBlocks(quote, k)}</blockquote>);
            }
            continue;
        }

        if (LIST.test(line)) {
            const [nodes, next] = parseList(lines, i, k);
            out.push(...nodes);
            i = next;
            continue;
        }

        const buffer = [line];
        i++;
        while (i < lines.length && lines[i].trim() && !startsBlock(lines, i) && !LIST.test(lines[i])) {
            buffer.push(lines[i]);
            i++;
        }
        out.push(
            <p key={k}>
                {buffer.map((text, idx) => {
                    const hardBreak = /( {2,}|\\)$/.test(text) && idx < buffer.length - 1;
                    return [
                        ...renderInline(text.trim().replace(/\\$/, ""), `${k}-${idx}`),
                        hardBreak ? <br key={`${k}-br${idx}`} /> : idx < buffer.length - 1 ? " " : null,
                    ];
                })}
            </p>,
        );
    }
    return out;
}

export function renderMarkdown(source: string): ReactNode[] {
    const text = source
        .replace(/\r\n?/g, "\n")
        .replace(/\t/g, "    ")
        .replace(/【[^】]*】/g, "")
        .replace(/\[\d+:\d+†[^\]]*\]/g, "")
        .replace(/\\\*\\\*/g, "**");
    return parseBlocks(text.split("\n"), "md");
}

export default function MarkdownMessage({ content }: { content: string }) {
    const nodes = useMemo(() => renderMarkdown(content), [content]);
    return <div className="md-content">{nodes}</div>;
}
