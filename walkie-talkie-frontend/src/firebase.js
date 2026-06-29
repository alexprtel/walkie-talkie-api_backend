import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDcM5uSxWRv_icBRyDxvJcZzv8WyIsCHB4",
  authDomain: "wokitoki-9591e.firebaseapp.com",
  projectId: "wokitoki-9591e",
  storageBucket: "wokitoki-9591e.firebasestorage.app",
  messagingSenderId: "869803525009",
  appId: "1:869803525009:web:1c8d8de5d5585eea7cd030",
  measurementId: "G-EJR2Q3DTF9"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  const result = await signInWithPopup(auth, googleProvider);
  return { email: result.user.email, name: result.user.displayName, id: result.user.uid };
};

export const resetPassword = async (email) => {
  await sendPasswordResetEmail(auth, email);
};