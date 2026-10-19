'use client';

import { useState } from "react";
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
import { useRequestPasswordReset } from "@/hooks/auth/useRequestPasswordReset";

export default function ForgotPassword() {
  const requestReset = useRequestPasswordReset();
  const [email, setEmail] = useState("");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    requestReset.mutate(email);
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
            <CardTitle>Forgot password</CardTitle>
            <CardDescription>
              Enter your email and we&apos;ll send you a reset link
            </CardDescription>
          </CardHeader>

          {requestReset.isSuccess ? (
            <p className="t-body text-center text-positive">
              If that email is registered, a reset link is on its way.
            </p>
          ) : (
            <form onSubmit={handleSubmit}>
              <FieldGroup className="pb-4">
                <FieldLabel>Email</FieldLabel>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </FieldGroup>

              {requestReset.error && (
                <p className="t-meta text-negative pb-2">{requestReset.error.message}</p>
              )}

              <Button type="submit" disabled={requestReset.isPending} className="w-full">
                {requestReset.isPending ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          )}

          <span className="text-center t-body">
            Remembered it? <Link className="text-primary" href="/login">Sign In</Link>
          </span>
        </Card>
      </div>
    </>
  );
}