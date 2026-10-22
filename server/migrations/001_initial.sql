CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, email text NOT NULL UNIQUE,
 password_hash text NOT NULL, role text NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
 balance bigint NOT NULL DEFAULT 0 CHECK(balance >= 0 AND balance <= 9000000000000000), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE battles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, description text NOT NULL DEFAULT '', category text NOT NULL DEFAULT 'General',
 image_url text NOT NULL DEFAULT '', ends_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed','settled')),
 multiplier_bps integer NOT NULL DEFAULT 10000 CHECK(multiplier_bps BETWEEN 100 AND 1000000), winning_option_id uuid,
 created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz, settled_at timestamptz
);
CREATE INDEX battles_status_ends ON battles(status,ends_at);
CREATE TABLE options (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), battle_id uuid NOT NULL REFERENCES battles(id), label text NOT NULL,
 odds_bps integer NOT NULL CHECK(odds_bps BETWEEN 100 AND 1000000), position integer NOT NULL DEFAULT 0,
 UNIQUE(id,battle_id)
);
ALTER TABLE battles ADD CONSTRAINT battle_winner_option FOREIGN KEY(winning_option_id,id) REFERENCES options(id,battle_id);
CREATE TABLE bets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), battle_id uuid NOT NULL REFERENCES battles(id),
 option_id uuid NOT NULL, amount bigint NOT NULL CHECK(amount > 0 AND amount <= 1000000000),
 payout bigint NOT NULL DEFAULT 0 CHECK(payout >= 0), status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','won','lost')),
 created_at timestamptz NOT NULL DEFAULT now(), settled_at timestamptz,
 FOREIGN KEY(option_id,battle_id) REFERENCES options(id,battle_id), UNIQUE(user_id,battle_id)
);
CREATE INDEX bets_battle ON bets(battle_id);
CREATE INDEX bets_user_time ON bets(user_id,created_at DESC);
CREATE INDEX bets_settlement ON bets(settled_at);
CREATE TABLE ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
 type text NOT NULL CHECK(type IN ('welcome','bet','payout','deposit','admin_adjustment')),
 amount bigint NOT NULL, balance_after bigint NOT NULL CHECK(balance_after >= 0), reference_id uuid, note text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(type,reference_id)
);
CREATE INDEX ledger_user_time ON ledger(user_id,created_at DESC);
CREATE TABLE packages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, coins bigint NOT NULL CHECK(coins > 0 AND coins <= 1000000000),
 bonus_coins bigint NOT NULL DEFAULT 0 CHECK(bonus_coins >= 0 AND bonus_coins <= 1000000000),
 price numeric(12,2) NOT NULL CHECK(price > 0), original_price numeric(12,2) NOT NULL CHECK(original_price >= price),
 currency text NOT NULL DEFAULT 'USD', active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE deposits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), package_id uuid NOT NULL REFERENCES packages(id),
 package_name text NOT NULL, coins bigint NOT NULL CHECK(coins > 0), amount numeric(12,2) NOT NULL CHECK(amount > 0), currency text NOT NULL,
 transfer_reference text NOT NULL, note text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 review_note text NOT NULL DEFAULT '', reviewed_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz,
 UNIQUE(user_id,transfer_reference)
);
CREATE INDEX deposits_status ON deposits(status,created_at DESC);
CREATE TABLE settings (id integer PRIMARY KEY CHECK(id=1), data jsonb NOT NULL);
INSERT INTO settings(id,data) VALUES(1,'{"bankName":"","bankAccountName":"","bankAccountNumber":"","transferInstructions":"Contact the administrator for bank transfer details. Virtual coins cannot be withdrawn.","currency":"USD","rankingMetric":"net_profit","enabledPeriods":["weekly","monthly","seasonal"]}');
CREATE UNIQUE INDEX deposit_transfer_reference_unique ON deposits(lower(transfer_reference));
