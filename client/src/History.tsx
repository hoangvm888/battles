import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  History as HistoryIcon,
  LoaderCircle,
  Trophy,
  XCircle,
} from 'lucide-react';
import { api, formatCoins, formatDate } from './shared';

type Bet = {
  id: string;
  battleId: string;
  battleTitle: string;
  optionId: string;
  optionLabel: string;
  amount: number;
  payout: number;
  status: 'pending' | 'won' | 'lost';
  createdAt: string;
  settledAt?: string;
};
type Response = { items: Bet[]; total: number; page: number; pageSize: number };
const filters = [
  { value: '', label: 'All bets' },
  { value: 'pending', label: 'Pending' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
];

export default function History() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Response>({ items: [], total: 0, page: 1, pageSize: 10 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api<Response>(`/api/bets?page=${page}&pageSize=10${status ? `&status=${status}` : ''}`)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Unable to load your bet history.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, status, reload]);

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">EVERY PICK. EVERY RESULT.</p>
          <h1 className="page-title">Bet history</h1>
          <p className="muted">Follow your open battles and see how your predictions paid off.</p>
        </div>
        <Link className="btn btn-primary" to="/battles">
          Explore battles <ArrowUpRight size={18} />
        </Link>
      </header>
      <div className="card" style={{ padding: 'clamp(16px, 4vw, 28px)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            alignItems: 'center',
            flexWrap: 'wrap',
            marginBottom: 22,
          }}
        >
          <div className="tabs" role="tablist" aria-label="Filter bet history">
            {filters.map((filter) => (
              <button
                className={`tab ${status === filter.value ? 'active' : ''}`}
                key={filter.value}
                role="tab"
                aria-selected={status === filter.value}
                onClick={() => {
                  setStatus(filter.value);
                  setPage(1);
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <span className="muted" style={{ fontSize: 13 }}>
            {loading ? 'Loading…' : `${data.total} ${data.total === 1 ? 'bet' : 'bets'}`}
          </span>
        </div>
        {error ? (
          <div className="alert" role="alert">
            {error}
            <button className="btn btn-ghost" onClick={() => setReload((n) => n + 1)}>
              Try again
            </button>
          </div>
        ) : loading ? (
          <div className="empty-state" aria-live="polite">
            <LoaderCircle className="spin" size={28} />
            <p>Loading your picks…</p>
          </div>
        ) : !data.items.length ? (
          <div className="empty-state">
            <HistoryIcon size={38} />
            <h2>{status ? `No ${status} bets yet` : 'Your first prediction is waiting'}</h2>
            <p className="muted">
              {status
                ? 'Try another filter or explore an open battle.'
                : 'Pick a battle, choose your answer, and put your virtual coins behind it.'}
            </p>
            <Link className="btn btn-primary" to="/battles">
              Find a battle <ArrowUpRight size={17} />
            </Link>
          </div>
        ) : (
          <div className="stack" style={{ gap: 14 }}>
            {data.items.map((bet) => (
              <article className="card" key={bet.id} style={{ padding: 'clamp(18px, 3vw, 24px)' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 16,
                  }}
                >
                  <div>
                    <small className="muted">{formatDate(bet.createdAt)}</small>
                    <h3 style={{ margin: '7px 0 9px', fontSize: 18 }}>
                      <Link
                        to={`/battles/${bet.battleId}`}
                        style={{ color: 'inherit', textDecoration: 'none' }}
                      >
                        {bet.battleTitle}
                      </Link>
                    </h3>
                    <span className="muted" style={{ fontSize: 14 }}>
                      Your pick:{' '}
                      <strong style={{ color: 'var(--text, #17243a)' }}>{bet.optionLabel}</strong>
                    </span>
                  </div>
                  <span className={`badge ${bet.status}`} style={{ whiteSpace: 'nowrap' }}>
                    {bet.status === 'won' ? (
                      <Trophy size={14} />
                    ) : bet.status === 'lost' ? (
                      <XCircle size={14} />
                    ) : (
                      <Clock3 size={14} />
                    )}
                    {bet.status === 'pending' ? 'Pending' : bet.status === 'won' ? 'Won' : 'Lost'}
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '16px 36px',
                    marginTop: 20,
                    paddingTop: 16,
                    borderTop: '1px solid var(--border, #e6eaf0)',
                  }}
                >
                  <div>
                    <small className="muted" style={{ display: 'block', marginBottom: 5 }}>
                      Coins placed
                    </small>
                    <strong>{formatCoins(bet.amount)}</strong>
                  </div>
                  <div>
                    <small className="muted" style={{ display: 'block', marginBottom: 5 }}>
                      Payout
                    </small>
                    <strong style={{ color: bet.status === 'won' ? '#169c69' : 'inherit' }}>
                      {bet.status === 'pending'
                        ? 'Awaiting result'
                        : `${formatCoins(bet.payout)} coins`}
                    </strong>
                  </div>
                  {bet.status !== 'pending' && (
                    <div>
                      <small className="muted" style={{ display: 'block', marginBottom: 5 }}>
                        Net result
                      </small>
                      <strong
                        style={{ color: bet.payout - bet.amount >= 0 ? '#169c69' : '#b85161' }}
                      >
                        {bet.payout - bet.amount > 0 ? '+' : ''}
                        {formatCoins(bet.payout - bet.amount)}
                      </strong>
                    </div>
                  )}
                  <Link
                    className="btn btn-ghost"
                    style={{ marginLeft: 'auto' }}
                    to={`/battles/${bet.battleId}`}
                  >
                    View battle <ArrowUpRight size={16} />
                  </Link>
                </div>
                {bet.settledAt && (
                  <small
                    className="muted"
                    style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 14 }}
                  >
                    <CheckCircle2 size={12} /> Settled {formatDate(bet.settledAt)}
                  </small>
                )}
              </article>
            ))}
          </div>
        )}
        {!loading && !error && data.total > data.pageSize && (
          <nav
            aria-label="Bet history pagination"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 22,
              gap: 12,
            }}
          >
            <button
              className="btn btn-ghost"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <small className="muted">
              Page {page} of {Math.ceil(data.total / data.pageSize)}
            </small>
            <button
              className="btn btn-ghost"
              disabled={page * data.pageSize >= data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </nav>
        )}
      </div>
      <p className="muted" style={{ textAlign: 'center', fontSize: 12 }}>
        Placed bets are final and cannot be cancelled. Payouts are credited automatically after the
        result is settled.
      </p>
    </div>
  );
}
