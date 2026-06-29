import {Firestore} from 'firebase-admin/firestore';
import {logger} from 'firebase-functions/v2';

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

/**
 * Workout category, mirroring the Dart `WorkoutCategory` enum
 * (lib/src/workouts/models/workout.dart) by ordinal.
 */
export const WORKOUT_CATEGORIES =
  ['Basketball', 'Strength', 'Fitness'] as const;
export type WorkoutCategory = 0 | 1 | 2;

/** A workout as stored at `workouts/{id}`. */
export interface CorpusWorkout {
  id: string;
  /** Ordinal into {@link WORKOUT_CATEGORIES}. */
  category: WorkoutCategory;
  description: string;
  exerciseIds: string[];
}

/** The closed set of exercise prescription shapes. */
export type ExerciseType = 'timed' | 'reps' | 'repsWithWeight';

/** An exercise as stored at `exercises/{id}`. */
export interface CorpusExercise {
  id: string;
  type: ExerciseType;
  title: string;
  subtitle: string;
  description: string;
  reps?: number;
  sets?: number;
  time?: number;
  weight?: number;
}

const EXERCISE_TYPES: readonly ExerciseType[] = [
  'timed', 'reps', 'repsWithWeight',
];

/**
 * Validate an untrusted Firestore value as an {@link ExerciseType}.
 *
 * The literal-union types are only a compile-time contract; Firestore data is
 * untyped, so the boundary needs a real runtime check. Returns undefined for
 * anything outside the closed set (caller skips it — fail closed).
 *
 * @param {unknown} v the raw stored value.
 * @return {ExerciseType | undefined} the validated type, or undefined.
 */
export function toExerciseType(v: unknown): ExerciseType | undefined {
  return typeof v === 'string' &&
    (EXERCISE_TYPES as readonly string[]).includes(v) ?
    (v as ExerciseType) :
    undefined;
}

/**
 * Validate an untrusted Firestore value as a {@link WorkoutCategory} ordinal.
 *
 * @param {unknown} v the raw stored value.
 * @return {WorkoutCategory | undefined} the validated ordinal, or undefined.
 */
export function toWorkoutCategory(v: unknown): WorkoutCategory | undefined {
  return v === 0 || v === 1 || v === 2 ? v : undefined;
}

const categoryName = (category: number): string =>
  WORKOUT_CATEGORIES[category] ?? `Category ${category}`;

// One-line summary of an exercise's prescription (sets/reps/time/weight).
// Returns '' when a required number is missing — better no prescription line
// than "undefined sets x undefineds" leaking into the prompt (fail closed).
const prescription = (ex: CorpusExercise): string => {
  switch (ex.type) {
  case 'timed':
    if (ex.sets == null || ex.time == null) return '';
    return `${ex.sets} sets x ${ex.time}s`;
  case 'reps':
    if (ex.sets == null || ex.reps == null) return '';
    return `${ex.sets} sets x ${ex.reps} reps`;
  case 'repsWithWeight':
    if (ex.sets == null || ex.reps == null || ex.weight == null) return '';
    return `${ex.sets} sets x ${ex.reps} reps @ ${ex.weight}kg`;
  default: {
    // Compile-time exhaustiveness: adding an ExerciseType without a case here
    // is a build error. At runtime an unexpected value emits no prescription
    // line rather than garbage (fail closed).
    const _exhaustive: never = ex.type;
    void _exhaustive;
    return '';
  }
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
  const profile = parseCoachProfile(profileSnap.data(), coachId);

  // TODO multi-coach: scope these queries by coachId.
  const [workoutsSnap, exercisesSnap] = await Promise.all([
    db.collection('workouts').get(),
    db.collection('exercises').get(),
  ]);

  // Validate at the Firestore boundary: a doc with an out-of-set category/type
  // is skipped (and logged) rather than blind-cast into the corpus — so unknown
  // data never reaches the prompt, but one bad doc doesn't take down the coach.
  const workouts: CorpusWorkout[] = workoutsSnap.docs
    .map((d) => {
      const data = d.data();
      const category = toWorkoutCategory(data.category);
      if (category === undefined) {
        logger.warn('Skipping workout with invalid category', {
          id: d.id, category: data.category,
        });
        return undefined;
      }
      return {
        id: d.id,
        category,
        description: String(data.description ?? ''),
        exerciseIds: Array.isArray(data.exerciseIds) ?
          data.exerciseIds.filter((e): e is string => typeof e === 'string') :
          [],
      };
    })
    .filter((w): w is CorpusWorkout => w !== undefined)
    .sort((a, b) => a.id.localeCompare(b.id));

  const exercisesById = new Map<string, CorpusExercise>();
  for (const d of exercisesSnap.docs) {
    const data = d.data();
    const type = toExerciseType(data.type);
    if (type === undefined) {
      logger.warn('Skipping exercise with invalid type', {
        id: d.id, type: data.type,
      });
      continue;
    }
    exercisesById.set(d.id, {
      id: d.id,
      type,
      title: String(data.title ?? ''),
      subtitle: String(data.subtitle ?? ''),
      description: String(data.description ?? ''),
      reps: data.reps,
      sets: data.sets,
      time: data.time,
      weight: data.weight,
    });
  }

  return formatCorpus(profile, workouts, exercisesById);
}

/**
 * Validate an untrusted Firestore document as a {@link CoachProfile}.
 *
 * Unlike workouts/exercises (collections where one bad doc is skipped), the
 * profile is the irreplaceable singleton — a malformed one means the companion
 * has no voice, so this throws rather than degrading silently.
 *
 * @param {FirebaseFirestore.DocumentData | undefined} data the raw doc data.
 * @param {string} coachId the coach id (for the error message).
 * @return {CoachProfile} the validated profile.
 */
function parseCoachProfile(
  data: FirebaseFirestore.DocumentData | undefined,
  coachId: string,
): CoachProfile {
  const voiceDescription = data?.voiceDescription;
  const principles = data?.principles;
  const seedQAs = data?.seedQAs;
  if (
    typeof voiceDescription !== 'string' ||
    !Array.isArray(principles) ||
    !Array.isArray(seedQAs)
  ) {
    throw new Error(
      `coachProfiles/${coachId} is malformed: expected voiceDescription ` +
        '(string), principles (array), seedQAs (array).',
    );
  }
  return {voiceDescription, principles, seedQAs};
}
