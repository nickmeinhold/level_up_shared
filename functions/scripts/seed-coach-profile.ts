/**
 * Seed a starter `coachProfiles/{coachId}` document.
 *
 * The voice content below is a STARTER draft for Benson to refine — the whole
 * point of the companion is that answers sound like *him*, so this should be
 * replaced with his own words and real example answers before it ships.
 *
 * Usage (emulator):
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 \
 *     GCLOUD_PROJECT=<project> npx tsx scripts/seed-coach-profile.ts <coachId>
 *
 * Usage (prod — needs application-default creds):
 *   gcloud auth application-default login
 *   GCLOUD_PROJECT=<project> npx tsx scripts/seed-coach-profile.ts <coachId>
 */
import {initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';

const coachId = process.argv[2];
if (!coachId) {
  console.error('Usage: tsx scripts/seed-coach-profile.ts <coachId>');
  process.exit(1);
}

// Guard against silently overwriting a real coach's voice profile in prod.
// Writing to the emulator is always fine; writing to a live project requires
// an explicit ALLOW_PROD_SEED=1 acknowledgement.
const usingEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
if (!usingEmulator && process.env.ALLOW_PROD_SEED !== '1') {
  console.error(
    'Refusing to seed a non-emulator (prod) Firestore. This would overwrite\n' +
      `coachProfiles/${coachId} with STARTER content. Re-run against the\n` +
      'emulator (set FIRESTORE_EMULATOR_HOST), or set ALLOW_PROD_SEED=1 to\n' +
      'confirm you intend to write starter content to a live project.',
  );
  process.exit(1);
}

// STARTER CONTENT — Benson to replace with his own voice + real answers.
const profile = {
  voiceDescription: [
    'You are Benson, a basketball coach and mentor who is deeply connected',
    'to the game. You are warm and encouraging but you never let players',
    'cut corners — you care most about mastering the fundamentals and',
    'developing an all-round game. You speak plainly and practically, like',
    'a mentor courtside, not a textbook.',
  ].join(' '),
  principles: [
    'Master the fundamentals before the flashy stuff.',
    'Develop an all-round game — no one-trick players.',
    'Footwork and body control win games.',
    'Reps with intent beat reps for the sake of it.',
  ],
  seedQAs: [
    {
      q: 'How do I stop getting stripped?',
      a: [
        'Protect the ball, mate. Chin it when you gather, keep your',
        'elbows out, and pivot away from the defender. If they\'re',
        'reaching, make them pay — rip through and go.',
      ].join(' '),
    },
    {
      q: 'I want to get a quicker first step.',
      a: [
        'It starts low. Get into a real stance, weight on the balls of',
        'your feet, and explode off your back foot. Add the defensive',
        'slides and the pound dribble work — that\'s where the burst',
        'comes from.',
      ].join(' '),
    },
  ],
};

async function main(): Promise<void> {
  initializeApp();
  const db = getFirestore();
  await db.collection('coachProfiles').doc(coachId).set(profile);
  console.log(`Seeded coachProfiles/${coachId} (starter voice — refine me).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
