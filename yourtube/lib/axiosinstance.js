import axios from "axios";
import { getOrCreateDeviceId } from "./security-context";
const axiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:5000",
  withCredentials: true,
});

axiosInstance.interceptors.request.use((config) => {
  const deviceId = getOrCreateDeviceId();
  if (deviceId) config.headers.set("X-VidCircle-Device-Id", deviceId);
  return config;
});

export default axiosInstance;
