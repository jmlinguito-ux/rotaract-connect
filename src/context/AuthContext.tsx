import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { AppUser, UserRole, VerificationStatus } from '../types';
import { supabase } from '../services/supabase';

interface AuthContextValue {
  user: AppUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Accepts either an email address or a username as the identifier. */
  signIn: (identifier: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, details: SignUpDetails) => Promise<{ error?: string; user?: AppUser }>;
  signOut: () => Promise<void>;
  /** Verifies the current password, then sets a new one. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ error?: string }>;
  /** Returns the newly signed-in account so callers can file its application. */
  register: (details?: Partial<AppUser>) => AppUser;
  updateAvatar: (avatarUrl: string) => Promise<void>;
  updateProfile: (updates: Partial<AppUser>) => Promise<void>;
}

export interface SignUpDetails {
  full_name: string;
  username: string;
  contact_number?: string;
  club_id: string;
  club_name: string;
  position: string;
  role?: UserRole;
  avatar_url?: string;
  member_id?: string;
  proof_url?: string;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function profileToAppUser(profile: any, clubName?: string): AppUser {
  return {
    id: profile.id,
    full_name: profile.full_name,
    email: profile.email,
    username: profile.username,
    club_id: profile.club_id,
    club_name: clubName ?? profile.clubs?.club_name ?? profile.club_name ?? '',
    position: profile.position,
    role: profile.role as UserRole,
    verification_status: profile.verification_status as VerificationStatus,
    avatar_url: profile.avatar_url,
    contact_number: profile.contact_number,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) {
      setUser(null);
      return;
    }

    // Resolve the club name in a separate query. An embedded `clubs(...)` select
    // is ambiguous here — profiles↔clubs are linked by both profiles.club_id and
    // clubs.president_id — and PostgREST errors on the ambiguity, which would
    // silently fail sign-in.
    let clubName: string | undefined;
    if (data.club_id) {
      const { data: club } = await supabase
        .from('clubs')
        .select('club_name')
        .eq('id', data.club_id)
        .single();
      clubName = club?.club_name;
    }

    setUser(profileToAppUser(data, clubName));
  };

  useEffect(() => {
    // Check for existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    // Listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setUser(null);
        setIsLoading(false);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (identifier: string, password: string) => {
    // Supabase auth only accepts an email. If the user typed a username, resolve
    // it to the account email first via the email_for_username RPC (SECURITY
    // DEFINER, callable by anon since profiles blocks unauthenticated reads).
    let email = identifier;
    if (!identifier.includes('@')) {
      const { data, error } = await supabase.rpc('email_for_username', {
        p_username: identifier,
      });
      if (error) return { error: error.message };
      if (!data) return { error: 'Invalid username or password.' };
      email = data as string;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return {};
  };

  const signUp = async (email: string, password: string, details: SignUpDetails) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error || !data.user) {
      return { error: error?.message ?? 'Sign up failed' };
    }

    const profile = {
      id: data.user.id,
      full_name: details.full_name,
      email,
      username: details.username,
      club_id: details.club_id,
      position: details.position,
      role: details.role ?? 'MEMBER',
      verification_status: 'AWAITING_CLUB_VALIDATION' as VerificationStatus,
      avatar_url: details.avatar_url,
      contact_number: details.contact_number,
    };

    const { error: profileError } = await supabase.from('profiles').insert(profile);
    if (profileError) {
      return { error: profileError.message };
    }

    // Create the verification application for club review
    if (details.member_id) {
      await supabase.from('verification_applications').insert({
        user_id: data.user.id,
        full_name: details.full_name,
        email,
        club_id: details.club_id,
        member_id: details.member_id,
        position: details.position,
        status: 'AWAITING_CLUB_VALIDATION',
        proof_url: details.proof_url,
      });
    }

    const appUser = profileToAppUser(profile, details.club_name);
    setUser(appUser);
    return { user: appUser };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    if (!user?.email) return { error: 'You must be signed in to change your password.' };
    // Supabase has no "verify current password" call, so re-authenticate with it;
    // a failure here means the current password was wrong.
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (verifyError) return { error: 'Your current password is incorrect.' };

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error: error.message };
    return {};
  };

  // Legacy register: kept for compatibility with callers that create a local-only
  // account. In production flows, use signUp instead.
  const register = (details?: Partial<AppUser>) => {
    const created: AppUser = {
      id: `u_${Date.now()}`,
      full_name: details?.full_name ?? 'New User',
      email: details?.email ?? '',
      username: details?.username ?? 'newuser',
      club_id: details?.club_id ?? '',
      club_name: details?.club_name ?? '',
      position: details?.position ?? 'Member',
      role: details?.role ?? 'MEMBER',
      verification_status: 'AWAITING_CLUB_VALIDATION',
      avatar_url: details?.avatar_url,
      contact_number: details?.contact_number,
    };
    setUser(created);
    return created;
  };

  const updateAvatar = async (avatarUrl: string) => {
    if (!user) return;
    await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', user.id);
    setUser(prev => (prev ? { ...prev, avatar_url: avatarUrl } : null));
  };

  const updateProfile = async (updates: Partial<AppUser>) => {
    if (!user) return;
    const dbUpdates: any = {};
    if (updates.full_name !== undefined) dbUpdates.full_name = updates.full_name;
    if (updates.username !== undefined) dbUpdates.username = updates.username;
    if (updates.position !== undefined) dbUpdates.position = updates.position;
    if (updates.avatar_url !== undefined) dbUpdates.avatar_url = updates.avatar_url;
    if (updates.contact_number !== undefined) dbUpdates.contact_number = updates.contact_number;
    if (updates.club_id !== undefined) dbUpdates.club_id = updates.club_id;

    if (Object.keys(dbUpdates).length > 0) {
      await supabase.from('profiles').update(dbUpdates).eq('id', user.id);
    }

    setUser(prev => (prev ? { ...prev, ...updates } : null));
  };

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: !!user, isLoading, signIn, signUp, signOut, changePassword, register, updateAvatar, updateProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
