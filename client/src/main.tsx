import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Coins,
  Eye,
  EyeOff,
  Flame,
  Gamepad2,
  History as HistoryIcon,
  Layers3,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
  Wallet as WalletIcon,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  AuthProvider,
  type Battle,
  type Bet,
  ErrorState,
  formatCoins,
  formatDate,
  type List,
  Loading,
  timeLeft,
  ToastProvider,
  useAuth,
  useToast,
} from './shared';
import Wallet from './Wallet';
import History from './History';
import Admin from './Admin';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/manrope/latin-800.css';
import './styles.css';

function AppShell() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenu, setMobileMenu] = useState(false);
  useEffect(() => {
    setMobileMenu(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  async function signOut() {
    try {
      await logout();
      navigate('/');
      toast('You have been signed out.');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }
  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <Link to="/" className="brand" aria-label="Battle home">
            <span className="brand-mark">
              <Zap fill="currentColor" size={23} />
            </span>
            battle<span className="brand-dot">.</span>
          </Link>
          <nav className="desktop-nav" aria-label="Main navigation">
            <NavLink to="/" end>
              <Swords size={17} /> Battles
            </NavLink>
            <NavLink to="/leaderboard">
              <Trophy size={17} /> Leaderboard
            </NavLink>
            {user && (
              <>
                <NavLink to="/history">
                  <HistoryIcon size={17} /> My bets
                </NavLink>
                <NavLink to="/wallet">
                  <WalletIcon size={17} /> Wallet
                </NavLink>
              </>
            )}
            {user?.role === 'admin' && (
              <NavLink to="/admin">
                <ShieldCheck size={17} /> Admin
              </NavLink>
            )}
          </nav>
          <div className="header-actions">
            {user ? (
              <>
                <Link to="/wallet" className="balance-pill">
                  <Coins size={17} />
                  <span>{formatCoins(user.balance)}</span>
                  <span className="balance-plus">+</span>
                </Link>
                <button
                  className="user-avatar"
                  onClick={signOut}
                  title={`Sign out ${user.name}`}
                  aria-label={`Sign out ${user.name}`}
                >
                  {user.name.charAt(0).toUpperCase()}
                  <LogOut className="logout-icon" size={14} />
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="header-login">
                  Log in
                </Link>
                <Link to="/register" className="btn btn-dark btn-small">
                  Get started <ArrowUpRight size={15} />
                </Link>
              </>
            )}
            <button
              className="icon-btn mobile-menu-button"
              aria-label={mobileMenu ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenu}
              onClick={() => setMobileMenu(!mobileMenu)}
            >
              {mobileMenu ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
        {mobileMenu && (
          <nav className="mobile-nav" aria-label="Mobile navigation">
            <NavLink to="/" end>
              Battles
            </NavLink>
            <NavLink to="/leaderboard">Leaderboard</NavLink>
            {user && (
              <>
                <NavLink to="/history">My bets</NavLink>
                <NavLink to="/wallet">Wallet</NavLink>
              </>
            )}
            {user?.role === 'admin' && <NavLink to="/admin">Admin dashboard</NavLink>}
          </nav>
        )}
      </header>
      <main className="main-content">
        <Outlet />
      </main>
      <footer className="site-footer">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <Zap fill="currentColor" size={18} />
          </span>
          battle<span className="brand-dot">.</span>
        </Link>
        <p>A little instinct. A lot of possibility.</p>
        <span>
          <ShieldCheck size={15} /> Virtual coins · Entertainment only
        </span>
      </footer>
    </>
  );
}

function CategoryIcon({ category, size = 32 }: { category: string; size?: number }) {
  const name = category.toLowerCase();
  return name.includes('sport') ? (
    <Trophy size={size} />
  ) : name.includes('gam') || name.includes('esport') ? (
    <Gamepad2 size={size} />
  ) : name.includes('tech') ? (
    <Zap size={size} />
  ) : name.includes('culture') || name.includes('entertain') ? (
    <Sparkles size={size} />
  ) : (
    <BarChart3 size={size} />
  );
}
function BattleCard({ battle }: { battle: Battle }) {
  const tone = battle.category.toLowerCase().includes('sport')
    ? 'sport'
    : battle.category.toLowerCase().includes('tech')
      ? 'tech'
      : battle.category.toLowerCase().includes('gam')
        ? 'gaming'
        : 'culture';
  const ended = battle.status !== 'open' || new Date(battle.endsAt).getTime() <= Date.now();
  return (
    <Link to={`/battles/${battle.id}`} className="battle-card">
      <div className={`battle-art art-${tone}`}>
        {battle.imageUrl ? (
          <img src={battle.imageUrl} alt="" loading="lazy" />
        ) : (
          <>
            <span className="art-orbit orbit-one" />
            <span className="art-orbit orbit-two" />
            <div className="art-emblem">
              <CategoryIcon category={battle.category} size={48} />
            </div>
            <span className="art-cross">+</span>
            <span className="art-small">
              <Swords size={22} />
            </span>
          </>
        )}
        <span className="category-label">{battle.category}</span>
        <span className={`battle-status ${battle.status === 'settled' ? 'settled' : ''}`}>
          {battle.status === 'settled' ? (
            'Result in'
          ) : ended ? (
            'Closed'
          ) : (
            <>
              <span className="live-dot" /> Live
            </>
          )}
        </span>
      </div>
      <div className="battle-card-body">
        <div className="card-meta">
          <span>
            <Clock3 size={13} />
            {battle.status === 'settled'
              ? 'Battle settled'
              : ended
                ? 'Betting closed'
                : timeLeft(battle.endsAt)}
          </span>
          <span className="multiplier">{Number(battle.multiplier)}× BOOST</span>
        </div>
        <h3>{battle.title}</h3>
        <div className="card-options">
          {battle.options.slice(0, 2).map((option) => (
            <div
              key={option.id}
              className={`mini-option ${battle.winningOptionId === option.id ? 'winning' : ''}`}
            >
              <span>{option.label}</span>
              <strong>{Number(option.odds)}×</strong>
            </div>
          ))}
          {battle.options.length > 2 && (
            <span className="more-options">+{battle.options.length - 2} more options</span>
          )}
        </div>
        <div className="card-bottom">
          <div>
            <span className="pool-icon">
              <Coins size={16} />
            </span>
            <strong>{formatCoins(battle.totalPool)}</strong>
            <span>in pool</span>
          </div>
          <span className="card-arrow">
            <ArrowUpRight size={19} />
          </span>
        </div>
      </div>
    </Link>
  );
}
function Battles() {
  const [items, setItems] = useState<Battle[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('All battles');
  const [status, setStatus] = useState('open');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const query = new URLSearchParams({
      status,
      search: debouncedSearch,
      page: String(page),
      pageSize: '9',
    });
    if (category !== 'All battles') query.set('category', category);
    api<List<Battle>>(`/api/battles?${query}`)
      .then((data) => {
        if (active) {
          setItems(data.items);
          setTotal(data.total);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [category, status, debouncedSearch, page, reload]);
  return (
    <>
      <section className="hero">
        <div className="hero-content">
          <div className="hero-kicker">
            <span className="live-dot" /> THE COMMUNITY PREDICTION ARENA
          </div>
          <h1>
            Pick a side.
            <br />
            Make your <em>move.</em>
          </h1>
          <p>
            Sports, culture, and everything in between.
            <br className="desktop-break" /> Back your instincts. Battle with virtual coins.
          </p>
          <div className="hero-actions">
            <a href="#battles" className="btn btn-lime">
              Explore battles <ArrowUpRight size={18} />
            </a>
            <Link to="/leaderboard" className="hero-leaderboard">
              Meet the leaders <ArrowRight size={16} />
            </Link>
          </div>
          <div className="hero-footnote">
            <ShieldCheck size={15} /> All the competition. Virtual coins only.
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="hero-orbit hero-orbit-one" />
          <div className="hero-orbit hero-orbit-two" />
          <div className="hero-orbit hero-orbit-three" />
          <div className="hero-icon-card hero-trophy">
            <Trophy size={35} />
          </div>
          <div className="hero-center">
            <Zap size={91} fill="currentColor" strokeWidth={1.4} />
          </div>
          <div className="hero-icon-card hero-chart">
            <BarChart3 size={33} />
          </div>
          <div className="hero-pick">
            <span className="live-dot" /> YOUR INSTINCTS. YOUR ARENA.
            <ArrowUpRight size={15} />
          </div>
          <div className="hero-spark spark-one">✦</div>
          <div className="hero-spark spark-two">✦</div>
        </div>
      </section>
      <div className="how-strip">
        <span>
          <span className="step-number">01</span> Find your battle
        </span>
        <ArrowRight size={15} />
        <span>
          <span className="step-number">02</span> Back your answer
        </span>
        <ArrowRight size={15} />
        <span>
          <span className="step-number">03</span> Rise up the ranks
        </span>
        <span className="how-strip-end">
          A good call goes a long way <Sparkles size={16} />
        </span>
      </div>
      <section className="battle-section" id="battles">
        <div className="section-heading">
          <div>
            <span className="eyebrow">THE ARENA IS OPEN</span>
            <h2>
              Find your next battle<span className="heading-dot">.</span>
            </h2>
          </div>
          <label className="sort-select">
            <span className="sr-only">Battle status</span>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="open">Live battles</option>
              <option value="closed">Awaiting results</option>
              <option value="settled">Past battles</option>
              <option value="">All statuses</option>
            </select>
            <ChevronDown size={15} />
          </label>
        </div>
        <div className="browse-toolbar">
          <div className="category-tabs" aria-label="Battle categories">
            {['All battles', 'Sports', 'Technology', 'Gaming', 'Culture'].map((c) => (
              <button
                className={`category-tab ${category === c ? 'active' : ''}`}
                key={c}
                onClick={() => {
                  setCategory(c);
                  setPage(1);
                }}
              >
                {c === 'All battles' ? (
                  <Layers3 size={15} />
                ) : (
                  <CategoryIcon category={c} size={15} />
                )}{' '}
                {c}
              </button>
            ))}
          </div>
          <label className="search-field">
            <Search size={17} />
            <input
              placeholder="Search battles…"
              aria-label="Search battles"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} retry={() => setReload((v) => v + 1)} />
        ) : items.length ? (
          <>
            <div className="battle-grid">
              {items.map((b) => (
                <BattleCard key={b.id} battle={b} />
              ))}
            </div>
            <div className="list-footer">
              <span>
                Showing {Math.min((page - 1) * 9 + 1, total)}–{Math.min(page * 9, total)} of {total}{' '}
                battles
              </span>
              <div className="pagination">
                <button
                  className="btn btn-ghost btn-small"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <button
                  className="btn btn-ghost btn-small"
                  disabled={page * 9 >= total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <Swords size={35} />
            <h3>The next great battle is on its way</h3>
            <p>No battles match these filters. Try another category or check back soon.</p>
            <button
              className="btn btn-dark"
              onClick={() => {
                setCategory('All battles');
                setSearch('');
                setStatus('');
              }}
            >
              Show all battles
            </button>
          </div>
        )}
      </section>
      <section className="community-banner">
        <div className="community-icon">
          <Trophy size={32} />
        </div>
        <div>
          <span className="eyebrow">GOOD CALLS DESERVE THE SPOTLIGHT</span>
          <h3>Climb the community leaderboard.</h3>
          <p>Weekly wins. Monthly momentum. A fresh season every three months.</p>
        </div>
        <Link to="/leaderboard" className="btn btn-dark">
          View rankings <ArrowUpRight size={17} />
        </Link>
      </section>
    </>
  );
}

function BattleDetail() {
  const id = useLocation().pathname.split('/').pop()!;
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [battle, setBattle] = useState<Battle | null>(null);
  const [myBet, setMyBet] = useState<Bet | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [optionId, setOptionId] = useState('');
  const [amount, setAmount] = useState('100');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const load = async () => {
    try {
      const data = await api<{ battle: Battle; myBet: Bet | null }>(`/api/battles/${id}`);
      setBattle(data.battle);
      setMyBet(data.myBet);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    const timer = setInterval(() => setTick((v) => v + 1), 30000);
    return () => clearInterval(timer);
  }, [id]);
  if (loading) return <Loading />;
  if (error || !battle)
    return (
      <ErrorState
        error={error || 'Battle not found'}
        retry={() => {
          setError('');
          load();
        }}
      />
    );
  const closed = battle.status !== 'open' || new Date(battle.endsAt).getTime() <= Date.now();
  const selected = battle.options.find((o) => o.id === optionId);
  const stake = Number(amount);
  const estimate =
    selected && stake > 0
      ? Math.floor(
          (Number(battle.totalPool) + stake) *
            (stake / (Number(selected.totalStake) + stake)) *
            Number(selected.odds) *
            Number(battle.multiplier),
        )
      : 0;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!battle || !confirmed) return;
    setBusy(true);
    try {
      await api(`/api/battles/${id}/bets`, {
        method: 'POST',
        body: JSON.stringify({ optionId, amount: stake }),
      });
      await Promise.all([refresh(), load()]);
      toast('Your bet is locked in. Good luck!');
      setConfirmed(false);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link className="back-link" to="/">
        <ArrowDownLeft size={16} /> Back to the arena
      </Link>
      <div className="detail-layout">
        <section>
          <div className="detail-intro card">
            <div className="detail-kickers">
              <span className="badge">{battle.category}</span>
              <span className={`badge ${battle.status === 'open' && !closed ? 'badge-live' : ''}`}>
                {battle.status === 'settled'
                  ? 'Settled'
                  : closed
                    ? 'Betting closed'
                    : 'Live battle'}
              </span>
              <span className="badge badge-lime">{Number(battle.multiplier)}× multiplier</span>
            </div>
            <h1>{battle.title}</h1>
            <p>{battle.description}</p>
            <div className="detail-stats">
              <div>
                <Coins size={20} />
                <strong>{formatCoins(battle.totalPool)}</strong>
                <span>Total coin pool</span>
              </div>
              <div>
                <Swords size={20} />
                <strong>{formatCoins(battle.participantCount)}</strong>
                <span>Players in battle</span>
              </div>
              <div>
                <Clock3 size={20} />
                <strong>{closed ? 'Closed' : timeLeft(battle.endsAt)}</strong>
                <span>{formatDate(battle.endsAt)}</span>
              </div>
            </div>
          </div>
          <div className="card detail-options">
            <div className="section-heading">
              <h2>Choose your side</h2>
              <span className="muted">{battle.options.length} answers</span>
            </div>
            {battle.options.map((option) => (
              <button
                key={option.id}
                className={`answer-option ${optionId === option.id ? 'selected' : ''} ${battle.winningOptionId === option.id ? 'correct' : ''}`}
                type="button"
                onClick={() => {
                  setOptionId(option.id);
                  setConfirmed(false);
                }}
                disabled={closed || !!myBet}
              >
                <span className="answer-radio">
                  {battle.winningOptionId === option.id ? '✓' : optionId === option.id ? '●' : ''}
                </span>
                <span className="answer-info">
                  <strong>{option.label}</strong>
                  <span>
                    {formatCoins(option.totalStake)} coins · {option.betCount}{' '}
                    {option.betCount === 1 ? 'pick' : 'picks'}
                    {battle.winningOptionId === option.id ? ' · Winning answer' : ''}
                  </span>
                  <span className="answer-track">
                    <span
                      style={{
                        width: `${battle.totalPool ? (Number(option.totalStake) / Number(battle.totalPool)) * 100 : 0}%`,
                      }}
                    />
                  </span>
                </span>
                <span className="answer-odds">{Number(option.odds)}×</span>
              </button>
            ))}
          </div>
          <div className="card rules-card">
            <span className="eyebrow">KNOW YOUR PLAY</span>
            <h3>How rewards work</h3>
            <p>
              A winner’s payout is the final total pool × their share of coins on the winning answer
              × answer odds × battle multiplier. Your share is your bet divided by all coins bet on
              that answer.
            </p>
            <div className="formula">Pool × Your winning stake share × Odds × Multiplier</div>
            <p className="muted">
              Payouts are rounded down to whole coins. Odds and multipliers may create additional
              virtual coins. All bets are final, and each player can place one bet per battle.
              Results are manually confirmed after betting closes. Virtual coins are for
              entertainment and have no cash redemption.
            </p>
          </div>
        </section>
        <aside className="bet-panel card">
          <div className="bet-panel-icon">
            <Zap size={25} fill="currentColor" />
          </div>
          <h2>
            {myBet
              ? 'Your move is locked in'
              : battle.status === 'settled'
                ? 'Battle complete'
                : closed
                  ? 'Waiting for the result'
                  : 'Make your move'}
          </h2>
          {myBet ? (
            <div className="stack">
              <span className={`badge ${myBet.status === 'won' ? 'badge-lime' : ''}`}>
                {myBet.status === 'pending'
                  ? 'Result pending'
                  : myBet.status === 'won'
                    ? 'Winning bet'
                    : 'Better luck next battle'}
              </span>
              <div className="bet-summary">
                <span>Your answer</span>
                <strong>{myBet.optionLabel}</strong>
                <span>Coins placed</span>
                <strong>{formatCoins(myBet.amount)}</strong>
                {myBet.status !== 'pending' && (
                  <>
                    <span>Payout</span>
                    <strong>{formatCoins(myBet.payout)} coins</strong>
                  </>
                )}
              </div>
              <p className="muted">Your bet cannot be changed or cancelled.</p>
              <Link to="/history" className="btn btn-dark">
                View my bets <ArrowRight size={16} />
              </Link>
            </div>
          ) : closed ? (
            <p className="muted">
              {battle.status === 'settled'
                ? 'The winning answer is highlighted. Explore another battle to make your next call.'
                : 'Betting has closed. The final answer and payouts will appear after an administrator confirms the result.'}
            </p>
          ) : !user ? (
            <>
              <p className="muted">Join the arena to back your instincts with virtual coins.</p>
              <Link to="/login" state={{ from: `/battles/${id}` }} className="btn btn-dark">
                Log in to place a bet <ArrowRight size={16} />
              </Link>
              <Link to="/register" className="text-link">
                New here? Create an account
              </Link>
            </>
          ) : (
            <form onSubmit={submit} className="stack">
              <div className="available-balance">
                <span>Your balance</span>
                <strong>
                  <Coins size={15} />
                  {formatCoins(user.balance)}
                </strong>
              </div>
              <label className="field">
                Your answer
                <input
                  readOnly
                  value={selected?.label ?? 'Select an answer to get started'}
                  aria-label="Selected answer"
                />
              </label>
              <label className="field">
                Coins to bet
                <div className="coin-input">
                  <Coins size={20} />
                  <input
                    type="number"
                    min="1"
                    step="1"
                    max={user.balance}
                    required
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      setConfirmed(false);
                    }}
                  />
                </div>
              </label>
              <div className="quick-amounts">
                {[100, 250, 500].map((n) => (
                  <button
                    type="button"
                    key={n}
                    disabled={n > user.balance}
                    onClick={() => {
                      setAmount(String(n));
                      setConfirmed(false);
                    }}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={!user.balance}
                  onClick={() => {
                    setAmount(String(user.balance));
                    setConfirmed(false);
                  }}
                >
                  Max
                </button>
              </div>
              <div className="estimate">
                <span>Estimated payout if you win</span>
                <strong>
                  {formatCoins(estimate)} <small>coins</small>
                </strong>
                <span>Based on the current pool. Final payout may change.</span>
              </div>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  required
                />
                <span>I understand this bet is final and cannot be cancelled.</span>
              </label>
              <button
                className="btn btn-dark"
                disabled={
                  busy ||
                  !selected ||
                  !confirmed ||
                  !Number.isSafeInteger(stake) ||
                  stake < 1 ||
                  stake > user.balance
                }
              >
                {busy ? 'Locking in…' : `Place bet · ${formatCoins(stake)} coins`}
                <ArrowUpRight size={17} />
              </button>
              {user.balance === 0 && (
                <Link className="text-link" to="/wallet">
                  Add coins to your wallet
                </Link>
              )}
            </form>
          )}
          <div className="panel-footer">
            <ShieldCheck size={14} /> Virtual coins. Real competition.
          </div>
        </aside>
      </div>
    </>
  );
}

function AuthPage({ register = false }: { register?: boolean }) {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (user) return <Navigate to="/" replace />;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(e.currentTarget);
    if (new TextEncoder().encode(String(form.get('password'))).length > 72) {
      setError('Password must be no more than 72 UTF-8 bytes.');
      setBusy(false);
      return;
    }
    try {
      await api(`/api/auth/${register ? 'register' : 'login'}`, {
        method: 'POST',
        body: JSON.stringify({
          email: form.get('email'),
          password: form.get('password'),
          ...(register ? { name: form.get('name') } : {}),
        }),
      });
      await refresh();
      toast(
        register ? 'Welcome to the arena. Your first move awaits.' : 'Welcome back to the arena.',
      );
      const from = location.state?.from;
      navigate(
        typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/',
        { replace: true },
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <div className="auth-story">
        <span className="hero-kicker">
          <span className="live-dot" /> YOUR NEXT GREAT CALL STARTS HERE
        </span>
        <h1>
          Big opinions.
          <br />
          <em>Bigger possibilities.</em>
        </h1>
        <p>There’s a battle for every instinct. Find yours.</p>
        <div className="auth-art">
          <div className="auth-zap">
            <Zap size={90} fill="currentColor" />
          </div>
          <Trophy className="auth-trophy" size={45} />
          <Sparkles className="auth-spark" size={36} />
        </div>
        <span className="auth-note">
          <ShieldCheck size={16} /> A virtual-coin community. Entertainment only.
        </span>
      </div>
      <section className="auth-form-wrap">
        <div className="auth-form">
          <span className="eyebrow">
            {register ? 'WELCOME TO BATTLE' : 'GOOD TO SEE YOU AGAIN'}
          </span>
          <h1>{register ? 'Find your edge.' : 'Welcome back.'}</h1>
          <p className="muted">
            {register
              ? 'Create an account and make your first move.'
              : 'Log in to see what’s happening in the arena.'}
          </p>
          <form className="stack" onSubmit={submit}>
            {error && (
              <div className="alert" role="alert">
                {error}
              </div>
            )}
            {register && (
              <label className="field">
                Your name
                <input
                  name="name"
                  autoComplete="name"
                  placeholder="How should we call you?"
                  required
                  minLength={2}
                  maxLength={80}
                />
              </label>
            )}
            <label className="field">
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
                maxLength={254}
              />
            </label>
            <label className="field">
              Password
              <div className="password-input">
                <input
                  name="password"
                  type={show ? 'text' : 'password'}
                  autoComplete={register ? 'new-password' : 'current-password'}
                  placeholder={register ? 'At least 10 characters' : 'Enter your password'}
                  required
                  minLength={register ? 10 : 1}
                  maxLength={72}
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  aria-label={show ? 'Hide password' : 'Show password'}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {register && (
              <p className="auth-disclaimer">
                By joining, you understand that coins are virtual, bets are final, and coins cannot
                be redeemed for cash.
              </p>
            )}
            <button type="submit" className="btn btn-dark" disabled={busy}>
              {busy ? 'One moment…' : register ? 'Create account' : 'Log in'}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="auth-switch">
            {register ? 'Already in the arena?' : 'New to Battle?'}{' '}
            <Link to={register ? '/login' : '/register'}>
              {register ? 'Log in' : 'Create an account'} <ArrowUpRight size={13} />
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}

function Leaderboard() {
  const [period, setPeriod] = useState('');
  const [periods, setPeriods] = useState<string[]>([]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    (async () => {
      const { settings } = await api<{ settings: { enabledPeriods: string[] } }>('/api/settings');
      const enabled = settings.enabledPeriods.filter((p) =>
        ['weekly', 'monthly', 'seasonal'].includes(p),
      );
      if (!enabled.length) throw new Error('Public rankings are currently unavailable.');
      if (active) setPeriods(enabled);
      const selected = enabled.includes(period) ? period : enabled[0];
      const value = await api(`/api/leaderboard?period=${selected}`);
      if (active) setData(value);
    })()
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [period, reload]);
  return (
    <>
      <div className="leaderboard-hero">
        <span className="eyebrow">THE COMMUNITY HALL OF FAME</span>
        <h1>
          Good instincts.
          <br />
          <em>Great company.</em>
        </h1>
        <p>The calls that count. The players making them.</p>
        <div className="leaderboard-hero-trophy">
          <Trophy size={83} />
        </div>
      </div>
      <div className="leaderboard-topbar">
        <div className="tabs">
          {periods.map((p) => (
            <button
              className={`tab ${(data?.period ?? periods[0]) === p ? 'active' : ''}`}
              key={p}
              onClick={() => setPeriod(p)}
            >
              {p === 'weekly' ? 'This week' : p === 'monthly' ? 'This month' : 'This season'}
            </button>
          ))}
        </div>
        <span className="muted">Seasons run for 3 calendar months · UTC</span>
      </div>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} retry={() => setReload((x) => x + 1)} />
      ) : (
        <section className="card rankings-card">
          <div className="section-heading">
            <div>
              <h2>
                {data?.period === 'weekly'
                  ? 'Weekly'
                  : data?.period === 'monthly'
                    ? 'Monthly'
                    : 'Seasonal'}{' '}
                leaders
              </h2>
              <p className="muted">
                {data?.startsAt && formatDate(data.startsAt)} –{' '}
                {data?.endsAt && formatDate(data.endsAt)}
              </p>
            </div>
            <span className="badge badge-lime">
              {data?.metric === 'gross_payout' ? 'Ranked by payouts' : 'Ranked by net profit'}
            </span>
          </div>
          {data?.items?.length ? (
            <div className="rankings-list">
              <div className="ranking-row ranking-labels">
                <span>RANK</span>
                <span>PLAYER</span>
                <span>WINS</span>
                <span>{data.metric === 'gross_payout' ? 'PAYOUTS' : 'NET PROFIT'}</span>
              </div>
              {data.items.map((entry: any, index: number) => (
                <div
                  key={entry.userId ?? entry.id ?? index}
                  className={`ranking-row ${index < 3 ? 'top-rank' : ''}`}
                >
                  <span className={`rank-number rank-${index + 1}`}>
                    {index < 3 ? <Trophy size={20} /> : index + 1}
                  </span>
                  <div className="ranking-player">
                    <span className="ranking-avatar">
                      {(entry.name ?? entry.userName ?? '?').charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <strong>{entry.name ?? entry.userName}</strong>
                      <span>
                        {index === 0
                          ? 'Leading the charge'
                          : index === 1
                            ? 'Right on their heels'
                            : index === 2
                              ? 'A podium-worthy run'
                              : 'Making their mark'}
                      </span>
                    </div>
                  </div>
                  <span className="ranking-wins">{entry.wins ?? entry.winCount ?? '—'}</span>
                  <strong className="ranking-score">
                    <Coins size={16} />
                    {formatCoins(
                      data.metric === 'gross_payout' ? entry.grossPayout : entry.netProfit,
                    )}
                  </strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Trophy size={40} />
              <h3>The podium is wide open</h3>
              <p>Settled battles will bring this period’s leaders into the spotlight.</p>
              <Link to="/" className="btn btn-dark">
                Find a battle <ArrowRight size={16} />
              </Link>
            </div>
          )}
          <p className="ranking-footnote">
            Only settled bets count. Net profit is payout minus coins bet; gross payouts are the
            total virtual coins awarded. Rankings update as battles are settled.
          </p>
        </section>
      )}
    </>
  );
}

function Protected({ admin = false }: { admin?: boolean }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  return loading ? (
    <Loading />
  ) : !user ? (
    <Navigate to="/login" replace state={{ from: location.pathname }} />
  ) : admin && user.role !== 'admin' ? (
    <ErrorState error="This area is available to administrators only." />
  ) : (
    <Outlet />
  );
}
function NotFound() {
  return (
    <div className="empty-state">
      <Swords size={40} />
      <h1>This battle is off the map.</h1>
      <p>The page you’re looking for doesn’t exist.</p>
      <Link to="/" className="btn btn-dark">
        Back to the arena
      </Link>
    </div>
  );
}
function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Battles />} />
              <Route path="battles" element={<Battles />} />
              <Route path="battles/:id" element={<BattleDetail />} />
              <Route path="login" element={<AuthPage />} />
              <Route path="register" element={<AuthPage register />} />
              <Route path="leaderboard" element={<Leaderboard />} />
              <Route element={<Protected />}>
                <Route path="wallet" element={<Wallet />} />
                <Route path="history" element={<History />} />
              </Route>
              <Route element={<Protected admin />}>
                <Route path="admin" element={<Admin />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
