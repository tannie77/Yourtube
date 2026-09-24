"use client";

import { useEffect, useState } from "react";
import { createContext, useContext } from "react";
import axiosInstance from "./axiosinstance";

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    axiosInstance.get("/user/me")
      .then((response) => { if (active) setUser(response.data.user); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const signIn = async (email, password) => {
    const response = await axiosInstance.post("/user/login", { email, password });
    setUser(response.data.user);
    return response.data.user;
  };

  const register = async (name, email, password) => {
    const response = await axiosInstance.post("/user/register", { name, email, password });
    setUser(response.data.user);
    return response.data.user;
  };

  const logout = async () => {
    await axiosInstance.post("/user/logout");
    setUser(null);
  };

  const login = (updatedUser) => setUser(updatedUser);

  return (
    <UserContext.Provider value={{ user, loading, login, logout, signIn, register }}>
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
