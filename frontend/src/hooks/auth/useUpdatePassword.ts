//hook for updating password
import { useMutation } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export function useUpdatePassword() {
  const supabase = createClient();

  return useMutation({
    mutationFn: async (newPassword: string) => {
      const { data, error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message);
      return data.user;
    },
  });
}