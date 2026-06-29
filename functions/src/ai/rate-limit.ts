import {Firestore} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';

/** Max askCoach calls allowed per user within {@link WINDOW_MS}. */
export const MAX_CALLS_PER_WINDOW = 30;
/** Rolling window length: 1 hour. */
export const WINDOW_MS = 60 * 60 * 1000;

/** Per-user usage state persisted at `aiCoachUsage/{uid}`. */
export interface UsageState {
  windowStart: number;
  count: number;
}

/** The decision the rate limiter reaches for a given call. */
export interface RateLimitDecision {
  allow: boolean;
  /** The state to persist when `allow` is true (omitted when blocked). */
  nextState?: UsageState;
}

/**
 * Pure rate-limit decision — no I/O, so it is deterministic and unit-testable.
 *
 * A fresh window starts when the previous one has elapsed (or there is no prior
 * state); within a live window, calls are allowed until the count hits the cap.
 *
 * @param {number} now current time in ms (Date.now()).
 * @param {UsageState | undefined} state the user's prior usage, if any.
 * @param {number} max calls allowed per window.
 * @param {number} windowMs window length in ms.
 * @return {RateLimitDecision} whether to allow, and the state to persist.
 */
export function rateLimitDecision(
  now: number,
  state: UsageState | undefined,
  max: number = MAX_CALLS_PER_WINDOW,
  windowMs: number = WINDOW_MS,
): RateLimitDecision {
  if (!state || now - state.windowStart >= windowMs) {
    return {allow: true, nextState: {windowStart: now, count: 1}};
  }
  if (state.count >= max) {
    return {allow: false};
  }
  return {
    allow: true,
    nextState: {windowStart: state.windowStart, count: state.count + 1},
  };
}

/**
 * Enforce the per-user askCoach rate limit, failing CLOSED.
 *
 * Runs inside a Firestore transaction so concurrent calls from the same user
 * can't race past the cap (the "while(true) liquidates the Vertex quota" case).
 * Throws `resource-exhausted` when the user is over the limit.
 *
 * @param {Firestore} db the Firestore instance.
 * @param {string} uid the calling user's uid.
 * @param {number} now current time in ms (injectable for tests).
 * @return {Promise<void>} resolves when the call is permitted and recorded.
 */
export async function enforceRateLimit(
  db: Firestore,
  uid: string,
  now: number = Date.now(),
): Promise<void> {
  const ref = db.collection('aiCoachUsage').doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const state = snap.exists ? (snap.data() as UsageState) : undefined;
    const decision = rateLimitDecision(now, state);
    if (!decision.allow) {
      throw new HttpsError(
        'resource-exhausted',
        'You\'ve asked your coach a lot recently — give it a little while ' +
          'before asking again.',
      );
    }
    tx.set(ref, decision.nextState!);
  });
}
