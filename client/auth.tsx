import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api';
import type { Action, Module, PermissionMatrix, Settings, User } from '../shared/types';
import { DEFAULT_PERMISSIONS, can as canFn } from '../shared/permissions';

export const BRANDING: Pick<Settings, 'companyName' | 'productName' | 'projectName' | 'tagline' | 'rera' | 'phone'> = {
  companyName: 'Sterlitee Developers',
  productName: 'Regal Park CRM',
  projectName: 'Sterlitee Regal Park',
  tagline: 'Your Private World, Nestled in Electronic City',
  rera: 'PRM/KA/RERA/1251/308/PR/180925/008098',
  phone: '+91 90080 32626',
};

type PublicUser = Omit<User, 'password'>;

interface AuthState {
  user: PublicUser | null;
  loading: boolean;
  permissions: PermissionMatrix;
  settings: Partial<Settings>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  can: (module: Module, action: Action) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState<boolean>(!!getToken());
  const [permissions, setPermissions] = useState<PermissionMatrix>(DEFAULT_PERMISSIONS);
  const [settings, setSettings] = useState<Partial<Settings>>(BRANDING);

  const loadContext = useCallback(async () => {
    const [perms, sets] = await Promise.all([
      api.get<PermissionMatrix>('/permissions').catch(() => DEFAULT_PERMISSIONS),
      api.get<Settings>('/settings').catch(() => BRANDING as Partial<Settings>),
    ]);
    setPermissions(perms);
    setSettings({ ...BRANDING, ...sets });
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    api.get<{ user: PublicUser } | PublicUser>('/auth/me')
      .then(async r => {
        setUser('user' in r ? r.user : r);
        await loadContext();
      })
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, [loadContext]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api.post<{ token: string; user: PublicUser }>('/auth/login', { email, password });
    setToken(r.token);
    setUser(r.user);
    await loadContext();
  }, [loadContext]);

  const logout = useCallback(() => {
    api.post('/auth/logout').catch(() => undefined);
    setToken(null);
    setUser(null);
    setPermissions(DEFAULT_PERMISSIONS);
    setSettings(BRANDING);
  }, []);

  const can = useCallback((module: Module, action: Action) => (user ? canFn(permissions, user.role, module, action) : false), [user, permissions]);

  return <AuthContext.Provider value={{ user, loading, permissions, settings, login, logout, can }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
