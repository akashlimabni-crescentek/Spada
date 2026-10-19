import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { UpdateProfileInput, ProfileResponse } from "@/types/user";

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: UpdateProfileInput) =>
      apiFetch("/api/v1/me", {
        method: "PATCH",
        body: JSON.stringify(updates),
      }) as Promise<ProfileResponse>,

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}