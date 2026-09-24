import axios from "axios";
const axiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:5000",
  withCredentials: true,
});
export default axiosInstance;
