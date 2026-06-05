import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCK_hL-iwM63itmPzyjtap5L--VQpLI56w",
  authDomain: "traving-d2c86.firebaseapp.com",
  projectId: "traving-d2c86",
  storageBucket: "traving-d2c86.firebasestorage.app",
  messagingSenderId: "44481586830",
  appId: "1:44481586830:web:1bfb05d2831db1a72b0bdf",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
