import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Coins,
  Copy,
  CreditCard,
  Landmark,
  LoaderCircle,
  Plus,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  WalletCards,
  X,
} from 'lucide-react';
import { api, formatCoins, formatDate, useAuth, useToast } from './shared';

type Package = {
  id: string;
  name: string;
  coins: number;
  bonusCoins: number;
  price: number;
  originalPrice: number | null;
  currency: string;
  active: boolean;
};
type LedgerEntry = {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  note?: string;
  description?: string;
  createdAt: string;
};
type Deposit = {
  id: string;
  packageName: string;
  coins: number;
  amount: number;
  currency: string;
  transferReference: string;
  note?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewNote?: string;
  createdAt: string;
  reviewedAt?: string;
};
type Settings = {
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  transferInstructions: string;
  currency: string;
};
type List<T> = { items: T[]; total: number; page: number; pageSize: number };
const money = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toLocaleString()} ${currency}`;
  }
};

export default function Wallet() {
  const toast = useToast();
  const { refresh } = useAuth();
  const [balance, setBalance] = useState(0);
  const [ledger, setLedger] = useState<List<LedgerEntry>>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 10,
  });
  const [deposits, setDeposits] = useState<List<Deposit>>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 10,
  });
  const [packages, setPackages] = useState<Package[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [depositPage, setDepositPage] = useState(1);
  const [showDeposit, setShowDeposit] = useState(false);
  const [packageId, setPackageId] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const savingRef = useRef(saving);
  savingRef.current = saving;
  const [tab, setTab] = useState<'transactions' | 'deposits'>('transactions');
  const selected = packages.find((p) => p.id === packageId);
  const bankReady = Boolean(
    settings?.bankName && settings?.bankAccountName && settings?.bankAccountNumber,
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      api<List<LedgerEntry> & { balance: number }>(`/api/wallet?page=${ledgerPage}&pageSize=10`),
      api<List<Deposit>>(`/api/deposits?page=${depositPage}&pageSize=10`),
      api<{ items: Package[] }>('/api/packages'),
      api<{ settings: Settings }>('/api/settings'),
      refresh(),
    ])
      .then(([wallet, depositData, packageData, settingData]) => {
        if (!active) return;
        setBalance(wallet.balance);
        setLedger(wallet);
        setDeposits(depositData);
        const available = packageData.items.filter((p) => p.active);
        setPackages(available);
        setSettings(settingData.settings);
        setPackageId((current) =>
          available.some((p) => p.id === current) ? current : (available[0]?.id ?? ''),
        );
      })
      .catch((err) => {
        if (active) setError(err.message || 'Unable to load your wallet.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload, ledgerPage, depositPage, refresh]);

  useEffect(() => {
    if (!showDeposit) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusableElements = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getClientRects().length > 0);
    const firstField = dialog.querySelector<HTMLElement>(
      'select:not([disabled]), input:not([disabled]), textarea:not([disabled])',
    );
    (firstField || focusableElements()[0] || dialog).focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !savingRef.current) {
        event.preventDefault();
        setShowDeposit(false);
      }
      if (event.key !== 'Tab') return;
      const elements = focusableElements();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first || !last) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      if (!dialog?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [showDeposit]);

  async function submitDeposit(event: FormEvent) {
    event.preventDefault();
    if (!selected || !bankReady || !confirmed || !reference.trim()) return;
    setSaving(true);
    try {
      await api('/api/deposits', {
        method: 'POST',
        body: JSON.stringify({ packageId, transferReference: reference.trim(), note: note.trim() }),
      });
      setShowDeposit(false);
      setReference('');
      setNote('');
      setConfirmed(false);
      setTab('deposits');
      setDepositPage(1);
      setReload((n) => n + 1);
      toast('Deposit request submitted. Your coins will arrive after admin approval.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to submit deposit.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Account number copied.', 'success');
    } catch {
      toast('Copy is unavailable. Select and copy the account number above.', 'error');
    }
  }

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">YOUR VIRTUAL COINS</p>
          <h1 className="page-title">My wallet</h1>
          <p className="muted">
            Keep track of every coin, from your next battle to your latest win.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn btn-ghost"
            onClick={() => setReload((n) => n + 1)}
            disabled={loading}
            aria-label="Refresh wallet"
          >
            <RefreshCw size={18} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setShowDeposit(true)}
            disabled={loading || Boolean(error)}
          >
            <Plus size={18} /> Add coins
          </button>
        </div>
      </header>
      {error ? (
        <div className="alert" role="alert">
          {error}{' '}
          <button className="btn btn-ghost" onClick={() => setReload((n) => n + 1)}>
            Try again
          </button>
        </div>
      ) : null}
      {loading && !ledger.items.length ? (
        <div className="card empty-state" aria-live="polite">
          <LoaderCircle className="spin" /> Loading your wallet…
        </div>
      ) : (
        <>
          <section
            className="wallet-summary card"
            style={{
              background: 'var(--navy, #132540)',
              color: 'white',
              padding: 'clamp(24px, 5vw, 40px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 24,
            }}
          >
            <div>
              <p style={{ color: '#a7b8d4', margin: '0 0 10px' }}>Available balance</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Coins size={32} color="#c1f271" />
                <strong style={{ fontSize: 'clamp(36px, 7vw, 52px)', letterSpacing: '-.04em' }}>
                  {formatCoins(balance)}
                </strong>
                <span style={{ color: '#a7b8d4' }}>coins</span>
              </div>
              <p style={{ color: '#a7b8d4', fontSize: 13, margin: '12px 0 0' }}>
                Virtual coins for entertainment. No cash withdrawals.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#d1dceb' }}>
              <ShieldCheck size={28} />
              <div>
                <strong style={{ display: 'block' }}>Every coin accounted for</strong>
                <small>Deposits are manually reviewed.</small>
              </div>
            </div>
          </section>
          <section className="card" style={{ padding: 'clamp(20px, 4vw, 28px)' }}>
            <div className="page-header" style={{ marginBottom: 20 }}>
              <div>
                <p className="eyebrow">READY FOR YOUR NEXT BATTLE?</p>
                <h2 style={{ margin: '4px 0' }}>Choose your coin package</h2>
              </div>
              <span className="badge">
                <Landmark size={14} /> Bank transfer
              </span>
            </div>
            {packages.length ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                  gap: 14,
                }}
              >
                {packages.map((pack) => (
                  <button
                    key={pack.id}
                    className="card"
                    style={{
                      padding: 22,
                      textAlign: 'left',
                      cursor: 'pointer',
                      border:
                        packageId === pack.id
                          ? '2px solid var(--primary, #5465ff)'
                          : '2px solid var(--border, #e6eaf0)',
                      position: 'relative',
                      background: 'var(--surface, white)',
                    }}
                    onClick={() => {
                      setPackageId(pack.id);
                      setShowDeposit(true);
                    }}
                  >
                    {pack.bonusCoins > 0 && (
                      <span className="badge" style={{ marginBottom: 12 }}>
                        +{formatCoins(pack.bonusCoins)} bonus
                      </span>
                    )}
                    <Coins
                      size={28}
                      style={{ color: '#d49b20', marginBottom: 12, display: 'block' }}
                    />
                    <strong style={{ display: 'block', fontSize: 25 }}>
                      {formatCoins(pack.coins + pack.bonusCoins)}
                    </strong>
                    <span
                      className="muted"
                      style={{ display: 'block', fontSize: 13, marginTop: 3 }}
                    >
                      {pack.name}
                    </span>
                    <div style={{ marginTop: 16, fontWeight: 700 }}>
                      {money(pack.price, pack.currency)}{' '}
                      {pack.originalPrice != null && pack.originalPrice > pack.price && (
                        <del
                          className="muted"
                          style={{ fontSize: 12, marginLeft: 4, fontWeight: 400 }}
                        >
                          {money(pack.originalPrice, pack.currency)}
                        </del>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <Coins size={32} />
                <p>No coin packages are available yet.</p>
                <small className="muted">An administrator can add packages in the CMS.</small>
              </div>
            )}
          </section>
          <section className="card" style={{ padding: 'clamp(16px, 4vw, 28px)' }}>
            <div className="tabs" role="tablist" aria-label="Wallet activity">
              <button
                role="tab"
                aria-selected={tab === 'transactions'}
                className={`tab ${tab === 'transactions' ? 'active' : ''}`}
                onClick={() => setTab('transactions')}
              >
                <ReceiptText size={17} /> Transactions
              </button>
              <button
                role="tab"
                aria-selected={tab === 'deposits'}
                className={`tab ${tab === 'deposits' ? 'active' : ''}`}
                onClick={() => setTab('deposits')}
              >
                <CreditCard size={17} /> Deposit requests
              </button>
            </div>
            {tab === 'transactions' ? (
              <>
                {!ledger.items.length ? (
                  <div className="empty-state">
                    <WalletCards size={34} />
                    <h3>Your coin story starts here</h3>
                    <p className="muted">Deposits, battle entries, and payouts will appear here.</p>
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Transaction</th>
                          <th>Date</th>
                          <th>Amount</th>
                          <th>Balance after</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledger.items.map((entry) => (
                          <tr key={entry.id}>
                            <td>
                              <span
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}
                              >
                                {entry.amount >= 0 ? (
                                  <ArrowDownLeft size={20} color="#169c69" />
                                ) : (
                                  <ArrowUpRight size={20} color="#748198" />
                                )}
                                <span>
                                  <strong style={{ display: 'block' }}>
                                    {entry.description ||
                                      entry.note ||
                                      entry.type.replaceAll('_', ' ')}
                                  </strong>
                                  <small className="muted">{entry.type.replaceAll('_', ' ')}</small>
                                </span>
                              </span>
                            </td>
                            <td>{formatDate(entry.createdAt)}</td>
                            <td
                              style={{
                                color: entry.amount >= 0 ? '#169c69' : 'inherit',
                                fontWeight: 700,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {entry.amount > 0 ? '+' : ''}
                              {formatCoins(entry.amount)}
                            </td>
                            <td>{formatCoins(entry.balanceAfter)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <Pagination
                  page={ledgerPage}
                  pageSize={ledger.pageSize}
                  total={ledger.total}
                  onChange={setLedgerPage}
                />
              </>
            ) : (
              <>
                {!deposits.items.length ? (
                  <div className="empty-state">
                    <CreditCard size={34} />
                    <h3>No deposit requests yet</h3>
                    <p className="muted">
                      Select a package, make your bank transfer, then submit a request.
                    </p>
                  </div>
                ) : (
                  <div className="stack" style={{ gap: 12, paddingTop: 18 }}>
                    {deposits.items.map((deposit) => (
                      <article key={deposit.id} className="card" style={{ padding: 18 }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 16,
                            flexWrap: 'wrap',
                          }}
                        >
                          <div>
                            <strong>
                              {deposit.packageName} · {formatCoins(deposit.coins)} coins
                            </strong>
                            <p className="muted" style={{ margin: '6px 0', fontSize: 13 }}>
                              {money(deposit.amount, deposit.currency)} ·{' '}
                              {formatDate(deposit.createdAt)}
                            </p>
                            <small>
                              Reference: <strong>{deposit.transferReference}</strong>
                            </small>
                          </div>
                          <span
                            className={`badge ${deposit.status}`}
                            style={{ alignSelf: 'flex-start' }}
                          >
                            {deposit.status === 'approved' ? (
                              <CheckCircle2 size={14} />
                            ) : deposit.status === 'rejected' ? (
                              <X size={14} />
                            ) : (
                              <LoaderCircle size={14} />
                            )}
                            {deposit.status}
                          </span>
                        </div>
                        {deposit.reviewNote && (
                          <p className="muted" style={{ margin: '12px 0 0', fontSize: 13 }}>
                            Admin note: {deposit.reviewNote}
                          </p>
                        )}
                        {deposit.status === 'pending' && (
                          <p className="muted" style={{ margin: '12px 0 0', fontSize: 13 }}>
                            Awaiting manual bank-transfer verification. Your balance has not
                            changed.
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                )}
                <Pagination
                  page={depositPage}
                  pageSize={deposits.pageSize}
                  total={deposits.total}
                  onChange={setDepositPage}
                />
              </>
            )}
          </section>
        </>
      )}
      {showDeposit && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget && !saving) setShowDeposit(false);
          }}
        >
          <section
            ref={dialogRef}
            tabIndex={-1}
            className="modal card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="deposit-title"
            style={{ maxWidth: 580, maxHeight: '92dvh', overflowY: 'auto', padding: 28 }}
          >
            <div className="page-header">
              <div>
                <p className="eyebrow">MANUAL BANK TRANSFER</p>
                <h2 id="deposit-title" style={{ marginTop: 5 }}>
                  Add coins to your wallet
                </h2>
              </div>
              <button
                className="btn btn-ghost"
                type="button"
                aria-label="Close deposit form"
                disabled={saving}
                onClick={() => setShowDeposit(false)}
              >
                <X size={20} />
              </button>
            </div>
            <form className="stack" onSubmit={submitDeposit}>
              <label className="field">
                1. Choose a package
                <select
                  className="input"
                  required
                  value={packageId}
                  onChange={(event) => setPackageId(event.target.value)}
                >
                  {!packages.length && <option value="">No packages available</option>}
                  {packages.map((pack) => (
                    <option key={pack.id} value={pack.id}>
                      {pack.name} — {formatCoins(pack.coins + pack.bonusCoins)} coins ·{' '}
                      {money(pack.price, pack.currency)}
                    </option>
                  ))}
                </select>
              </label>
              {selected && (
                <div className="card" style={{ background: 'var(--bg, #f5f7fb)', padding: 18 }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: 16 }}>
                    2. Transfer {money(selected.price, selected.currency)} outside this app
                  </h3>
                  {bankReady ? (
                    <dl style={{ margin: 0, display: 'grid', gap: 10 }}>
                      <div>
                        <dt className="muted" style={{ fontSize: 12 }}>
                          Bank
                        </dt>
                        <dd style={{ margin: 0, fontWeight: 600 }}>{settings?.bankName}</dd>
                      </div>
                      <div>
                        <dt className="muted" style={{ fontSize: 12 }}>
                          Account holder
                        </dt>
                        <dd style={{ margin: 0, fontWeight: 600 }}>{settings?.bankAccountName}</dd>
                      </div>
                      <div>
                        <dt className="muted" style={{ fontSize: 12 }}>
                          Account number
                        </dt>
                        <dd
                          style={{
                            margin: 0,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            fontWeight: 600,
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {settings?.bankAccountNumber}
                          <button
                            className="btn btn-ghost"
                            type="button"
                            aria-label="Copy bank account number"
                            onClick={() => copy(settings?.bankAccountNumber ?? '')}
                          >
                            <Copy size={15} />
                          </button>
                        </dd>
                      </div>
                      {settings?.transferInstructions && (
                        <div>
                          <dt className="muted" style={{ fontSize: 12 }}>
                            Transfer instructions
                          </dt>
                          <dd style={{ margin: '3px 0 0', whiteSpace: 'pre-wrap' }}>
                            {settings.transferInstructions}
                          </dd>
                        </div>
                      )}
                    </dl>
                  ) : (
                    <p className="alert" role="status">
                      Bank transfer details have not been configured. Please contact an
                      administrator before sending money.
                    </p>
                  )}
                </div>
              )}
              <label className="field">
                3. Bank transfer reference
                <input
                  className="input"
                  required
                  maxLength={120}
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder="Reference from your completed bank transfer"
                  autoComplete="off"
                />
              </label>
              <label className="field">
                Additional note <span className="muted">(optional)</span>
                <textarea
                  className="input"
                  rows={2}
                  maxLength={1000}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Information to help the admin verify your transfer"
                />
              </label>
              <label
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                <input
                  type="checkbox"
                  required
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  style={{ marginTop: 4 }}
                />
                I have completed the bank transfer. I understand coins are credited only after an
                administrator verifies it.
              </label>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={saving || !selected || !bankReady || !confirmed || !reference.trim()}
              >
                {saving ? <LoaderCircle size={18} className="spin" /> : <Check size={18} />}
                {saving ? 'Submitting…' : 'Submit for approval'}
              </button>
              <small className="muted">
                This form records a review request. It does not process a payment.
              </small>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (total <= pageSize) return null;
  return (
    <nav
      aria-label="Activity pagination"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        marginTop: 18,
      }}
    >
      <button className="btn btn-ghost" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </button>
      <small className="muted">
        Page {page} of {Math.ceil(total / pageSize)}
      </small>
      <button
        className="btn btn-ghost"
        disabled={page * pageSize >= total}
        onClick={() => onChange(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
