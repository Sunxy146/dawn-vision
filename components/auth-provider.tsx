'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '@/lib/api-client';
import { getStoredUser, storeUser, clearUser, setToken, clearToken } from '@/lib/auth';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl: string;
  locale: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: () => {},
});

/** 前端壳模式：引导签发真 JWT，创作工坊可走 create-stream */
const SHELL_MODE = process.env.NEXT_PUBLIC_DAWNVISION_SHELL === '1';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (SHELL_MODE) {
        try {
          const res = await fetch('/api/auth/shell-bootstrap', { method: 'POST' });
          if (res.ok) {
            const data = await res.json();
            if (!cancelled) {
              setToken(data.token);
              storeUser(data.user);
              setUser(data.user);
            }
          } else if (!cancelled) {
            // 兜底：仍给 UI 壳用户，但创作会 401（提示重启/看日志）
            const fallback = {
              id: 'shell-dev',
              email: 'dev@dawnvision.local',
              name: '晓阳叙影',
              role: 'admin',
              avatarUrl: '',
              locale: 'zh',
            };
            setUser(fallback);
            storeUser(fallback);
          }
        } catch {
          if (!cancelled) {
            const fallback = {
              id: 'shell-dev',
              email: 'dev@dawnvision.local',
              name: '晓阳叙影',
              role: 'admin',
              avatarUrl: '',
              locale: 'zh',
            };
            setUser(fallback);
            storeUser(fallback);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }

      const stored = getStoredUser();
      if (stored) {
        setUser(stored);
        api.me()
          .then((data: any) => {
            if (cancelled) return;
            setUser(data);
            storeUser(data);
          })
          .catch(() => {
            if (cancelled) return;
            clearToken();
            clearUser();
            setUser(null);
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      } else {
        setLoading(false);
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    if (SHELL_MODE) {
      const res = await fetch('/api/auth/shell-bootstrap', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'shell bootstrap failed');
      setToken(data.token);
      storeUser(data.user);
      setUser(data.user);
      return;
    }
    const data: any = await api.login({ email, password });
    setToken(data.token);
    storeUser(data.user);
    setUser(data.user);
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    if (SHELL_MODE) {
      await login(email, password);
      return;
    }
    const data: any = await api.register({ email, password, name });
    setToken(data.token);
    storeUser(data.user);
    setUser(data.user);
  }, [login]);

  const logout = useCallback(() => {
    clearToken();
    clearUser();
    setUser(null);
    void fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
