'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import Image from "next/image";
import { useUpdatePassword } from "@/hooks/auth/useUpdatePassword";
import { createClient } from "@/lib/supabase/client";

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPassword() {
  const router = useRouter();
  const supabase = createClient();
  const updatePassword = useUpdatePassword();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  // Supabase picks the recovery token up from the URL automatically, but if
  // someone lands here without a valid reset link there's no session to act on.
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
      setCheckingSession(false);
    });
  }, [supabase]);

  useEffect(() => {
    if (updatePassword.isSuccess) {
      const timeout = setTimeout(() => router.push("/dashboard"), 2000);
      return () => clearTimeout(timeout);
    }
  }, [updatePassword.isSuccess, router]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setValidationError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setValidationError("Passwords don't match.");
      return;
    }

    updatePassword.mutate(password);
  }

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-backgroundhighlight items-center justify-between flex h-12 md:h-14">
        <h2 className="t-h1 ml-4">SPADA</h2>
      </nav>

      <div className="mt-25 flex-row justify-items-center md:w-auto lg-40">
        <Card className="w-70 bg-backgroundhighlight p-4 text-left">
          <CardHeader className="text-center">
            <Image src="/SPADALOGOMAINPAGE.svg" alt="SPADA logo" width={500} height={500} />
            <CardTitle>Reset password</CardTitle>
            <CardDescription>Choose a new password for your account</CardDescription>
          </CardHeader>

          <CardContent>
            {checkingSession ? (
              <p className="t-body text-center">Checking your link…</p>
            ) : !hasSession ? (
              <p className="t-body text-center">
                This reset link is invalid or has expired. Please request a new one.
              </p>
            ) : updatePassword.isSuccess ? (
              <p className="t-body text-center text-positive">
                Password updated. Redirecting…
              </p>
            ) : (
              <form onSubmit={handleSubmit}>
                <FieldGroup className="pb-4">
                  <FieldLabel>New password</FieldLabel>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </FieldGroup>
                <FieldGroup className="pb-4">
                  <FieldLabel>Confirm password</FieldLabel>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </FieldGroup>

                {(validationError || updatePassword.error) && (
                  <p className="t-meta text-negative pb-2">
                    {validationError ?? updatePassword.error?.message}
                  </p>
                )}

                <Button type="submit" disabled={updatePassword.isPending} className="w-full">
                  {updatePassword.isPending ? "Updating…" : "Update password"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}