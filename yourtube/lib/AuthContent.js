"use client";

import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { useEffect, useState } from "react";
import { createContext , useContext} from "react";
import { auth, provider } from "./firebase";
import axiosInstance from "./axiosinstance";

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    if (typeof window === "undefined") return null;
    const storedUser = localStorage.getItem("user");
    return storedUser ? JSON.parse(storedUser) : null;
  });

  const login = (userdata) => {
    setUser(userdata);
    localStorage.setItem("user", JSON.stringify(userdata));
  };

  const logout = async () => {
    setUser(null);
    localStorage.removeItem("user");
    await signOut(auth);
  };

  const handlegooglesignin = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      const firebaseuser = result.user
      const payload={
        email:firebaseuser.email,
        name:firebaseuser.displayName,
        image:firebaseuser.photoURL||"https://github.com/shadcn.png",
      };
      const response = await axiosInstance.post("/users/login",payload);
      login(response.data.result);
    } catch (error) {
      console.error(error);
    }
  };
useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, async (firebaseuser) => {
    if (firebaseuser) {
      try {
        const payload = {
          email: firebaseuser.email,
          name: firebaseuser.displayName,
          image: firebaseuser.photoURL || "https://github.com/shadcn.png",
        };
        const response = await axiosInstance.post("/user/login", payload);
        login(response.data.result);
      } catch (error) {
        console.error(error);
        logout();
      }
    }
  });
  return () => unsubscribe();
}, []);

return (
  <UserContext.Provider value={{ user, login, logout, handlegooglesignin }}>
    {children}
  </UserContext.Provider>
);
};
export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};
