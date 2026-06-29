import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Firestore} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import {enforceCoachMembership, membershipDocPath} from './membership';

/**
 * Minimal fake Firestore that follows exactly the chain
 * enforceCoachMembership walks (collection→doc→collection→doc→get), recording
 * each path segment and returning a configurable `exists`.
 *
 * @param {boolean} exists what the membership doc's `.exists` should report.
 * @param {string[]} captured receives each path segment, in walk order.
 * @return {Firestore} the fake, typed as Firestore for the call site.
 */
function fakeDb(exists: boolean, captured: string[] = []): Firestore {
  const leaf = {get: async () => ({exists})};
  const coaches = {doc: (coachId: string) => {
    captured.push(coachId); return leaf;
  }};
  const athleteDoc = {collection: (name: string) => {
    captured.push(name); return coaches;
  }};
  const root = {collection: (name: string) => {
    captured.push(name);
    return {doc: (uid: string) => {
      captured.push(uid); return athleteDoc;
    }};
  }};
  return root as unknown as Firestore;
}

test('membershipDocPath builds the athlete->coach path', () => {
  assert.equal(
    membershipDocPath('athlete-1', 'benson'),
    'coachMemberships/athlete-1/coaches/benson',
  );
});

test('resolves and reads the membership doc for a member', async () => {
  const captured: string[] = [];
  await enforceCoachMembership(fakeDb(true, captured), 'athlete-1', 'benson');
  assert.deepEqual(
    captured,
    ['coachMemberships', 'athlete-1', 'coaches', 'benson'],
  );
});

test('throws permission-denied when not a member', async () => {
  await assert.rejects(
    () => enforceCoachMembership(fakeDb(false), 'athlete-1', 'benson'),
    (e: unknown) => e instanceof HttpsError && e.code === 'permission-denied',
  );
});
