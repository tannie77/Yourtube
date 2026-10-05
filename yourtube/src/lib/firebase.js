import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCyxbdclt2ocA5zgE-MDy1ndYIFqVMAr30",
  authDomain: "yourtube-8cda9.firebaseapp.com",
  projectId: "yourtube-8cda9",
  storageBucket: "yourtube-8cda9.firebasestorage.app",
  messagingSenderId: "921641878423",
  appId: "1:921641878423:web:0d65801eebaf2b25f03ad2",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
export { auth, provider };
