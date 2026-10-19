// hook for requesting password reset link to inbox
import { useMutation } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export function useRequestPasswordReset() {
  const supabase = createClient();

  return useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/resetPassword`,
      });
      if (error) throw new Error(error.message);
    },
  });
}