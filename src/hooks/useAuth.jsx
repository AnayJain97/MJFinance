import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut, browserSessionPersistence, setPersistence, reauthenticateWithCredential, EmailAuthProvider, updatePassword } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../services/firebase';

const EMAIL_DOMAIN = '@gmail.com';
const EMAIL_PREFIX = 'idfrwst+';

function usernameToEmail(username) {
  return `${EMAIL_PREFIX}${username.toLowerCase().trim()}${EMAIL_DOMAIN}`;
}

function emailToUsername(email) {
  if (!email) return '';
  const match = email.match(/\+(.+)@/);
  return match ? match[1] : email.split('@')[0];
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userRoles, setUserRoles] = useState(null);
  const [userDisplayName, setUserDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    let unsubRoles = null;
    let unsubAuth = null;
    let cancelled = false;

    async function bootstrap() {
      try {
        await setPersistence(auth, browserSessionPersistence);
      } catch (err) {
        // Common in private-mode browsers / storage-disabled environments.
        // Fail open so the app doesn't hang on the splash screen — the user
        // just won't get session persistence.
        console.warn('setPersistence failed, continuing without session persistence:', err);
      }

      if (cancelled) return;

      unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
        if (unsubRoles) { unsubRoles(); unsubRoles = null; }

        if (!firebaseUser) {
          setUser(null);
          setUserRoles(null);
          setLoading(false);
          return;
        }

        setUser(firebaseUser);

        try {
          const userRef = doc(db, 'users', firebaseUser.uid);
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            await setDoc(userRef, {
              email: firebaseUser.email,
              displayName: firebaseUser.displayName || emailToUsername(firebaseUser.email),
              orgs: {},
              createdAt: serverTimestamp(),
            });
          }

          unsubRoles = onSnapshot(userRef,
            (snap) => {
              const data = snap.data();
              setUserRoles(data?.orgs || {});
              setUserDisplayName(data?.displayName || emailToUsername(firebaseUser.email));
              setLoading(false);
            },
            (err) => {
              console.error('User profile snapshot error:', err);
              setAuthError(err?.message || 'Failed to load your profile');
              setUserRoles({});
              setLoading(false);
            }
          );
        } catch (err) {
          // getDoc/setDoc bootstrap failure — surface to UI so the user isn't
          // stuck on the loading screen.
          console.error('User profile bootstrap failed:', err);
          setAuthError(err?.message || 'Failed to load your profile');
          setUserRoles({});
          setLoading(false);
        }
      },
      (err) => {
        console.error('onAuthStateChanged error:', err);
        setAuthError(err?.message || 'Authentication error');
        setLoading(false);
      });
    }

    bootstrap();

    return () => {
      cancelled = true;
      if (unsubAuth) unsubAuth();
      if (unsubRoles) unsubRoles();
    };
  }, []);

  const signIn = async (username, password) => {
    const email = usernameToEmail(username);
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signOut = () => firebaseSignOut(auth);

  const changePassword = async (currentPassword, newPassword) => {
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
  };

  return (
    <AuthContext.Provider value={{ user, loading, authError, userRoles, userDisplayName, signIn, signOut, changePassword }}>
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
