import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// TODO: Replace with your Firebase project's config
const firebaseConfig = {
  apiKey: "AIzaSyDcwBbSqjFOb7vGvszwjSoTX-LJQtqEm2E",
  authDomain: "sadia-a6e31.firebaseapp.com",
  projectId: "sadia-a6e31",
  storageBucket: "sadia-a6e31.firebasestorage.app",
  messagingSenderId: "410486513379",
  appId: "1:410486513379:web:36784725bf939fc93dafd6"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
