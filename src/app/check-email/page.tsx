"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Mail } from "lucide-react";

function CheckEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";

  return (
    <div className="min-h-[calc(100vh-160px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mb-6">
            <Mail className="w-8 h-8 text-green-primary" />
          </div>
          <h1 className="text-2xl font-bold text-black-primary mb-2">Check your email</h1>
          <p className="text-sm text-black-primary/60 mb-6">
            We&apos;ve sent a verification link to {email ? (
              <strong className="text-black-primary">{email}</strong>
            ) : (
              "your inbox"
            )}. Click the link in the email to verify your account.
          </p>
          <div className="space-y-3">
            <Link
              href={`/resend-verification${email ? `?email=${encodeURIComponent(email)}` : ""}`}
              className="block w-full py-3 px-4 border border-gray-200 text-black-primary hover:bg-gray-50 font-medium rounded-xl transition-colors"
            >
              Resend verification email
            </Link>
            <Link
              href="/login"
              className="block w-full py-3 px-4 text-sm text-black-primary/60 hover:text-black-primary transition-colors"
            >
              Back to login
            </Link>
          </div>
          <p className="mt-6 text-xs text-black-primary/40">
            Didn&apos;t get the email? Check your spam folder.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function CheckEmailPage() {
  return (
    <Suspense fallback={null}>
      <CheckEmailContent />
    </Suspense>
  );
}
