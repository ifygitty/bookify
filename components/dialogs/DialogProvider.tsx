"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
    type FormEvent,
    type KeyboardEvent as ReactKeyboardEvent,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, Loader2, Trash2, XCircle, type LucideIcon } from "lucide-react";

import "@/components/landing.css";
import "@/components/dialogs/dialogs.css";

export type DialogVariant = "success" | "error" | "warning" | "info" | "danger";

export type AlertOptions = {
    title: string;
    description?: string;
    variant?: Exclude<DialogVariant, "danger">;
    confirmText?: string;
};

export type ConfirmOptions = {
    title: string;
    description?: string;
    variant?: "danger" | "warning" | "info";
    confirmText?: string;
    cancelText?: string;
    /** Runs while the dialog stays open; if it throws, the error is shown and the dialog remains. */
    onConfirm?: () => Promise<void> | void;
};

export type PromptOptions = {
    title: string;
    description?: string;
    label: string;
    placeholder?: string;
    defaultValue?: string;
    confirmText?: string;
    cancelText?: string;
    multiline?: boolean;
    maxLength?: number;
    validate?: (value: string) => string | null;
};

type DialogContextValue = {
    showAlert: (options: AlertOptions) => Promise<void>;
    confirmDialog: (options: ConfirmOptions) => Promise<boolean>;
    promptDialog: (options: PromptOptions) => Promise<string | null>;
};

type ActiveDialog =
    | { id: number; kind: "alert"; options: AlertOptions; resolve: () => void }
    | { id: number; kind: "confirm"; options: ConfirmOptions; resolve: (value: boolean) => void }
    | { id: number; kind: "prompt"; options: PromptOptions; resolve: (value: string | null) => void };

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
type QueuedDialog = DistributiveOmit<ActiveDialog, "id">;

const DialogContext = createContext<DialogContextValue | null>(null);

const VARIANT_ICONS: Record<DialogVariant, LucideIcon> = {
    success: CheckCircle2,
    error: XCircle,
    warning: AlertTriangle,
    info: Info,
    danger: Trash2,
};

const FOCUSABLE =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const EXIT_MS = 170;

export function useDialogs() {
    const context = useContext(DialogContext);
    if (!context) throw new Error("useDialogs must be used inside <DialogProvider>.");
    return context;
}

export default function DialogProvider({ children }: { children: ReactNode }) {
    const [queue, setQueue] = useState<ActiveDialog[]>([]);
    const [closing, setClosing] = useState(false);
    const nextId = useRef(0);

    const enqueue = useCallback((dialog: QueuedDialog) => {
        nextId.current += 1;
        const entry = { ...dialog, id: nextId.current } as ActiveDialog;
        setQueue((current) => [...current, entry]);
    }, []);

    const showAlert = useCallback(
        (options: AlertOptions) => new Promise<void>((resolve) => enqueue({ kind: "alert", options, resolve })),
        [enqueue],
    );
    const confirmDialog = useCallback(
        (options: ConfirmOptions) => new Promise<boolean>((resolve) => enqueue({ kind: "confirm", options, resolve })),
        [enqueue],
    );
    const promptDialog = useCallback(
        (options: PromptOptions) => new Promise<string | null>((resolve) => enqueue({ kind: "prompt", options, resolve })),
        [enqueue],
    );

    const active = queue[0] ?? null;

    const finish = useCallback((settle: () => void) => {
        setClosing(true);
        window.setTimeout(() => {
            settle();
            setQueue((current) => current.slice(1));
            setClosing(false);
        }, EXIT_MS);
    }, []);

    const value = useMemo(() => ({ showAlert, confirmDialog, promptDialog }), [showAlert, confirmDialog, promptDialog]);

    return (
        <DialogContext.Provider value={value}>
            {children}
            {active && typeof document !== "undefined"
                ? createPortal(<DialogShell key={active.id} dialog={active} closing={closing} onFinish={finish} />, document.body)
                : null}
        </DialogContext.Provider>
    );
}

function DialogShell({
    dialog,
    closing,
    onFinish,
}: {
    dialog: ActiveDialog;
    closing: boolean;
    onFinish: (settle: () => void) => void;
}) {
    const panelRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
    const cancelRef = useRef<HTMLButtonElement>(null);
    const confirmRef = useRef<HTMLButtonElement>(null);
    const submittingRef = useRef(false);
    const titleId = useId();
    const descriptionId = useId();
    const errorId = useId();
    const inputId = useId();

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [inputValue, setInputValue] = useState(dialog.kind === "prompt" ? dialog.options.defaultValue ?? "" : "");

    const variant: DialogVariant = dialog.kind === "prompt" ? "info" : dialog.options.variant ?? "info";
    const isDanger = dialog.kind === "confirm" && dialog.options.variant === "danger";
    const Icon = VARIANT_ICONS[variant];
    const description = dialog.options.description;

    useEffect(() => {
        const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const frame = window.requestAnimationFrame(() => {
            // Destructive dialogs focus Cancel so Enter can never delete by accident.
            const target =
                inputRef.current ?? (isDanger ? cancelRef.current : null) ?? confirmRef.current ?? panelRef.current;
            target?.focus();
        });

        return () => {
            window.cancelAnimationFrame(frame);
            document.body.style.overflow = previousOverflow;
            if (returnTo && document.contains(returnTo)) returnTo.focus();
        };
    }, [isDanger]);

    const cancel = () => {
        if (submittingRef.current) return;
        onFinish(() => {
            if (dialog.kind === "confirm") dialog.resolve(false);
            else if (dialog.kind === "prompt") dialog.resolve(null);
            else dialog.resolve();
        });
    };

    const submit = async () => {
        if (submittingRef.current) return;

        if (dialog.kind === "alert") {
            onFinish(() => dialog.resolve());
            return;
        }

        if (dialog.kind === "prompt") {
            const trimmed = inputValue.trim();
            const validationError =
                dialog.options.validate?.(trimmed) ?? (trimmed ? null : "Please enter a value to continue.");
            if (validationError) {
                setError(validationError);
                inputRef.current?.focus();
                return;
            }
            onFinish(() => dialog.resolve(trimmed));
            return;
        }

        submittingRef.current = true;
        setBusy(true);
        setError(null);
        try {
            await dialog.options.onConfirm?.();
            submittingRef.current = false;
            onFinish(() => dialog.resolve(true));
        } catch (caught) {
            submittingRef.current = false;
            setBusy(false);
            setError(caught instanceof Error && caught.message ? caught.message : "Something went wrong. Please try again.");
        }
    };

    const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Escape") {
            event.stopPropagation();
            if (!isDanger && !busy) cancel();
            return;
        }
        if (event.key !== "Tab") return;

        const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
        if (focusable.length === 0) {
            event.preventDefault();
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };

    const handleFormSubmit = (event: FormEvent) => {
        event.preventDefault();
        void submit();
    };

    const confirmText =
        dialog.kind === "alert"
            ? dialog.options.confirmText ?? "Got it"
            : dialog.options.confirmText ?? (dialog.kind === "prompt" ? "Save" : "Confirm");
    const cancelText = dialog.kind === "alert" ? null : dialog.options.cancelText ?? "Cancel";
    const role = dialog.kind === "prompt" ? "dialog" : "alertdialog";

    return (
        <div className="mentor-dialog-root" data-closing={closing ? "true" : undefined} onKeyDown={handleKeyDown}>
            <div
                className="mentor-dialog-backdrop"
                aria-hidden="true"
                onClick={() => {
                    if (!isDanger && !busy) cancel();
                }}
            />
            <div
                ref={panelRef}
                role={role}
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={description ? descriptionId : undefined}
                tabIndex={-1}
                className="mentor-dialog border-light"
                data-variant={variant}
            >
                <form onSubmit={handleFormSubmit} className="mentor-dialog-form" noValidate>
                    <div className="mentor-dialog-header">
                        <span className="mentor-dialog-icon" aria-hidden="true">
                            <Icon className="size-6" />
                        </span>
                        <h2 id={titleId} className="mentor-dialog-title">
                            {dialog.options.title}
                        </h2>
                    </div>

                    {description ? (
                        <p id={descriptionId} className="mentor-dialog-description">
                            {description}
                        </p>
                    ) : null}

                    {dialog.kind === "prompt" ? (
                        <div className="mentor-dialog-field">
                            <label htmlFor={inputId} className="mentor-dialog-label">
                                {dialog.options.label}
                            </label>
                            {dialog.options.multiline ? (
                                <textarea
                                    id={inputId}
                                    ref={inputRef}
                                    rows={4}
                                    value={inputValue}
                                    maxLength={dialog.options.maxLength}
                                    placeholder={dialog.options.placeholder}
                                    aria-invalid={error ? true : undefined}
                                    aria-describedby={error ? errorId : undefined}
                                    className="mentor-dialog-input"
                                    onChange={(event) => {
                                        setInputValue(event.target.value);
                                        setError(null);
                                    }}
                                />
                            ) : (
                                <input
                                    id={inputId}
                                    ref={inputRef}
                                    type="text"
                                    value={inputValue}
                                    maxLength={dialog.options.maxLength}
                                    placeholder={dialog.options.placeholder}
                                    aria-invalid={error ? true : undefined}
                                    aria-describedby={error ? errorId : undefined}
                                    className="mentor-dialog-input"
                                    onChange={(event) => {
                                        setInputValue(event.target.value);
                                        setError(null);
                                    }}
                                />
                            )}
                        </div>
                    ) : null}

                    {error ? (
                        <p id={errorId} role="alert" className="mentor-dialog-error">
                            {error}
                        </p>
                    ) : null}

                    <div className="mentor-dialog-actions">
                        {cancelText ? (
                            <button
                                ref={cancelRef}
                                type="button"
                                className="mentor-dialog-btn mentor-dialog-btn-secondary"
                                disabled={busy}
                                onClick={cancel}
                            >
                                {cancelText}
                            </button>
                        ) : null}
                        <button
                            ref={confirmRef}
                            type="submit"
                            className={`mentor-dialog-btn ${isDanger ? "mentor-dialog-btn-danger" : "mentor-dialog-btn-primary"}`}
                            disabled={busy}
                        >
                            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                            {confirmText}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
