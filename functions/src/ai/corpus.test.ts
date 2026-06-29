import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCorpus,
  toExerciseType,
  toWorkoutCategory,
  CoachProfile,
  CorpusWorkout,
  CorpusExercise,
} from './corpus';

const profile: CoachProfile = {
  voiceDescription: 'Direct, encouraging, all about mastering fundamentals.',
  principles: ['Stay low on defense', 'Footwork before flash'],
  seedQAs: [{q: 'How do I stop getting stripped?', a: 'Chin the ball, pivot.'}],
};

const exercises = new Map<string, CorpusExercise>([
  ['ex-a', {
    id: 'ex-a', type: 'reps', title: 'Pound dribble', subtitle: 'Ball control',
    description: 'Hard pounds, eyes up.', reps: 20, sets: 3,
  }],
  ['ex-b', {
    id: 'ex-b', type: 'timed', title: 'Defensive slides', subtitle: 'Footwork',
    description: 'Stay low.', time: 30, sets: 4,
  }],
]);

const workouts: CorpusWorkout[] = [
  {id: 'w-1', category: 0, description: 'Ball handling', exerciseIds: ['ex-a']},
  {id: 'w-2', category: 1, description: 'Defense', exerciseIds: ['ex-b']},
];

test('formatCorpus includes voice, principles, seed Q&As, and content', () => {
  const out = formatCorpus(profile, workouts, exercises);
  assert.match(out, /mastering fundamentals/);
  assert.match(out, /Footwork before flash/);
  assert.match(out, /How do I stop getting stripped\?/);
  assert.match(out, /Pound dribble/);
  assert.match(out, /3 sets x 20 reps/);
  assert.match(out, /4 sets x 30s/);
  assert.match(out, /Basketball workout: Ball handling/);
});

test('formatCorpus is deterministic (byte-stable for caching)', () => {
  const a = formatCorpus(profile, workouts, exercises);
  const b = formatCorpus(profile, workouts, exercises);
  assert.equal(a, b);
});

test('prescription omitted (no "undefined") when fields missing', () => {
  const w: CorpusWorkout[] = [
    {id: 'w-z', category: 1, description: 'Bad', exerciseIds: ['ex-bad']},
  ];
  const ex = new Map<string, CorpusExercise>([
    ['ex-bad', {
      id: 'ex-bad', type: 'timed', title: 'Broken drill',
      subtitle: 'No numbers', description: 'Missing sets/time.',
    }],
  ]);
  const out = formatCorpus(profile, w, ex);
  assert.match(out, /Broken drill/);
  assert.doesNotMatch(out, /undefined/);
});

test('toExerciseType validates against the closed set', () => {
  assert.equal(toExerciseType('reps'), 'reps');
  assert.equal(toExerciseType('repsWithWeight'), 'repsWithWeight');
  assert.equal(toExerciseType('garbage'), undefined);
  assert.equal(toExerciseType(42), undefined);
  assert.equal(toExerciseType(undefined), undefined);
});

test('toWorkoutCategory accepts only valid ordinals', () => {
  assert.equal(toWorkoutCategory(0), 0);
  assert.equal(toWorkoutCategory(2), 2);
  assert.equal(toWorkoutCategory(3), undefined);
  assert.equal(toWorkoutCategory('1'), undefined);
  assert.equal(toWorkoutCategory(undefined), undefined);
});

test('formatCorpus skips exerciseIds with no matching exercise', () => {
  const w: CorpusWorkout[] = [
    {
      id: 'w-x',
      category: 2,
      description: 'Mixed',
      exerciseIds: ['ex-a', 'gone'],
    },
  ];
  const out = formatCorpus(profile, w, exercises);
  assert.match(out, /Pound dribble/);
  assert.doesNotMatch(out, /gone/);
});
