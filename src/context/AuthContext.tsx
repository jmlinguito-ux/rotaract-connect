import React, { createContext, useContext, useState, ReactNode, useEffect, useRef, useCallback } from 'react';
import { AppUser, UserRole, VerificationStatus } from '../types';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseUrl, supabaseAnonKey } from '../services/supabase';
import { PickedImage, uploadPublicImage, uploadImageAsset } from '../services/storage';
import { unregisterPushTokenAsync } from '../services/push';
import { getCachedUser, setCachedUser, clearCachedUser } from '../services/cache';
import RotaractNotifications from '../../modules/rotaract-notifications';

interface AuthContextValue {
  user: AppUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Re-reads the signed-in user's own profile (role, verification, club). */
  refreshProfile: () => Promise<void>;
  /** Accepts either an email address or a username as the identifier. */
  signIn: (identifier: string, password: string) => Promise<{ error?: string; needsVerification?: boolean; email?: string }>;
  /**
   * Starts registration. When the Supabase project requires email confirmation,
   * this returns `{ needsVerification: true }` and the account is NOT created in
   * `profiles` until the emailed code is verified (see `confirmEmailVerification`).
   * When confirmation is disabled, the profile is created immediately (as before).
   */
  signUp: (email: string, password: string, details: SignUpDetails) => Promise<{ error?: string; user?: AppUser; needsVerification?: boolean; email?: string }>;
  /** Verifies the emailed 6-digit signup code, then finalizes the account. */
  confirmEmailVerification: (code: string) => Promise<{ error?: string }>;
  /** Starts an email change: sends a 6-digit code to the NEW address. */
  requestEmailChange: (newEmail: string) => Promise<{ error?: string }>;
  /** Completes the change with the code from the new address. */
  confirmEmailChange: (newEmail: string, code: string) => Promise<{ error?: string }>;
  /** Re-sends the signup verification email. Supabase applies its own rate limiting. */
  resendVerificationEmail: () => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  /** Verifies the current password, then sets a new one. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ error?: string }>;
  /**
   * Looks up the account by USERNAME, then sends a password-reset code to that
   * account's email. Returns the resolved email so the caller can complete the
   * reset (and show a masked hint). If no account has that username, returns an
   * error — this flow intentionally confirms account existence by username.
   * Supabase applies its own server-side rate limiting on the email send.
   */
  requestPasswordReset: (username: string) => Promise<{ error?: string; email?: string }>;
  /**
   * Verifies the emailed recovery code and sets the new password, then signs out
   * so the user re-authenticates with it. The transient recovery session is not
   * promoted to a logged-in state.
   */
  confirmPasswordReset: (email: string, code: string, newPassword: string) => Promise<{ error?: string }>;
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
  /** Picked profile photo, uploaded to Storage after the account is created. */
  avatar_asset?: PickedImage;
  member_id?: string;
  /** Picked ID/roster proof, uploaded to the private bucket after account creation. */
  proof_asset?: PickedImage;
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
    // Older rows predate the column; absent means "allowed", matching the default.
    allow_direct_inquiries: profile.allow_direct_inquiries ?? true,
  };
}

/**
 * Copies the Supabase session into Android-native storage so the notification
 * inline-reply receiver can post a message while the app is not running. The reply
 * is then an ordinary authenticated PostgREST call and RLS applies unchanged.
 * No-op on iOS and on builds without the native module.
 */
function mirrorSessionToNative(session: Session | null) {
  if (!RotaractNotifications) return;
  if (session?.access_token && session.refresh_token && session.user?.id) {
    RotaractNotifications.setSession(
      supabaseUrl,
      supabaseAnonKey,
      session.access_token,
      session.refresh_token,
      session.user.id,
    );
  } else {
    RotaractNotifications.clearSession();
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // While a password reset is in flight, the recovery session Supabase creates
  // must NOT be promoted to a signed-in user (which would navigate into the app
  // mid-reset). Guarded in the auth listener below.
  const recoveringRef = useRef(false);
  // Details captured at sign-up, applied only once the emailed code is verified.
  // Held in memory for the common verify-immediately flow; user_metadata is the
  // durable fallback if the app restarts mid-flow (see confirmEmailVerification).
  const pendingSignUpRef = useRef<{ email: string; details: SignUpDetails } | null>(null);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) {
      setUser(null);
      await clearCachedUser();
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

    const appUser = profileToAppUser(data, clubName);
    setUser(appUser);
    setCachedUser(appUser);
  };

  const fetchProfileRef = useRef(fetchProfile);
  fetchProfileRef.current = fetchProfile;

  /**
   * Re-reads the signed-in user's own profile.
   *
   * Needed because AuthContext.user was previously written once, at sign-in: a role
   * change or verification approval stayed invisible until the next sign-in, and
   * pull-to-refresh did not help because it reloads DataContext, not this.
   */
  const refreshProfile = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) await fetchProfileRef.current(session.user.id);
  }, []);

  // Live updates to this user's own row — role, verification status, club. Scoped
  // by id so a district full of profile edits does not wake every device.
  useEffect(() => {
    const uid = user?.id;
    if (!uid) return;
    const channel = supabase
      .channel(`rt-profile-${uid}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` },
        () => { fetchProfileRef.current(uid); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  useEffect(() => {
    // 1. Instantly restore user profile from local cache for 0ms startup
    getCachedUser().then(cached => {
      if (cached) {
        setUser(cached);
        setIsLoading(false);
      }
    });

    // Safety guard: Ensure isLoading does not hang indefinitely on slow/offline starts
    const safetyTimer = setTimeout(() => {
      setIsLoading(false);
    }, 4000);

    // Check for existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      mirrorSessionToNative(session);
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => {
          clearTimeout(safetyTimer);
          setIsLoading(false);
        });
      } else {
        clearTimeout(safetyTimer);
        setIsLoading(false);
      }
    }).catch(() => {
      clearTimeout(safetyTimer);
      setIsLoading(false);
    });

    // Listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      // Keep the native copy in step — TOKEN_REFRESHED fires here too, which is what
      // stops the inline-reply receiver from going stale while the app sits closed.
      mirrorSessionToNative(session);
      if (session?.user) {
        // Don't sign the user in from a password-recovery session — the reset
        // flow drives that itself and signs out when done.
        if (recoveringRef.current) { setIsLoading(false); return; }
        fetchProfile(session.user.id).finally(() => {
          clearTimeout(safetyTimer);
          setIsLoading(false);
        });
      } else {
        setUser(null);
        clearCachedUser();
        clearTimeout(safetyTimer);
        setIsLoading(false);
      }
    });

    return () => {
      clearTimeout(safetyTimer);
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
    if (error) {
      // Unconfirmed email: route to verification instead of a dead-end error. We
      // don't have the original registration details here, so the finalize step
      // reconstructs them from user_metadata after the code is verified.
      if (/email not confirmed|not confirmed/i.test(error.message)) {
        pendingSignUpRef.current = { email, details: null as any };
        return { error: 'Please verify your email address to finish signing in.', needsVerification: true, email };
      }
      return { error: error.message };
    }
    return {};
  };

  /**
   * Creates the applicant's profile (and club-verification application) once an
   * authenticated session exists. Shared by the immediate path (email confirmation
   * off) and the post-code path (email confirmation on). Idempotent via upsert.
   */
  const finalizeSignUp = async (userId: string, email: string, details: SignUpDetails) => {
    let avatarUrl: string | undefined;
    let proofPath: string | undefined;
    try {
      if (details.avatar_asset) avatarUrl = await uploadPublicImage('avatars', userId, details.avatar_asset);
    } catch (e) { console.warn('[auth] avatar upload failed', e); }
    try {
      if (details.proof_asset) proofPath = await uploadImageAsset('verification-proofs', userId, details.proof_asset);
    } catch (e) { console.warn('[auth] proof upload failed', e); }

    const profile = {
      id: userId,
      full_name: details.full_name,
      email,
      username: details.username,
      club_id: details.club_id,
      position: details.position,
      role: details.role ?? 'MEMBER',
      verification_status: 'AWAITING_CLUB_VALIDATION' as VerificationStatus,
      avatar_url: avatarUrl,
      contact_number: details.contact_number,
    };

    const { error: profileError } = await supabase.from('profiles').upsert(profile, { onConflict: 'id' });
    if (profileError) return { error: profileError.message };

    if (details.member_id) {
      await supabase.from('verification_applications').insert({
        user_id: userId,
        full_name: details.full_name,
        email,
        club_id: details.club_id,
        member_id: details.member_id,
        position: details.position,
        status: 'AWAITING_CLUB_VALIDATION',
        proof_url: proofPath,
      });
    }

    // Load the canonical profile (resolves club_name, etc.) into app state.
    await fetchProfile(userId);
    return {};
  };

  const signUp = async (email: string, password: string, details: SignUpDetails) => {
    // Carry the profile fields in user_metadata so the account can still be
    // finalized after an app restart mid-verification (images excepted).
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: details.full_name,
          username: details.username,
          club_id: details.club_id,
          position: details.position,
          role: details.role ?? 'MEMBER',
          contact_number: details.contact_number ?? null,
          member_id: details.member_id ?? null,
        },
      },
    });
    if (error || !data.user) {
      return { error: error?.message ?? 'Sign up failed' };
    }

    // No session means the project requires email confirmation. Defer creating the
    // profile until the emailed code is verified (there's no session to authorize
    // Storage uploads or the profile insert yet).
    if (!data.session) {
      pendingSignUpRef.current = { email, details };
      return { needsVerification: true, email };
    }

    // Confirmation disabled: a session exists now, so finalize immediately.
    const result = await finalizeSignUp(data.user.id, email, details);
    if (result.error) return { error: result.error };
    return {};
  };

  const confirmEmailVerification = async (code: string) => {
    const pending = pendingSignUpRef.current;
    if (!pending) return { error: 'Your verification session expired. Please register or sign in again.' };

    const { data, error } = await supabase.auth.verifyOtp({
      email: pending.email,
      token: code.trim(),
      type: 'signup',
    });
    if (error || !data.user) {
      return { error: 'That verification code is invalid or has expired. Request a new one and try again.' };
    }

    // Reconstruct the registration details from user_metadata when they weren't
    // held in memory (e.g. verifying from the login path after a restart).
    const meta = (data.user.user_metadata ?? {}) as Record<string, any>;
    const details: SignUpDetails = pending.details ?? {
      full_name: meta.full_name ?? '',
      username: meta.username ?? '',
      contact_number: meta.contact_number ?? undefined,
      club_id: meta.club_id ?? '',
      club_name: '',
      position: meta.position ?? 'Member',
      role: meta.role ?? 'MEMBER',
      member_id: meta.member_id ?? undefined,
    };

    const result = await finalizeSignUp(data.user.id, pending.email, details);
    if (result.error) return { error: result.error };
    pendingSignUpRef.current = null;
    return {};
  };

  /**
   * Requests an email change. Supabase emails a confirmation code to the NEW
   * address; nothing changes until confirmEmailChange verifies it, so a typo just
   * means the code never arrives and the account is untouched.
   */
  const requestEmailChange = async (newEmail: string) => {
    const trimmed = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return { error: 'Enter a valid email address.' };
    if (trimmed === user?.email?.toLowerCase()) return { error: 'That is already your email address.' };

    const { error } = await supabase.auth.updateUser({ email: trimmed });
    if (error) return { error: error.message };
    return {};
  };

  /**
   * Confirms the change with the code sent to the new address, then mirrors it onto
   * the profile row — the app reads `profiles.email` everywhere, so leaving it stale
   * would show the old address throughout the UI while auth used the new one.
   */
  const confirmEmailChange = async (newEmail: string, code: string) => {
    const trimmed = newEmail.trim().toLowerCase();
    const { error } = await supabase.auth.verifyOtp({
      email: trimmed,
      token: code.trim(),
      type: 'email_change',
    });
    if (error) return { error: error.message };

    if (user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ email: trimmed })
        .eq('id', user.id);
      if (profileError) return { error: profileError.message };
      await fetchProfileRef.current(user.id);
    }
    return {};
  };

  const resendVerificationEmail = async () => {
    const pending = pendingSignUpRef.current;
    if (!pending) return { error: 'Nothing to resend. Please register again.' };
    const { error } = await supabase.auth.resend({ type: 'signup', email: pending.email });
    if (error) return { error: error.message };
    return {};
  };

  const signOut = async () => {
    // Remove THIS device's push token FIRST, while the session still authorizes the
    // RLS-scoped delete (policy: user_id = auth.uid()). If we cleared the session
    // first, the delete would match zero rows and the server would keep pushing this
    // account's notifications to the device after sign-out.
    try { await unregisterPushTokenAsync(); } catch (e) { console.warn('[auth] push unregister on sign-out failed', e); }
    RotaractNotifications?.clearSession();
    await supabase.auth.signOut();
    await clearCachedUser();
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

  const requestPasswordReset = async (username: string) => {
    const trimmed = username.trim();
    if (!trimmed) {
      return { error: 'Please enter your username.' };
    }
    // Resolve the username to its account email (SECURITY DEFINER RPC, callable by
    // anon and case-insensitive). A null result means no account has that username.
    const { data, error } = await supabase.rpc('email_for_username', { p_username: trimmed });
    if (error) return { error: error.message };
    if (!data) return { error: 'We couldn\'t find an account with that username.' };

    const email = data as string;
    // Send the 6-digit recovery code to the account's email. The email is returned
    // to the caller (never shown in full — the screen masks it) so it can complete
    // verifyOtp in confirmPasswordReset.
    const { error: sendError } = await supabase.auth.resetPasswordForEmail(email);
    if (sendError) return { error: sendError.message };
    return { email };
  };

  const confirmPasswordReset = async (email: string, code: string, newPassword: string) => {
    recoveringRef.current = true;
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: 'recovery',
      });
      if (verifyError) {
        return { error: 'That reset code is invalid or has expired. Request a new one and try again.' };
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) return { error: error.message };
      // Sign out so the user signs in fresh with the new password.
      await supabase.auth.signOut();
      setUser(null);
      return {};
    } finally {
      recoveringRef.current = false;
    }
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
    if (updates.allow_direct_inquiries !== undefined) dbUpdates.allow_direct_inquiries = updates.allow_direct_inquiries;

    if (Object.keys(dbUpdates).length > 0) {
      await supabase.from('profiles').update(dbUpdates).eq('id', user.id);
    }

    setUser(prev => (prev ? { ...prev, ...updates } : null));
  };

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: !!user, isLoading, refreshProfile, signIn, signUp, confirmEmailVerification, requestEmailChange, confirmEmailChange, resendVerificationEmail, signOut, changePassword, requestPasswordReset, confirmPasswordReset, register, updateAvatar, updateProfile }}
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
