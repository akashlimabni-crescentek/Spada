"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FieldGroup, FieldLabel, Field } from "@/components/ui/field"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Image from "next/image";
import Link from "next/link"
import Footer from "@/components/custom/nav/footer"
import { useRegister } from "@/hooks/auth/useRegister"
import { BackButton } from "@/components/custom/nav/BackButton";
import SpadaLogo from "@/components/custom/static/SpadaLogo";

const registerSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers, and underscores allowed"),
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Include at least one uppercase letter")
    .regex(/[0-9]/, "Include at least one number"),
});

type FieldErrors = Partial<Record<"username" | "email" | "password", string>>;

export default function RegisterPage() {
  const router = useRouter();
  const { mutate, isPending, error } = useRegister();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [showConfirmMessage, setShowConfirmMessage] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const result = registerSchema.safeParse({ username, email, password });
    if (!result.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    mutate(
      { username, email, password, marketingOptIn },
      {
        onSuccess: ({ needsEmailConfirmation }) => {
          if (needsEmailConfirmation) {
            setShowConfirmMessage(true);
          } else {
            router.push("/dashboard");
          }
        },
      }
    );
  }

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-backgroundhighlight items-center justify-between flex h-12 md:h-14">
        <SpadaLogo/>
      </nav>

      <main className="mt-25 pb-10 flex-row justify-items-center md:w-auto lg-40">
         <div className="w-70 flex justify-start mb-2">
                  <BackButton />
          </div>
        <Card className="w-70 bg-backgroundhighlight p-4 text-left mb-30">
          <CardHeader className="text-center">
            <Image src="/SPADALOGOMAINPAGE.svg" alt="SPADA logo" width={500} height={500} />
            <CardTitle>Welcome</CardTitle>
            <CardDescription>
              {showConfirmMessage ? "Check your email" : "Create Your Account"}
            </CardDescription>
          </CardHeader>

          {showConfirmMessage ? (
            <CardContent>
              <p className="t-body">
                We&apos;ve sent a confirmation link to <strong>{email}</strong>. Click it to activate your account before logging in.
              </p>
            </CardContent>
          ) : (
            <>
              <form onSubmit={handleSubmit} noValidate>
                <FieldGroup className="pb-2">
                  <FieldLabel>Username</FieldLabel>
                  <Input
                    placeholder="Your Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    aria-invalid={!!errors.username}
                  />
                  {errors.username && (
                    <span className="t-meta text-negative">{errors.username}</span>
                  )}
                </FieldGroup>
                <FieldGroup className="pb-2">
                  <FieldLabel>Email</FieldLabel>
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={!!errors.email}
                  />
                  {errors.email && (
                    <span className="t-meta text-negative">{errors.email}</span>
                  )}
                </FieldGroup>
                <FieldGroup className="pb-4">
                  <FieldLabel>Password</FieldLabel>
                  <Input
                    type="password"
                    placeholder="*********"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={!!errors.password}
                  />
                  {errors.password && (
                    <span className="t-meta text-negative">{errors.password}</span>
                  )}
                </FieldGroup>
                <FieldGroup className="pb-2">
                  <Field orientation="horizontal">
                    <Checkbox
                      id="terms-checkbox"
                      name="terms-checkbox"
                      checked={agreedToTerms}
                      onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                    />
                    <Label className="t-body" htmlFor="terms-checkbox">Accept terms and conditions</Label>
                  </Field>
                </FieldGroup>
                <FieldGroup className="pb-2">
                  <Field orientation="horizontal">
                    <Checkbox
                      id="contact-checkbox"
                      name="contact-checkbox"
                      checked={marketingOptIn}
                      onCheckedChange={(checked) => setMarketingOptIn(checked === true)}
                    />
                    <Label htmlFor="contact-checkbox" className="t-body">Receive Product updates</Label>
                  </Field>
                </FieldGroup>

                {error && <p className="t-body text-negative pb-2">{error.message}</p>}

                <Button type="submit" disabled={!agreedToTerms || isPending}>
                  {isPending ? "Creating account…" : "Sign Up"}
                </Button>
              </form>

              <span className="text-center t-body">
                Already have an account? <Link className="text-primary" href="/login">Log in</Link>
              </span>
            </>
          )}
        </Card>
      </main>

      <footer>
        <Footer />
      </footer>
    </>
  );
}