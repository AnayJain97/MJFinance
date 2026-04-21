import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { auth, googleProvider, db } from '../services/firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userRoles, setUserRoles] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubRoles = null;

    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubRoles) { unsubRoles(); unsubRoles = null; }

      if (firebaseUser) {
        setUser(firebaseUser);

        const userRef = doc(db, 'users', firebaseUser.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            email: firebaseUser.email,
            displayName: firebaseUser.displayName || '',
            orgs: {},
            createdAt: serverTimestamp(),
          });
        }

        unsubRoles = onSnapshot(userRef, (snap) => {
          const data = snap.data();
          setUserRoles(data?.orgs || {});
          setLoading(false);
        });
      } else {
        setUser(null);
        setUserRoles(null);
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubRoles) unsubRoles();
    };
  }, []);

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error('Sign-in error:', err.code, err.message);
    }
  };

  const signOut = () => firebaseSignOut(auth);

  const getOrgRole = (orgId) => {
    if (!userRoles) return 'none';
    return userRoles[orgId] || 'none';
  };

  return (
    <AuthContext.Provider value={{ user, loading, userRoles, getOrgRole, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
