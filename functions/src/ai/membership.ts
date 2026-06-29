import {Firestore} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';

/**
 * Build the Firestore path to the membership doc that connects an athlete to a
 * coach: `coachMemberships/{athleteUid}/coaches/{coachId}`. The doc's EXISTENCE
 * is the entitlement — there is no payload to interpret.
 *
 * @param {string} athleteUid the authenticated athlete's uid.
 * @param {string} coachId the coach being asked.
 * @return {string} the membership document path.
 */
export function membershipDocPath(
  athleteUid: string,
  coachId: string,
): string {
  return `coachMemberships/${athleteUid}/coaches/${coachId}`;
}

/**
 * Enforce that `athleteUid` is connected to `coachId`, failing CLOSED.
 *
 * The athlete→coach link is the server-side source of truth: a doc at
 * `coachMemberships/{athleteUid}/coaches/{coachId}` that ONLY the backend can
 * create (client writes are denied by Firestore rules — see firestore.rules).
 * So although the caller supplies `coachId`, it is validated against the
 * membership rather than trusted on its own — closing the IDOR where any
 * authenticated user could pull any coach's voice profile by passing that
 * coach's id.
 *
 * @param {Firestore} db the Firestore instance.
 * @param {string} athleteUid the authenticated athlete's uid.
 * @param {string} coachId the coach being asked.
 * @return {Promise<void>} resolves when entitled; throws otherwise.
 */
export async function enforceCoachMembership(
  db: Firestore,
  athleteUid: string,
  coachId: string,
): Promise<void> {
  const snap = await db
    .collection('coachMemberships').doc(athleteUid)
    .collection('coaches').doc(coachId)
    .get();
  if (!snap.exists) {
    throw new HttpsError(
      'permission-denied',
      'You are not connected to this coach.',
    );
  }
}
