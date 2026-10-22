# Virtual-coin accounting

## Balances and the ledger

All coin amounts are whole numbers. The stored wallet balance is the amount available for new bets. Placing a bet subtracts its stake; approving a deposit or settling a winning bet adds a credit. The ledger records these balance changes so an operator can trace the source of a credit or debit.

Important invariants are enforced by the API and database transactions:

- A user cannot spend a negative amount or more than the current balance.
- An accepted bet cannot be cancelled or changed. A user can place only one bet per battle.
- A deposit approval cannot credit the same request twice.
- A battle cannot distribute its settlement twice.
- Answer odds and the battle multiplier used by accepted bets cannot be changed after betting starts.
- Balance updates and their associated ledger entries are committed together.

Operations that compete for the same wallet or battle use database locking. A stale balance shown in a browser is never the authority for accepting a bet.

## Reward calculation

The default allocation is stake-weighted within the winning answer:

```text
payout = floor(
  final battle pool
  × winning stake / total stakes on the winning answer
  × answer odds
  × battle multiplier
)
```

The payout is calculated and rounded down for each winning bet. There is one bet per user per battle, so this is also one rounded credit per winning user. The payout is the total credit, including any returned value represented by the formula. The original stake has already been debited and is not added a second time. Losing bets receive zero coins.

For example, a battle has a 1,000-coin final pool. The winning answer has 200 coins staked on it. A winner with 50 coins on that answer has a 25% share. At odds of 2 and a battle multiplier of 1.5, the formula credits:

```text
floor(1,000 × 50 / 200 × 2 × 1.5) = 750 coins
```

That winner's net result is 750 − 50 = 700 coins. This is a virtual-coin issuance model: odds and multipliers can make total payouts exceed the original pool. The formula does not guarantee conservation of coins or a financially funded prize pool. Rounding down can also leave an undistributed fraction of the theoretical reward.

If nobody selected the winning answer, there is nobody to credit. The result still resolves the losing bets; the pool is not automatically rolled over to another battle.

## Deposits

A deposit request snapshots the selected package terms. Editing a package later must not change the coins or price promised by a pending request. The operator verifies the actual bank receipt outside the application and approves or rejects the request.

The API's approval handling prevents duplicate credits for one request. Transfer references are globally unique after trimming and case folding, so different accounts cannot submit the same reference string. An operator must still prevent the same external bank transfer from being described using different references across distinct requests. Use the reference and bank statement when reviewing each request.

## Leaderboard interpretation

A total-payout metric sums the payouts from bets settled during the selected period. A net-profit metric sums `payout − stake` for all bets settled during that period, including losing stakes. An earlier bet settled this week belongs to this week's results. A new bet that remains unresolved does not enter the score yet. Deposits and initial welcome coins do not increase a player's competitive score. Only players with at least one settled bet in the period appear.

Periods are based on server-side UTC timestamps, with weekly periods beginning on Monday and seasons matching three-month calendar quarters. Historical accounting records are retained rather than deleted at a period boundary.

## Operational review

Before a public launch, test competing requests against the same wallet, repeated deposit approvals, repeated settlement calls, late bets, invalid answer selections, and administrative access with a regular user account. Review the automated integration test coverage as well as the UI: transaction correctness is a backend property.
