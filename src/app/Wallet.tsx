import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
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
import './Wallet.css';

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
    <div className="q-wallet">
      <div className="q-finance-tools">
        <span>YOUR VIRTUAL COINS</span>
        <button
          className="q-refresh"
          onClick={() => setReload((n) => n + 1)}
          disabled={loading}
          aria-label="Refresh wallet"
        >
          <RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>
      {error && (
        <div className="alert" role="alert">
          {error}
          <button className="btn btn-ghost" onClick={() => setReload((n) => n + 1)}>
            Try again
          </button>
        </div>
      )}
      {loading && !ledger.items.length ? (
        <div className="card empty-state" aria-live="polite">
          <LoaderCircle className="spin" />
          Loading your wallet…
        </div>
      ) : (
        <>
          <section className="q-wallet-balance" aria-label="Current coin balance">
            <span className="q-wallet-bank">
              <Landmark size={25} />
            </span>
            <div className="q-wallet-balance-value">
              <h2>{formatCoins(balance)}</h2>
              <p>Current Balance · coins</p>
            </div>
            <button
              className="q-wallet-add"
              onClick={() => setShowDeposit(true)}
              disabled={loading || Boolean(error)}
            >
              <Plus size={14} />
              Add coins
            </button>
          </section>
          <p className="q-wallet-note">
            <ShieldCheck size={14} /> Virtual coins only. No cash withdrawals.
          </p>
          <section className="q-finance-panel q-wallet-overview" aria-label="Wallet overview">
            <div>
              <span className="q-finance-icon">
                <Coins size={22} />
              </span>
              <div>
                <p>Available coins</p>
                <strong>{formatCoins(balance)}</strong>
              </div>
            </div>
            <div>
              <span className="q-finance-icon">
                <CreditCard size={22} />
              </span>
              <div>
                <p>Deposit requests</p>
                <strong>{formatCoins(deposits.total)}</strong>
              </div>
              <span className="q-finance-meta">Manual review</span>
            </div>
            <div>
              <span className="q-finance-icon">
                <ReceiptText size={22} />
              </span>
              <div>
                <p>Wallet transactions</p>
                <strong>{formatCoins(ledger.total)}</strong>
              </div>
            </div>
          </section>
          <section className="q-finance-panel">
            <div className="q-finance-section-heading">
              <div>
                <h2>Choose your coin package</h2>
                <p>More coins for your next battle</p>
              </div>
              <Landmark size={20} />
            </div>
            {packages.length ? (
              <div className="q-package-list">
                {packages.map((pack) => (
                  <button
                    key={pack.id}
                    className={`q-package ${packageId === pack.id ? 'selected' : ''}`}
                    onClick={() => {
                      setPackageId(pack.id);
                      setShowDeposit(true);
                    }}
                  >
                    <span className="q-package-icon">
                      <Coins size={23} />
                    </span>
                    <span className="q-package-details">
                      <strong>
                        {formatCoins(pack.coins + pack.bonusCoins)} <small>coins</small>
                      </strong>
                      <span>{pack.name}</span>
                      {pack.bonusCoins > 0 && <em>+{formatCoins(pack.bonusCoins)} bonus coins</em>}
                    </span>
                    <span className="q-package-price">
                      <strong>{money(pack.price, pack.currency)}</strong>
                      {pack.originalPrice != null && pack.originalPrice > pack.price && (
                        <del>{money(pack.originalPrice, pack.currency)}</del>
                      )}
                    </span>
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
          <section className="q-finance-panel">
            <div className="q-wallet-tabs" role="tablist" aria-label="Wallet activity">
              <button
                role="tab"
                aria-selected={tab === 'transactions'}
                className={tab === 'transactions' ? 'active' : ''}
                onClick={() => setTab('transactions')}
              >
                <ReceiptText size={16} />
                Transactions
              </button>
              <button
                role="tab"
                aria-selected={tab === 'deposits'}
                className={tab === 'deposits' ? 'active' : ''}
                onClick={() => setTab('deposits')}
              >
                <CreditCard size={16} />
                Deposit requests
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
                  <ul className="q-transaction-list">
                    {ledger.items.map((entry) => (
                      <li key={entry.id}>
                        <span className={`q-finance-icon ${entry.amount < 0 ? 'debit' : ''}`}>
                          {entry.amount >= 0 ? (
                            <ArrowDownLeft size={21} />
                          ) : (
                            <ArrowUpRight size={21} />
                          )}
                        </span>
                        <div className="q-transaction-info">
                          <strong>
                            {entry.description || entry.note || entry.type.replaceAll('_', ' ')}
                          </strong>
                          <span>{formatDate(entry.createdAt)}</span>
                          <small>{entry.type.replaceAll('_', ' ')}</small>
                        </div>
                        <div
                          className={`q-transaction-amount ${entry.amount >= 0 ? 'credit' : ''}`}
                        >
                          <strong>
                            {entry.amount > 0 ? '+' : ''}
                            {formatCoins(entry.amount)}
                          </strong>
                          <span>{formatCoins(entry.balanceAfter)} after</span>
                        </div>
                      </li>
                    ))}
                  </ul>
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
                  <div className="q-deposit-list">
                    {deposits.items.map((deposit) => (
                      <article key={deposit.id} className="q-deposit-record">
                        <div className="q-deposit-record-top">
                          <span className="q-finance-icon">
                            <Landmark size={20} />
                          </span>
                          <div>
                            <strong>{deposit.packageName}</strong>
                            <p>
                              {formatCoins(deposit.coins)} coins ·{' '}
                              {money(deposit.amount, deposit.currency)}
                            </p>
                          </div>
                          <span className={`q-status ${deposit.status}`}>
                            {deposit.status === 'approved' ? (
                              <CheckCircle2 size={12} />
                            ) : deposit.status === 'rejected' ? (
                              <X size={12} />
                            ) : (
                              <LoaderCircle size={12} />
                            )}
                            {deposit.status}
                          </span>
                        </div>
                        <dl>
                          <div>
                            <dt>Transfer reference</dt>
                            <dd>{deposit.transferReference}</dd>
                          </div>
                          <div>
                            <dt>Requested</dt>
                            <dd>{formatDate(deposit.createdAt)}</dd>
                          </div>
                        </dl>
                        {deposit.reviewNote && (
                          <p className="q-deposit-message">Admin note: {deposit.reviewNote}</p>
                        )}
                        {deposit.status === 'pending' && (
                          <p className="q-deposit-message">
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
      {showDeposit &&
        createPortal(
          <div
            className="q-sheet-backdrop"
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget && !saving) setShowDeposit(false);
            }}
          >
            <section
              ref={dialogRef}
              tabIndex={-1}
              className="q-deposit-sheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby="deposit-title"
            >
              <img className="q-sheet-decoration" src="/assets/images/modal-bg-white.png" alt="" />
              <div className="q-sheet-body">
                <div className="q-sheet-heading">
                  <div>
                    <p>MANUAL BANK TRANSFER</p>
                    <h2 id="deposit-title">Add coins to your wallet</h2>
                  </div>
                  <button
                    className="q-sheet-close"
                    type="button"
                    aria-label="Close deposit form"
                    disabled={saving}
                    onClick={() => setShowDeposit(false)}
                  >
                    <X size={19} />
                  </button>
                </div>
                <div className="q-sheet-balance">
                  <span>
                    <WalletCards size={18} />
                  </span>
                  Wallet Balance: <strong>{formatCoins(balance)} coins</strong>
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
                    <div className="q-deposit-bank">
                      <h3>
                        2. Transfer {money(selected.price, selected.currency)} outside this app
                      </h3>
                      {bankReady ? (
                        <dl>
                          <div>
                            <dt>Bank</dt>
                            <dd>{settings?.bankName}</dd>
                          </div>
                          <div>
                            <dt>Account holder</dt>
                            <dd>{settings?.bankAccountName}</dd>
                          </div>
                          <div>
                            <dt>Account number</dt>
                            <dd className="q-bank-number">
                              {settings?.bankAccountNumber}
                              <button
                                className="q-copy"
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
                              <dt>Transfer instructions</dt>
                              <dd className="q-bank-instructions">
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
                  <label className="q-deposit-confirm">
                    <input
                      type="checkbox"
                      required
                      checked={confirmed}
                      onChange={(event) => setConfirmed(event.target.checked)}
                    />
                    I have completed the bank transfer. I understand coins are credited only after
                    an administrator verifies it.
                  </label>
                  <button
                    className="btn btn-primary q-deposit-submit"
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
              </div>
            </section>
          </div>,
          document.body,
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
