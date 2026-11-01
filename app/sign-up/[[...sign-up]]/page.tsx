import { SignUp } from "@clerk/nextjs";
import Image from "next/image";

export default function SignUpPage() {
    return (
        <main className="auth-wrapper">
            <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-soft sm:p-8">
                <div className="mb-6 text-center">
                    <Image
                        src="/assets/Mainlogo.png"
                        alt="Mentor"
                        width={1920}
                        height={1080}
                        priority
                        className="mx-auto mb-4 h-20 w-40 object-contain"
                    />
                    <h1 className="text-2xl font-semibold text-[#212a3b]">Create your account</h1>
                    <p className="mt-2 text-sm text-[#3d485e]">Sign up to organize your learning with Mentor.</p>
                </div>
                <SignUp
                    routing="path"
                    path="/sign-up"
                    fallbackRedirectUrl="/courses"
                />
            </section>
        </main>
    );
}
