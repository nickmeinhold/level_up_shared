import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Firestore} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import {enforceCoachMembership, membershipDocPath} from './membership';

/**
 * Minimal fake Firestore that records the document path
 * enforceCoachMembership reads and returns a configurable `exists`.
 *
 * @param {boolean} exists what the membership doc's `.exists` should report.
 * @param {object} sink receives the looked-up document path as `sink.path`.
 * @return {Firestore} the fake, typed as Firestore for the call site.
 */
function fakeDb(exists: boolean, sink: {path?: string} = {}): Firestore {
  return {
    doc: (path: string) => {
      sink.path = path;
      return {get: async () => ({exists})};
    },
  } as unknown as Firestore;
}

test('membershipDocPath builds the athlete->coach path', () => {
  assert.equal(
    membershipDocPath('athlete-1', 'benson'),
    'coachMemberships/athlete-1/coaches/benson',
  );
});

test('resolves and reads the membership doc for a member', async () => {
  const sink: {path?: string} = {};
  await enforceCoachMembership(fakeDb(true, sink), 'athlete-1', 'benson');
  // Enforcement must read exactly the path membershipDocPath builds — single
  // source of truth for the security-critical doc location.
  assert.equal(sink.path, 'coachMemberships/athlete-1/coaches/benson');
});

test('throws permission-denied when not a member', async () => {
  await assert.rejects(
    () => enforceCoachMembership(fakeDb(false), 'athlete-1', 'benson'),
    (e: unknown) => e instanceof HttpsError && e.code === 'permission-denied',
  );
});
