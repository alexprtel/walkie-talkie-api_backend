import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult, sendPasswordResetEmail } from 'firebase/auth';

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

// Cambiamos de signInWithPopup a signInWithRedirect
export const signInWithGoogleRedirect = () => signInWithRedirect(auth, googleProvider);

// Función para obtener el resultado de la redirección
export const getGoogleRedirectResult = () => getRedirectResult(auth);

export const resetPassword = async (email) => {
  await sendPasswordResetEmail(auth, email);
};