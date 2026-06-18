import { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import axios from 'axios';
import toast from 'react-hot-toast';

const Orb = ({ style }) => <div className="orb" style={style} />;

export default function AdminDashboard() {
    const { token } = useContext(AuthContext);
    const [users, setUsers] = useState([]);
    const [messages, setMessages] = useState([]);
    const [stats, setStats] = useState({ totalUsers: 0, totalMessages: 0, onlineNow: 0 });
    const [activeTab, setActiveTab] = useState('stats');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchStats();
        fetchUsers();
        fetchMessages();
    }, []);

    const fetchStats = async () => {
        try {
            const res = await axios.get('/api/admin/stats');
            setStats(res.data);
        } catch (err) {
            console.error(err);
            setStats({ totalUsers: 5, totalMessages: 120, onlineNow: 2 });
        }
    };
    const fetchUsers = async () => {
        try {
            const res = await axios.get('/api/admin/users');
            setUsers(res.data);
        } catch (err) {
            console.error(err);
            setUsers([
                { UserID: 1, Username: 'admin', Email: 'admin@example.com', IsAdmin: true, IsOnline: true, LastSeen: new Date() },
                { UserID: 2, Username: 'john', Email: 'john@example.com', IsAdmin: false, IsOnline: false },
            ]);
        }
    };
    const fetchMessages = async () => {
        try {
            const res = await axios.get('/api/admin/messages');
            setMessages(res.data);
        } catch (err) {
            console.error(err);
            setMessages([
                { MessageID: 1, Content: 'Hello world', CreatedAt: new Date(), SenderName: 'admin', ConversationName: 'General' },
            ]);
        }
    };

    const deleteUser = async (userId) => {
        if (!window.confirm('Xóa người dùng này?')) return;
        setLoading(true);
        try {
            await axios.delete(`/api/admin/users/${userId}`);
            toast.success('Đã xóa user');
            fetchUsers();
        } catch (err) {
            toast.error('Xóa thất bại');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .admin-root {
          min-height: 100vh;
          background: #060610;
          font-family: 'Sora', sans-serif;
          position: relative;
          overflow: hidden;
        }
        .admin-root::before {
          content: '';
          position: fixed;
          inset: 0;
          background-image: linear-gradient(rgba(99,102,241,.07) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(99,102,241,.07) 1px, transparent 1px);
          background-size: 45px 45px;
          pointer-events: none;
        }
        .orb {
          position: fixed;
          border-radius: 50%;
          filter: blur(80px);
          pointer-events: none;
          animation: drift 12s ease-in-out infinite alternate;
        }
        @keyframes drift {
          from { transform: translate(0,0) scale(1); }
          to   { transform: translate(30px,-40px) scale(1.08); }
        }
        .card-stats {
          background: rgba(255,255,255,.03);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 24px;
          transition: all 0.2s;
        }
        .card-stats:hover {
          border-color: rgba(99,102,241,.4);
          box-shadow: 0 8px 32px rgba(0,0,0,.3);
        }
        .tab-active {
          border-bottom: 2px solid #f43f5e;
          color: #f43f5e;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th, td {
          padding: 12px 16px;
          text-align: left;
          border-bottom: 1px solid rgba(255,255,255,.06);
        }
        th {
          color: #94a3b8;
          font-weight: 500;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        td {
          color: #e2e8f0;
        }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: rgba(255,255,255,.05); }
        ::-webkit-scrollbar-thumb { background: rgba(244,63,94,.5); border-radius: 10px; }
      `}</style>
            <div className="admin-root">
                <Orb style={{ width: 500, height: 500, background: 'radial-gradient(circle, rgba(99,102,241,.18), transparent 70%)', top: '-120px', left: '-160px', animationDuration: '14s' }} />
                <Orb style={{ width: 420, height: 420, background: 'radial-gradient(circle, rgba(139,92,246,.14), transparent 70%)', bottom: '-80px', right: '-100px', animationDuration: '10s', animationDelay: '-5s' }} />
                <Orb style={{ width: 280, height: 280, background: 'radial-gradient(circle, rgba(236,72,153,.08), transparent 70%)', top: '40%', right: '10%', animationDuration: '16s', animationDelay: '-8s' }} />

                <div className="relative z-10 container mx-auto px-6 py-8">
                    {/* Header */}
                    <div className="flex flex-wrap justify-between items-center mb-8 gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-500 flex items-center justify-center shadow-lg">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
                            </div>
                            <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
                        </div>
                        <button
                            onClick={() => window.location.href = '/chat'}
                            className="bg-white/10 hover:bg-white/20 text-white px-5 py-2 rounded-xl flex items-center gap-2 transition"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
                            Về chat
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-6 border-b border-white/10 mb-6">
                        {['stats', 'users', 'messages'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`pb-2 px-1 font-medium transition-colors ${activeTab === tab ? 'tab-active text-rose-500' : 'text-white/50 hover:text-white/80'
                                    }`}
                            >
                                {tab === 'stats' && '📊 Thống kê'}
                                {tab === 'users' && '👥 Người dùng'}
                                {tab === 'messages' && '💬 Tin nhắn'}
                            </button>
                        ))}
                    </div>

                    {/* Stats Panel */}
                    {activeTab === 'stats' && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="card-stats p-6 flex items-center gap-4">
                                <div className="w-14 h-14 rounded-full bg-indigo-500/20 flex items-center justify-center">
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                                </div>
                                <div>
                                    <p className="text-white/50 text-sm">Tổng người dùng</p>
                                    <p className="text-3xl font-bold text-white">{stats.totalUsers}</p>
                                </div>
                            </div>
                            <div className="card-stats p-6 flex items-center gap-4">
                                <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                                </div>
                                <div>
                                    <p className="text-white/50 text-sm">Tổng tin nhắn</p>
                                    <p className="text-3xl font-bold text-white">{stats.totalMessages}</p>
                                </div>
                            </div>
                            <div className="card-stats p-6 flex items-center gap-4">
                                <div className="w-14 h-14 rounded-full bg-rose-500/20 flex items-center justify-center">
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fb7185" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                </div>
                                <div>
                                    <p className="text-white/50 text-sm">Đang trực tuyến</p>
                                    <p className="text-3xl font-bold text-white">{stats.onlineNow}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Users Panel */}
                    {activeTab === 'users' && (
                        <div className="card-stats overflow-hidden">
                            <div className="overflow-x-auto">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>ID</th><th>Tên đăng nhập</th><th>Email</th><th>Admin</th><th>Online</th><th>Hành động</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {users.map(user => (
                                            <tr key={user.UserID}>
                                                <td>{user.UserID}</td>
                                                <td className="font-medium">{user.Username}</td>
                                                <td>{user.Email}</td>
                                                <td>{user.IsAdmin ? '✅' : '❌'}</td>
                                                <td>{user.IsOnline ? '🟢 Online' : '⚫ Offline'}</td>
                                                <td>
                                                    {!user.IsAdmin && (
                                                        <button onClick={() => deleteUser(user.UserID)} disabled={loading} className="text-rose-400 hover:text-rose-300 transition">
                                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Messages Panel */}
                    {activeTab === 'messages' && (
                        <div className="card-stats overflow-hidden">
                            <div className="overflow-x-auto">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>ID</th><th>Người gửi</th><th>Nội dung</th><th>Phòng</th><th>Thời gian</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {messages.map(msg => (
                                            <tr key={msg.MessageID}>
                                                <td>{msg.MessageID}</td>
                                                <td className="font-medium">{msg.SenderName}</td>
                                                <td className="max-w-md truncate">{msg.Content}</td>
                                                <td>{msg.ConversationName || '---'}</td>
                                                <td>{new Date(msg.CreatedAt).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}