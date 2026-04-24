import { useState, useEffect } from 'react';
import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../services/firebase';

/**
 * Hook to read a Firestore collection in real-time, scoped to the current user.
 * Waits for auth to be ready before subscribing.
 */
export function useCollection(collectionPath) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!collectionPath) { setLoading(false); return; }

    // Reset state when path changes (e.g. org switch) so we don't render stale data
    setData([]);
    setLoading(true);
    setError(null);

    let unsubFirestore = null;

    // Wait for auth state to be resolved before querying
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      // Clean up previous Firestore subscription if any
      if (unsubFirestore) { unsubFirestore(); unsubFirestore = null; }

      if (!user) {
        setData([]);
        setLoading(false);
        return;
      }

      const q = collection(db, collectionPath);
      // No orderBy here: a Firestore orderBy on a missing field silently
      // filters out docs without that field (we hit this with locks). Callers
      // sort by their own criteria (date, client name, etc.).
      unsubFirestore = onSnapshot(q,
        (snapshot) => {
          const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          // Stable client-side sort: newest createdAt first, falling back to
          // doc id for docs missing the field.
          docs.sort((a, b) => {
            const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            if (ta !== tb) return tb - ta;
            return (b.id || '').localeCompare(a.id || '');
          });
          setData(docs);
          setLoading(false);
        },
        (err) => {
          console.error('useCollection error:', err);
          setError(err);
          setData([]);
          setLoading(false);
        }
      );
    });

    return () => {
      unsubAuth();
      if (unsubFirestore) unsubFirestore();
    };
  }, [collectionPath]);

  return { data, loading, error };
}

/**
 * Hook to read a single Firestore document in real-time.
 * Waits for auth to be ready before subscribing.
 */
export function useDocument(docPath) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!docPath) { setLoading(false); return; }

    // Reset state when path changes so we don't render stale data
    setData(null);
    setLoading(true);
    setError(null);

    let unsubFirestore = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (unsubFirestore) { unsubFirestore(); unsubFirestore = null; }

      if (!user) {
        setData(null);
        setLoading(false);
        return;
      }

      unsubFirestore = onSnapshot(doc(db, docPath),
        (snapshot) => {
          setData(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
          setLoading(false);
        },
        (err) => {
          console.error('useDocument error:', err);
          setError(err);
          setLoading(false);
        }
      );
    });

    return () => {
      unsubAuth();
      if (unsubFirestore) unsubFirestore();
    };
  }, [docPath]);

  return { data, loading, error };
}

/**
 * Add a document to a Firestore collection. Returns { id }.
 * Throws if the user is not authenticated (rather than silently failing inside
 * Firebase with a permission error and leaving the caller none the wiser).
 */
export async function addDocument(collectionPath, data) {
  if (!auth.currentUser) {
    throw new Error('Not authenticated. Please sign in again.');
  }
  const docRef = await addDoc(collection(db, collectionPath), {
    ...data,
    createdAt: serverTimestamp(),
    createdBy: auth.currentUser.email || '',
  });
  return { id: docRef.id };
}

/**
 * Update a Firestore document.
 */
export async function updateDocument(docPath, data) {
  if (!auth.currentUser) {
    throw new Error('Not authenticated. Please sign in again.');
  }
  await updateDoc(doc(db, docPath), {
    ...data,
    updatedAt: serverTimestamp(),
    modifiedBy: auth.currentUser.email || '',
  });
}

/**
 * Delete a Firestore document.
 */
export async function deleteDocument(docPath) {
  if (!auth.currentUser) {
    throw new Error('Not authenticated. Please sign in again.');
  }
  await deleteDoc(doc(db, docPath));
}
