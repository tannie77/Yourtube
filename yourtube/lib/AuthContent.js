"use client";

import { useCallback, useEffect, useState } from "react";
import { createContext, useContext } from "react";
import axiosInstance from "./axiosinstance";

const UserContext = createContext();
const THEME_KEY = "vidcircle_theme_preference";

function automaticTheme() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  return hour >= 5 && hour < 12 ? "light" : "dark";
}

function validTheme(value) {
  return ["automatic", "light", "dark"].includes(value) ? value : "automatic";
}

function applyTheme(preference) {
  if (typeof document === "undefined") return automaticTheme();
  const resolved = preference === "automatic" ? automaticTheme() : preference;
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.dataset.vidcircleTheme = resolved;
  document.documentElement.style.colorScheme = resolved;
  return resolved;
}

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [themePreference, setThemePreferenceState] = useState("automatic");
  const [resolvedTheme, setResolvedTheme] = useState("light");

  const syncTheme = useCallback((preference) => {
    const safePreference = validTheme(preference);
    setThemePreferenceState(safePreference);
    setResolvedTheme(applyTheme(safePreference));
    if (typeof window !== "undefined") {
      try { window.localStorage.setItem(THEME_KEY, safePreference); } catch { /* Server persistence remains available. */ }
    }
  }, []);

  useEffect(() => {
    let active = true;
    const themeTimer = window.setTimeout(() => {
      if (!active) return;
      try { syncTheme(validTheme(window.localStorage.getItem(THEME_KEY))); } catch { syncTheme("automatic"); }
    }, 0);
    axiosInstance.get("/user/me")
      .then((response) => {
        if (!active) return;
        setUser(response.data.user);
        syncTheme(response.data.user.themePreference);
      })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; window.clearTimeout(themeTimer); };
  }, [syncTheme]);

  useEffect(() => {
    if (themePreference !== "automatic") return;
    const timer = window.setInterval(() => setResolvedTheme(applyTheme("automatic")), 60_000);
    return () => window.clearInterval(timer);
  }, [themePreference]);

  const signIn = async (email, password, securityContext = {}) => {
    const response = await axiosInstance.post("/user/login", { email, password, ...securityContext });
    if (response.data.user) {
      setUser(response.data.user);
      syncTheme(response.data.user.themePreference);
    }
    return response.data;
  };

  const verifyOtp = async (challengeToken, code) => {
    const response = await axiosInstance.post("/user/login/otp", { challengeToken, code });
    setUser(response.data.user);
    syncTheme(response.data.user.themePreference);
    return response.data;
  };

  const register = async (name, email, password, securityContext = {}) => {
    const response = await axiosInstance.post("/user/register", { name, email, password, ...securityContext });
    setUser(response.data.user);
    syncTheme(response.data.user.themePreference);
    return response.data;
  };

  const logout = async () => {
    await axiosInstance.post("/user/logout");
    setUser(null);
  };

  const login = (updatedUser) => setUser(updatedUser);

  const updateThemePreference = async (preference) => {
    const response = await axiosInstance.patch("/user/preferences/theme", { themePreference: preference });
    setUser((current) => current ? { ...current, themePreference: response.data.themePreference } : current);
    syncTheme(response.data.themePreference);
    return response.data.themePreference;
  };

  return (
    <UserContext.Provider value={{ user, loading, login, logout, signIn, verifyOtp, register, themePreference, resolvedTheme, updateThemePreference }}>
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
