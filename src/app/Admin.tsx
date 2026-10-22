import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  Search,
  X,
  Settings2,
  ShieldCheck,
  Coins,
  Swords,
  ArrowUpRight,
  Users,
  ClipboardList,
  Trophy,
  Check,
  Ban,
  Pencil,
} from 'lucide-react';
import { api, formatCoins, formatDate, useToast } from './shared';
import './Admin.css';

type Tab = 'battles' | 'deposits' | 'bets' | 'packages' | 'settings' | 'users';
type Option = { id?: string; label: string; odds: number; totalStake?: number; betCount?: number };
type Battle = {
  id: string;
  title: string;
  description: string;
  category: string;
  imageUrl: string | null;
  endsAt: string;
  status: string;
  multiplier: number;
  totalPool: number;
  participantCount: number;
  winningOptionId: string | null;
  options: Option[];
};
type CoinPackage = {
  id: string;
  name: string;
  coins: number;
  bonusCoins: number;
  price: number;
  originalPrice: number | null;
  currency: string;
  active: boolean;
};
type Settings = {
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  transferInstructions: string;
  currency: string;
  rankingMetric: 'net_profit' | 'gross_payout';
  enabledPeriods: string[];
};
type Deposit = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  packageName: string;
  coins: number;
  amount: number;
  currency: string;
  transferReference: string;
  note: string | null;
  status: string;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
};
type Bet = {
  id: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  battleId: string;
  battleTitle: string;
  optionLabel: string;
  amount: number;
  payout: number;
  status: string;
  createdAt: string;
};
type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  balance: number;
  createdAt: string;
};
type List<T> = { items: T[]; total: number; page: number; pageSize: number };
type BattleDraft = {
  title: string;
  description: string;
  category: string;
  imageUrl: string;
  endsAt: string;
  multiplier: number;
  options: Option[];
};
const localDateTime = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const emptyBattle = (): BattleDraft => ({
  title: '',
  description: '',
  category: 'General',
  imageUrl: '',
  endsAt: localDateTime(new Date(Date.now() + 7 * 86400000)),
  multiplier: 1,
  options: [
    { label: '', odds: 2 },
    { label: '', odds: 2 },
  ],
});
const emptyPackage = (): Omit<CoinPackage, 'id'> => ({
  name: '',
  coins: 1000,
  bonusCoins: 0,
  price: 10,
  originalPrice: null,
  currency: 'USD',
  active: true,
});
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.';
const json = (method: string, body?: unknown) => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const money = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).format(Number(amount));
  } catch {
    return `${amount} ${currency}`;
  }
};

export default function Admin() {
  const [tab, setTab] = useState<Tab>('battles');
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<unknown[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState('');
  const [editBattle, setEditBattle] = useState<Battle | 'new' | null>(null);
  const [battleDraft, setBattleDraft] = useState<BattleDraft>(emptyBattle);
  const [settleBattle, setSettleBattle] = useState<Battle | null>(null);
  const [winningOption, setWinningOption] = useState('');
  const [editPackage, setEditPackage] = useState<CoinPackage | 'new' | null>(null);
  const [packageDraft, setPackageDraft] = useState<Omit<CoinPackage, 'id'>>(emptyPackage);
  const [reviewDeposit, setReviewDeposit] = useState<Deposit | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const toast = useToast();
  const reload = () => setRefresh((value) => value + 1);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (query.trim()) params.set('search', query.trim());
    if (status) params.set('status', status);
    const path =
      tab === 'packages'
        ? '/api/admin/packages'
        : tab === 'settings'
          ? '/api/settings'
          : `/api/admin/${tab}?${params}`;
    api<List<unknown> | { settings: Settings }>(path)
      .then((result) => {
        if (!active) return;
        if (tab === 'settings') setSettings((result as { settings: Settings }).settings);
        else {
          const list = result as List<unknown>;
          setRows(list.items || []);
          setTotal(list.total ?? list.items?.length ?? 0);
        }
      })
      .catch((err) => {
        if (active) setError(message(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tab, page, query, status, refresh]);

  const switchTab = (next: Tab) => {
    setTab(next);
    setPage(1);
    setQuery('');
    setStatus('');
    setRows([]);
  };
  async function perform(key: string, task: () => Promise<unknown>, success: string) {
    setBusy(key);
    try {
      await task();
      toast(success, 'success');
      reload();
      return true;
    } catch (err) {
      toast(message(err), 'error');
      return false;
    } finally {
      setBusy('');
    }
  }
  const openBattle = (battle: Battle | 'new') => {
    setEditBattle(battle);
    setBattleDraft(
      battle === 'new'
        ? emptyBattle()
        : {
            title: battle.title,
            description: battle.description,
            category: battle.category,
            imageUrl: battle.imageUrl || '',
            endsAt: new Date(
              new Date(battle.endsAt).getTime() -
                new Date(battle.endsAt).getTimezoneOffset() * 60000,
            )
              .toISOString()
              .slice(0, 16),
            multiplier: Number(battle.multiplier),
            options: battle.options.map((option) => ({
              id: option.id,
              label: option.label,
              odds: Number(option.odds),
            })),
          },
    );
  };
  const saveBattle = async (event: FormEvent) => {
    event.preventDefault();
    if (!editBattle) return;
    const locked =
      editBattle !== 'new' && (Number(editBattle.totalPool) > 0 || editBattle.participantCount > 0);
    const payload = {
      ...battleDraft,
      imageUrl: battleDraft.imageUrl || '',
      endsAt: new Date(battleDraft.endsAt).toISOString(),
    };
    const body = locked
      ? {
          title: payload.title,
          description: payload.description,
          category: payload.category,
          imageUrl: payload.imageUrl,
        }
      : payload;
    if (
      await perform(
        'battle-form',
        () =>
          api(
            editBattle === 'new' ? '/api/admin/battles' : `/api/admin/battles/${editBattle.id}`,
            json(editBattle === 'new' ? 'POST' : 'PATCH', body),
          ),
        editBattle === 'new' ? 'Battle published.' : 'Battle updated.',
      )
    )
      setEditBattle(null);
  };
  const openPackage = (item: CoinPackage | 'new') => {
    setEditPackage(item);
    setPackageDraft(
      item === 'new'
        ? emptyPackage()
        : {
            ...item,
            coins: Number(item.coins),
            bonusCoins: Number(item.bonusCoins),
            price: Number(item.price),
            originalPrice: item.originalPrice ? Number(item.originalPrice) : null,
          },
    );
  };
  const savePackage = async (event: FormEvent) => {
    event.preventDefault();
    if (!editPackage) return;
    if (
      await perform(
        'package-form',
        () =>
          api(
            editPackage === 'new' ? '/api/admin/packages' : `/api/admin/packages/${editPackage.id}`,
            json(editPackage === 'new' ? 'POST' : 'PATCH', {
              ...packageDraft,
              originalPrice: packageDraft.originalPrice ?? packageDraft.price,
            }),
          ),
        'Coin package saved.',
      )
    )
      setEditPackage(null);
  };
  const saveSettings = async (event: FormEvent) => {
    event.preventDefault();
    if (!settings) return;
    await perform(
      'settings',
      () => api('/api/admin/settings', json('PATCH', settings)),
      'Bank and leaderboard settings saved.',
    );
  };
  const review = async (decision: 'approve' | 'reject') => {
    if (!reviewDeposit) return;
    if (
      await perform(
        `review-${decision}`,
        () =>
          api(
            `/api/admin/deposits/${reviewDeposit.id}/${decision}`,
            json('POST', { note: reviewNote }),
          ),
        decision === 'approve' ? 'Deposit approved and wallet credited.' : 'Deposit rejected.',
      )
    )
      setReviewDeposit(null);
  };

  const tabs: { key: Tab; label: string; icon: typeof Swords }[] = [
    { key: 'battles', label: 'Battles', icon: Swords },
    { key: 'deposits', label: 'Deposits', icon: Coins },
    { key: 'bets', label: 'All bets', icon: ClipboardList },
    { key: 'packages', label: 'Coin packages', icon: ArrowUpRight },
    { key: 'settings', label: 'Settings', icon: Settings2 },
    { key: 'users', label: 'Members', icon: Users },
  ];
  const filtered = ['battles', 'deposits', 'bets', 'users'].includes(tab);
  const stateOptions =
    tab === 'battles'
      ? ['open', 'closed', 'settled']
      : tab === 'deposits'
        ? ['pending', 'approved', 'rejected']
        : ['pending', 'won', 'lost'];
  return (
    <section className="admin-page">
      <div className="page-header">
        <div>
          <div className="eyebrow">
            <ShieldCheck size={15} /> ADMIN WORKSPACE
          </div>
          <h1 className="page-title">
            The control room<span>.</span>
          </h1>
          <p className="muted">Create the competition. Keep every coin accounted for.</p>
        </div>
        <span className="admin-access">
          <ShieldCheck size={17} /> Administrator
        </span>
      </div>
      <div className="admin-nav" aria-label="Administration sections">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`admin-nav-item ${tab === key ? 'active' : ''}`}
            onClick={() => switchTab(key)}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </div>
      <div className="admin-section-head">
        <div>
          <h2>{tabs.find((item) => item.key === tab)?.label}</h2>
          <p className="muted">
            {tab === 'battles'
              ? 'Manage topics, odds, closing times and final results.'
              : tab === 'deposits'
                ? 'Verify bank transfers before approving coin credits.'
                : tab === 'bets'
                  ? 'An immutable record of every pick and payout.'
                  : tab === 'packages'
                    ? 'Set coin offers, pricing and bonus rewards.'
                    : tab === 'settings'
                      ? 'Configure transfer instructions and ranking rules.'
                      : 'View registered members and their virtual coin balances.'}
          </p>
        </div>
        {tab === 'battles' && (
          <button className="btn btn-primary" onClick={() => openBattle('new')}>
            <Plus size={17} />
            Create battle
          </button>
        )}
        {tab === 'packages' && (
          <button className="btn btn-primary" onClick={() => openPackage('new')}>
            <Plus size={17} />
            Add package
          </button>
        )}
      </div>
      {filtered && (
        <div className="admin-filter-bar">
          <label className="admin-search">
            <Search size={17} />
            <input
              aria-label={tab === 'bets' ? 'Filter bets by member name or email' : `Search ${tab}`}
              placeholder={tab === 'bets' ? 'Search member name or email…' : `Search ${tab}…`}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
          </label>
          {tab !== 'users' && (
            <select
              aria-label="Filter by status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {stateOptions.map((item) => (
                <option key={item} value={item}>
                  {item.charAt(0).toUpperCase() + item.slice(1)}
                </option>
              ))}
            </select>
          )}
          <span className="muted admin-result-count">{total} records</span>
        </div>
      )}
      {error && (
        <div className="alert" role="alert">
          {error}
          <button className="btn btn-ghost" onClick={reload}>
            Try again
          </button>
        </div>
      )}
      {loading ? (
        <div className="card empty-state" role="status">
          Loading your workspace…
        </div>
      ) : (
        !error && (
          <>
            {tab === 'battles' && (
              <div className="admin-battle-list">
                {(rows as Battle[]).map((battle) => (
                  <article className="card admin-battle" key={battle.id}>
                    <div className="admin-battle-top">
                      <div>
                        <span className={`badge ${battle.status}`}>{battle.status}</span>
                        <span className="admin-category">{battle.category}</span>
                        <h3>{battle.title}</h3>
                      </div>
                      <button
                        className="btn btn-ghost admin-icon-btn"
                        aria-label={`Edit ${battle.title}`}
                        onClick={() => openBattle(battle)}
                        disabled={battle.status !== 'open'}
                      >
                        <Pencil size={17} />
                      </button>
                    </div>
                    <div className="admin-battle-options">
                      {battle.options.map((option) => (
                        <div
                          key={option.id || option.label}
                          className={battle.winningOptionId === option.id ? 'winner' : ''}
                        >
                          <span>
                            {option.label}
                            {battle.winningOptionId === option.id && <Check size={14} />}
                          </span>
                          <strong>{Number(option.odds)}×</strong>
                        </div>
                      ))}
                    </div>
                    <div className="admin-battle-bottom">
                      <div className="admin-battle-meta">
                        <span>
                          <Coins size={14} /> {formatCoins(battle.totalPool)} pool
                        </span>
                        <span>
                          <Users size={14} /> {battle.participantCount} players
                        </span>
                        <span>Topic {Number(battle.multiplier)}×</span>
                        <span>Closes {formatDate(battle.endsAt)}</span>
                      </div>
                      {battle.status === 'open' && (
                        <button
                          className="btn btn-ghost"
                          disabled={!!busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                'Close this battle? New bets will no longer be accepted.',
                              )
                            )
                              void perform(
                                battle.id,
                                () => api(`/api/admin/battles/${battle.id}/close`, json('POST')),
                                'Battle closed. You can now choose the result.',
                              );
                          }}
                        >
                          Close battle
                        </button>
                      )}
                      {battle.status === 'closed' && (
                        <button
                          className="btn btn-primary"
                          onClick={() => {
                            setSettleBattle(battle);
                            setWinningOption('');
                          }}
                        >
                          <Trophy size={15} />
                          Set result
                        </button>
                      )}
                    </div>
                  </article>
                ))}
                {rows.length === 0 && (
                  <Empty
                    title="No battles found"
                    text="Create a new topic or adjust your search to get started."
                  />
                )}
              </div>
            )}
            {tab === 'deposits' && (
              <Table
                headers={[
                  'Member / reference',
                  'Package',
                  'Transfer',
                  'Requested',
                  'Status',
                  'Review',
                ]}
                empty={rows.length === 0}
              >
                {(rows as Deposit[]).map((deposit) => (
                  <tr key={deposit.id}>
                    <td>
                      <strong>{deposit.userName}</strong>
                      <small>{deposit.userEmail}</small>
                      <code>{deposit.transferReference}</code>
                    </td>
                    <td>
                      {deposit.packageName}
                      <small>{formatCoins(deposit.coins)} coins</small>
                    </td>
                    <td>
                      <strong>{money(deposit.amount, deposit.currency)}</strong>
                      {deposit.note && <small>{deposit.note}</small>}
                    </td>
                    <td>{formatDate(deposit.createdAt)}</td>
                    <td>
                      <span className={`badge ${deposit.status}`}>{deposit.status}</span>
                      {deposit.reviewNote && <small>{deposit.reviewNote}</small>}
                    </td>
                    <td>
                      {deposit.status === 'pending' ? (
                        <button
                          className="btn btn-ghost"
                          onClick={() => {
                            setReviewDeposit(deposit);
                            setReviewNote('');
                          }}
                        >
                          Review transfer
                        </button>
                      ) : (
                        <span className="muted">
                          {deposit.reviewedAt ? formatDate(deposit.reviewedAt) : 'Reviewed'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
            {tab === 'bets' && (
              <Table
                headers={['Member', 'Battle / answer', 'Stake', 'Payout', 'Status', 'Placed']}
                empty={rows.length === 0}
              >
                {(rows as Bet[]).map((bet) => (
                  <tr key={bet.id}>
                    <td>
                      <strong>{bet.userName || 'Member'}</strong>
                      <small>{bet.userEmail || bet.userId}</small>
                    </td>
                    <td>
                      <strong>{bet.battleTitle}</strong>
                      <small>{bet.optionLabel}</small>
                    </td>
                    <td>{formatCoins(bet.amount)}</td>
                    <td>{formatCoins(bet.payout)}</td>
                    <td>
                      <span className={`badge ${bet.status}`}>{bet.status}</span>
                    </td>
                    <td>{formatDate(bet.createdAt)}</td>
                  </tr>
                ))}
              </Table>
            )}
            {tab === 'users' && (
              <Table
                headers={['Member', 'Role', 'Coin balance', 'Joined']}
                empty={rows.length === 0}
              >
                {(rows as AdminUser[]).map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.name}</strong>
                      <small>{user.email}</small>
                    </td>
                    <td>
                      <span className="badge">{user.role}</span>
                    </td>
                    <td>
                      <strong>{formatCoins(user.balance)}</strong>
                    </td>
                    <td>{formatDate(user.createdAt)}</td>
                  </tr>
                ))}
              </Table>
            )}
            {tab === 'packages' && (
              <div className="admin-package-grid">
                {(rows as CoinPackage[]).map((item) => (
                  <article className="card admin-package" key={item.id}>
                    <div className="admin-battle-top">
                      <span className={`badge ${item.active ? 'open' : ''}`}>
                        {item.active ? 'Active' : 'Inactive'}
                      </span>
                      <button
                        className="btn btn-ghost admin-icon-btn"
                        aria-label={`Edit ${item.name}`}
                        onClick={() => openPackage(item)}
                      >
                        <Pencil size={17} />
                      </button>
                    </div>
                    <div className="admin-package-icon">
                      <Coins size={24} />
                    </div>
                    <h3>{item.name}</h3>
                    <div className="admin-package-coins">
                      {formatCoins(Number(item.coins) + Number(item.bonusCoins))}
                      <span>coins</span>
                    </div>
                    {Number(item.bonusCoins) > 0 && (
                      <p className="admin-bonus">
                        Includes {formatCoins(item.bonusCoins)} bonus coins
                      </p>
                    )}
                    <div className="admin-package-price">
                      {item.originalPrice && Number(item.originalPrice) > Number(item.price) && (
                        <del>{money(item.originalPrice, item.currency)}</del>
                      )}
                      <strong>{money(item.price, item.currency)}</strong>
                    </div>
                  </article>
                ))}
                {rows.length === 0 && (
                  <Empty
                    title="No coin packages yet"
                    text="Add an offer so members can request a manual deposit."
                  />
                )}
              </div>
            )}
            {tab === 'settings' && settings && (
              <form onSubmit={saveSettings} className="admin-settings-grid">
                <div className="card admin-settings-card">
                  <div className="admin-card-heading">
                    <Coins size={20} />
                    <div>
                      <h3>Manual bank transfers</h3>
                      <p className="muted">Members see these details when making a deposit.</p>
                    </div>
                  </div>
                  <div className="stack">
                    <Field label="Bank name">
                      <input
                        value={settings.bankName}
                        onChange={(event) =>
                          setSettings({ ...settings, bankName: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Account holder">
                      <input
                        value={settings.bankAccountName}
                        onChange={(event) =>
                          setSettings({ ...settings, bankAccountName: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Account number">
                      <input
                        value={settings.bankAccountNumber}
                        onChange={(event) =>
                          setSettings({ ...settings, bankAccountNumber: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Currency (ISO code)">
                      <input
                        required
                        minLength={3}
                        maxLength={3}
                        value={settings.currency}
                        onChange={(event) =>
                          setSettings({ ...settings, currency: event.target.value.toUpperCase() })
                        }
                      />
                    </Field>
                    <Field label="Transfer instructions">
                      <textarea
                        rows={4}
                        value={settings.transferInstructions}
                        onChange={(event) =>
                          setSettings({ ...settings, transferInstructions: event.target.value })
                        }
                      />
                    </Field>
                  </div>
                </div>
                <div className="card admin-settings-card">
                  <div className="admin-card-heading">
                    <Trophy size={20} />
                    <div>
                      <h3>Leaderboard rules</h3>
                      <p className="muted">Rankings are calculated from settled results.</p>
                    </div>
                  </div>
                  <Field label="Ranking metric">
                    <select
                      value={settings.rankingMetric}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          rankingMetric: event.target.value as Settings['rankingMetric'],
                        })
                      }
                    >
                      <option value="net_profit">Net profit (payout − stakes)</option>
                      <option value="gross_payout">Total winning payouts</option>
                    </select>
                  </Field>
                  <fieldset className="admin-periods">
                    <legend>Enabled public rankings</legend>
                    {[
                      { id: 'weekly', text: 'Weekly', detail: 'Monday → Sunday, UTC' },
                      { id: 'monthly', text: 'Monthly', detail: 'Calendar months, UTC' },
                      {
                        id: 'seasonal',
                        text: 'Seasonal',
                        detail: '3-month calendar quarters, UTC',
                      },
                    ].map((period) => (
                      <label key={period.id}>
                        <input
                          type="checkbox"
                          disabled={
                            settings.enabledPeriods.length === 1 &&
                            settings.enabledPeriods.includes(period.id)
                          }
                          checked={settings.enabledPeriods.includes(period.id)}
                          onChange={(event) =>
                            setSettings({
                              ...settings,
                              enabledPeriods: event.target.checked
                                ? [...settings.enabledPeriods, period.id]
                                : settings.enabledPeriods.filter((value) => value !== period.id),
                            })
                          }
                        />
                        <span>
                          <strong>{period.text}</strong>
                          <small>{period.detail}</small>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <p className="admin-info">
                    Rankings start a new period automatically. At least one period must remain
                    enabled. Previous results stay in the immutable bet history.
                  </p>
                  <button className="btn btn-primary" disabled={!!busy}>
                    {busy === 'settings' ? 'Saving…' : 'Save settings'}
                  </button>
                </div>
              </form>
            )}
            {filtered && total > 20 && (
              <div className="admin-pagination">
                <span className="muted">
                  Page {page} of {Math.ceil(total / 20)}
                </span>
                <button
                  className="btn btn-ghost"
                  disabled={page === 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Previous
                </button>
                <button
                  className="btn btn-ghost"
                  disabled={page * 20 >= total}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )
      )}
      {editBattle && (
        <Modal
          title={editBattle === 'new' ? 'Create a battle' : 'Edit battle'}
          onClose={() => !busy && setEditBattle(null)}
        >
          <form onSubmit={saveBattle} className="stack">
            <Field label="Battle title">
              <input
                required
                minLength={5}
                maxLength={180}
                value={battleDraft.title}
                onChange={(event) => setBattleDraft({ ...battleDraft, title: event.target.value })}
                placeholder="Who will take the championship?"
              />
            </Field>
            <Field label="Description and rules">
              <textarea
                required
                rows={3}
                value={battleDraft.description}
                onChange={(event) =>
                  setBattleDraft({ ...battleDraft, description: event.target.value })
                }
                placeholder="Explain the topic and how the final answer is decided."
              />
            </Field>
            <div className="form-grid">
              <Field label="Category">
                <input
                  required
                  value={battleDraft.category}
                  onChange={(event) =>
                    setBattleDraft({ ...battleDraft, category: event.target.value })
                  }
                />
              </Field>
              <Field label="Topic multiplier">
                <input
                  required
                  type="number"
                  min="0.01"
                  max="100"
                  step="0.01"
                  disabled={
                    editBattle !== 'new' &&
                    (Number(editBattle.totalPool) > 0 || editBattle.participantCount > 0)
                  }
                  value={battleDraft.multiplier}
                  onChange={(event) =>
                    setBattleDraft({ ...battleDraft, multiplier: Number(event.target.value) })
                  }
                />
              </Field>
            </div>
            <Field label="Closing date and time (your local timezone)">
              <input
                required
                type="datetime-local"
                disabled={
                  editBattle !== 'new' &&
                  (Number(editBattle.totalPool) > 0 || editBattle.participantCount > 0)
                }
                value={battleDraft.endsAt}
                onChange={(event) => setBattleDraft({ ...battleDraft, endsAt: event.target.value })}
              />
            </Field>
            <Field label="Cover image URL (optional)">
              <input
                type="url"
                value={battleDraft.imageUrl}
                onChange={(event) =>
                  setBattleDraft({ ...battleDraft, imageUrl: event.target.value })
                }
                placeholder="https://…"
              />
            </Field>
            <div>
              <div className="admin-options-heading">
                <strong>Answer options & odds</strong>
                <span className="muted">At least two options</span>
              </div>
              {editBattle !== 'new' &&
                (Number(editBattle.totalPool) > 0 || editBattle.participantCount > 0) && (
                  <p className="admin-info">
                    Bets already exist. Answers, odds, multiplier and closing time are locked.
                  </p>
                )}
              <div className="stack">
                {battleDraft.options.map((option, index) => (
                  <div className="admin-option-form" key={option.id || index}>
                    <Field label={`Answer ${index + 1}`}>
                      <input
                        required
                        disabled={
                          editBattle !== 'new' &&
                          (Number(editBattle.totalPool) > 0 || editBattle.participantCount > 0)
                        }
                        value={option.label}
                        onChange={(event) =>
                          setBattleDraft({
                            ...battleDraft,
                            options: battleDraft.options.map((item, i) =>
                              i === index ? { ...item, label: event.target.value } : item,
                            ),
                          })
                        }
                      />
                    </Field>
                    <Field label="Odds ×">
                      <input
                        type="number"
                        required
                        min="0.01"
                        max="100"
                        step="0.01"
                        disabled={
                          editBattle !== 'new' &&
                          (Number(editBattle.totalPool) > 0 || editBattle.participantCount > 0)
                        }
                        value={option.odds}
                        onChange={(event) =>
                          setBattleDraft({
                            ...battleDraft,
                            options: battleDraft.options.map((item, i) =>
                              i === index ? { ...item, odds: Number(event.target.value) } : item,
                            ),
                          })
                        }
                      />
                    </Field>
                    <button
                      type="button"
                      className="btn btn-ghost admin-remove"
                      aria-label={`Remove answer ${index + 1}`}
                      disabled={
                        battleDraft.options.length <= 2 ||
                        (editBattle !== 'new' &&
                          (Number(editBattle.totalPool) > 0 || editBattle.participantCount > 0))
                      }
                      onClick={() =>
                        setBattleDraft({
                          ...battleDraft,
                          options: battleDraft.options.filter((_, i) => i !== index),
                        })
                      }
                    >
                      <X size={17} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={
                  battleDraft.options.length >= 10 ||
                  (editBattle !== 'new' &&
                    (Number(editBattle.totalPool) > 0 || editBattle.participantCount > 0))
                }
                onClick={() =>
                  setBattleDraft({
                    ...battleDraft,
                    options: [...battleDraft.options, { label: '', odds: 2 }],
                  })
                }
              >
                <Plus size={16} />
                Add answer
              </button>
            </div>
            <div className="admin-modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setEditBattle(null)}
                disabled={!!busy}
              >
                Cancel
              </button>
              <button className="btn btn-primary" disabled={!!busy}>
                {busy === 'battle-form'
                  ? 'Saving…'
                  : editBattle === 'new'
                    ? 'Publish battle'
                    : 'Save changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {settleBattle && (
        <Modal title="Publish the final result" onClose={() => !busy && setSettleBattle(null)}>
          <form
            className="stack"
            onSubmit={async (event) => {
              event.preventDefault();
              if (
                await perform(
                  'settle',
                  () =>
                    api(
                      `/api/admin/battles/${settleBattle.id}/settle`,
                      json('POST', { winningOptionId: winningOption }),
                    ),
                  'Results published. Winning wallets have been credited.',
                )
              )
                setSettleBattle(null);
            }}
          >
            <p className="muted">
              Choose the correct answer for <strong>{settleBattle.title}</strong>. Payouts are
              calculated and credited immediately.
            </p>
            <Field label="Correct answer">
              <select
                required
                value={winningOption}
                onChange={(event) => setWinningOption(event.target.value)}
              >
                <option value="">Select a winning answer</option>
                {settleBattle.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label} · {Number(option.odds)}×
                  </option>
                ))}
              </select>
            </Field>
            <div className="admin-info">
              This action is final. The {formatCoins(settleBattle.totalPool)} coin pool will be
              settled using the configured odds and {Number(settleBattle.multiplier)}× topic
              multiplier.
            </div>
            <div className="admin-modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setSettleBattle(null)}
                disabled={!!busy}
              >
                Cancel
              </button>
              <button className="btn btn-primary" disabled={!!busy || !winningOption}>
                {busy === 'settle' ? 'Settling…' : 'Confirm result & pay winners'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {reviewDeposit && (
        <Modal title="Verify bank transfer" onClose={() => !busy && setReviewDeposit(null)}>
          <div className="stack">
            <p className="muted">
              Check your bank records before crediting <strong>{reviewDeposit.userName}</strong>.
            </p>
            <dl className="admin-review-details">
              <div>
                <dt>Transfer reference</dt>
                <dd>
                  <code>{reviewDeposit.transferReference}</code>
                </dd>
              </div>
              <div>
                <dt>Expected transfer</dt>
                <dd>{money(reviewDeposit.amount, reviewDeposit.currency)}</dd>
              </div>
              <div>
                <dt>Coins to credit</dt>
                <dd>{formatCoins(reviewDeposit.coins)}</dd>
              </div>
              <div>
                <dt>Member email</dt>
                <dd>{reviewDeposit.userEmail}</dd>
              </div>
              {reviewDeposit.note && (
                <div>
                  <dt>Member note</dt>
                  <dd>{reviewDeposit.note}</dd>
                </div>
              )}
            </dl>
            <Field label="Review note (optional)">
              <textarea
                rows={3}
                maxLength={1000}
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
                placeholder="Record your bank transfer verification details."
              />
            </Field>
            <p className="admin-info">
              Approving credits the wallet once. Rejected requests do not change the coin balance.
            </p>
            <div className="admin-modal-actions">
              <button
                type="button"
                className="btn btn-danger"
                disabled={!!busy}
                onClick={() => void review('reject')}
              >
                <Ban size={16} />
                {busy === 'review-reject' ? 'Rejecting…' : 'Reject request'}
              </button>
              <button
                className="btn btn-primary"
                disabled={!!busy}
                onClick={() => void review('approve')}
              >
                <Check size={16} />
                {busy === 'review-approve' ? 'Crediting…' : 'Approve & credit coins'}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {editPackage && (
        <Modal
          title={editPackage === 'new' ? 'Create coin package' : 'Edit coin package'}
          onClose={() => !busy && setEditPackage(null)}
        >
          <form onSubmit={savePackage} className="stack">
            <Field label="Package name">
              <input
                required
                minLength={2}
                maxLength={100}
                value={packageDraft.name}
                onChange={(event) => setPackageDraft({ ...packageDraft, name: event.target.value })}
              />
            </Field>
            <div className="form-grid">
              <Field label="Base coins">
                <input
                  required
                  type="number"
                  min="1"
                  step="1"
                  value={packageDraft.coins}
                  onChange={(event) =>
                    setPackageDraft({ ...packageDraft, coins: Number(event.target.value) })
                  }
                />
              </Field>
              <Field label="Bonus coins">
                <input
                  required
                  type="number"
                  min="0"
                  step="1"
                  value={packageDraft.bonusCoins}
                  onChange={(event) =>
                    setPackageDraft({ ...packageDraft, bonusCoins: Number(event.target.value) })
                  }
                />
              </Field>
              <Field label="Price">
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={packageDraft.price}
                  onChange={(event) =>
                    setPackageDraft({ ...packageDraft, price: Number(event.target.value) })
                  }
                />
              </Field>
              <Field label="Original price (optional)">
                <input
                  type="number"
                  min={packageDraft.price}
                  step="0.01"
                  value={packageDraft.originalPrice ?? ''}
                  onChange={(event) =>
                    setPackageDraft({
                      ...packageDraft,
                      originalPrice: event.target.value ? Number(event.target.value) : null,
                    })
                  }
                />
              </Field>
              <Field label="Currency (ISO code)">
                <input
                  required
                  minLength={3}
                  maxLength={3}
                  value={packageDraft.currency}
                  onChange={(event) =>
                    setPackageDraft({ ...packageDraft, currency: event.target.value.toUpperCase() })
                  }
                />
              </Field>
            </div>
            <label className="admin-checkbox">
              <input
                type="checkbox"
                checked={packageDraft.active}
                onChange={(event) =>
                  setPackageDraft({ ...packageDraft, active: event.target.checked })
                }
              />
              Available to members
            </label>
            <div className="admin-modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setEditPackage(null)}
                disabled={!!busy}
              >
                Cancel
              </button>
              <button className="btn btn-primary" disabled={!!busy}>
                {busy === 'package-form' ? 'Saving…' : 'Save coin package'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Empty({
  title = 'No records found',
  text = 'Try adjusting the filters or check back after members start participating.',
}: {
  title?: string;
  text?: string;
}) {
  return (
    <div className="card empty-state">
      <ClipboardList size={30} />
      <h3>{title}</h3>
      <p className="muted">{text}</p>
    </div>
  );
}
function Table({
  headers,
  children,
  empty,
}: {
  headers: string[];
  children: ReactNode;
  empty: boolean;
}) {
  return empty ? (
    <Empty />
  ) : (
    <div className="card table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
        ) || [],
      ).filter((element) => element.offsetParent !== null);
    (focusable()[0] || panel.current)?.focus();
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key !== 'Tab') return;
      const items = focusable(),
        first = items[0],
        last = items[items.length - 1];
      if (!first) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', listener);
    return () => {
      document.removeEventListener('keydown', listener);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);
  return createPortal(
    <div
      className="admin-page admin-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={panel}
        tabIndex={-1}
        className="admin-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="admin-modal-heading">
          <h2>{title}</h2>
          <button
            type="button"
            className="btn btn-ghost admin-icon-btn"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </div>
        {children}
      </section>
    </div>,
    document.body,
  );
}
