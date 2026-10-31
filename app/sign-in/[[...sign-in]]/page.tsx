import { SignIn } from "@clerk/nextjs";
import Image from "next/image";

export default function SignInPage() {
    return (
        <main className="auth-wrapper">
            <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-soft sm:p-8">
                <div className="mb-6 text-center">
                    <Image
                        src="/assets/mentor.png"
                        alt="Mentor"
                        width={1920}
                        height={1280}
                        priority
                        className="mx-auto mb-4 h-20 w-40 rounded-lg bg-white object-contain p-1"
                    />
                    <h1 className="text-2xl font-semibold text-[#212a3b]">Welcome back</h1>
                    <p className="mt-2 text-sm text-[#3d485e]">Sign in to continue learning with Mentor.</p>
                </div>
                <SignIn />
            </section>
        </main>
    );
}
