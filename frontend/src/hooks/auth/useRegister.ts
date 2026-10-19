"use client"

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

interface RegisterCredentials {
  username: string;
  email: string;
  password: string;
  marketingOptIn: boolean;
}

export function useRegister() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({ username, email, password, marketingOptIn }: RegisterCredentials) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            marketing_opt_in: marketingOptIn,
          },
        },
      });
      if (error) throw new Error(error.message);

      // Since email confirmation is ON: data.session will be null right
      // after signUp — the user exists but isn't actually logged in yet.
      return {
        user: data.user,
        needsEmailConfirmation: data.user !== null && data.session === null,
      };
    },
    onSuccess: ({ user, needsEmailConfirmation }) => {
      // Only treat them as "logged in" in the cache if they actually have
      // a session. Otherwise middleware will disagree with the cache and
      // you'll get a flash of dashboard → bounce back to /login.
      if (!needsEmailConfirmation) {
        queryClient.setQueryData(['auth', 'me'], user);
      }
    },
  });
}