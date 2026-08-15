import React, { createContext, useContext, useState, ReactNode } from 'react';
import { AppUser } from '../types';
import { users } from '../data/mockData';

interface AuthContextValue {
  user: AppUser | null;
  isAuthenticated: boolean;
  signInAs: (userId: string) => void;
  signOut: () => void;
  /** Returns the newly signed-in account so callers can file its application. */
  register: (details?: Partial<AppUser>) => AppUser;
  updateAvatar: (avatarUrl: string) => void;
  updateProfile: (updates: Partial<AppUser>) => void;
  demoUsers: AppUser[];
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const DEMO_IDS = [
  'app_u1',
  'app_u4',
  'u_member',
  'u2',
  'u_pres',
  'u4',
  'u8',
  'u5',
  'u9',
  'u6',
  'u10',
  'u7',
  'u_district',
  'u_admin',
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);

  const signInAs = (userId: string) => {
    const u = users.find(x => x.id === userId);
    if (u) setUser({ ...u });
  };

  const signOut = () => setUser(null);

  const register = (details?: Partial<AppUser>) => {
    const base = users.find(u => u.id === 'u_member')!;
    const isPresident = (details?.position ?? base.position).toLowerCase().includes('president');
    const created: AppUser = {
      ...base,
      ...details,
      // A registration is a brand-new identity — reusing the template account's id
      // would overwrite that account and file the application against the wrong user.
      id: `u_${Date.now()}`,
      verification_status: isPresident ? 'AWAITING_DISTRICT_VALIDATION' : 'AWAITING_CLUB_VALIDATION',
    };
    users.push(created);
    setUser(created);

    return created;
  };

  const updateAvatar = (avatarUrl: string) => {
    setUser(prev => (prev ? { ...prev, avatar_url: avatarUrl } : null));
    if (user) {
      const idx = users.findIndex(u => u.id === user.id);
      if (idx !== -1) users[idx].avatar_url = avatarUrl;
    }
  };

  const updateProfile = (updates: Partial<AppUser>) => {
    setUser(prev => (prev ? { ...prev, ...updates } : null));
    if (user) {
      const idx = users.findIndex(u => u.id === user.id);
      if (idx !== -1) Object.assign(users[idx], updates);
    }
  };

  const demoUsers = DEMO_IDS.map(id => users.find(u => u.id === id)!).filter(Boolean);

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: !!user, signInAs, signOut, register, updateAvatar, updateProfile, demoUsers }}
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
