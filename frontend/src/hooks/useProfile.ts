import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { UserProfile, ProfileResponse } from '@/types/user';

export function useProfile() {
  return useQuery<UserProfile>({
    queryKey: ['profile'],
    queryFn: async () => {
      const data: ProfileResponse = await apiFetch('/api/v1/me');
      return data.profile;
    },
  });
}