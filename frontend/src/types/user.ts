export interface UserProfile {
  id: string;
  display_name: string | null;
  email: string;
  subscription_tier: string;
  mass_credits: number;
  marketing_opt_in: boolean;
  referral_code: string | null;
  referred_by: string | null;
  created_at: string;
  billing_cycle: string | null;
  avatar_url: string | null;
  subscription_status: string;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  badges: string[];
  banner_url: string | null;
  x_handle: string | null;
}

// the actual shape /api/v1/me responds with
export interface ProfileResponse {
  profile: UserProfile;
}

export type UpdateProfileInput = {
  avatarUrl?: string;
  displayName?: string;
  xHandle?: string;
};