import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { supabase } from '../integrations/supabase/client';
import type { Profile } from '../integrations/supabase/types';

interface AuthContextType {
  user: any | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadingProfileFor = useRef<string | null>(null);

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        loadProfile(session.user.id);
      }
      setLoading(false);
    });

    // Listen for auth changes. Skip INITIAL_SESSION — getSession above already handled it.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'INITIAL_SESSION') return;
        if (session?.user) {
          setUser(session.user);
          loadProfile(session.user.id);
        } else {
          setUser(null);
          setProfile(null);
        }
      }
    );

    return () => subscription?.unsubscribe();
  }, []);

  const loadProfile = async (userId: string) => {
    // Coalesce concurrent calls for the same user into a single request.
    if (loadingProfileFor.current === userId) return;
    loadingProfileFor.current = userId;
    try {
      const { data, error: err } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (err) {
        if (err.code === 'PGRST116') {
          const { data: authUser } = await supabase.auth.getUser();
          if (authUser.user) {
            const { data: created } = await supabase
              .from('profiles')
              .insert({
                id: userId,
                email: authUser.user.email || '',
                full_name: authUser.user.user_metadata?.full_name || null,
              })
              .select()
              .single();

            if (created) setProfile(created);
          }
        }
      } else {
        setProfile(data);
      }
    } catch (err) {
      console.error('[AUTH] Erro loadProfile:', err);
    } finally {
      loadingProfileFor.current = null;
    }
  };

  const login = async (email: string, password: string) => {
    try {
      setLoading(true);
      setError(null);
      console.log('[AUTH] Login tentativa:', email);

      const { data, error: err } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (err) throw err;

      if (data.session?.user) {
        setUser(data.session.user);
        await loadProfile(data.session.user.id);
      }
      console.log('[AUTH] Login OK');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao fazer login';
      console.log('[AUTH] Login erro:', message);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      setLoading(true);
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
      console.log('[AUTH] Logout OK');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao fazer logout';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      error,
      login,
      logout,
      isAuthenticated: !!user,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return context;
}
