import { useState, useEffect, useContext, useRef } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import axios from 'axios';
import toast from 'react-hot-toast';

const Orb = ({ style }) => <div className="orb" style={style} />;

export default function AIChatPage() {
    const { user } = useContext(AuthContext);
    const [conversations, setConversations] = useState([]);
    const [selectedConv, setSelectedConv] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        fetchConversations();
    }, []);

    useEffect(() => {
        if (selectedConv) {
            fetchMessages(selectedConv.AIConversationID);
        }
    }, [selectedConv]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const fetchConversations = async () => {
        try {
            const res = await axios.get('/api/ai/conversations');
            setConversations(res.data);
            if (res.data.length > 0) setSelectedConv(res.data[0]);
            else createNewConversation();
        } catch (err) {
            console.error(err);
            // Mock
            const mock = [{ AIConversationID: 1, Title: 'Hội thoại mới', CreatedAt: new Date() }];
            setConversations(mock);
            setSelectedConv(mock[0]);
        }
    };

    const createNewConversation = async () => {
        try {
            const res = await axios.post('/api/ai/conversations', { title: 'Hội thoại mới' });
            const newConv = { AIConversationID: res.data.aiConversationId, Title: 'Hội thoại mới', CreatedAt: new Date() };
            setConversations(prev => [newConv, ...prev]);
            setSelectedConv(newConv);
        } catch (err) {
            toast.error('Không thể tạo hội thoại');
        }
    };

    const fetchMessages = async (convId) => {
        try {
            const res = await axios.get(`/api/ai/messages/${convId}`);
            setMessages(res.data);
        } catch (err) {
            console.error(err);
            setMessages([]);
        }
    };

    const sendMessage = async () => {
        if (!input.trim() || !selectedConv || loading) return;
        const userMsg = { AIMessageID: Date.now(), RoleName: 'user', Content: input, CreatedAt: new Date() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);
        try {
            const res = await axios.post('/api/ai/send', {
                aiConversationId: selectedConv.AIConversationID,
                message: input,
            });
            const aiMsg = { AIMessageID: Date.now() + 1, RoleName: 'assistant', Content: res.data.reply, CreatedAt: new Date() };
            setMessages(prev => [...prev, aiMsg]);
        } catch (err) {
            toast.error('AI phản hồi lỗi');
            const errorMsg = { RoleName: 'assistant', Content: 'Xin lỗi, tôi gặp sự cố. Vui lòng thử lại.', CreatedAt: new Date() };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .ai-root {
          min-height: 100vh;
          background: #060610;
          font-family: 'Sora', sans-serif;
          position: relative;
          overflow: hidden;
        }
        .ai-root::before {
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
      `}</style>
            <div className="ai-root">
                <Orb style={{ width: 500, height: 500, background: 'radial-gradient(circle, rgba(99,102,241,.18), transparent 70%)', top: '-120px', left: '-160px', animationDuration: '14s' }} />
                <Orb style={{ width: 420, height: 420, background: 'radial-gradient(circle, rgba(139,92,246,.14), transparent 70%)', bottom: '-80px', right: '-100px', animationDuration: '10s', animationDelay: '-5s' }} />
                <Orb style={{ width: 280, height: 280, background: 'radial-gradient(circle, rgba(236,72,153,.08), transparent 70%)', top: '40%', right: '10%', animationDuration: '16s', animationDelay: '-8s' }} />

                <div className="flex h-screen relative z-10">
                    {/* Sidebar AI conversations */}
                    <div className="w-80 backdrop-blur-xl bg-white/5 border-r border-white/10 flex flex-col">
                        <div className="p-4 border-b border-white/10">
                            <h2 className="font-bold text-xl text-white flex items-center gap-2">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 0 1 10 10c0 5-4 9-9 9-1 0-2-.2-3-.5" /><path d="M4 13c0 2 1 4 3 5" /><path d="M8 16c2 1 4 1 6 0" /><circle cx="12" cy="12" r="3" /></svg>
                                AI Assistant
                            </h2>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2">
                            {conversations.map(conv => (
                                <div
                                    key={conv.AIConversationID}
                                    onClick={() => setSelectedConv(conv)}
                                    className={`mx-2 mb-2 p-3 rounded-xl cursor-pointer transition-all ${selectedConv?.AIConversationID === conv.AIConversationID
                                            ? 'bg-gradient-to-r from-emerald-600/40 to-teal-600/40 border border-emerald-500/30'
                                            : 'hover:bg-white/5'
                                        }`}
                                >
                                    <p className="text-white font-medium truncate">{conv.Title || 'Hội thoại AI'}</p>
                                    <p className="text-xs text-white/40">{new Date(conv.CreatedAt).toLocaleDateString()}</p>
                                </div>
                            ))}
                        </div>
                        <div className="p-4 border-t border-white/10 space-y-2">
                            <button
                                onClick={createNewConversation}
                                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-2 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition"
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                                Hội thoại mới
                            </button>
                            <button
                                onClick={() => window.location.href = '/chat'}
                                className="w-full bg-white/10 text-white/80 py-2 rounded-xl flex items-center justify-center gap-2 hover:bg-white/20 transition"
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
                                Quay lại Chat
                            </button>
                        </div>
                    </div>

                    {/* Chat area */}
                    <div className="flex-1 flex flex-col">
                        {selectedConv ? (
                            <>
                                <div className="backdrop-blur-md bg-white/5 border-b border-white/10 p-4">
                                    <h3 className="text-white font-semibold text-lg">{selectedConv.Title}</h3>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                    {messages.map((msg, idx) => (
                                        <div key={idx} className={`flex ${msg.RoleName === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${msg.RoleName === 'user'
                                                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-tr-none'
                                                    : 'bg-white/10 backdrop-blur-sm text-white rounded-tl-none border border-white/10'
                                                }`}>
                                                {msg.RoleName === 'assistant' && <p className="text-xs font-semibold text-emerald-300 mb-1">🤖 AI</p>}
                                                <p className="whitespace-pre-wrap break-words">{msg.Content}</p>
                                                <p className="text-xs opacity-60 mt-1 text-right">
                                                    {new Date(msg.CreatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                    {loading && (
                                        <div className="flex justify-start">
                                            <div className="bg-white/10 backdrop-blur-sm px-4 py-2 rounded-2xl rounded-tl-none">
                                                <p className="text-white/70 flex items-center gap-2">
                                                    <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span> AI đang suy nghĩ...
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>
                                <div className="backdrop-blur-md bg-white/5 border-t border-white/10 p-4">
                                    <div className="flex gap-2">
                                        <textarea
                                            className="flex-1 bg-black/30 border border-white/20 rounded-xl p-3 text-white placeholder-white/40 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                            rows="1"
                                            placeholder="Hỏi AI bất cứ điều gì..."
                                            value={input}
                                            onChange={e => setInput(e.target.value)}
                                            onKeyDown={handleKeyPress}
                                            disabled={loading}
                                        />
                                        <button
                                            onClick={sendMessage}
                                            disabled={loading}
                                            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-90 text-white px-5 rounded-xl transition flex items-center gap-2 disabled:opacity-50"
                                        >
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                                            Gửi
                                        </button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex items-center justify-center flex-col gap-4">
                                <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
                                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5"><path d="M12 2a10 10 0 0 1 10 10c0 5-4 9-9 9-1 0-2-.2-3-.5" /><path d="M4 13c0 2 1 4 3 5" /><path d="M8 16c2 1 4 1 6 0" /><circle cx="12" cy="12" r="3" /></svg>
                                </div>
                                <p className="text-white/50">Chọn hoặc tạo hội thoại AI</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}