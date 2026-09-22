// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDstj_xcC14BAyYFubAGJK8nroIoru5648",
  authDomain: "yourtube-e63dd.firebaseapp.com",
  projectId: "yourtube-e63dd",
  storageBucket: "yourtube-e63dd.firebasestorage.app",
  messagingSenderId: "258856446778",
  appId: "1:258856446778:web:512c077f7e3712d82ffe03",
  measurementId: "G-P1PZSN4TTW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

export { auth, provider };
