import React, { useEffect, useRef, useState, type FormEvent } from 'react';
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
  useParams,
} from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Clock3,
  Coins,
  Eye,
  EyeOff,
  Home,
  History as HistoryIcon,
  LogOut,
  Menu,
  Moon,
  Search,
  ShieldCheck,
  Sun,
  Swords,
  Trophy,
  UserRound,
  Wallet as WalletIcon,
  X,
} from 'lucide-react';
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
import { PwaStatus } from './Pwa';
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-700.css';
import '../assets/css/style.scss';
import './styles.css';

const image = (name: string) => `/assets/images/${name}`;
const categoryImages: Record<string, string> = {
  Sports: 'icon1.png',
  Technology: 'icon3.png',
  Gaming: 'icon4.png',
  Culture: 'icon2.png',
  Entertainment: 'icon2.png',
  Science: 'icon3.png',
  Crypto: 'icon1.png',
};

function AppShell() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const drawer = useRef<HTMLElement>(null);
  const [dark, setDark] = useState(() => localStorage.getItem('mode') === 'dark');
  const isAdmin = location.pathname.startsWith('/admin');
  const isHome = location.pathname === '/' || location.pathname === '/battles';
  const title = isHome
    ? 'Quizio'
    : location.pathname.startsWith('/battles/')
      ? 'Battle Details'
      : ({
          '/login': 'Sign In',
          '/register': 'Sign Up',
          '/leaderboard': 'Leaderboard',
          '/wallet': 'My Wallet',
          '/history': 'Bet History',
          '/admin': 'Admin CMS',
        }[location.pathname] ?? 'Quizio');
  const secondaryArt = ['/login', '/register', '/leaderboard'].includes(location.pathname);
  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    document.body.classList.toggle('dark', dark);
    document.body.classList.toggle('white', !dark);
    localStorage.setItem('mode', dark ? 'dark' : 'white');
  }, [dark]);
  useEffect(() => {
    if (!menuOpen) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() =>
      drawer.current?.querySelector<HTMLButtonElement>('button')?.focus(),
    );
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
      if (event.key !== 'Tab') return;
      const controls = drawer.current?.querySelectorAll<HTMLElement>(
        'a[href],button:not(:disabled)',
      );
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', listener);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', listener);
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, [menuOpen]);
  async function signOut() {
    try {
      await logout();
      setMenuOpen(false);
      navigate('/');
      toast('You have been signed out.');
    } catch (error) {
      toast((error as Error).message, 'error');
    }
  }
  return (
    <div className={`quizio-frame ${isAdmin ? 'quizio-frame--admin' : ''}`}>
      <img
        className="quizio-header-art"
        src={image(secondaryArt ? 'header-bg-2.png' : 'header-bg-1.png')}
        alt=""
      />
      <span className="quizio-header-glow quizio-header-glow--one" aria-hidden="true" />
      <span className="quizio-header-glow quizio-header-glow--two" aria-hidden="true" />
      <header className="quizio-header">
        <div className="quizio-topbar">
          <div className="quizio-brand">
            {isHome ? (
              <button
                className="quizio-round-button"
                aria-label="Open menu"
                aria-expanded={menuOpen}
                aria-controls="quizio-menu"
                onClick={() => setMenuOpen(true)}
              >
                <Menu size={23} />
              </button>
            ) : (
              <Link to="/" className="quizio-round-button quizio-back" aria-label="Back to home">
                <ArrowLeft size={21} />
              </Link>
            )}
            <h1 className="quizio-page-title">{title}</h1>
          </div>
          <div className="quizio-header-actions">
            {user && (
              <Link
                to="/wallet"
                className="quizio-header-balance"
                aria-label={`Wallet balance ${formatCoins(user.balance)} coins`}
              >
                <Coins size={15} />
                <span>{formatCoins(user.balance)}</span>
              </Link>
            )}
            <Link
              to={user ? '/wallet' : '/login'}
              className="quizio-round-button"
              aria-label={user ? 'My account and wallet' : 'Log in'}
            >
              <UserRound size={19} />
            </Link>
            {!isHome && (
              <button
                className="quizio-round-button"
                aria-label="Open menu"
                aria-expanded={menuOpen}
                aria-controls="quizio-menu"
                onClick={() => setMenuOpen(true)}
              >
                <Menu size={20} />
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="quizio-content">
        <Outlet />
        <PwaStatus />
      </main>
      <nav className="quizio-bottom-nav" aria-label="Main navigation">
        <NavLink to="/" end>
          <Home size={21} />
          <span>Home</span>
        </NavLink>
        <NavLink to="/leaderboard">
          <Trophy size={21} />
          <span>Rankings</span>
        </NavLink>
        <NavLink to="/wallet">
          <WalletIcon size={21} />
          <span>Wallet</span>
        </NavLink>
        <NavLink to="/history">
          <HistoryIcon size={21} />
          <span>My bets</span>
        </NavLink>
        {user?.role === 'admin' && (
          <NavLink to="/admin">
            <ShieldCheck size={21} />
            <span>Admin</span>
          </NavLink>
        )}
      </nav>
      {menuOpen && (
        <div
          className="quizio-drawer-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setMenuOpen(false);
          }}
        >
          <aside
            ref={drawer}
            id="quizio-menu"
            className="quizio-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Quizio menu"
            onClick={(event) => {
              if (event.target instanceof Element && event.target.closest('a[href]'))
                setMenuOpen(false);
            }}
          >
            <div className="section-heading">
              <div className="quizio-drawer-logo">
                <img src={image('quizio-logo.png')} alt="" />
                <strong>Quizio</strong>
              </div>
              <button
                className="icon-btn"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              >
                <X size={22} />
              </button>
            </div>
            <p className="muted">
              {user ? `Welcome, ${user.name}` : 'Your next battle starts here.'}
            </p>
            <Link to="/">
              <Swords size={19} /> Browse battles <ChevronRight size={16} />
            </Link>
            <Link to="/leaderboard">
              <Trophy size={19} /> Leaderboard <ChevronRight size={16} />
            </Link>
            <Link to="/wallet">
              <WalletIcon size={19} /> My wallet <ChevronRight size={16} />
            </Link>
            <Link to="/history">
              <HistoryIcon size={19} /> Bet history <ChevronRight size={16} />
            </Link>
            {user?.role === 'admin' && (
              <Link to="/admin">
                <ShieldCheck size={19} /> Admin CMS <ChevronRight size={16} />
              </Link>
            )}
            <button onClick={() => setDark((value) => !value)}>
              {dark ? <Sun size={19} /> : <Moon size={19} />}
              {dark ? 'Light mode' : 'Dark mode'}
            </button>
            {user ? (
              <button onClick={signOut} aria-label={`Sign out ${user.name}`}>
                <LogOut size={19} /> Sign out
              </button>
            ) : (
              <Link to="/login">
                <UserRound size={19} /> Sign in / Register
              </Link>
            )}
            <small className="quizio-disclaimer">
              <ShieldCheck size={15} /> Virtual coins · Entertainment only
            </small>
          </aside>
        </div>
      )}
    </div>
  );
}

function BattleCard({ battle }: { battle: Battle }) {
  const closed = battle.status !== 'open' || new Date(battle.endsAt).getTime() <= Date.now();
  const end = new Date(battle.endsAt);
  return (
    <Link to={`/battles/${battle.id}`} className="quizio-battle-card">
      <div className="quizio-battle-card-top">
        <span>
          <Clock3 size={14} />
          {battle.status === 'settled'
            ? 'Result published'
            : closed
              ? 'Betting closed'
              : 'Closes in'}
        </span>
        <strong>
          {battle.status === 'settled'
            ? 'Settled'
            : closed
              ? 'Awaiting result'
              : timeLeft(battle.endsAt)}
        </strong>
      </div>
      <div className="quizio-battle-body">
        <div className="quizio-battle-summary">
          <div className="quizio-date-badge">
            <strong>{new Intl.DateTimeFormat('en', { day: '2-digit' }).format(end)}</strong>
            <span>{new Intl.DateTimeFormat('en', { month: 'short' }).format(end)}</span>
          </div>
          <div>
            <span className="quizio-category-label">{battle.category}</span>
            <h3>{battle.title}</h3>
          </div>
          {battle.imageUrl && (
            <img className="quizio-battle-thumb" src={battle.imageUrl} alt="" loading="lazy" />
          )}
        </div>
        <div className="quizio-battle-facts">
          <div>
            <span>Coin pool</span>
            <strong>
              <Coins size={13} />
              {formatCoins(battle.totalPool)}
            </strong>
          </div>
          <div>
            <span>Players</span>
            <strong>{formatCoins(battle.participantCount)}</strong>
          </div>
          <div>
            <span>Multiplier</span>
            <strong>{Number(battle.multiplier)}×</strong>
          </div>
        </div>
        <div className="quizio-battle-options">
          {battle.options.map((option) => (
            <span
              className={battle.winningOptionId === option.id ? 'is-winning' : ''}
              key={option.id}
            >
              {option.label}
              <strong>{Number(option.odds)}×</strong>
            </span>
          ))}
        </div>
        <div className="quizio-battle-footer">
          <span>
            <Swords size={15} />
            {battle.options.length} answers
          </span>
          <strong>
            {battle.status === 'settled'
              ? 'View result'
              : closed
                ? 'View battle'
                : 'Choose your answer'}
            <ChevronRight size={16} />
          </strong>
        </div>
      </div>
    </Link>
  );
}

function Battles() {
  const { user } = useAuth();
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
  const categories = [
    'All battles',
    'Sports',
    'Technology',
    'Gaming',
    'Entertainment',
    'Science',
    'Crypto',
  ];
  return (
    <>
      <section className="quizio-home-intro">
        <p>
          {user
            ? `Hello, ${user.name.split(' ')[0]}! Ready for a battle?`
            : 'Choose a battle. Back your answer.'}
        </p>
        <label className="quizio-search">
          <Search size={19} />
          <input
            aria-label="Search battles"
            placeholder="Search battles…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
      </section>
      <section className="quizio-categories">
        <h2>Browse By Category</h2>
        <div className="quizio-category-tabs" aria-label="Battle categories">
          {categories.map((value, index) => (
            <button
              key={value}
              className={`quizio-category-item ${category === value ? 'active' : ''}`}
              onClick={() => {
                setCategory(value);
                setPage(1);
              }}
            >
              <img src={image(categoryImages[value] || `icon${(index % 4) + 1}.png`)} alt="" />
              <span>{value === 'All battles' ? 'All battles' : value}</span>
            </button>
          ))}
        </div>
      </section>
      <Link to={user ? '/wallet' : '/register'} className="quizio-balance-banner">
        <div className="quizio-balance-copy">
          <span>{user ? 'Your coin balance' : 'Welcome to Quizio Battles'}</span>
          <strong>{user ? formatCoins(user.balance) : 'Join the battle'}</strong>
          <small>
            {user ? 'Manage wallet & deposits' : 'Register and make your first pick'}
            <ArrowRight size={13} />
          </small>
        </div>
        <img src={image('quizio-logo.png')} alt="" />
      </Link>
      <section className="quizio-battles-section">
        <div className="quizio-section-title">
          <h2>
            <Trophy size={21} />
            {status === 'settled'
              ? 'Past Battles'
              : status === 'closed'
                ? 'Awaiting Results'
                : 'Current Battles'}
          </h2>
          <label className="quizio-status-filter">
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
          </label>
        </div>
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} retry={() => setReload((value) => value + 1)} />
        ) : items.length ? (
          <>
            <div className="quizio-battle-list">
              {items.map((battle) => (
                <BattleCard key={battle.id} battle={battle} />
              ))}
            </div>
            <div className="list-footer">
              <span>
                {Math.min((page - 1) * 9 + 1, total)}–{Math.min(page * 9, total)} of {total} battles
              </span>
              <div className="pagination">
                <button
                  className="btn btn-ghost btn-small"
                  disabled={page === 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Previous
                </button>
                <button
                  className="btn btn-ghost btn-small"
                  disabled={page * 9 >= total}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state card">
            <Swords size={32} />
            <h3>No battles found</h3>
            <p>Try another category or check back for the next battle.</p>
            <button
              className="btn btn-primary"
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
      <Link to="/leaderboard" className="quizio-leaderboard-link">
        <img src={image('leader-crown.svg')} alt="" />
        <div>
          <strong>Best Players</strong>
          <span>Weekly, monthly and seasonal rankings</span>
        </div>
        <ChevronRight size={20} />
      </Link>
      <p className="quizio-disclaimer">
        <ShieldCheck size={14} /> Virtual coins only. No cash withdrawals.
      </p>
    </>
  );
}

function BattleDetail() {
  const { id } = useParams();
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
  const [, setTick] = useState(0);
  async function load() {
    try {
      const data = await api<{ battle: Battle; myBet: Bet | null }>(`/api/battles/${id}`);
      setBattle(data.battle);
      setMyBet(data.myBet);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    setLoading(true);
    setError('');
    setOptionId('');
    setConfirmed(false);
    load();
    const timer = setInterval(() => setTick((value) => value + 1), 30_000);
    return () => clearInterval(timer);
  }, [id]);
  if (loading) return <Loading />;
  if (error || !battle)
    return (
      <ErrorState
        error={error || 'Battle not found.'}
        retry={() => {
          setError('');
          load();
        }}
      />
    );
  const closed = battle.status !== 'open' || new Date(battle.endsAt).getTime() <= Date.now();
  const selected = battle.options.find((option) => option.id === optionId);
  const stake = Number(amount);
  const estimate =
    selected && stake > 0
      ? Math.floor(
          (((Number(battle.totalPool) + stake) * stake) / (Number(selected.totalStake) + stake)) *
            Number(selected.odds) *
            Number(battle.multiplier),
        )
      : 0;
  async function submit(event: FormEvent) {
    event.preventDefault();
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
    } catch (error) {
      toast((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="quizio-detail stack">
      <section className="card quizio-detail-card">
        <div className="quizio-detail-kickers">
          <span className="badge">{battle.category}</span>
          <span className={`badge ${battle.status === 'settled' ? 'won' : ''}`}>
            {battle.status === 'settled' ? 'Settled' : closed ? 'Betting closed' : 'Live battle'}
          </span>
          <span className="badge quizio-multiplier">{Number(battle.multiplier)}× multiplier</span>
        </div>
        <h2>{battle.title}</h2>
        <p className="muted">{battle.description}</p>
        <div className="quizio-battle-facts">
          <div>
            <span>Coin pool</span>
            <strong>
              <Coins size={15} />
              {formatCoins(battle.totalPool)}
            </strong>
          </div>
          <div>
            <span>Players</span>
            <strong>{formatCoins(battle.participantCount)}</strong>
          </div>
          <div>
            <span>Betting</span>
            <strong>{closed ? 'Closed' : timeLeft(battle.endsAt)}</strong>
          </div>
        </div>
        <p className="quizio-close-time">
          <Clock3 size={14} />
          {formatDate(battle.endsAt)}
        </p>
      </section>
      <section className="card quizio-answer-card">
        <div className="quizio-section-title">
          <h2>Choose your answer</h2>
          <span className="muted">{battle.options.length} options</span>
        </div>
        <div className="stack">
          {battle.options.map((option) => (
            <button
              type="button"
              key={option.id}
              className={`quizio-answer ${optionId === option.id ? 'quizio-answer--selected' : ''} ${battle.winningOptionId === option.id ? 'quizio-answer--correct' : ''}`}
              disabled={closed || !!myBet}
              onClick={() => {
                setOptionId(option.id);
                setConfirmed(false);
              }}
            >
              <span className="quizio-answer-dot">
                {battle.winningOptionId === option.id ? '✓' : optionId === option.id ? '●' : ''}
              </span>
              <span className="quizio-answer-copy">
                <strong>{option.label}</strong>
                <small>
                  {formatCoins(option.totalStake)} coins · {option.betCount} picks
                  {battle.winningOptionId === option.id ? ' · Winning answer' : ''}
                </small>
                <span className="quizio-answer-track">
                  <span
                    style={{
                      width: `${battle.totalPool ? (Number(option.totalStake) / Number(battle.totalPool)) * 100 : 0}%`,
                    }}
                  />
                </span>
              </span>
              <span className="quizio-odds">{Number(option.odds)}×</span>
            </button>
          ))}
        </div>
      </section>
      <section className="card quizio-bet-panel">
        <div className="quizio-section-title">
          <h2>
            <Coins size={20} />
            {myBet ? 'Your bet' : closed ? 'Battle result' : 'Place your bet'}
          </h2>
        </div>
        {myBet ? (
          <div className="stack">
            <span className={`badge ${myBet.status}`}>
              {myBet.status === 'pending'
                ? 'Result pending'
                : myBet.status === 'won'
                  ? 'Winning bet'
                  : 'Lost'}
            </span>
            <dl className="bet-summary">
              <dt>Your answer</dt>
              <dd>{myBet.optionLabel}</dd>
              <dt>Coins placed</dt>
              <dd>{formatCoins(myBet.amount)}</dd>
              {myBet.status !== 'pending' && (
                <>
                  <dt>Payout</dt>
                  <dd>{formatCoins(myBet.payout)} coins</dd>
                </>
              )}
            </dl>
            <p className="muted">Your bet cannot be changed or cancelled.</p>
            <Link to="/history" className="btn btn-primary">
              View my bets
              <ArrowRight size={16} />
            </Link>
          </div>
        ) : closed ? (
          <p className="muted">
            {battle.status === 'settled'
              ? 'The correct answer is highlighted above. Payouts have been credited.'
              : 'The administrator will confirm the correct answer after closing. Payouts will appear in your wallet and bet history.'}
          </p>
        ) : !user ? (
          <div className="stack">
            <p className="muted">Sign in to join this battle with virtual coins.</p>
            <Link to="/login" state={{ from: `/battles/${id}` }} className="btn btn-primary">
              Log in to place a bet
              <ArrowRight size={16} />
            </Link>
            <Link to="/register" className="text-link">
              Create an account
            </Link>
          </div>
        ) : (
          <form className="stack" onSubmit={submit}>
            <div className="available-balance">
              <span>Your balance</span>
              <strong>
                <Coins size={16} />
                {formatCoins(user.balance)}
              </strong>
            </div>
            <label className="field">
              Your answer
              <input
                readOnly
                aria-label="Selected answer"
                value={selected?.label ?? 'Select an answer above'}
              />
            </label>
            <label className="field">
              Coins to bet
              <div className="coin-input">
                <Coins size={19} />
                <input
                  required
                  type="number"
                  min="1"
                  step="1"
                  max={user.balance}
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    setConfirmed(false);
                  }}
                />
              </div>
            </label>
            <div className="quick-amounts">
              {[100, 250, 500].map((value) => (
                <button
                  type="button"
                  key={value}
                  disabled={value > user.balance}
                  onClick={() => {
                    setAmount(String(value));
                    setConfirmed(false);
                  }}
                >
                  {value}
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
              <small>Based on the current pool. Final payout may change.</small>
            </div>
            <label className="checkbox-field">
              <input
                type="checkbox"
                required
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>I understand this bet is final and cannot be cancelled.</span>
            </label>
            <button
              className="btn btn-primary"
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
              <ArrowRight size={17} />
            </button>
            {user.balance === 0 && (
              <Link to="/wallet" className="text-link">
                Add coins to your wallet
              </Link>
            )}
          </form>
        )}
      </section>
      <section className="card rules-card">
        <h2>Battle instructions</h2>
        <p>
          Payout = final pool × your share of stakes on the winning answer × answer odds × battle
          multiplier.
        </p>
        <p className="muted">
          Your share is your stake divided by all stakes on the correct answer. Rewards round down
          to whole coins. Multipliers can create extra virtual coins. One final bet per battle; no
          changes or cancellations. Virtual coins cannot be redeemed for cash.
        </p>
      </section>
    </div>
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
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    if (new TextEncoder().encode(String(form.get('password'))).length > 72) {
      setError('Please choose a shorter password.');
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
      toast(register ? 'Welcome to Quizio. Make your first pick!' : 'Welcome back to Quizio.');
      const from = location.state?.from;
      navigate(
        typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/',
        { replace: true },
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card quizio-auth-card">
      <div className="quizio-auth-tabs">
        <Link to="/login" className={!register ? 'active' : ''}>
          Sign In
        </Link>
        <Link to="/register" className={register ? 'active' : ''}>
          Sign Up
        </Link>
      </div>
      <div className="quizio-auth-intro">
        <img src={image('quizio-logo.png')} alt="Quizio" />
        <h2>{register ? 'Join the battle' : 'Welcome back!'}</h2>
        <p>
          {register
            ? 'Create your account to start predicting.'
            : 'Sign in to your Quizio account.'}
        </p>
      </div>
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
              required
              minLength={2}
              maxLength={80}
              autoComplete="name"
              placeholder="Enter your name"
            />
          </label>
        )}
        <label className="field">
          Email address
          <input
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            placeholder="Enter email address"
          />
        </label>
        <label className="field">
          Password
          <div className="password-input">
            <input
              name="password"
              type={show ? 'text' : 'password'}
              required
              minLength={register ? 10 : 1}
              maxLength={72}
              autoComplete={register ? 'new-password' : 'current-password'}
              placeholder={register ? 'At least 10 characters' : 'Enter your password'}
            />
            <button
              type="button"
              aria-label={show ? 'Hide password' : 'Show password'}
              onClick={() => setShow((value) => !value)}
            >
              {show ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
          </div>
        </label>
        {register && (
          <p className="auth-disclaimer">
            Coins are virtual, bets are final, and coins cannot be redeemed for cash.
          </p>
        )}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Please wait…' : register ? 'Create account' : 'Log in'}
          <ArrowRight size={17} />
        </button>
      </form>
      <p className="auth-switch">
        {register ? 'Already have an account?' : 'Don’t have an account?'}
        <Link to={register ? '/login' : '/register'}>
          {register ? 'Log in' : 'Create an account'}
        </Link>
      </p>
    </section>
  );
}

type RankingEntry = {
  rank: number;
  userId: string;
  name: string;
  wins: number;
  netProfit: number;
  totalPayout: number;
  score: number;
};
type Ranking = {
  period: string;
  startsAt: string;
  endsAt: string;
  metric: string;
  items: RankingEntry[];
};
function Leaderboard() {
  const [period, setPeriod] = useState('');
  const [periods, setPeriods] = useState<string[]>([]);
  const [data, setData] = useState<Ranking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    (async () => {
      const { settings } = await api<{ settings: { enabledPeriods: string[] } }>('/api/settings');
      const enabled = settings.enabledPeriods.filter((value) =>
        ['weekly', 'monthly', 'seasonal'].includes(value),
      );
      if (!enabled.length) throw new Error('Public rankings are currently unavailable.');
      if (active) setPeriods(enabled);
      const selected = enabled.includes(period) ? period : enabled[0];
      const result = await api<Ranking>(`/api/leaderboard?period=${selected}`);
      if (active) setData(result);
    })()
      .catch((error) => {
        if (active) setError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [period, reload]);
  const label = (value: string) =>
    value === 'weekly' ? 'This week' : value === 'monthly' ? 'This month' : 'This season';
  const heading =
    data?.period === 'weekly'
      ? 'Weekly leaders'
      : data?.period === 'monthly'
        ? 'Monthly leaders'
        : 'Seasonal leaders';
  return (
    <div className="quizio-rankings">
      <div className="quizio-ranking-tabs" aria-label="Ranking periods">
        {periods.map((value) => (
          <button
            className={(data?.period ?? periods[0]) === value ? 'active' : ''}
            key={value}
            onClick={() => setPeriod(value)}
          >
            {label(value)}
          </button>
        ))}
      </div>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} retry={() => setReload((value) => value + 1)} />
      ) : (
        data && (
          <>
            {data.items.length > 0 && (
              <div className="quizio-podium" aria-label="Top three players">
                {[1, 0, 2].map((index) => {
                  const entry = data.items[index];
                  return entry ? (
                    <div className={`quizio-podium-player place-${index + 1}`} key={entry.userId}>
                      <div className="quizio-podium-avatar">
                        <span>{entry.name.charAt(0).toUpperCase()}</span>
                        <img src={image('leader-img-bg.png')} alt="" />
                        {index === 0 && (
                          <img
                            className="quizio-podium-crown"
                            src={image('leader-crown.svg')}
                            alt=""
                          />
                        )}
                        <strong>{entry.rank}</strong>
                      </div>
                      <span className="quizio-podium-name">{entry.name}</span>
                      <span className="quizio-podium-score">
                        <Coins size={12} />
                        {formatCoins(entry.score)}
                      </span>
                    </div>
                  ) : (
                    <div className="quizio-podium-player" key={index} />
                  );
                })}
              </div>
            )}
            <section className="card quizio-rank-list">
              <div className="quizio-section-title">
                <h2>{heading}</h2>
                <Trophy size={21} />
              </div>
              <p className="muted quizio-rank-dates">
                {formatDate(data.startsAt)} – {formatDate(data.endsAt)}
              </p>
              {data.items.length ? (
                data.items.map((entry) => (
                  <div
                    className={`quizio-rank-row ${entry.rank === 1 ? 'quizio-rank-row--leader' : ''}`}
                    key={entry.userId}
                  >
                    <span className="quizio-rank-position">
                      {entry.rank <= 3 ? (
                        <img src={image(`medal${entry.rank}.svg`)} alt={`Rank ${entry.rank}`} />
                      ) : (
                        entry.rank
                      )}
                    </span>
                    <span className="quizio-rank-avatar">{entry.name.charAt(0).toUpperCase()}</span>
                    <div>
                      <strong>{entry.name}</strong>
                      <small>
                        {entry.wins} {entry.wins === 1 ? 'win' : 'wins'}
                      </small>
                    </div>
                    <span className="quizio-rank-score">
                      <Coins size={13} />
                      {formatCoins(entry.score)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <img className="quizio-empty-cup" src={image('result-cup.svg')} alt="" />
                  <h3>The podium is waiting</h3>
                  <p>Rankings appear once battles have been settled.</p>
                  <Link to="/" className="btn btn-primary">
                    Find a battle
                  </Link>
                </div>
              )}
              <p className="quizio-ranking-rules">
                Ranked by{' '}
                {data.metric === 'gross_payout'
                  ? 'total winning payouts'
                  : 'net profit (payout minus stake)'}
                . Only settled bets count. Weeks start Monday; seasons are 3-month calendar
                quarters, UTC.
              </p>
            </section>
          </>
        )
      )}
    </div>
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
    <div className="card empty-state">
      <Swords size={35} />
      <h2>This page could not be found</h2>
      <Link to="/" className="btn btn-primary">
        Back to home
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
              <Route path="home.html" element={<Navigate to="/" replace />} />
              <Route path="index.html" element={<Navigate to="/" replace />} />
              <Route path="sign-in.html" element={<Navigate to="/login" replace />} />
              <Route path="sign-up.html" element={<Navigate to="/register" replace />} />
              <Route path="my-wallet.html" element={<Navigate to="/wallet" replace />} />
              <Route path="leader-board.html" element={<Navigate to="/leaderboard" replace />} />
              <Route path="result-summary.html" element={<Navigate to="/history" replace />} />
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
