# Using Quizio Battles

Quizio Battles develops the original Quizio mobile PWA into a virtual-coin prediction application. Coins have no withdrawal or cash-out flow. Manual deposits are recorded by the application and credited only after an administrator verifies a transfer outside the application. The application does not process bank payments.

## Players

1. Register with an email address and password, or sign in to an existing account.
2. Open a battle to see its answer options, displayed odds, topic multiplier, closing time, and current pool.
3. Choose an answer and enter a whole number of coins. Each user can place one bet per battle. Review the selection before confirming: a submitted bet cannot be edited, cancelled, or increased with another bet.
4. Open your wallet to check the available balance and transaction history. Coins committed to a bet are deducted immediately.
5. Follow the battle in bet history. A closed battle is awaiting an administrator's result; a settled battle displays the recorded result and payout.

The server checks the current balance, battle status, closing time, and selected option when accepting a bet. A page left open past the deadline does not extend that deadline. Displayed potential rewards are estimates until the final pool is known.

### Install and reconnect

On a supported browser, use the application's install action when it is offered, or the browser's install/Add to Home Screen menu. Installation requires the production build over HTTPS, with a localhost exception for local testing.

The app can reopen its public shell while offline. Sign-in, balances, bets, deposit requests and rankings still need a connection; the app does not queue financial actions for later submission. Reconnect and refresh the relevant data before placing a bet or reviewing a deposit.

When a new app version is available, finish any form you are editing before choosing the update action. Updating reloads the app after you accept it.

### Requesting coins by bank transfer

1. Select an available coin package in the wallet.
2. Read the bank instructions configured by the administrator.
3. Transfer outside the application and submit the requested transfer reference.
4. Keep the external transfer receipt until the request is resolved.
5. Check the deposit status in the wallet. A pending request does not increase the spendable balance.

An administrator can approve or reject a pending request. Approval credits its recorded coin amount exactly once. A rejected request does not credit coins. Package changes after submission do not change the terms recorded for an existing request. Transfer references are trimmed and compared without regard to letter case; an existing reference cannot be submitted again, including by another account. Contact the administrator if a reference was entered incorrectly.

### Public rankings

The leaderboard is public. Its available periods and scoring metric are controlled by the administrator. Periods use UTC so that all players see the same boundaries:

| Period | Boundary |
| --- | --- |
| Weekly | Monday 00:00 UTC to the following Monday |
| Monthly | First day of the calendar month to the first day of the next month |
| Seasonal | Calendar quarters: January–March, April–June, July–September, October–December |

The selected metric and current period should be read together. A payout ranking and a net-profit ranking answer different questions; neither represents a withdrawable cash balance. Results belong to the period when the battle was settled, even if the bet was placed in an earlier period. Only players with settled bets in the selected period appear.

## Administrators

The custom admin CMS is part of the React application. Administrative endpoints also enforce the account role on the server; opening an admin URL does not grant privileges.

### Create and manage battles

1. Create a battle with a clear title, description, closing time, answer options, answer odds, and topic multiplier.
2. Check the choices, deadline, and reward terms before accepting the first bet. Options, odds, multiplier, and closing time are locked once betting has begun. Descriptive fields remain editable while the battle is open.
3. Close the battle manually when needed. Otherwise, the server's closing-time checks prevent late bets.
4. After closure, verify the real result and select the correct answer.
5. Settle once. Settlement records the result, resolves the bets, and credits winning balances together.

Do not use a later battle edit to correct an already settled result. Check the winning answer carefully before settlement; the application has no automatic result reversal or bet cancellation flow.

### Review deposits

Use the deposit review screen to inspect pending requests. Compare each request with the actual bank statement before approval. A screenshot, transfer reference, or pending request is not proof that funds reached the bank account.

Check the received amount, currency, sender/reference, recipient account, and whether the same external transfer has already been used for another request. The application rejects duplicate transfer-reference strings across all accounts, but it cannot determine whether two different strings describe the same real transfer. Approve only the matching request. Reject mismatches with an explanation that helps the player resolve the issue.

Approval updates the request status, wallet balance, and coin ledger in one database transaction. Retrying an approval must not issue a second credit. This protects against repeated button clicks and request retries; it cannot verify a bank transfer automatically.

### Coin packages and settings

Create and maintain coin packages through the CMS. Package prices, offered coins, discounts, and active status control future deposit requests. Existing requests retain their recorded terms.

Configure bank transfer instructions before inviting players to deposit. Keep passwords, bank login credentials, and payment-card data out of those instructions: the displayed instructions are public application content.

Leaderboard settings control which periods are visible and how scores are calculated. Calendar period boundaries roll forward automatically; a new week or season does not require deleting historical bets or ledger entries.

## Limits of the first release

- Bank verification is a human operation; there is no payment gateway or bank reconciliation integration.
- There is no cash-out, bet cancellation, or settlement reversal interface.
- The system uses one correct answer per settled battle.
- Email delivery, password recovery, and automatic result feeds require separate integrations if desired.

For the accounting formula and operational invariants, see [Virtual-coin accounting](accounting.md). For hosting and recovery, see [Deployment](deployment.md).
