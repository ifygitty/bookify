'use client';

import {ArrowUp, Mic, MicOff} from "lucide-react";
import useVapi from "@/hooks/useVapi";
import {IBook} from "@/types";
import Image from "next/image";
import Transcript from "@/components/Transcript";
import {toast} from "sonner";

import {useAuth} from "@clerk/nextjs";
import {useRouter} from "next/navigation";
import {useEffect, useState} from "react";

const VapiControls = ({ book }: { book: IBook }) => {
    const { status, isActive, messages, currentMessage, currentUserMessage, duration, start, stop, sendText, clearError, limitError, isBillingError, maxDurationSeconds } = useVapi(book)
    const { isLoaded, isSignedIn } = useAuth();
    const router = useRouter();
    const [text, setText] = useState('');

    useEffect(() => {
        if (limitError) {
            toast.error(limitError);
            if (isBillingError) {
                router.push("/subscriptions");
            }
            clearError();
        }
    }, [isBillingError, limitError, router, clearError]);

    const handleMicClick = () => {
        if (!isLoaded) {
            toast.info("Checking your sign-in status. Please try again in a moment.");
            return;
        }

        if (!isSignedIn) {
            toast.error("Please sign in before starting a voice session.");
            return;
        }

        if (isActive) {
            stop();
        } else {
            start();
        }
    };

    const handleTextSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!isActive) {
            toast.info('Start a session before sending a message.');
            return;
        }

        if (sendText(text)) setText('');
    };

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const getStatusDisplay = () => {
        switch (status) {
            case 'connecting': return { label: 'Connecting...', color: 'vapi-status-dot-connecting' };
            case 'starting': return { label: 'Starting...', color: 'vapi-status-dot-starting' };
            case 'listening': return { label: 'Listening', color: 'vapi-status-dot-listening' };
            case 'thinking': return { label: 'Thinking...', color: 'vapi-status-dot-thinking' };
            case 'speaking': return { label: 'Speaking', color: 'vapi-status-dot-speaking' };
            default: return { label: 'Ready', color: 'vapi-status-dot-ready' };
        }
    };

    const statusDisplay = getStatusDisplay();

    return (
        <>
            <div className="max-w-4xl mx-auto flex flex-col gap-8">
                {/* Header Card */}
                <div className="vapi-header-card">
                    <div className="vapi-cover-wrapper">
                        <Image
                            src={book.coverURL || "/images/book-placeholder.png"}
                            alt={book.title}
                            width={120}
                            height={180}
                            className="vapi-cover-image !w-[120px] !h-auto"
                            priority
                        />
                        <div className="vapi-mic-wrapper relative">
                            {isActive && (status === 'speaking' || status === 'thinking') && (
                                <div className="absolute inset-0 rounded-full bg-white animate-ping opacity-75" />
                            )}
                            <button
                                onClick={handleMicClick}
                                disabled={status === 'connecting'}
                                className={`vapi-mic-btn shadow-md !w-[60px] !h-[60px] z-10 ${isActive ? 'vapi-mic-btn-active' : 'vapi-mic-btn-inactive'}`}
                            >
                                {isActive ? (
                                    <Mic className="size-7 text-white" />
                                ) : (
                                    <MicOff className="size-7 text-[#212a3b]" />
                                )}
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-col gap-4 flex-1">
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold font-serif text-[#212a3b] mb-1">
                                {book.title}
                            </h1>
                            <p className="text-[#3d485e] font-medium">by {book.author}</p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <div className="vapi-status-indicator">
                                <span className={`vapi-status-dot ${statusDisplay.color}`} />
                                <span className="vapi-status-text">{statusDisplay.label}</span>
                            </div>

                            <div className="vapi-status-indicator">
                                <span className="vapi-status-text">Voice: {book.persona || "Daniel"}</span>
                            </div>

                            <div className="vapi-status-indicator">
                                <span className="vapi-status-text">
                                    {formatDuration(duration)}/{formatDuration(maxDurationSeconds)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

            <div className="vapi-transcript-wrapper">
                <div className="transcript-container min-h-[400px]">
                    <Transcript
                        messages={messages}
                        currentMessage={currentMessage}
                        currentUserMessage={currentUserMessage}
                    />
                </div>
                <form onSubmit={handleTextSubmit} className="mt-4 flex gap-3">
                    <input
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        placeholder={isActive ? 'Type a question about this book...' : 'Start a session to type'}
                        disabled={!isActive}
                        className="min-w-0 flex-1 rounded-xl border border-[#d7dbe3] bg-white px-4 py-3 text-[#212a3b] outline-none transition focus:border-[#663820] disabled:cursor-not-allowed disabled:bg-[#f2f3f5]"
                        aria-label="Type a message"
                    />
                    <button
                        type="submit"
                        disabled={!isActive || !text.trim()}
                        className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#663820] text-white transition hover:bg-[#4f2a18] disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="Send message"
                    >
                        <ArrowUp className="size-5" />
                    </button>
                </form>
            </div>
            </div>
        </>
    )
}
export default VapiControls
