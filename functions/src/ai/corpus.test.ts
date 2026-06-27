import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCorpus,
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
