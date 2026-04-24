import { doc, setDoc, serverTimestamp, deleteField } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { db, auth } from './firebase';

/**
 * Locks are stored at orgs/{orgId}/locks/{fyLabel}
 * Doc shape:
 *   {
 *     fyLabel: string,
 *     isLocked: boolean,
 *     lockedAt: Timestamp | null,
 *     lockedBy: string | null,
 *   }
 * When unlocking we keep the doc but set isLocked=false and clear metadata.
 */

function lockDocPath(orgId, fyLabel) {
  return `orgs/${orgId}/locks/${fyLabel}`;
}

/**
 * Re-authenticate the current user with their password.
 * Throws on failure (Firebase auth error).
 */
export async function reauthenticateCurrentUser(password) {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('Not signed in');
  const credential = EmailAuthProvider.credential(user.email, password);
  await reauthenticateWithCredential(user, credential);
}

/**
 * Lock a FY. Caller is expected to have already re-authenticated.
 *
 * @param frozenCF Optional { side: 'lending'|'borrowing'|null, amount: number }
 *                 captured from the live carry-forward plan at the moment of locking.
 *                 Stored on the lock doc so the cascade survives data deletion.
 */
export async function lockFY(orgId, fyLabel, frozenCF = null) {
  const user = auth.currentUser;
  await setDoc(doc(db, lockDocPath(orgId, fyLabel)), {
    fyLabel,
    isLocked: true,
    lockedAt: serverTimestamp(),
    lockedBy: user?.email || '',
    cfSide: frozenCF?.side || null,
    cfAmount: frozenCF?.amount ?? 0,
    // createdAt is required for useCollection's orderBy('createdAt') query to surface this doc
    createdAt: serverTimestamp(),
  }, { merge: true });
}

/**
 * Unlock a FY. Keeps the doc but clears metadata and sets isLocked=false.
 */
export async function unlockFY(orgId, fyLabel) {
  await setDoc(doc(db, lockDocPath(orgId, fyLabel)), {
    fyLabel,
    isLocked: false,
    lockedAt: deleteField(),
    lockedBy: deleteField(),
    cfSide: deleteField(),
    cfAmount: deleteField(),
    createdAt: serverTimestamp(),
  }, { merge: true });
}
