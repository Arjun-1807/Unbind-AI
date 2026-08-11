"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import type { User, AnalysisSummary } from "@/types";
import * as api from "@/services/api";

interface AuthContextValue {
  user: User | null;
  authReady: boolean;
  analyses: AnalysisSummary[];
  analysesLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (username: string, email: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAnalyses: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [analyses, setAnalyses] = useState<AnalysisSummary[]>([]);
  const [analysesLoading, setAnalysesLoading] = useState(true);

  const refreshAnalyses = useCallback(async () => {
    setAnalysesLoading(true);
    try {
      const data = await api.getUserAnalyses();
      setAnalyses(data);
    } catch {
      setAnalyses([]);
    } finally {
      setAnalysesLoading(false);
    }
  }, []);

  // Load user on mount.
  //
  // The session lives entirely in the backend's httpOnly auth cookie, so there
  // is no local copy to hydrate from and nothing here writes one: persisting
  // the user object also persisted its `accessToken`, turning any XSS into a
  // 7-day credential theft. Earlier builds did exactly that, so the first job
  // on boot is to purge what they left on disk.
  useEffect(() => {
    api.purgeLegacyBrowserCredentials();
    (async () => {
      const remoteUser = await api.getCurrentUser();
      if (remoteUser) {
        setUser(remoteUser);
        await refreshAnalyses();
        setAuthReady(true);
        return;
      }

      // No valid backend session.
      setUser(null);
      setAnalyses([]);
      setAnalysesLoading(false);
      setAuthReady(true);
    })();
  }, []);

  const loginHandler = useCallback(
    async (email: string, password: string) => {
      const u = await api.login(email, password);
      setUser(u);
      void refreshAnalyses();
    },
    [refreshAnalyses],
  );

  const signupHandler = useCallback(
    async (username: string, email: string, password: string) => {
      const u = await api.signup(username, email, password);
      setUser(u);
      void refreshAnalyses();
    },
    [refreshAnalyses],
  );

  const loginWithGoogleHandler = useCallback(
    async (credential: string) => {
      const u = await api.googleLogin(credential);
      setUser(u);
      void refreshAnalyses();
    },
    [refreshAnalyses],
  );

  const logoutHandler = useCallback(async () => {
    await api.logout();
    setUser(null);
    setAnalyses([]);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        analyses,
        analysesLoading,
        login: loginHandler,
        signup: signupHandler,
        loginWithGoogle: loginWithGoogleHandler,
        logout: logoutHandler,
        refreshAnalyses,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
