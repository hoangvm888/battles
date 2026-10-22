export type Period = 'weekly' | 'monthly' | 'seasonal';
export function periodBounds(period: Period, now = new Date()) {
  const year = now.getUTCFullYear(),
    month = now.getUTCMonth();
  let startsAt: Date, endsAt: Date;
  if (period === 'weekly') {
    startsAt = new Date(Date.UTC(year, month, now.getUTCDate()));
    startsAt.setUTCDate(startsAt.getUTCDate() - ((startsAt.getUTCDay() + 6) % 7));
    endsAt = new Date(startsAt);
    endsAt.setUTCDate(endsAt.getUTCDate() + 7);
  } else if (period === 'monthly') {
    startsAt = new Date(Date.UTC(year, month, 1));
    endsAt = new Date(Date.UTC(year, month + 1, 1));
  } else {
    const quarter = Math.floor(month / 3) * 3;
    startsAt = new Date(Date.UTC(year, quarter, 1));
    endsAt = new Date(Date.UTC(year, quarter + 3, 1));
  }
  return { startsAt, endsAt };
}
export function calculatePayout(
  totalPool: bigint,
  stake: bigint,
  winningStake: bigint,
  oddsBps: bigint,
  multiplierBps: bigint,
) {
  if (winningStake <= 0n) return 0n;
  return (totalPool * stake * oddsBps * multiplierBps) / (winningStake * 10000n * 10000n);
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const safeNumber = (v: string | number | bigint) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n))
    throw new ApiError(409, 'COIN_LIMIT', 'Coin amount exceeds the supported limit.');
  return n;
};
