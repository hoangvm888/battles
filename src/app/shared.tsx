import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, X, AlertCircle, LoaderCircle } from 'lucide-react';

export type User = {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  balance: number;
  createdAt: string;
};
export type Option = {
  id: string;
  label: string;
  odds: number;
  totalStake: number;
  betCount: number;
};
export type Battle = {
  id: string;
  title: string;
  description: string;
  category: string;
  imageUrl: string | null;
  endsAt: string;
  status: 'open' | 'closed' | 'settled';
  multiplier: number;
  totalPool: number;
  participantCount: number;
  winningOptionId: string | null;
  options: Option[];
  createdAt: string;
  settledAt: string | null;
};
export type Bet = {
  id: string;
  battleId: string;
  battleTitle: string;
  optionId: string;
  optionLabel: string;
  amount: number;
  payout: number;
  status: 'pending' | 'won' | 'lost';
  createdAt: string;
  settledAt: string | null;
};
export type List<T> = { items: T[]; total: number; page: number; pageSize: number };

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  if (!navigator.onLine) {
    throw new ApiError(
      'You are offline. Reconnect to load account data or submit a request.',
      503,
      'OFFLINE',
    );
  }
  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      data?.error?.message ?? `Request failed (${response.status}). Please try again.`,
      response.status,
      data?.error?.code,
    );
  return data as T;
}
export const formatCoins = (value: number | string | null | undefined) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value ?? 0));
export const formatDate = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(value))
    : '—';
export function timeLeft(value: string) {
  const ms = new Date(value).getTime() - Date.now();
  if (ms <= 0) return 'Awaiting result';
  const h = Math.floor(ms / 3_600_000);
  return h >= 24
    ? `${Math.floor(h / 24)}d ${h % 24}h left`
    : h
      ? `${h}h ${Math.floor(ms / 60_000) % 60}m left`
      : `${Math.max(1, Math.floor(ms / 60_000))}m left`;
}

const AuthContext = createContext<{
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}>({ user: null, loading: true, refresh: async () => {}, logout: async () => {} });
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const data = await api<{ user: User }>('/api/auth/me');
      setUser(data.user);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setUser(null);
      else throw e;
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, [refresh]);
  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' });
    setUser(null);
  };
  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);

const ToastContext = createContext<(message: string, type?: 'success' | 'error') => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<
    { id: number; message: string; type: 'success' | 'error' }[]
  >([]);
  const toast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((items) => [...items, { id, message, type }]);
    setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 6000);
  }, []);
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div className={`toast ${t.type}`} key={t.id}>
            {t.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
            <span>{t.message}</span>
            <button
              aria-label="Dismiss notification"
              onClick={() => setToasts((items) => items.filter((i) => i.id !== t.id))}
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
export function Loading({ message = 'Loading your next move…' }: { message?: string }) {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spin" size={24} />
      <span>{message}</span>
    </div>
  );
}
export function ErrorState({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <div className="empty-state">
      <AlertCircle size={28} />
      <h3>Something got in the way</h3>
      <p>{error}</p>
      {retry && (
        <button className="btn btn-primary" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
