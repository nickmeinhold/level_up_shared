import {Firestore} from 'firebase-admin/firestore';

/**
 * The coach's voice profile — a small, hand-authored document that teaches
 * Claude to answer *as this coach*, beyond the raw drill data. Stored at
 * `coachProfiles/{coachId}`.
 */
export interface CoachProfile {
  /** Free-text description of tone, register, and how the coach talks. */
  voiceDescription: string;
  /** Short coaching principles / rules of thumb, in the coach's words. */
  principles: string[];
  /** A handful of example Q&As demonstrating the coach's voice. */
  seedQAs: { q: string; a: string }[];
}

/** A workout as stored at `workouts/{id}`. */
export interface CorpusWorkout {
  id: string;
  /** 0 = basketball, 1 = strength, 2 = fitness (WorkoutCategory enum). */
  category: number;
  description: string;
  exerciseIds: string[];
}

/** An exercise as stored at `exercises/{id}`. */
export interface CorpusExercise {
  id: string;
  /** 'timed' | 'reps' | 'repsWithWeight'. */
  type: string;
  title: string;
  subtitle: string;
  description: string;
  reps?: number;
  sets?: number;
  time?: number;
  weight?: number;
}

const CATEGORY_NAMES = ['Basketball', 'Strength', 'Fitness'];

const categoryName = (category: number): string =>
  CATEGORY_NAMES[category] ?? `Category ${category}`;

// One-line summary of an exercise's prescription (sets/reps/time/weight).
const prescription = (ex: CorpusExercise): string => {
  switch (ex.type) {
  case 'timed':
    return `${ex.sets} sets x ${ex.time}s`;
  case 'reps':
    return `${ex.sets} sets x ${ex.reps} reps`;
  case 'repsWithWeight':
    return `${ex.sets} sets x ${ex.reps} reps @ ${ex.weight}kg`;
  default:
    return '';
  }
};

/**
 * Render the coach's knowledge into a single deterministic text block for the
 * (cached) system prompt.
 *
 * Determinism matters: the corpus is the cached prefix, so its bytes must be
 * identical across requests or prompt caching silently misses. Firestore does
 * not guarantee read order, so callers MUST pass workouts pre-sorted by id;
 * within each workout, exercises are rendered in the stored `exerciseIds`
 * order (meaningful and stable).
 *
 * @param {CoachProfile} profile the coach's voice profile.
 * @param {CorpusWorkout[]} workouts workouts, pre-sorted by id.
 * @param {Map<string, CorpusExercise>} exercisesById exercises keyed by id.
 * @return {string} the deterministic corpus text.
 */
export function formatCorpus(
  profile: CoachProfile,
  workouts: CorpusWorkout[],
  exercisesById: Map<string, CorpusExercise>,
): string {
  const lines: string[] = [];

  lines.push('# The coach\'s voice');
  lines.push(profile.voiceDescription.trim());
  lines.push('');

  if (profile.principles.length > 0) {
    lines.push('## Coaching principles');
    for (const p of profile.principles) {
      lines.push(`- ${p}`);
    }
    lines.push('');
  }

  if (profile.seedQAs.length > 0) {
    lines.push('## Examples of how the coach answers');
    for (const qa of profile.seedQAs) {
      lines.push(`Q: ${qa.q}`);
      lines.push(`A: ${qa.a}`);
      lines.push('');
    }
  }

  lines.push('# Coaching content (workouts and exercises)');
  lines.push('');
  for (const w of workouts) {
    lines.push(`## ${categoryName(w.category)} workout: ${w.description}`);
    for (const exId of w.exerciseIds) {
      const ex = exercisesById.get(exId);
      if (!ex) continue;
      lines.push(`### ${ex.title} — ${ex.subtitle}`);
      const presc = prescription(ex);
      if (presc) lines.push(presc);
      if (ex.description.trim()) lines.push(ex.description.trim());
      lines.push('');
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}

/**
 * Read the coach's profile + all coaching content from Firestore and render
 * the deterministic corpus text.
 *
 * NOTE (multi-coach): the current schema does not scope `workouts`/`exercises`
 * by coach, so for the single-coach (Benson) setup we load everything. When
 * multiple coaches exist, scope these queries by coachId here.
 *
 * @param {Firestore} db the Firestore instance.
 * @param {string} coachId the coach whose corpus to build.
 * @return {Promise<string>} the deterministic corpus text.
 */
export async function buildCoachCorpus(
  db: Firestore,
  coachId: string,
): Promise<string> {
  const profileSnap = await db.collection('coachProfiles').doc(coachId).get();
  if (!profileSnap.exists) {
    throw new Error(`No coachProfile found for coachId ${coachId}`);
  }
  const profile = profileSnap.data() as CoachProfile;

  // TODO multi-coach: scope these queries by coachId.
  const [workoutsSnap, exercisesSnap] = await Promise.all([
    db.collection('workouts').get(),
    db.collection('exercises').get(),
  ]);

  const workouts: CorpusWorkout[] = workoutsSnap.docs
    .map((d) => ({id: d.id, ...(d.data() as Omit<CorpusWorkout, 'id'>)}))
    .sort((a, b) => a.id.localeCompare(b.id));

  const exercisesById = new Map<string, CorpusExercise>();
  for (const d of exercisesSnap.docs) {
    exercisesById.set(d.id, {
      id: d.id,
      ...(d.data() as Omit<CorpusExercise, 'id'>),
    });
  }

  return formatCorpus(profile, workouts, exercisesById);
}
