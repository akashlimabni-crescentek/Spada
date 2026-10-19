// src/components/custom/BackButton.tsx
"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

export function BackButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="flex items-center justify-left gap-1 t-ui px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-raised transition-colors"
    >
      <ChevronLeft className="h-4 w-4" />
      Back
    </button>
  );
}