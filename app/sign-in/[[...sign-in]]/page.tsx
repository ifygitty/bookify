import { SignIn } from "@clerk/nextjs";
import Image from "next/image";

export default function SignInPage() {
    return (
        <main className="auth-wrapper">
            <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-soft sm:p-8">
                <div className="mb-6 text-center">
                    <div className="mx-auto mb-4 h-20 w-56 overflow-hidden rounded-xl bg-[#0d3d29]">
                        <Image
                            src="/assets/elio.png"
                            alt="Elio"
                            width={1920}
                            height={1080}
                            priority
                            className="h-full w-full object-cover"
                        />
                    </div>
                    <h1 className="text-2xl font-semibold text-[#212a3b]">Welcome back</h1>
                    <p className="mt-2 text-sm text-[#3d485e]">Sign in to continue learning with Elio.</p>
                </div>
                <SignIn
                    routing="path"
                    path="/sign-in"
                    fallbackRedirectUrl="/courses"
                />
            </section>
        </main>
    );
}
