"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Truck, Building2, UserPlus, ArrowLeft, Loader2 } from "lucide-react";

type Role = "operator" | "location_manager" | "requestor";

const roles: { value: Role; label: string; icon: typeof Truck; description: string }[] = [
  {
    value: "operator",
    label: "Operator",
    icon: Truck,
    description: "I own/operate vending machines and want new locations",
  },
  {
    value: "location_manager",
    label: "Location Manager",
    icon: Building2,
    description: "I manage a property and want a vending machine",
  },
  {
    value: "requestor",
    label: "Requestor",
    icon: UserPlus,
    description: "I want to request a vending machine for a location I frequent",
  },
];

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [role, setRole] = useState<Role | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleRoleSelect(selected: Role) {
    setRole(selected);
    setStep(2);
    setError(null);
  }

  function handleBack() {
    setStep(1);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!role) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, full_name: fullName, role }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-160px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-navy">Join VendHub</h1>
          <p className="text-navy/60 mt-2">
            {step === 1
              ? "Select your role to get started"
              : "Fill in your details to create an account"}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {/* Error alert */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Step 1: Role Selection */}
          {step === 1 && (
            <div className="space-y-4">
              {roles.map(({ value, label, icon: Icon, description }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleRoleSelect(value)}
                  className="w-full flex items-start gap-4 p-5 rounded-xl border-2 border-gray-100
                    hover:border-orange-primary hover:bg-peach/50 transition-all duration-200
                    text-left cursor-pointer group"
                >
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-peach flex items-center justify-center
                    group-hover:bg-orange-primary/10 transition-colors">
                    <Icon className="w-6 h-6 text-orange-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-navy">{label}</p>
                    <p className="text-sm text-navy/60 mt-0.5">{description}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Step 2: Registration Form */}
          {step === 2 && (
            <>
              {/* Back button */}
              <button
                type="button"
                onClick={handleBack}
                className="flex items-center gap-1.5 text-sm text-navy/60 hover:text-orange-primary
                  transition-colors mb-6 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Change role
              </button>

              {/* Selected role badge */}
              <div className="flex items-center gap-2 mb-6 px-3 py-2 bg-peach rounded-lg w-fit">
                {(() => {
                  const selected = roles.find((r) => r.value === role);
                  if (!selected) return null;
                  const Icon = selected.icon;
                  return (
                    <>
                      <Icon className="w-4 h-4 text-orange-primary" />
                      <span className="text-sm font-medium text-navy">{selected.label}</span>
                    </>
                  );
                })()}
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Full Name */}
                <div>
                  <label htmlFor="full_name" className="block text-sm font-medium text-navy mb-1.5">
                    Full Name
                  </label>
                  <input
                    id="full_name"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full"
                  />
                </div>

                {/* Email */}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-navy mb-1.5">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full"
                  />
                </div>

                {/* Password */}
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-navy mb-1.5">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full"
                  />
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 bg-orange-primary hover:bg-orange-hover text-white
                    font-semibold rounded-xl transition-colors disabled:opacity-50
                    disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Creating Account...
                    </>
                  ) : (
                    "Create Account"
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        {/* Footer link */}
        <p className="text-center mt-6 text-sm text-navy/60">
          Already have an account?{" "}
          <Link href="/login" className="text-orange-primary hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
