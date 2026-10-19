'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import Image from "next/image";
import Link from "next/link";
import { useLogin } from "@/hooks/auth/useLogin";
import { BackButton } from "@/components/custom/nav/BackButton";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type FieldErrors = Partial<Record<"email" | "password", string>>;

export default function Login() {
  const router = useRouter();
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const result = loginSchema.safeParse({ email, password });
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
    login.mutate(
      { email, password },
      { onSuccess: () => router.push("/dashboard") }
    );
  }

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-backgroundhighlight items-center justify-between flex h-12 md:h-14">
        <h2 className="t-h1 ml-4"> SPADA</h2>
        <div className="flex items-center gap-3 mr-4">
          <Link href={'/login'}><Button>Login</Button></Link>
          <Link href={'/register'}><Button>Register</Button></Link>
        </div>
      </nav>

      <div className="mt-25 flex flex-col items-center md:w-auto lg-40">
        <div className="w-70 flex justify-start mb-2">
          <BackButton />
        </div>

        <Card className="w-70 bg-backgroundhighlight p-4 text-left">
          <CardHeader className="text-center">
            <Image
              src="/SPADALOGOMAINPAGE.svg"
              alt="SPADA logo"
              width={500}
              height={500}
              priority
            />
            <CardTitle>Welcome Back</CardTitle>
            <CardDescription>Sign In or Create an Account</CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit} noValidate>
            <FieldGroup className="pb-4">
              <FieldLabel>Email</FieldLabel>
              <Input
                type="email"
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!errors.password}
              />
              {errors.password && (
                <span className="t-meta text-negative">{errors.password}</span>
              )}
            </FieldGroup>

            <div className="flex justify-start pb-4">
              <Link href="/forgotPassword" className="t-meta text-primary">
                Forgot password?
              </Link>
            </div>

            {login.error && (
              <p className="t-meta text-negative pb-2">{login.error.message}</p>
            )}

            <Button type="submit" disabled={login.isPending} className="w-full">
              {login.isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <span className="text-center t-body">
            Don&apos;t have an account? <Link className="text-primary" href="/register">Sign Up</Link>
          </span>
        </Card>
      </div>
    </>
  );
}