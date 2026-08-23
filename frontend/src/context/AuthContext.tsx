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
  /**
   * Set when the boot session check could not reach the backend. Distinct from
   * `user === null`, which means "definitely signed out" — this means "we do
   * not know", and route guards must not redirect on it.
   */
  authError: boolean;
  /** Retry the boot session check after an `authError`. */
  retryAuth: () => void;
  analyses: AnalysisSummary[];
  analysesLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAnalyses: () => Promise<void>;
  /** Rename the account. Updates the cached user so the header and
   *  dashboard greeting change with it, not just the profile page. */
  updateName: (username: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [authAttempt, setAuthAttempt] = useState(0);
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
    let cancelled = false;
    (async () => {
      try {
        const remoteUser = await api.getCurrentUser();
        if (cancelled) return;
        setAuthError(false);
        if (remoteUser) {
          setUser(remoteUser);
          // Flip authReady as soon as the session is known. The analyses list
          // is a dashboard detail with its own `analysesLoading` flag, so
          // awaiting it here would keep every route blocked on a second
          // round-trip.
          setAuthReady(true);
          void refreshAnalyses();
          return;
        }

        // The backend explicitly said there is no session.
        setUser(null);
        setAnalyses([]);
        setAnalysesLoading(false);
        setAuthReady(true);
      } catch {
        // We could not reach the backend, so we do not know whether there is a
        // session. Treating that as "signed out" would end a valid session on
        // a transient blip, so hold the user as-is and let the UI offer a
        // retry. authReady still flips: the app must stop showing a loader.
        if (cancelled) return;
        setAuthError(true);
        setAnalysesLoading(false);
        setAuthReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // refreshAnalyses is a stable useCallback([]); listing it satisfies the
    // exhaustive-deps rule without re-running the session check.
  }, [authAttempt, refreshAnalyses]);

  const retryAuth = useCallback(() => {
    setAuthReady(false);
    setAuthError(false);
    setAuthAttempt((n) => n + 1);
  }, []);

  // A 401 from any endpoint means the cookie expired mid-session. Clear the
  // session once, centrally, rather than leaving every screen rendering as
  // signed-in while each action fails with a raw backend error.
  useEffect(
    () =>
      api.onUnauthorized(() => {
        setUser(null);
        setAnalyses([]);
        setAnalysesLoading(false);
        setAuthReady(true);
      }),
    [],
  );

  const loginHandler = useCallback(
    async (email: string, password: string) => {
      const u = await api.login(email, password);
      setUser(u);
      void refreshAnalyses();
    },
    [refreshAnalyses],
  );

  const signupHandler = useCallback(
    async (email: string, password: string) => {
      const u = await api.signup(email, password);
      setUser(u);
      void refreshAnalyses();
    },
    [refreshAnalyses],
  );

  const updateNameHandler = useCallback(async (username: string) => {
    const updated = await api.updateName(username);
    setUser(updated);
  }, []);

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
        authError,
        retryAuth,
        analyses,
        analysesLoading,
        login: loginHandler,
        signup: signupHandler,
        loginWithGoogle: loginWithGoogleHandler,
        logout: logoutHandler,
        refreshAnalyses,
        updateName: updateNameHandler,
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
