// // src/contexts/AuthContext.jsx
// import { createContext, useState, useEffect } from 'react';
// import axios from 'axios';
// import { useNavigate } from 'react-router-dom';
// import toast from 'react-hot-toast';

// export const AuthContext = createContext();

// // Cấu hình base URL (nếu frontend chạy khác port)
// axios.defaults.baseURL = 'http://localhost:5000';

// export const AuthProvider = ({ children }) => {
//     const [user, setUser] = useState(null);
//     const [token, setToken] = useState(localStorage.getItem('token'));
//     const navigate = useNavigate();

//     // Khi có token trong localStorage, tự động lấy thông tin user
//     useEffect(() => {
//         if (token) {
//             axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
//             axios.get('/api/users/me')
//                 .then(res => setUser(res.data))
//                 .catch(() => {
//                     // Token hết hạn hoặc không hợp lệ
//                     localStorage.removeItem('token');
//                     setToken(null);
//                     delete axios.defaults.headers.common['Authorization'];
//                 });
//         }
//     }, [token]);

//     // Đăng nhập
//     const login = async (username, password) => {
//         try {
//             const res = await axios.post('/api/auth/login', { username, password });
//             const { token, user } = res.data;
//             localStorage.setItem('token', token);
//             setToken(token);
//             setUser(user);
//             axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
//             toast.success('Đăng nhập thành công');
//             navigate('/chat');
//         } catch (err) {
//             const message = err.response?.data?.error || 'Sai tài khoản hoặc mật khẩu';
//             toast.error(message);
//         }
//     };

//     // Đăng ký
//     const register = async (userData) => {
//         try {
//             await axios.post('/api/auth/register', userData);
//             toast.success('Đăng ký thành công! Hãy đăng nhập.');
//             navigate('/login');
//         } catch (err) {
//             const message = err.response?.data?.error || 'Đăng ký thất bại';
//             toast.error(message);
//         }
//     };

//     // Đăng xuất
//     const logout = () => {
//         localStorage.removeItem('token');
//         setToken(null);
//         setUser(null);
//         delete axios.defaults.headers.common['Authorization'];
//         toast.success('Đã đăng xuất');
//         navigate('/login');
//     };

//     return (
//         <AuthContext.Provider value={{ user, token, login, register, logout }}>
//             {children}
//         </AuthContext.Provider>
//     );
// };
import { createContext, useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

export const AuthContext = createContext(null);

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
axios.defaults.baseURL = API;

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(() => localStorage.getItem('accessToken'));
    const [loading, setLoading] = useState(true);
    const refreshTimer = useRef(null);

    /* ── axios request interceptor: attach Bearer token ── */
    useEffect(() => {
        const req = axios.interceptors.request.use(cfg => {
            const t = localStorage.getItem('accessToken');
            if (t) cfg.headers.Authorization = `Bearer ${t}`;
            return cfg;
        });

        /* ── axios response interceptor: auto-refresh on 401 ── */
        const res = axios.interceptors.response.use(
            r => r,
            async err => {
                const original = err.config;
                if (err.response?.status === 401 && !original._retry) {
                    original._retry = true;
                    try {
                        const newToken = await refreshAccessToken();
                        original.headers.Authorization = `Bearer ${newToken}`;
                        return axios(original);
                    } catch {
                        logout();
                        return Promise.reject(err);
                    }
                }
                return Promise.reject(err);
            }
        );

        return () => {
            axios.interceptors.request.eject(req);
            axios.interceptors.response.eject(res);
        };
    }, []);

    /* ── on mount: validate stored token ── */
    useEffect(() => {
        const init = async () => {
            const stored = localStorage.getItem('accessToken');
            if (!stored) { setLoading(false); return; }
            try {
                const { data } = await axios.get('/api/auth/me');
                setUser(data);
                setToken(stored);
            } catch {
                try {
                    await refreshAccessToken();
                    const { data } = await axios.get('/api/auth/me');
                    setUser(data);
                } catch {
                    clearAuth();
                }
            } finally {
                setLoading(false);
            }
        };
        init();
    }, []);

    const refreshAccessToken = async () => {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');
        const { data } = await axios.post('/api/auth/refresh', { refreshToken });
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        setToken(data.accessToken);
        return data.accessToken;
    };

    const login = useCallback(async (usernameOrEmail, password) => {
        const { data } = await axios.post('/api/auth/login', {
            username: usernameOrEmail,
            email: usernameOrEmail,
            password
        });

        const accessToken = data.token || data.accessToken; // ← lấy đúng field backend trả về

        localStorage.setItem('accessToken', accessToken);
        setToken(accessToken);   // ← chỉ 1 dòng setToken, bỏ dòng setToken(data.accessToken) cũ
        setUser(data.user);
        toast.success(`Chào mừng, ${data.user.fullName || data.user.username}! 👋`);
        return data.user;
    }, []);

    const logout = useCallback(async () => {
        try {
            const refreshToken = localStorage.getItem('refreshToken');
            await axios.post('/api/auth/logout', { refreshToken });
        } catch { /* ignore */ }
        clearAuth();
        disconnectSocket();
        toast('Đã đăng xuất', { icon: '👋' });
    }, []);

    const updateUser = useCallback((updates) => {
        setUser(prev => ({ ...prev, ...updates }));
    }, []);

    const clearAuth = () => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        setToken(null);
        setUser(null);
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };

    const isAdmin = user?.isAdmin === true;

    return (
        <AuthContext.Provider value={{ user, token, loading, isAdmin, login, logout, updateUser }}>
            {children}
        </AuthContext.Provider>
    );
}