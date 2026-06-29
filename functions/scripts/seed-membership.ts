/**
 * Seed a `coachMemberships/{athleteUid}/coaches/{coachId}` doc — the
 * server-side entitlement that authorizes an athlete to ask a coach's AI
 * companion (see functions/src/ai/membership.ts).
 *
 * In production these are created by the backend when a coach accepts an
 * athlete; this script is for local/test setup — e.g. connecting a test
 * athlete to Benson for the Coach AI live verification.
 *
 * Usage (emulator):
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=<project> \
 *     npx tsx scripts/seed-membership.ts <athleteUid> <coachId>
 *
 * Usage (prod — needs application-default creds):
 *   gcloud auth application-default login
 *   ALLOW_PROD_SEED=1 GCLOUD_PROJECT=<project> \
 *     npx tsx scripts/seed-membership.ts <athleteUid> <coachId>
 */
import {initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';

const athleteUid = process.argv[2];
const coachId = process.argv[3];
if (!athleteUid || !coachId) {
  console.error(
    'Usage: tsx scripts/seed-membership.ts <athleteUid> <coachId>',
  );
  process.exit(1);
}

// Same prod guard as seed-coach-profile.ts: writing to the emulator is always
// fine; writing to a live project requires an explicit acknowledgement.
const usingEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
if (!usingEmulator && process.env.ALLOW_PROD_SEED !== '1') {
  console.error(
    'Refusing to seed a non-emulator (prod) Firestore. Set ALLOW_PROD_SEED=1 ' +
      'to confirm you intend to connect this athlete to this coach in a live ' +
      'project.',
  );
  process.exit(1);
}

async function main(): Promise<void> {
  initializeApp();
  const db = getFirestore();
  await db
    .collection('coachMemberships').doc(athleteUid)
    .collection('coaches').doc(coachId)
    .set({connectedAt: new Date().toISOString()});
  console.log(
    `Seeded coachMemberships/${athleteUid}/coaches/${coachId}.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
