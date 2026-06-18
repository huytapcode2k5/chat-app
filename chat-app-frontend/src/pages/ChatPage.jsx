import { useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../contexts/AuthContext';
import { useSocket } from '../hooks/useSocket';
import { conversationApi, messageApi, friendApi, aiApi, fileApi, notifApi, userApi } from '../services/api';
import toast from 'react-hot-toast';

/* ─── tiny helpers ─────────────────────────────────────────────────────────── */
// Ép chuỗi từ DB thành UTC bằng cách thêm 'Z' nếu chưa có
const toUTC = (d) => {
    if (!d) return new Date();
    const s = String(d);
    // Nếu chưa có timezone info thì coi là UTC
    return new Date(s.endsWith('Z') || s.includes('+') ? s : s + 'Z');
};

const fmtTime = (d) => toUTC(d).toLocaleTimeString('vi-VN', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh'   // ← luôn hiển thị giờ VN
});

const fmtDate = (d) => {
    const dt = toUTC(d);
    const now = new Date();

    // So sánh theo giờ VN
    const dtVN = new Date(dt.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    const nowVN = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));

    if (dtVN.toDateString() === nowVN.toDateString()) return 'Hôm nay';
    const yesterday = new Date(nowVN);
    yesterday.setDate(yesterday.getDate() - 1);
    if (dtVN.toDateString() === yesterday.toDateString()) return 'Hôm qua';
    return dt.toLocaleDateString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        timeZone: 'Asia/Ho_Chi_Minh'
    });
};
const getInitials = (name) => (name || '?').split(' ').slice(-2).map(w => w[0]).join('').toUpperCase();
const AVATAR_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
const avatarColor = (id) => AVATAR_COLORS[(id || 0) % AVATAR_COLORS.length];

/* ─── Biệt danh từng thành viên trong nhóm (lưu localStorage) ────────────────
   Key format: member_nickname_{conversationID}_{userID}
*/
const loadAllMemberNicknames = () => {
    const result = {};
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith('member_nickname_')) {
            result[k.replace('member_nickname_', '')] = localStorage.getItem(k);
        }
    }
    return result;
};
const memberNickKey = (convId, userId) => `${convId}_${userId}`;
const getMemberDisplayName = (memberNicknames, convId, member) => {
    if (!member) return '';
    const nick = memberNicknames[memberNickKey(convId, member.userID)];
    return nick || member.fullName || member.username || 'Unknown';
};

/* ─── Avatar ───────────────────────────────────────────────────────────────── */
function Avatar({ user, size = 36, showOnline = false }) {
    const s = { width: size, height: size, minWidth: size };
    if (user?.avatarUrl) {
        return (
            <div style={{ ...s, position: 'relative', flexShrink: 0 }}>
                <img src={user.avatarUrl} alt="" style={{ ...s, borderRadius: size * 0.28, objectFit: 'cover' }} />
                {showOnline && (
                    <span style={{
                        position: 'absolute', bottom: -1, right: -1,
                        width: 10, height: 10, borderRadius: '50%',
                        background: user.isOnline ? '#22c55e' : '#6b7280',
                        border: '2px solid #0d0f14'
                    }} />
                )}
            </div>
        );
    }
    return (
        <div style={{
            ...s, borderRadius: size * 0.28, flexShrink: 0, position: 'relative',
            background: avatarColor(user?.userID),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: size * 0.36, fontWeight: 700, color: '#fff',
            fontFamily: 'Space Grotesk, sans-serif'
        }}>
            {getInitials(user?.fullName || user?.username)}
            {showOnline && (
                <span style={{
                    position: 'absolute', bottom: -1, right: -1,
                    width: 10, height: 10, borderRadius: '50%',
                    background: user?.isOnline ? '#22c55e' : '#6b7280',
                    border: '2px solid #0d0f14'
                }} />
            )}
        </div>
    );
}

/* ─── SettingsAvatar — hover overlay đúng cách ────────────────────────────── */
function SettingsAvatar({ localUser, onUpload }) {
    const [hovered, setHovered] = useState(false);
    const inputRef = useRef(null);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div
                style={{ position: 'relative', cursor: 'pointer', display: 'inline-block' }}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                onClick={() => inputRef.current?.click()}
            >
                <Avatar user={localUser} size={76} />
                {/* Overlay đặt đúng — nhận hover từ wrapper div cha */}
                <div style={{
                    position: 'absolute', inset: 0,
                    borderRadius: 76 * 0.28,
                    background: 'rgba(0,0,0,.55)',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 4,
                    opacity: hovered ? 1 : 0,
                    transition: 'opacity .18s',
                    pointerEvents: 'none'
                }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                    <span style={{ color: '#fff', fontSize: 10, fontWeight: 600 }}>Đổi ảnh</span>
                </div>
            </div>
            <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    await onUpload(file);
                    e.target.value = '';
                }}
            />
        </div>
    );
}


function ConvItem({ conv, isActive, onClick, currentUserID, nickname, blockedByMe = [], blockedMe = [] }) {
    const other = conv.members?.find(m => Number(m.userID) !== Number(currentUserID));
    const isBlocked = conv.conversationType === 'Direct' && other && blockedByMe.map(Number).includes(Number(other.userID));
    const isBlockedByOther = conv.conversationType === 'Direct' && other && blockedMe.map(Number).includes(Number(other.userID));

    const baseName = conv.conversationType === 'Direct'
        ? (other?.fullName || other?.username || 'Unknown')
        : (conv.name || 'Nhóm chat');
    const displayName = nickname || baseName;
    const displayUser = conv.conversationType === 'Direct' ? other : {
        userID: conv.conversationID, fullName: conv.name, avatarUrl: conv.avatarUrl
    };
    const lastText = conv.lastMessage?.isDeleted
        ? 'Tin nhắn đã bị xoá'
        : conv.lastMessage?.content || (conv.lastMessage?.attachments?.length ? '📎 File đính kèm' : '');

    return (
        <div onClick={onClick} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 10px', borderRadius: 11, cursor: 'pointer',
            background: isActive ? 'rgba(99,102,241,.15)' : 'transparent',
            border: isActive ? '1px solid rgba(99,102,241,.25)' : '1px solid transparent',
            transition: 'all .15s', marginBottom: 2, position: 'relative'
        }}
            onMouseEnter={e => !isActive && (e.currentTarget.style.background = 'rgba(255,255,255,.04)')}
            onMouseLeave={e => !isActive && (e.currentTarget.style.background = 'transparent')}
        >
            <Avatar user={displayUser} size={40} showOnline={conv.conversationType === 'Direct' && !isBlocked && !isBlockedByOther} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '65%', display: 'flex', alignItems: 'center' }}>
                        {conv.conversationType === 'Group' && <span style={{ fontSize: 11, marginRight: 4 }}>👥</span>}
                        {displayName}
                        {isBlocked && <span style={{ fontSize: 9.5, color: '#f87171', background: 'rgba(239,68,68,.15)', padding: '1px 5px', borderRadius: 4, marginLeft: 6, flexShrink: 0 }}>Đã chặn</span>}
                        {isBlockedByOther && <span style={{ fontSize: 9.5, color: '#94a3b8', background: 'rgba(148,163,184,.15)', padding: '1px 5px', borderRadius: 4, marginLeft: 6, flexShrink: 0 }}>Bị chặn</span>}
                    </span>
                    <span style={{ fontSize: 10.5, color: '#475569', flexShrink: 0 }}>
                        {conv.lastMessage ? fmtTime(conv.lastMessage.createdAt) : ''}
                    </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                    <span style={{
                        fontSize: 12, color: conv.unreadCount > 0 ? '#94a3b8' : '#475569',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        maxWidth: '80%', fontStyle: conv.lastMessage?.isDeleted ? 'italic' : 'normal'
                    }}>
                        {lastText}
                    </span>
                    {conv.unreadCount > 0 && (
                        <span style={{
                            background: '#6366f1', color: '#fff', fontSize: 10, fontWeight: 700,
                            padding: '1px 6px', borderRadius: 10, minWidth: 18, textAlign: 'center'
                        }}>{conv.unreadCount > 99 ? '99+' : conv.unreadCount}</span>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ─── Message bubble ─────────────────────────────────────────────────────── */
function MessageBubble({ msg, isOwn, showAvatar, senderDisplayName, onReact, onReply, onEdit, onDelete }) {
    const [hovered, setHovered] = useState(false);
    const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

    if (msg.isDeleted) {
        return (
            <div style={{ display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start', marginBottom: 2 }}>
                <span style={{ fontSize: 12, color: '#475569', fontStyle: 'italic', padding: '6px 12px' }}>
                    🚫 Tin nhắn đã bị xoá
                </span>
            </div>
        );
    }

    return (
        <div style={{
            display: 'flex', flexDirection: isOwn ? 'row-reverse' : 'row',
            alignItems: 'flex-end', gap: 7, marginBottom: 2,
            position: 'relative'
        }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {/* avatar */}
            {!isOwn && (
                <div style={{ width: 28, flexShrink: 0 }}>
                    {showAvatar && <Avatar user={msg.sender} size={28} />}
                </div>
            )}

            <div style={{ maxWidth: '60%', position: 'relative' }}>
                {/* sender name for groups */}
                {!isOwn && showAvatar && msg.sender && (
                    <div style={{ fontSize: 11, color: '#818cf8', marginBottom: 3, marginLeft: 2 }}>
                        {senderDisplayName || msg.sender.fullName || msg.sender.username}
                    </div>
                )}

                {/* reply preview */}
                {msg.replyTo && !msg.replyTo.isDeleted && (
                    <div style={{
                        background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)',
                        borderLeft: '3px solid #6366f1', borderRadius: '8px 8px 0 0',
                        padding: '6px 10px', fontSize: 11.5, color: '#94a3b8', marginBottom: -4,
                        borderBottomLeftRadius: 0, borderBottomRightRadius: 0
                    }}>
                        <span style={{ color: '#818cf8', fontWeight: 600 }}>
                            {msg.replyTo.sender?.username}
                        </span>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                            {msg.replyTo.content}
                        </div>
                    </div>
                )}

                {/* bubble */}
                <div style={{
                    background: isOwn
                        ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                        : 'rgba(255,255,255,.06)',
                    border: isOwn ? 'none' : '1px solid rgba(255,255,255,.09)',
                    borderRadius: isOwn ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                    padding: '9px 13px',
                    color: isOwn ? '#fff' : '#e2e8f0',
                    fontSize: 13.5, lineHeight: 1.55,
                    wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                    boxShadow: isOwn ? '0 4px 16px rgba(99,102,241,.3)' : 'none'
                }}>
                    {/* attachments */}
                    {msg.attachments?.map(a => (
                        <div key={a.attachmentID} style={{ marginBottom: 6 }}>
                            {a.fileType === 'image' ? (
                                <img src={a.fileUrl} alt={a.fileName}
                                    style={{ maxWidth: 240, maxHeight: 200, borderRadius: 8, display: 'block', cursor: 'pointer' }}
                                    onClick={() => window.open(a.fileUrl, '_blank')} />
                            ) : (
                                <a href={a.fileUrl} target="_blank" rel="noreferrer"
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        color: isOwn ? 'rgba(255,255,255,.9)' : '#94a3b8',
                                        textDecoration: 'none', fontSize: 12,
                                        background: 'rgba(0,0,0,.2)', borderRadius: 8, padding: '6px 10px'
                                    }}>
                                    <span style={{ fontSize: 20 }}>📁</span>
                                    <div>
                                        <div style={{ fontWeight: 500 }}>{a.fileName}</div>
                                        <div style={{ fontSize: 10, opacity: .7 }}>
                                            {a.fileSize ? `${(a.fileSize / 1024).toFixed(1)} KB` : ''}
                                        </div>
                                    </div>
                                </a>
                            )}
                        </div>
                    ))}

                    {msg.content && <span>{msg.content}</span>}

                    {/* edited tag */}
                    {msg.isEdited && (
                        <span style={{ fontSize: 10, opacity: .6, marginLeft: 6 }}>(đã chỉnh sửa)</span>
                    )}
                </div>

                {/* reactions display */}
                {msg.reactions?.length > 0 && (
                    <div style={{
                        display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3,
                        justifyContent: isOwn ? 'flex-end' : 'flex-start'
                    }}>
                        {msg.reactions.map(r => (
                            <button key={r.emoji} onClick={() => onReact(msg.messageID, r.emoji)} style={{
                                background: r.reactedByMe ? 'rgba(99,102,241,.25)' : 'rgba(255,255,255,.07)',
                                border: r.reactedByMe ? '1px solid rgba(99,102,241,.4)' : '1px solid rgba(255,255,255,.1)',
                                borderRadius: 12, padding: '1px 6px', cursor: 'pointer',
                                fontSize: 12, display: 'flex', alignItems: 'center', gap: 3
                            }}>
                                {r.emoji} <span style={{ color: '#94a3b8', fontSize: 10 }}>{r.count}</span>
                            </button>
                        ))}
                    </div>
                )}

                {/* time + status */}
                <div style={{
                    fontSize: 10.5, color: '#475569', marginTop: 3,
                    textAlign: isOwn ? 'right' : 'left',
                    display: 'flex', alignItems: 'center',
                    justifyContent: isOwn ? 'flex-end' : 'flex-start', gap: 4
                }}>
                    {fmtTime(msg.createdAt)}
                    {isOwn && msg.status && (
                        <span style={{ color: msg.status.isSeen ? '#818cf8' : '#475569', fontSize: 11 }}>
                            {msg.status.isSeen ? '✓✓' : msg.status.isDelivered ? '✓✓' : '✓'}
                        </span>
                    )}
                </div>
            </div>

            {/* hover action bar */}
            {hovered && (
                <div style={{
                    position: 'absolute', top: -30,
                    [isOwn ? 'right' : 'left']: 0,
                    display: 'flex', gap: 2, zIndex: 10,
                    background: '#1a1e27', border: '1px solid rgba(255,255,255,.1)',
                    borderRadius: 10, padding: '3px 6px',
                    boxShadow: '0 4px 16px rgba(0,0,0,.5)'
                }}>
                    {REACTIONS.map(e => (
                        <button key={e} onClick={() => onReact(msg.messageID, e)} style={{
                            background: 'none', border: 'none', cursor: 'pointer', fontSize: 14,
                            padding: '1px 3px', borderRadius: 5, transition: 'transform .1s'
                        }}
                            onMouseEnter={el => el.currentTarget.style.transform = 'scale(1.3)'}
                            onMouseLeave={el => el.currentTarget.style.transform = 'scale(1)'}
                        >{e}</button>
                    ))}
                    <div style={{ width: 1, background: 'rgba(255,255,255,.1)', margin: '2px 3px' }} />
                    <button onClick={() => onReply(msg)} title="Trả lời" style={actionBtnStyle}>↩</button>
                    {isOwn && <button onClick={() => onEdit(msg)} title="Sửa" style={actionBtnStyle}>✏️</button>}
                    {isOwn && <button onClick={() => onDelete(msg.messageID)} title="Xoá" style={{ ...actionBtnStyle, color: '#f87171' }}>🗑</button>}
                </div>
            )}
        </div>
    );
}
const actionBtnStyle = {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 13, padding: '2px 4px', color: '#94a3b8', borderRadius: 5
};

/* ─── AI Chat panel ──────────────────────────────────────────────────────── */
function AIPanel({ connection }) {
    const [sessions, setSessions] = useState([]);
    const [activeID, setActiveID] = useState(null);
    const [msgs, setMsgs] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingSessions, setLoadingSessions] = useState(true);
    const bottomRef = useRef(null);

    useEffect(() => {
        aiApi.getConversations()
            .then(setSessions)
            .catch(() => { })
            .finally(() => setLoadingSessions(false));
    }, []);

    useEffect(() => {
        if (!activeID) return;
        aiApi.getMessages(activeID).then(setMsgs).catch(() => { });
    }, [activeID]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [msgs, loading]);

    const newSession = () => { setActiveID(null); setMsgs([]); };

    const sendAI = async () => {
        if (!input.trim() || loading) return;
        const text = input.trim();
        setInput('');
        setLoading(true);
        const userMsg = { aiMessageID: Date.now(), roleName: 'user', content: text, createdAt: new Date() };
        setMsgs(p => [...p, userMsg]);
        try {
            const res = await aiApi.send({ aiConversationID: activeID || null, message: text });
            if (!activeID) {
                setActiveID(res.aiConversationID);
                setSessions(p => [{ aiConversationID: res.aiConversationID, title: res.title, createdAt: new Date() }, ...p]);
            }
            setMsgs(p => [...p.filter(m => m.aiMessageID !== userMsg.aiMessageID),
            res.userMessage, res.assistantMessage]);
        } catch {
            toast.error('AI không phản hồi, thử lại nhé');
            setMsgs(p => p.filter(m => m.aiMessageID !== userMsg.aiMessageID));
        } finally {
            setLoading(false);
        }
    };

    const deleteSession = async (id, e) => {
        e.stopPropagation();
        await aiApi.deleteConversation(id).catch(() => { });
        setSessions(p => p.filter(s => s.aiConversationID !== id));
        if (activeID === id) { setActiveID(null); setMsgs([]); }
    };

    const QUICK = ['Viết code Python đọc CSV', 'Giải thích về Machine Learning', 'Soạn email chuyên nghiệp', 'Dịch tiếng Anh sang tiếng Việt'];

    return (
        <div style={{ display: 'flex', height: '100%', minWidth: 0 }}>
            {/* AI session sidebar */}
            <div style={{
                width: 220, borderRight: '1px solid rgba(255,255,255,.07)',
                display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,.15)'
            }}>
                <div style={{ padding: '14px 12px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
                    <div style={{ fontSize: 12, color: '#818cf8', fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', marginBottom: 8 }}>
                        ✦ AI Assistant
                    </div>
                    <button onClick={newSession} style={{
                        width: '100%', padding: '7px 10px', borderRadius: 9,
                        background: 'linear-gradient(135deg, rgba(99,102,241,.3), rgba(139,92,246,.3))',
                        border: '1px solid rgba(99,102,241,.3)', color: '#a5b4fc',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5
                    }}>
                        <span style={{ fontSize: 15 }}>+</span> Cuộc trò chuyện mới
                    </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
                    {loadingSessions ? (
                        <div style={{ textAlign: 'center', color: '#475569', fontSize: 12, padding: 16 }}>Đang tải...</div>
                    ) : sessions.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#475569', fontSize: 12, padding: 16 }}>Chưa có cuộc trò chuyện nào</div>
                    ) : sessions.map(s => (
                        <div key={s.aiConversationID}
                            onClick={() => setActiveID(s.aiConversationID)}
                            style={{
                                padding: '8px 10px', borderRadius: 8, cursor: 'pointer', marginBottom: 2,
                                background: activeID === s.aiConversationID ? 'rgba(99,102,241,.15)' : 'transparent',
                                border: activeID === s.aiConversationID ? '1px solid rgba(99,102,241,.2)' : '1px solid transparent',
                                display: 'flex', alignItems: 'center', gap: 6, transition: 'all .15s',
                                position: 'relative'
                            }}
                            onMouseEnter={e => { if (activeID !== s.aiConversationID) e.currentTarget.style.background = 'rgba(255,255,255,.04)'; }}
                            onMouseLeave={e => { if (activeID !== s.aiConversationID) e.currentTarget.style.background = 'transparent'; }}
                        >
                            <span style={{ fontSize: 13 }}>💬</span>
                            <span style={{ fontSize: 12, color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {s.title || 'Cuộc trò chuyện mới'}
                            </span>
                            <button onClick={(e) => deleteSession(s.aiConversationID, e)}
                                style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 11, padding: '1px 3px', borderRadius: 4, flexShrink: 0 }}
                                title="Xoá">✕</button>
                        </div>
                    ))}
                </div>
            </div>

            {/* AI chat area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                {/* header */}
                <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,.07)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                        background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18
                    }}>🤖</div>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: '#e2e8f0' }}>AI Assistant</div>
                        <div style={{ fontSize: 11, color: '#818cf8' }}>✦ Powered by Claude</div>
                    </div>
                </div>

                {/* messages */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 8px' }}>
                    {msgs.length === 0 && !loading && (
                        <div style={{ textAlign: 'center', paddingTop: 40 }}>
                            <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
                            <div style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0', marginBottom: 6 }}>AI Assistant sẵn sàng hỗ trợ!</div>
                            <div style={{ fontSize: 13, color: '#475569', marginBottom: 24 }}>Hãy đặt câu hỏi hoặc chọn gợi ý bên dưới</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                                {QUICK.map(q => (
                                    <button key={q} onClick={() => { setInput(q); }}
                                        style={{
                                            background: 'rgba(99,102,241,.1)', border: '1px solid rgba(99,102,241,.2)',
                                            borderRadius: 10, padding: '7px 14px', color: '#a5b4fc',
                                            fontSize: 12, cursor: 'pointer', transition: 'all .15s'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,.2)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(99,102,241,.1)'}
                                    >{q}</button>
                                ))}
                            </div>
                        </div>
                    )}
                    {msgs.map(m => (
                        <div key={m.aiMessageID} style={{
                            display: 'flex', flexDirection: m.roleName === 'user' ? 'row-reverse' : 'row',
                            gap: 10, marginBottom: 16, alignItems: 'flex-start'
                        }}>
                            {m.roleName === 'assistant' && (
                                <div style={{
                                    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                                    background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15
                                }}>🤖</div>
                            )}
                            <div style={{
                                maxWidth: '75%',
                                background: m.roleName === 'user'
                                    ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                                    : 'rgba(168,85,247,.08)',
                                border: m.roleName === 'user' ? 'none' : '1px solid rgba(168,85,247,.2)',
                                borderRadius: m.roleName === 'user' ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                                padding: '10px 14px', color: '#e2e8f0',
                                fontSize: 13.5, lineHeight: 1.6,
                                whiteSpace: 'pre-wrap', wordBreak: 'break-word'
                            }}>
                                {m.content}
                                <div style={{ fontSize: 10, color: 'rgba(148,163,184,.4)', marginTop: 4, textAlign: 'right' }}>
                                    {fmtTime(m.createdAt)}
                                </div>
                            </div>
                        </div>
                    ))}
                    {loading && (
                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16 }}>
                            <div style={{
                                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                                background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15
                            }}>🤖</div>
                            <div style={{
                                background: 'rgba(168,85,247,.08)', border: '1px solid rgba(168,85,247,.2)',
                                borderRadius: '4px 16px 16px 16px', padding: '12px 16px',
                                display: 'flex', gap: 5, alignItems: 'center'
                            }}>
                                {[0, .2, .4].map((d, i) => (
                                    <div key={i} style={{
                                        width: 7, height: 7, borderRadius: '50%',
                                        background: '#a855f7',
                                        animation: `pulse 1.2s ${d}s infinite ease-in-out`
                                    }} />
                                ))}
                            </div>
                        </div>
                    )}
                    <div ref={bottomRef} />
                </div>

                {/* input */}
                <div style={{ padding: '12px 20px 16px', borderTop: '1px solid rgba(255,255,255,.07)' }}>
                    <div style={{
                        display: 'flex', gap: 10, alignItems: 'flex-end',
                        background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
                        borderRadius: 14, padding: '10px 14px',
                        transition: 'border-color .2s'
                    }}>
                        <textarea
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAI(); } }}
                            placeholder="Hỏi AI bất cứ điều gì... (Enter để gửi)"
                            rows={1}
                            style={{
                                flex: 1, background: 'none', border: 'none', outline: 'none',
                                color: '#e2e8f0', fontSize: 13.5, fontFamily: 'inherit',
                                resize: 'none', maxHeight: 120, lineHeight: 1.5
                            }}
                            onInput={e => {
                                e.target.style.height = 'auto';
                                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                            }}
                            disabled={loading}
                        />
                        <button onClick={sendAI} disabled={loading || !input.trim()} style={{
                            width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                            background: loading || !input.trim() ? 'rgba(255,255,255,.08)' : 'linear-gradient(135deg, #7c3aed, #a855f7)',
                            border: 'none', cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                            color: '#fff', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all .2s'
                        }}>
                            {loading ? (
                                <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
                            ) : '➤'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
function ConvInfoPanel({
    conv, currentUserID, onClose, onDeleteConv, onNicknameChange,
    memberNicknames, onMemberNicknameChange, onLeaveGroup, onOpenAddMembers,
    isBlocked, onToggleBlock, onKickMember,
}) {
    const [tab, setTab] = useState('info');
    const [nickname, setNickname] = useState('');
    const [savingNick, setSavingNick] = useState(false);
    const [mediaList, setMediaList] = useState([]);
    const [fileList, setFileList] = useState([]);
    const [loadingMedia, setLoadingMedia] = useState(false);
    // userID đang được edit biệt danh trong danh sách thành viên (Group)
    const [editingMemberID, setEditingMemberID] = useState(null);
    const [memberNickDraft, setMemberNickDraft] = useState('');

    const other = conv?.members?.find(m => Number(m.userID) !== Number(currentUserID));
    // Vai trò của chính mình trong nhóm — dùng để hiện nút kick
    const myMembership = conv?.members?.find(m => Number(m.userID) === Number(currentUserID));
    const isMeAdmin = myMembership?.role === 'Admin';
    const displayName = conv?.conversationType === 'Direct'
        ? (other?.fullName || other?.username)
        : conv?.name;

    // Load nickname từ localStorage khi panel mở / conv thay đổi
    useEffect(() => {
        if (!conv) return;
        const saved = localStorage.getItem(`nickname_${conv.conversationID}`);
        setNickname(saved || '');
    }, [conv?.conversationID]);

    useEffect(() => {
        if (!conv || tab === 'info') return;
        setLoadingMedia(true);
        axios.get(`/api/messages/${conv.conversationID}`)
            .then(res => {
                const allAttachments = (res.data.items || []).flatMap(m => m.attachments || []);
                setMediaList(allAttachments.filter(a => a.fileType === 'image'));
                setFileList(allAttachments.filter(a => a.fileType !== 'image'));
            })
            .catch(() => { })
            .finally(() => setLoadingMedia(false));
    }, [conv, tab]);

    if (!conv) return null;

    const saveNickname = () => {
        if (savingNick) return;
        setSavingNick(true);
        const trimmed = nickname.trim();
        if (trimmed) {
            localStorage.setItem(`nickname_${conv.conversationID}`, trimmed);
        } else {
            localStorage.removeItem(`nickname_${conv.conversationID}`);
        }
        if (typeof onNicknameChange === 'function') {
            onNicknameChange(conv.conversationID, trimmed);
        }
        toast.success(trimmed ? 'Đã lưu biệt danh!' : 'Đã xoá biệt danh');
        setSavingNick(false);
    };

    const clearNickname = () => {
        setNickname('');
        localStorage.removeItem(`nickname_${conv.conversationID}`);
        if (typeof onNicknameChange === 'function') onNicknameChange(conv.conversationID, '');
        toast('Đã xoá biệt danh', { icon: '✓' });
    };

    const tabBtn = (id, icon, label) => (
        <button
            onClick={() => setTab(id)}
            style={{
                flex: 1, padding: '10px 4px', background: 'none',
                border: 'none',
                borderBottom: `2px solid ${tab === id ? '#6366f1' : 'transparent'}`,
                color: tab === id ? '#818cf8' : '#475569',
                cursor: 'pointer', fontSize: 11, fontWeight: 600,
                fontFamily: 'inherit', transition: 'all .15s',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3
            }}
        >
            <span style={{ fontSize: 15 }}>{icon}</span>
            {label}
        </button>
    );

    const savedNick = localStorage.getItem(`nickname_${conv.conversationID}`);

    return (
        <div style={{
            width: 300, flexShrink: 0,
            background: '#0f1117',
            borderLeft: '1px solid rgba(255,255,255,.07)',
            display: 'flex', flexDirection: 'column',
            height: '100%', overflow: 'hidden',
        }}>
            {/* Header */}
            <div style={{
                padding: '13px 14px',
                borderBottom: '1px solid rgba(255,255,255,.06)',
                display: 'flex', alignItems: 'center', gap: 10,
                flexShrink: 0
            }}>
                <button onClick={onClose} style={{
                    background: 'rgba(255,255,255,.07)', border: 'none', color: '#94a3b8',
                    cursor: 'pointer', width: 27, height: 27, borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
                    flexShrink: 0, transition: 'background .15s'
                }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.13)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,.07)'}
                >✕</button>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>
                    Thông tin hội thoại
                </span>
            </div>

            {/* Hero section — avatar + tên */}
            <div style={{
                padding: '22px 16px 18px',
                textAlign: 'center',
                background: 'linear-gradient(180deg, rgba(99,102,241,.06) 0%, transparent 100%)',
                borderBottom: '1px solid rgba(255,255,255,.06)',
                flexShrink: 0
            }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                    {conv.conversationType === 'Direct' ? (
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                            <Avatar user={other} size={70} />
                            {other?.isOnline && (
                                <span style={{
                                    position: 'absolute', bottom: 2, right: 2,
                                    width: 13, height: 13, borderRadius: '50%',
                                    background: '#22c55e', border: '2.5px solid #0f1117'
                                }} />
                            )}
                        </div>
                    ) : (
                        <div style={{
                            width: 70, height: 70, borderRadius: 22,
                            background: avatarColor(conv.conversationID),
                            display: 'flex', alignItems: 'center',
                            justifyContent: 'center', fontSize: 30
                        }}>👥</div>
                    )}
                </div>

                {/* Tên chính — ưu tiên nickname nếu có */}
                <div style={{ fontSize: 15.5, fontWeight: 700, color: '#f1f5f9', marginBottom: savedNick ? 2 : 4 }}>
                    {savedNick || displayName}
                </div>
                {/* Tên gốc hiện mờ nếu đang dùng nickname */}
                {savedNick && (
                    <div style={{ fontSize: 11.5, color: '#475569', marginBottom: 6 }}>
                        {displayName}
                    </div>
                )}

                {conv.conversationType === 'Direct' && other && (
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        fontSize: 11.5, color: other.isOnline ? '#22c55e' : '#64748b',
                        background: other.isOnline ? 'rgba(34,197,94,.1)' : 'rgba(71,85,105,.1)',
                        border: `1px solid ${other.isOnline ? 'rgba(34,197,94,.22)' : 'rgba(71,85,105,.2)'}`,
                        borderRadius: 20, padding: '3px 10px'
                    }}>
                        <span style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: other.isOnline ? '#22c55e' : '#64748b', display: 'inline-block'
                        }} />
                        {other.isOnline ? 'Đang hoạt động' : 'Ngoại tuyến'}
                    </div>
                )}
                {conv.conversationType === 'Group' && (
                    <div style={{
                        fontSize: 11.5, color: '#64748b',
                        background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)',
                        borderRadius: 20, display: 'inline-block', padding: '3px 10px'
                    }}>
                        👥 {conv.members?.length} thành viên
                    </div>
                )}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,.06)', flexShrink: 0 }}>
                {tabBtn('info', '📋', 'Chi tiết')}
                {tabBtn('media', '🖼️', 'Ảnh')}
                {tabBtn('files', '📁', 'File')}
            </div>

            {/* Tab content — scrollable */}
            <div style={{ flex: 1, padding: '14px 14px', overflowY: 'auto' }}>

                {/* ── Tab: Info ── */}
                {tab === 'info' && (
                    <>
                        {/* Biệt danh */}
                        <div style={{ marginBottom: 18 }}>
                            <div style={{
                                fontSize: 10.5, color: '#6366f1', fontWeight: 700,
                                letterSpacing: .8, marginBottom: 9,
                                display: 'flex', alignItems: 'center', gap: 5
                            }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                                </svg>
                                BIỆT DANH
                            </div>
                            <div style={{
                                background: 'rgba(255,255,255,.03)',
                                border: '1px solid rgba(255,255,255,.08)',
                                borderRadius: 12, overflow: 'hidden'
                            }}>
                                <input
                                    value={nickname}
                                    onChange={e => setNickname(e.target.value)}
                                    placeholder={`Đặt biệt danh cho ${displayName}...`}
                                    style={{
                                        width: '100%', padding: '10px 12px',
                                        background: 'none', border: 'none',
                                        borderBottom: '1px solid rgba(255,255,255,.07)',
                                        color: '#e2e8f0', fontSize: 13, outline: 'none',
                                        fontFamily: 'inherit', boxSizing: 'border-box'
                                    }}
                                    onKeyDown={e => { if (e.key === 'Enter') saveNickname(); }}
                                />
                                <div style={{ display: 'flex' }}>
                                    {(nickname || savedNick) && (
                                        <button
                                            onClick={clearNickname}
                                            style={{
                                                flex: 1, padding: '9px', background: 'none',
                                                border: 'none', borderRight: '1px solid rgba(255,255,255,.06)',
                                                color: '#f87171', cursor: 'pointer',
                                                fontSize: 12, fontFamily: 'inherit',
                                                transition: 'background .15s'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,.08)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                        >Xoá</button>
                                    )}
                                    <button
                                        disabled={savingNick}
                                        onClick={saveNickname}
                                        style={{
                                            flex: 2, padding: '9px', background: 'none',
                                            border: 'none', color: '#818cf8',
                                            cursor: 'pointer', fontSize: 12,
                                            fontFamily: 'inherit', fontWeight: 600,
                                            transition: 'background .15s'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,.1)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                    >{savingNick ? '...' : '✓ Lưu biệt danh'}</button>
                                </div>
                            </div>
                        </div>

                        {/* Thành viên nhóm */}
                        {conv.conversationType === 'Group' && (
                            <div style={{ marginBottom: 18 }}>
                                <div style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    marginBottom: 9,
                                }}>
                                    <div style={{
                                        fontSize: 10.5, color: '#6366f1', fontWeight: 700,
                                        letterSpacing: .8,
                                        display: 'flex', alignItems: 'center', gap: 5
                                    }}>
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                            <circle cx="9" cy="7" r="4" />
                                            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                        </svg>
                                        THÀNH VIÊN ({conv.members?.length || 0})
                                    </div>
                                    {typeof onOpenAddMembers === 'function' && (
                                        <button
                                            onClick={onOpenAddMembers}
                                            style={{
                                                background: 'rgba(99,102,241,.12)', border: '1px solid rgba(99,102,241,.25)',
                                                borderRadius: 7, color: '#818cf8', cursor: 'pointer',
                                                fontSize: 10.5, fontWeight: 600, fontFamily: 'inherit',
                                                padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 3
                                            }}
                                        >+ Thêm</button>
                                    )}
                                </div>
                                <div style={{
                                    background: 'rgba(255,255,255,.03)',
                                    border: '1px solid rgba(255,255,255,.07)',
                                    borderRadius: 12, overflow: 'hidden'
                                }}>
                                    {conv.members?.map((m, i, arr) => {
                                        const isMe = Number(m.userID) === Number(currentUserID);
                                        const nick = memberNicknames?.[memberNickKey(conv.conversationID, m.userID)];
                                        const isEditing = editingMemberID === m.userID;
                                        return (
                                            <div key={m.userID} style={{
                                                display: 'flex', alignItems: 'center',
                                                gap: 10, padding: '10px 12px',
                                                borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,.05)' : 'none'
                                            }}>
                                                <Avatar user={m} size={32} showOnline />
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    {isEditing ? (
                                                        <input
                                                            autoFocus
                                                            value={memberNickDraft}
                                                            onChange={e => setMemberNickDraft(e.target.value)}
                                                            placeholder={m.fullName || m.username}
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter') {
                                                                    onMemberNicknameChange?.(conv.conversationID, m.userID, memberNickDraft.trim());
                                                                    setEditingMemberID(null);
                                                                }
                                                                if (e.key === 'Escape') setEditingMemberID(null);
                                                            }}
                                                            style={{
                                                                width: '100%', padding: '4px 7px',
                                                                background: 'rgba(255,255,255,.06)',
                                                                border: '1px solid rgba(99,102,241,.4)',
                                                                borderRadius: 6, color: '#e2e8f0',
                                                                fontSize: 12.5, outline: 'none',
                                                                fontFamily: 'inherit', boxSizing: 'border-box'
                                                            }}
                                                        />
                                                    ) : (
                                                        <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {m.role === 'Admin' && <span title="Trưởng nhóm" style={{ marginRight: 3 }}>👑</span>}
                                                            {nick || m.fullName || m.username}
                                                            {isMe && (
                                                                <span style={{ color: '#475569', marginLeft: 4, fontSize: 11 }}>(bạn)</span>
                                                            )}
                                                            {nick && (
                                                                <span style={{ color: '#475569', marginLeft: 4, fontSize: 10.5 }}>
                                                                    · {m.fullName || m.username}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                    <div style={{ fontSize: 11, color: m.isOnline ? '#22c55e' : '#475569' }}>
                                                        {m.isOnline ? 'Online' : 'Offline'}
                                                    </div>
                                                </div>
                                                {!isMe && (
                                                    isEditing ? (
                                                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                                            <button
                                                                onClick={() => {
                                                                    onMemberNicknameChange?.(conv.conversationID, m.userID, memberNickDraft.trim());
                                                                    setEditingMemberID(null);
                                                                }}
                                                                style={{ background: 'rgba(99,102,241,.15)', border: 'none', borderRadius: 6, color: '#818cf8', cursor: 'pointer', fontSize: 12, padding: '4px 6px' }}
                                                            >✓</button>
                                                            <button
                                                                onClick={() => setEditingMemberID(null)}
                                                                style={{ background: 'rgba(255,255,255,.06)', border: 'none', borderRadius: 6, color: '#94a3b8', cursor: 'pointer', fontSize: 12, padding: '4px 6px' }}
                                                            >✕</button>
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                                                            <button
                                                                title="Đặt biệt danh"
                                                                onClick={() => { setEditingMemberID(m.userID); setMemberNickDraft(nick || ''); }}
                                                                style={{
                                                                    flexShrink: 0, background: 'none', border: 'none',
                                                                    color: '#475569', cursor: 'pointer', fontSize: 13,
                                                                    padding: '4px 6px', borderRadius: 6, transition: 'background .15s, color .15s'
                                                                }}
                                                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.06)'; e.currentTarget.style.color = '#818cf8'; }}
                                                                onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#475569'; }}
                                                            >✏️</button>
                                                            {/* Nút kick — chỉ trưởng nhóm (Admin) mới thấy */}
                                                            {isMeAdmin && (
                                                                <button
                                                                    title="Xoá khỏi nhóm"
                                                                    onClick={() => {
                                                                        if (window.confirm(`Xoá ${nick || m.fullName || m.username} khỏi nhóm?`)) {
                                                                            onKickMember?.(conv.conversationID, m.userID);
                                                                        }
                                                                    }}
                                                                    style={{
                                                                        flexShrink: 0, background: 'none', border: 'none',
                                                                        color: '#475569', cursor: 'pointer', fontSize: 13,
                                                                        padding: '4px 6px', borderRadius: 6, transition: 'background .15s, color .15s'
                                                                    }}
                                                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,.1)'; e.currentTarget.style.color = '#f87171'; }}
                                                                    onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#475569'; }}
                                                                >🚫</button>
                                                            )}
                                                        </div>
                                                    )
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div style={{ height: 1, background: 'rgba(255,255,255,.06)', margin: '4px 0 14px' }} />

                        {/* Actions */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {/* Chặn / Bỏ chặn — chỉ áp dụng chat 1-1 */}
                            {conv.conversationType === 'Direct' && (
                                <button
                                    onClick={() => {
                                        const msg = isBlocked
                                            ? 'Bỏ chặn người này?'
                                            : `Chặn ${other?.fullName || other?.username || 'người này'}? Hai bên sẽ không thể gửi tin nhắn cho nhau.`;
                                        if (window.confirm(msg)) onToggleBlock?.(other?.userID);
                                    }}
                                    style={actionPanelBtn('#f87171', 'rgba(239,68,68,.05)')}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,.1)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,.05)'}
                                >{isBlocked ? '✅ Bỏ chặn người dùng' : '🚫 Chặn người dùng'}</button>
                            )}

                            {/* Rời nhóm — chỉ áp dụng Group */}
                            {conv.conversationType === 'Group' && (
                                <button
                                    onClick={() => {
                                        if (window.confirm('Rời khỏi nhóm này? Bạn sẽ không nhận được tin nhắn mới từ nhóm.')) {
                                            onLeaveGroup?.(conv.conversationID);
                                        }
                                    }}
                                    style={actionPanelBtn('#f87171', 'rgba(239,68,68,.05)')}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,.1)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,.05)'}
                                >🚪 Rời nhóm</button>
                            )}

                            <button
                                onClick={() => { if (window.confirm('Xoá đoạn chat này ở phía bạn? Người còn lại vẫn sẽ thấy lịch sử trò chuyện.')) onDeleteConv(conv.conversationID); }}
                                style={actionPanelBtn('#f87171', 'rgba(239,68,68,.05)')}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,.1)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,.05)'}
                            >🗑️ Xoá đoạn chat (chỉ phía bạn)</button>
                        </div>
                    </>
                )}

                {/* ── Tab: Ảnh ── */}
                {tab === 'media' && (
                    <div>
                        {loadingMedia ? (
                            <div style={{ textAlign: 'center', color: '#475569', padding: 32 }}>
                                <div style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,.1)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin .7s linear infinite', margin: '0 auto 8px' }} />
                                Đang tải...
                            </div>
                        ) : mediaList.length === 0 ? (
                            <div style={{ textAlign: 'center', color: '#475569', padding: 32 }}>
                                <div style={{ fontSize: 34, marginBottom: 8, opacity: .35 }}>🖼️</div>
                                <div style={{ fontSize: 13 }}>Chưa có ảnh nào</div>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
                                {mediaList.map((a, i) => (
                                    <img key={i} src={a.fileUrl} alt={a.fileName}
                                        onClick={() => window.open(a.fileUrl, '_blank')}
                                        style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, cursor: 'pointer', transition: 'opacity .15s' }}
                                        onMouseEnter={e => e.target.style.opacity = '.75'}
                                        onMouseLeave={e => e.target.style.opacity = '1'}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Tab: File ── */}
                {tab === 'files' && (
                    <div>
                        {loadingMedia ? (
                            <div style={{ textAlign: 'center', color: '#475569', padding: 32 }}>
                                <div style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,.1)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin .7s linear infinite', margin: '0 auto 8px' }} />
                                Đang tải...
                            </div>
                        ) : fileList.length === 0 ? (
                            <div style={{ textAlign: 'center', color: '#475569', padding: 32 }}>
                                <div style={{ fontSize: 34, marginBottom: 8, opacity: .35 }}>📁</div>
                                <div style={{ fontSize: 13 }}>Chưa có file nào</div>
                            </div>
                        ) : fileList.map((a, i) => (
                            <a key={i} href={a.fileUrl} target="_blank" rel="noreferrer"
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '10px 12px', borderRadius: 10, marginBottom: 4,
                                    background: 'rgba(255,255,255,.03)',
                                    border: '1px solid rgba(255,255,255,.07)',
                                    textDecoration: 'none', transition: 'background .15s'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.07)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,.03)'}
                            >
                                <div style={{
                                    width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                                    background: 'rgba(99,102,241,.1)', border: '1px solid rgba(99,102,241,.2)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17
                                }}>📄</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12.5, color: '#e2e8f0', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.fileName}</div>
                                    <div style={{ fontSize: 11, color: '#475569', marginTop: 1 }}>
                                        {a.fileSize ? `${(a.fileSize / 1024).toFixed(1)} KB` : ''}
                                    </div>
                                </div>
                                <span style={{ fontSize: 15, color: '#6366f1', flexShrink: 0 }}>↓</span>
                            </a>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}


// Helper style cho action buttons trong panel
const actionPanelBtn = (color, bg) => ({
    width: '100%', padding: '9px 12px', background: bg,
    border: `1px solid ${color}22`, borderRadius: 9,
    color, cursor: 'pointer', fontSize: 12.5,
    fontFamily: 'inherit', fontWeight: 500,
    textAlign: 'left', transition: 'background .15s'
});
/* ════════════════════════════════════════════════════════════════════════════
   MAIN ChatPage
════════════════════════════════════════════════════════════════════════════ */
export default function ChatPage() {
    const { user, token, logout, updateUser } = useContext(AuthContext);
    const navigate = useNavigate();
    const { connection, isConnected } = useSocket(token);
    const [localUser, setLocalUser] = useState(user);
    const selectedConvRef = useRef(null);
    const userRef = useRef(user);
    useEffect(() => {
        setLocalUser(user);
        userRef.current = user;
    }, [user]);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showChangePassword, setShowChangePassword] = useState(false);
    const [pwForm, setPwForm] = useState({ oldPassword: '', newPassword: '', confirm: '' });
    const [changingPw, setChangingPw] = useState(false);
    const [conversations, setConversations] = useState([]);
    // Biệt danh: { [conversationID]: string }
    const [nicknames, setNicknames] = useState(() => {
        const result = {};
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k?.startsWith('nickname_')) {
                const convId = k.replace('nickname_', '');
                result[convId] = localStorage.getItem(k);
            }
        }
        return result;
    });

    const [msgSearch, setMsgSearch] = useState('');
    const [showMsgSearch, setShowMsgSearch] = useState(false);

    const [selectedConv, setSelectedConv] = useState(null);

    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [loadingMsgs, setLoadingMsgs] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [replyTo, setReplyTo] = useState(null);
    const [editMsg, setEditMsg] = useState(null);
    const [typingUsers, setTypingUsers] = useState({});
    const [view, setView] = useState('chats');
    const [friends, setFriends] = useState([]);
    const [friendRequests, setFriendRequests] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [unreadNotifs, setUnreadNotifs] = useState(0);
    const [searchQ, setSearchQ] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [uploadProgress, setUploadProgress] = useState(null);
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [groupName, setGroupName] = useState('');
    const [selectedMembers, setSelectedMembers] = useState([]);
    const [editName, setEditName] = useState('');
    const [savingProfile, setSavingProfile] = useState(false);

    const [showConvPanel, setShowConvPanel] = useState(false);
    // Chặn 2 chiều: mình chặn người ta (blockedByMe) và người ta chặn mình (blockedMe)
    const [blockedByMe, setBlockedByMe] = useState([]);
    const [blockedMe, setBlockedMe] = useState([]);
    // Biệt danh từng thành viên trong nhóm: { "{convId}_{userId}": "biệt danh" }
    const [memberNicknames, setMemberNicknames] = useState(() => loadAllMemberNicknames());
    // Modal thêm thành viên vào nhóm hiện tại
    const [showAddMembers, setShowAddMembers] = useState(false);
    const [addMemberSelection, setAddMemberSelection] = useState([]);
    const bottomRef = useRef(null);
    const typingTimer = useRef(null);
    const fileInputRef = useRef(null);
    const messagesRef = useRef(null);

    const isAdmin = user?.isAdmin;

    // ── Xoá đoạn chat ở PHÍA MÌNH — không ảnh hưởng phía đối phương ──────────
    const clearConversation = useCallback(async (convId) => {
        try {
            await axios.post(`/api/conversations/${convId}/clear`);
            if (selectedConvRef.current?.conversationID === convId) {
                setMessages([]);
            }
            setConversations(prev => prev.map(c =>
                c.conversationID === convId ? { ...c, lastMessage: null } : c
            ));
            setShowConvPanel(false);
            toast.success('Đã xoá đoạn chat ở phía bạn');
        } catch {
            toast.error('Không thể xoá đoạn chat');
        }
    }, []);

    // ── Rời nhóm (chỉ áp dụng cho Group) ─────────────────────────────────────
    const leaveGroup = useCallback(async (convId) => {
        try {
            await axios.post(`/api/conversations/${convId}/leave`);
            connection?.invoke('LeaveConversation', convId).catch(() => { });
            setConversations(prev => prev.filter(c => c.conversationID !== convId));
            if (selectedConvRef.current?.conversationID === convId) {
                setSelectedConv(null);
                setMessages([]);
                selectedConvRef.current = null;
            }
            setShowConvPanel(false);
            toast.success('Đã rời nhóm');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Không thể rời nhóm');
        }
    }, [connection]);

    // ── Thêm thành viên từ danh sách bạn bè vào nhóm hiện tại ────────────────
    const addMembersToGroup = useCallback(async (convId, memberIDs) => {
        if (!memberIDs.length) return;
        try {
            const { data } = await axios.post(`/api/conversations/${convId}/members`, { memberIDs });
            setSelectedConv(prev =>
                prev?.conversationID === convId ? { ...prev, members: data.members } : prev
            );
            selectedConvRef.current = selectedConvRef.current?.conversationID === convId
                ? { ...selectedConvRef.current, members: data.members }
                : selectedConvRef.current;
            setConversations(prev => prev.map(c =>
                c.conversationID === convId ? { ...c, members: data.members } : c
            ));
            toast.success('Đã thêm thành viên vào nhóm!');
            setShowAddMembers(false);
            setAddMemberSelection([]);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Thêm thành viên thất bại');
        }
    }, []);

    // ── Trưởng nhóm xoá một thành viên khỏi nhóm ─────────────────────────────
    const kickMember = useCallback(async (convId, targetUserID) => {
        try {
            await axios.delete(`/api/conversations/${convId}/members/${targetUserID}`);
            // Cập nhật cục bộ ngay — backend cũng sẽ emit MemberLeft đến mọi người
            const targetUID = Number(targetUserID);
            setSelectedConv(prev => {
                if (prev?.conversationID !== convId) return prev;
                const updated = { ...prev, members: (prev.members || []).filter(m => Number(m.userID) !== targetUID) };
                selectedConvRef.current = updated;
                return updated;
            });
            setConversations(prev => prev.map(c =>
                c.conversationID === convId
                    ? { ...c, members: (c.members || []).filter(m => Number(m.userID) !== targetUID) }
                    : c
            ));
            toast.success('Đã xoá thành viên khỏi nhóm');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Không thể xoá thành viên');
        }
    }, []);

    // ── Chặn / Bỏ chặn người dùng (chat 1-1) ─────────────────────────────────
    const toggleBlockUser = useCallback(async (targetUserID) => {
        if (!targetUserID) return;
        const isBlocked = blockedByMe.includes(targetUserID);
        try {
            if (isBlocked) {
                await axios.delete(`/api/blocks/${targetUserID}`);
                setBlockedByMe(prev => prev.filter(id => id !== targetUserID));
                toast.success('Đã bỏ chặn');
            } else {
                await axios.post(`/api/blocks/${targetUserID}`);
                setBlockedByMe(prev => [...prev, targetUserID]);
                toast.success('Đã chặn người này');
            }
        } catch {
            toast.error('Thao tác thất bại');
        }
    }, [blockedByMe]);

    // ── Đặt / xoá biệt danh cho 1 thành viên trong nhóm ──────────────────────
    const handleMemberNicknameChange = useCallback((convId, userId, value) => {
        const key = memberNickKey(convId, userId);
        const storageKey = `member_nickname_${key}`;
        setMemberNicknames(prev => {
            const next = { ...prev };
            if (value) {
                localStorage.setItem(storageKey, value);
                next[key] = value;
            } else {
                localStorage.removeItem(storageKey);
                delete next[key];
            }
            return next;
        });
    }, []);

    const handleNicknameChange = useCallback((convId, newNick) => {
        setNicknames(prev => {
            const next = { ...prev };
            if (newNick) next[String(convId)] = newNick;
            else delete next[String(convId)];
            return next;
        });
    }, []);
    // Hàm updateProfile — SỬA:
    const updateProfile = useCallback(async (data) => {
        try {
            await axios.put('/api/users/profile', data);

            // Sau khi update thành công, fetch lại thông tin user mới nhất từ server
            const { data: freshUser } = await axios.get('/api/users/me');

            // freshUser giờ có đủ field đúng format
            setLocalUser(prev => ({ ...prev, ...freshUser }));
            if (typeof updateUser === 'function') updateUser(freshUser);

            toast.success('Cập nhật thành công!');
        } catch (err) {
            console.error('updateProfile error:', err.response?.data);
            toast.error(err.response?.data?.error || 'Cập nhật thất bại');
        }
    }, [updateUser]);

    /* ── Load conversations on mount ─────────────────────────────────────── */
    useEffect(() => {
        conversationApi.getAll().then(setConversations).catch(() => { });
        notifApi.getAll().then(n => {
            setNotifications(n);
            setUnreadNotifs(n.filter(x => !x.isRead).length);
        }).catch(() => { });
        friendApi.getPendingRequests()
            .then(r => setFriendRequests(r || []))
            .catch(() => { });
        // Danh sách chặn 2 chiều
        axios.get('/api/blocks')
            .then(({ data }) => {
                setBlockedByMe(Array.isArray(data?.blockedByMe) ? data.blockedByMe : []);
                setBlockedMe(Array.isArray(data?.blockedMe) ? data.blockedMe : []);
            })
            .catch(() => { });
    }, []);

    /* ── SignalR event listeners ─────────────────────────────────────────── */
    useEffect(() => {
        if (!connection) return;

        const onNewMessage = (evt) => {
            // Support both { message: ... } wrapper and direct message object
            const msg = evt?.message ?? evt;
            if (!msg || !msg.conversationID) return;

            const isActiveConv = Number(selectedConvRef.current?.conversationID) === Number(msg.conversationID);

            // Chỉ thêm vào messages nếu đang mở đúng conversation đó
            if (isActiveConv) {
                setMessages(prev => {
                    if (prev.some(m => m.messageID === msg.messageID)) return prev;
                    return [...prev, msg];
                });
                connection.invoke('MarkSeen', msg.conversationID, msg.messageID).catch(() => { });
            }

            // Cập nhật lastMessage + unreadCount trên sidebar
            setConversations(prev => prev.map(c => {
                if (Number(c.conversationID) !== Number(msg.conversationID)) return c;
                return {
                    ...c,
                    lastMessage: msg,
                    unreadCount: isActiveConv ? 0 : (c.unreadCount || 0) + 1,
                };
            }));

            // Toast thông báo — chỉ khi không phải conv đang mở VÀ không phải tin mình gửi
            const isOwnMessage = Number(msg.sender?.userID) === Number(userRef.current?.userID);
            if (!isActiveConv && !isOwnMessage) {
                const senderName = msg.sender?.fullName || msg.sender?.username || 'Ai đó';
                // Normalize messageType (backend có thể trả về 'text' hoặc 'Text')
                const msgType = (msg.messageType || '').toLowerCase();
                const preview = msg.content
                    ? (msg.content.slice(0, 50) + (msg.content.length > 50 ? '...' : ''))
                    : msgType.includes('image') ? '📷 Đã gửi ảnh'
                        : '📎 Đã gửi file';

                toast(
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                            background: msg.sender?.avatarUrl ? 'none' : '#6366f1',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            overflow: 'hidden', fontSize: 14, fontWeight: 700, color: '#fff'
                        }}>
                            {msg.sender?.avatarUrl
                                ? <img src={msg.sender.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                : (senderName[0] || '?').toUpperCase()
                            }
                        </div>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{senderName}</div>
                            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 1 }}>{preview}</div>
                        </div>
                    </div>,
                    {
                        duration: 4000,
                        style: {
                            background: '#1e2130',
                            border: '1px solid rgba(99,102,241,.3)',
                            borderRadius: 12,
                            padding: '10px 14px',
                            cursor: 'pointer',
                        },
                    }
                );
            }
        };

        const onMessageEdited = ({ messageID, newContent }) => {
            setMessages(prev => prev.map(m =>
                m.messageID === messageID ? { ...m, content: newContent, isEdited: true } : m
            ));
        };

        const onMessageDeleted = ({ messageID }) => {
            setMessages(prev => prev.map(m =>
                m.messageID === messageID ? { ...m, isDeleted: true, content: null } : m
            ));
        };

        const onMessageSeen = ({ messageID, seenByUserID, seenAt }) => {
            setMessages(prev => prev.map(m =>
                m.messageID === messageID ? { ...m, status: { isDelivered: true, isSeen: true, seenAt } } : m
            ));
        };

        const onUserOnline = ({ userID, isOnline, lastSeen }) => {
            setConversations(prev => prev.map(c => ({
                ...c,
                members: c.members?.map(m =>
                    m.userID === userID ? { ...m, isOnline, lastSeen } : m
                )
            })));
        };

        const onTyping = ({ conversationID, userID: uid, username, isTyping: t }) => {
            if (uid === user?.userID) return;
            setTypingUsers(prev => {
                const arr = prev[conversationID] || [];
                return {
                    ...prev,
                    [conversationID]: t
                        ? [...new Set([...arr, username])]
                        : arr.filter(u => u !== username)
                };
            });
        };

        const onReaction = ({ messageID, emoji, userID: uid, count }) => {
            setMessages(prev => prev.map(m => {
                if (m.messageID !== messageID) return m;
                const reactions = [...(m.reactions || [])];
                const idx = reactions.findIndex(r => r.emoji === emoji);
                if (count === 0) {
                    return { ...m, reactions: reactions.filter(r => r.emoji !== emoji) };
                }
                if (idx >= 0) {
                    reactions[idx] = { ...reactions[idx], count, reactedByMe: uid === user?.userID };
                } else {
                    reactions.push({ emoji, count, reactedByMe: uid === user?.userID });
                }
                return { ...m, reactions };
            }));
        };

        const onNotification = (notif) => {
            setNotifications(prev => [notif, ...prev]);
            setUnreadNotifs(n => n + 1);
            toast(notif.content || notif.title, { icon: '🔔', duration: 3000 });
        };

        connection.on('NewMessage', onNewMessage);
        // Thêm handler
        const onNewConversation = (conv) => {
            setConversations(prev => {
                // Tránh duplicate nếu đã có
                if (prev.some(c => c.conversationID === conv.conversationID)) return prev;
                return [conv, ...prev];
            });
            connection?.invoke('JoinConversation', conv.conversationID).catch(() => { });
            toast(`Bạn được thêm vào nhóm "${conv.name || 'nhóm chat'}"`, {
                icon: '👥', duration: 3000
            });
        };

        // Đăng ký
        connection.on('NewConversation', onNewConversation);

        // Cleanup — thêm vào return cleanup bên dưới
        // connection.off('NewConversation', onNewConversation);
        connection.on('MessageEdited', onMessageEdited);
        connection.on('MessageDeleted', onMessageDeleted);
        connection.on('MessageSeen', onMessageSeen);
        connection.on('UserOnline', onUserOnline);
        connection.on('Typing', onTyping);
        connection.on('Reaction', onReaction);
        connection.on('Notification', onNotification);
        const onFriendRequest = (data) => {
            setFriendRequests(prev => {
                const exists = prev.some(r => r.requestID === data.requestID);
                if (exists) return prev;
                return [data, ...prev];
            });
        };

        const onFriendAccepted = () => {
            friendApi.getList().then(setFriends).catch(() => { });
        };

        connection.on('FriendRequest', onFriendRequest);
        connection.on('FriendAccepted', onFriendAccepted);

        // ── Có người rời nhóm / bị kick — cập nhật members list + báo toast ──
        const onMemberLeft = ({ conversationID, userID: leftUserID, userName, action }) => {
            // ✅ Ép kiểu Number — tránh lỗi so sánh number vs string
            const leftUID = Number(leftUserID);
            const convID = Number(conversationID);
            const isMe = leftUID === Number(userRef.current?.userID);

            // Cập nhật member list trong cả conversations list và selectedConv
            setConversations(prev => prev.map(c =>
                Number(c.conversationID) === convID
                    ? { ...c, members: (c.members || []).filter(m => Number(m.userID) !== leftUID) }
                    : c
            ));

            setSelectedConv(prev => {
                if (!prev || Number(prev.conversationID) !== convID) return prev;
                const updated = { ...prev, members: (prev.members || []).filter(m => Number(m.userID) !== leftUID) };
                selectedConvRef.current = updated;
                return updated;
            });

            if (!isMe) {
                // Báo cho các thành viên còn lại biết có người rời / bị kick
                toast(
                    action === 'kicked'
                        ? `${userName} đã bị xoá khỏi nhóm`
                        : `${userName} đã rời nhóm`,
                    { icon: action === 'kicked' ? '🚫' : '👋' }
                );
            }
            // Nếu là mình: leaveGroup() đã xử lý UI rồi nên không cần làm thêm
        };

        // ── Có thành viên mới được thêm vào nhóm ──────────────────────────────
        const onMembersAdded = ({ conversationID, members }) => {
            setConversations(prev => prev.map(c =>
                c.conversationID === conversationID ? { ...c, members } : c
            ));
            setSelectedConv(prev => {
                if (prev?.conversationID !== conversationID) return prev;
                const updated = { ...prev, members };
                selectedConvRef.current = updated;
                return updated;
            });
        };

        // ── Chính mình bị kick khỏi nhóm — đóng phòng chat nếu đang mở ────────
        const onRemovedFromGroup = ({ conversationID }) => {
            setConversations(prev => prev.filter(c => c.conversationID !== conversationID));
            setSelectedConv(prev => {
                if (prev?.conversationID !== conversationID) return prev;
                selectedConvRef.current = null;
                setMessages([]);
                toast.error('Bạn đã bị xoá khỏi nhóm này');
                return null;
            });
        };

        // ── Bị chặn / được bỏ chặn bởi người khác — cập nhật state để UI phản ánh đúng ──
        const onGotBlocked = ({ byUserID }) => {
            setBlockedMe(prev => prev.includes(byUserID) ? prev : [...prev, byUserID]);
        };
        const onGotUnblocked = ({ byUserID }) => {
            setBlockedMe(prev => prev.filter(id => id !== byUserID));
        };

        connection.on('MemberLeft', onMemberLeft);
        connection.on('MembersAdded', onMembersAdded);
        connection.on('RemovedFromGroup', onRemovedFromGroup);
        connection.on('GotBlocked', onGotBlocked);
        connection.on('GotUnblocked', onGotUnblocked);

        return () => {
            connection.off('NewMessage', onNewMessage);
            connection.off('MessageEdited', onMessageEdited);
            connection.off('MessageDeleted', onMessageDeleted);
            connection.off('MessageSeen', onMessageSeen);
            connection.off('UserOnline', onUserOnline);
            connection.off('Typing', onTyping);
            connection.off('Reaction', onReaction);
            connection.off('Notification', onNotification);
            connection.off('FriendRequest', onFriendRequest);
            connection.off('FriendAccepted', onFriendAccepted);
            connection.off('NewConversation', onNewConversation);
            connection.off('MemberLeft', onMemberLeft);
            connection.off('MembersAdded', onMembersAdded);
            connection.off('RemovedFromGroup', onRemovedFromGroup);
            connection.off('GotBlocked', onGotBlocked);
            connection.off('GotUnblocked', onGotUnblocked);
        };
    }, [connection, user?.userID]);

    /* ── Select conversation ─────────────────────────────────────────────── */
    const selectConv = useCallback(async (conv) => {
        selectedConvRef.current = conv;
        setSelectedConv(conv);
        setMessages([]);
        setReplyTo(null);
        setEditMsg(null);
        setLoadingMsgs(true);
        setView('chats');
        try {
            const res = await messageApi.getPage(conv.conversationID);
            setMessages(res.items || []);
            setHasMore(res.page < res.totalPages);
            // Join SignalR group
            connection?.invoke('JoinConversation', conv.conversationID).catch(() => { });
            // Mark seen
            const lastMsg = res.items?.at(-1);
            if (lastMsg) {
                connection?.invoke('MarkSeen', conv.conversationID, lastMsg.messageID).catch(() => { });
                setConversations(prev => prev.map(c =>
                    c.conversationID === conv.conversationID ? { ...c, unreadCount: 0 } : c
                ));
            }
        } catch {
            toast.error('Không thể tải tin nhắn');
        } finally {
            setLoadingMsgs(false);
        }
    }, [connection]);

    /* ── Auto scroll to bottom on new messages ─────────────────────────── */
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    /* ── Load more (scroll to top) ──────────────────────────────────────── */
    const loadMore = useCallback(async () => {
        if (!selectedConv || !hasMore || loadingMsgs) return;
        const firstID = messages[0]?.messageID;
        setLoadingMsgs(true);
        try {
            const res = await messageApi.getPage(selectedConv.conversationID, 1, 50, firstID);
            setMessages(prev => [...(res.items || []), ...prev]);
            setHasMore(res.page < res.totalPages);
        } finally {
            setLoadingMsgs(false);
        }
    }, [selectedConv, hasMore, loadingMsgs, messages]);

    /* ── Send message ────────────────────────────────────────────────────── */
    const sendMessage = useCallback(async () => {
        if ((!input.trim() && !editMsg) || !selectedConv || sending) return;

        if (editMsg) {
            connection?.invoke('EditMessage', editMsg.messageID, input.trim()).catch(() => { });
            setEditMsg(null);
            setInput('');
            return;
        }

        const text = input.trim();
        setInput('');
        setSending(true);
        stopTyping();

        try {
            connection?.invoke('SendMessage', {
                conversationID: selectedConv.conversationID,
                content: text,
                messageType: 'Text',
                replyToMessageID: replyTo?.messageID ?? null,
            });
            setReplyTo(null);
        } catch {
            toast.error('Gửi tin nhắn thất bại');
            setInput(text);
        } finally {
            setSending(false);
        }
    }, [input, editMsg, selectedConv, sending, connection, replyTo]);

    /* ── File upload ─────────────────────────────────────────────────────── */
    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !selectedConv) return;
        const MAX = 25 * 1024 * 1024;
        if (file.size > MAX) { toast.error('File tối đa 25MB'); return; }
        setUploadProgress(0);
        try {
            const res = await fileApi.upload(file, p => setUploadProgress(p));
            connection?.invoke('SendMessage', {
                conversationID: selectedConv.conversationID,
                content: null,
                messageType: file.type.startsWith('image/') ? 'Image' : 'File',
                attachmentUrls: [res.fileUrl],
            });
        } catch {
            toast.error('Upload thất bại');
        } finally {
            setUploadProgress(null);
            e.target.value = '';
        }
    };

    /* ── Typing indicator ────────────────────────────────────────────────── */
    const handleInputChange = (e) => {
        setInput(e.target.value);
        if (!selectedConv || !connection) return;
        connection.invoke('Typing', { conversationId: selectedConv.conversationID, isTyping: true }).catch(() => { });
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(stopTyping, 2000);
    };
    const stopTyping = () => {
        if (selectedConv && connection)
            connection.invoke('Typing', selectedConv.conversationID, false).catch(() => { });
    };

    /* ── Reactions / Delete ──────────────────────────────────────────────── */
    const reactToMessage = (messageID, emoji) => {
        connection?.invoke('ReactToMessage', messageID, emoji).catch(() => { });
    };
    const deleteMessage = (messageID) => {
        connection?.invoke('DeleteMessage', messageID).catch(() => { });
    };
    const startEdit = (msg) => {
        setEditMsg(msg);
        setInput(msg.content || '');
        setReplyTo(null);
    };

    /* ── Friend actions ──────────────────────────────────────────────────── */
    useEffect(() => {
        if (view !== 'friends') return;
        Promise.all([friendApi.getList(), friendApi.getPendingRequests()])
            .then(([f, r]) => { setFriends(f); setFriendRequests(r); })
            .catch(() => { });
    }, [view]);

    const searchUsers = async (q) => {
        setSearchQ(q);
        if (q.length < 2) {
            setSearchResults([]);
            return;
        }
        try {
            const res = await friendApi.search(q);
            setSearchResults(Array.isArray(res) ? res : []);
        } catch {
            setSearchResults([]);
            toast.error('Không thể tìm kiếm');
        }
    };

    const openDirectChat = async (friendUser) => {
        const existing = conversations.find(c =>
            c.conversationType === 'Direct' &&
            c.members?.some(m =>
                (m.userID ?? m.UserID) === (friendUser.userID ?? friendUser.UserID)
            )
        );
        if (existing) { selectConv(existing); setView('chats'); return; }

        try {
            const conv = await conversationApi.create({
                type: 'Direct', memberIDs: [friendUser.userID ?? friendUser.UserID]
            });
            setConversations(prev => [conv, ...prev]);
            selectConv(conv);
            setView('chats');
        } catch {
            toast.error('Không thể mở cuộc trò chuyện');
        }
    };

    const createGroup = async () => {
        if (!groupName.trim() || selectedMembers.length < 2) {
            toast.error('Nhập tên nhóm và chọn ít nhất 2 thành viên'); return;
        }
        const conv = await conversationApi.create({
            type: 'Group', memberIDs: selectedMembers, groupName: groupName.trim()
        }).catch(() => null);
        if (!conv) { toast.error('Tạo nhóm thất bại'); return; }
        setConversations(prev => [conv, ...prev]);
        setShowGroupModal(false);
        setGroupName(''); setSelectedMembers([]);
        selectConv(conv); setView('chats');
        toast.success('Tạo nhóm thành công!');
    };

    /* ── Notifications ───────────────────────────────────────────────────── */
    const markAllRead = async () => {
        await notifApi.markAllRead().catch(() => { });
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        setUnreadNotifs(0);
    };

    /* ── Group messages by date ──────────────────────────────────────────── */
    // Lọc tin nhắn theo từ khóa tìm kiếm
    const displayMessages = msgSearch.trim()
        ? messages.filter(m =>
            m.content?.toLowerCase().includes(msgSearch.toLowerCase())
        )
        : messages;

    // Đổi messages → displayMessages trong groupedMessages
    const groupedMessages = displayMessages.reduce((acc, msg) => {
        const day = fmtDate(msg.createdAt);
        if (!acc[day]) acc[day] = [];
        acc[day].push(msg);
        return acc;
    }, {});
    // const groupedMessages = messages.reduce((acc, msg) => {
    //     const day = fmtDate(msg.createdAt);
    //     if (!acc[day]) acc[day] = [];
    //     acc[day].push(msg);
    //     return acc;
    // }, {});

    const convTyping = typingUsers[selectedConv?.conversationID] || [];

    /* ── selected conversation display info ─────────────────────────────── */
    const otherMember = selectedConv?.members?.find(m => m.userID !== user?.userID);
    const convName = (() => {
        const nick = nicknames[String(selectedConv?.conversationID)];
        if (nick) return nick;
        return selectedConv?.conversationType === 'Direct'
            ? (otherMember?.fullName || otherMember?.username)
            : selectedConv?.name;
    })();
    const convStatus = selectedConv?.conversationType === 'Direct'
        ? (otherMember?.isOnline ? '● Đang hoạt động' : `Truy cập ${otherMember?.lastSeen ? fmtTime(otherMember.lastSeen) : 'lâu rồi'}`)
        : `${selectedConv?.members?.length || 0} thành viên`;
    // Đã chặn người đang chat (chỉ áp dụng Direct)
    // Đã chặn người đang chat (chỉ áp dụng Direct)
    const isOtherBlocked = selectedConv?.conversationType === 'Direct'
        && otherMember
        && blockedByMe.map(Number).includes(Number(otherMember.userID));
    // Người đang chat đã chặn mình
    const isBlockedByOther = selectedConv?.conversationType === 'Direct'
        && otherMember
        && blockedMe.map(Number).includes(Number(otherMember.userID));

    const filteredConvs = conversations.filter(c => {
        if (!searchQ) return true;
        const other = c.members?.find(m => m.userID !== user?.userID);
        const name = c.conversationType === 'Direct'
            ? (other?.fullName || other?.username || '')
            : (c.name || '');
        return name.toLowerCase().includes(searchQ.toLowerCase());
    });

    /* ════════════════════════════════════════════════════════════════════════
       RENDER
    ════════════════════════════════════════════════════════════════════════ */
    return (
        <>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0d0f14; color: #e2e8f0; font-family: 'Sora', sans-serif; }

        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 4px; }

        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse {
          0%, 100% { opacity: .3; transform: scale(1); }
          50%       { opacity: 1;  transform: scale(1.25); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .msg-appear { animation: fadeUp .2s ease; }

        .nav-btn {
          width: 44px; height: 44px; border-radius: 13px;
          background: none; border: none; cursor: pointer;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          color: #475569; transition: all .15s; gap: 2px; position: relative;
        }
        .nav-btn.active { background: rgba(99,102,241,.15); color: #818cf8; }
        .nav-btn:hover:not(.active) { background: rgba(255,255,255,.06); color: #94a3b8; }
        .nav-btn svg { width: 19px; height: 19px; }

        textarea { font-family: 'Sora', sans-serif; }
      `}</style>

            <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#0d0f14' }}>

                {/* ── LEFT NAV RAIL ───────────────────────────────────────────────── */}

                <div style={{
                    width: 64, flexShrink: 0,
                    background: '#0b0d12',
                    borderRight: '1px solid rgba(255,255,255,.06)',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', padding: '16px 0', gap: 4
                }}>
                    {/* Logo */}
                    <div style={{
                        width: 38, height: 38, borderRadius: 12, marginBottom: 16,
                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 0 20px rgba(99,102,241,.4)', flexShrink: 0
                    }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                    </div>

                    {[
                        { id: 'chats', label: 'Chats', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg> },
                        { id: 'friends', label: 'Bạn bè', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>, badge: friendRequests.length },
                        { id: 'ai', label: 'AI Chat', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" /></svg> },
                        { id: 'notifs', label: 'Thông báo', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>, badge: unreadNotifs },
                        { id: 'settings', label: 'Cài đặt', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg> },
                    ].map(item => (
                        <button key={item.id} className={`nav-btn${view === item.id ? ' active' : ''}`}
                            onClick={() => {
                                setView(item.id);
                                setSearchQ('');        // ← thêm dòng này
                                setSearchResults([]);  // ← thêm dòng này
                            }} title={item.label}>
                            {item.icon}
                            {item.badge > 0 && (
                                <span style={{
                                    position: 'absolute', top: 5, right: 5,
                                    width: 16, height: 16, borderRadius: '50%',
                                    background: '#ef4444', color: '#fff',
                                    fontSize: 9, fontWeight: 700,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    border: '2px solid #0b0d12'
                                }}>{item.badge > 9 ? '9+' : item.badge}</span>
                            )}
                        </button>
                    ))}

                    <div style={{ flex: 1 }} />

                    {isAdmin && (
                        <button className="nav-btn" onClick={() => navigate('/admin')} title="Admin Panel">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                            </svg>
                        </button>
                    )}
                    {/* My avatar — click hiện menu */}
                    <div style={{ position: 'relative' }}>
                        <div
                            style={{ position: 'relative', cursor: 'pointer' }}
                            onClick={() => setShowUserMenu(p => !p)}
                            title="Tài khoản"
                        >
                            <Avatar user={localUser} size={36} />
                            <div style={{
                                position: 'absolute', bottom: -1, right: -1,
                                width: 10, height: 10, borderRadius: '50%',
                                background: '#22c55e', border: '2px solid #0b0d12'
                            }} />
                        </div>

                        {/* Popup menu */}
                        {showUserMenu && (
                            <>
                                {/* Overlay trong suốt để click ngoài đóng menu */}
                                <div
                                    style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                                    onClick={() => setShowUserMenu(false)}
                                />
                                <div style={{
                                    position: 'absolute', bottom: 44, left: 8,
                                    width: 200, background: '#1a1e27',
                                    border: '1px solid rgba(255,255,255,.12)',
                                    borderRadius: 12, padding: '6px',
                                    boxShadow: '0 8px 32px rgba(0,0,0,.6)',
                                    zIndex: 100
                                }}>
                                    {/* Tên user */}
                                    <div style={{ padding: '8px 10px 10px', borderBottom: '1px solid rgba(255,255,255,.07)', marginBottom: 4 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>
                                            {localUser?.fullName || localUser?.username}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#475569' }}>@{localUser?.username}</div>
                                    </div>

                                    {/* Đổi mật khẩu */}
                                    <button
                                        onClick={() => { setShowUserMenu(false); setShowChangePassword(true); }}
                                        style={{
                                            width: '100%', padding: '8px 10px', background: 'none',
                                            border: 'none', borderRadius: 8, color: '#94a3b8',
                                            fontSize: 13, cursor: 'pointer', textAlign: 'left',
                                            display: 'flex', alignItems: 'center', gap: 8,
                                            transition: 'background .15s'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.06)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                                        Đổi mật khẩu
                                    </button>

                                    {/* Đăng xuất */}
                                    <button
                                        onClick={() => { setShowUserMenu(false); if (window.confirm('Bạn muốn đăng xuất?')) logout(); }}
                                        style={{
                                            width: '100%', padding: '8px 10px', background: 'none',
                                            border: 'none', borderRadius: 8, color: '#f87171',
                                            fontSize: 13, cursor: 'pointer', textAlign: 'left',
                                            display: 'flex', alignItems: 'center', gap: 8,
                                            transition: 'background .15s'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,.1)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                                        Đăng xuất
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* ── SIDEBAR ─────────────────────────────────────────────────────── */}
                <div style={{
                    width: 288, flexShrink: 0,
                    background: '#111318',
                    borderRight: '1px solid rgba(255,255,255,.07)',
                    display: 'flex', flexDirection: 'column',
                    height: '100vh'
                }}>

                    {/* ── CHATS view ── */}
                    {view === 'chats' && (
                        <>
                            <div style={{ padding: '18px 14px 12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                                    <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Space Grotesk', color: '#f1f5f9' }}>Tin nhắn</span>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        <button onClick={() => setShowGroupModal(true)} title="Tạo nhóm" style={{
                                            background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)',
                                            borderRadius: 9, padding: '5px 9px', color: '#94a3b8', cursor: 'pointer', fontSize: 14
                                        }}>👥+</button>
                                    </div>
                                </div>
                                {/* Search */}
                                <div style={{ position: 'relative' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#475569' }}>
                                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                                    </svg>
                                    <input
                                        value={searchQ}
                                        onChange={e => setSearchQ(e.target.value)}
                                        placeholder="Tìm cuộc trò chuyện..."
                                        style={{
                                            width: '100%', padding: '8px 12px 8px 32px',
                                            background: 'rgba(255,255,255,.05)',
                                            border: '1px solid rgba(255,255,255,.08)',
                                            borderRadius: 10, color: '#e2e8f0', fontSize: 13,
                                            outline: 'none', fontFamily: 'inherit'
                                        }}
                                    />
                                </div>
                            </div>

                            <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
                                {filteredConvs.length === 0 && (
                                    <div style={{ textAlign: 'center', color: '#475569', fontSize: 13, padding: '32px 16px' }}>
                                        {searchQ ? 'Không tìm thấy cuộc trò chuyện' : 'Chưa có cuộc trò chuyện nào'}
                                    </div>
                                )}
                                {filteredConvs.map(conv => (
                                    <ConvItem key={conv.conversationID} conv={conv}
                                        isActive={selectedConv?.conversationID === conv.conversationID}
                                        onClick={() => selectConv(conv)}
                                        currentUserID={user?.userID}
                                        nickname={nicknames[String(conv.conversationID)]}
                                        blockedByMe={blockedByMe}
                                        blockedMe={blockedMe} />
                                ))}
                            </div>
                        </>
                    )}

                    {/* ── FRIENDS view ── */}
                    {view === 'friends' && (
                        <>
                            <div style={{ padding: '18px 14px 12px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
                                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Space Grotesk', color: '#f1f5f9', marginBottom: 12 }}>Bạn bè</div>
                                <input
                                    value={searchQ}
                                    onChange={e => searchUsers(e.target.value)}
                                    placeholder="Tìm người dùng..."
                                    style={{
                                        width: '100%', padding: '8px 12px',
                                        background: 'rgba(255,255,255,.05)',
                                        border: '1px solid rgba(255,255,255,.08)',
                                        borderRadius: 10, color: '#e2e8f0', fontSize: 13,
                                        outline: 'none', fontFamily: 'inherit'
                                    }}
                                />
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                                {/* search results */}
                                {searchResults.length > 0 && (
                                    <>
                                        <div style={{ fontSize: 11, color: '#475569', padding: '4px 6px 6px', fontWeight: 600, letterSpacing: .5 }}>KẾT QUẢ TÌM KIẾM</div>
                                        {searchResults.map(u => {
                                            const isBlocked = blockedByMe.map(Number).includes(Number(u.userID));
                                            const isBlockedByOther = blockedMe.map(Number).includes(Number(u.userID));
                                            return (
                                                <div key={u.userID} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10 }}>
                                                    <Avatar user={u} size={36} showOnline={!isBlocked && !isBlockedByOther} />
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', display: 'flex', alignItems: 'center' }}>
                                                            {u.fullName || u.username}
                                                            {isBlocked && <span style={{ fontSize: 9.5, color: '#f87171', background: 'rgba(239,68,68,.15)', padding: '1px 4px', borderRadius: 4, marginLeft: 6 }}>Đã chặn</span>}
                                                            {isBlockedByOther && <span style={{ fontSize: 9.5, color: '#94a3b8', background: 'rgba(148,163,184,.15)', padding: '1px 4px', borderRadius: 4, marginLeft: 6 }}>Bị chặn</span>}
                                                        </div>
                                                        <div style={{ fontSize: 11, color: '#475569' }}>@{u.username}</div>
                                                    </div>
                                                    {(isBlocked || isBlockedByOther) ? (
                                                        <span style={{ fontSize: 11, color: '#64748b' }}>Không khả dụng</span>
                                                    ) : (
                                                        <button onClick={() => friendApi.sendRequest(u.userID).then(() => toast.success('Đã gửi lời mời'))}
                                                            style={{
                                                                background: 'rgba(99,102,241,.15)', border: '1px solid rgba(99,102,241,.3)',
                                                                borderRadius: 8, padding: '4px 10px', color: '#818cf8',
                                                                fontSize: 11, cursor: 'pointer', fontWeight: 600
                                                            }}>+ Kết bạn</button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        <div style={{ height: 1, background: 'rgba(255,255,255,.07)', margin: '8px 0' }} />
                                    </>
                                )}
                                {/* pending requests */}
                                {friendRequests.length > 0 && (
                                    <>
                                        <div style={{ fontSize: 11, color: '#818cf8', padding: '4px 6px 6px', fontWeight: 600, letterSpacing: .5 }}>
                                            LỜI MỜI ({friendRequests.length})
                                        </div>
                                        {friendRequests.map(req => {
                                            // Backend trả về 2 format khác nhau — normalize ở đây
                                            const senderName = req.sender?.fullName || req.sender?.username || req.FullName || req.Username || 'Unknown';
                                            const senderAvatar = req.sender?.avatarUrl || req.AvatarUrl;
                                            const senderUser = req.sender || { fullName: req.FullName, username: req.Username, avatarUrl: req.AvatarUrl };
                                            const reqID = req.requestID || req.RequestID;

                                            return (
                                                <div key={reqID} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, marginBottom: 4, background: 'rgba(99,102,241,.06)', border: '1px solid rgba(99,102,241,.12)' }}>
                                                    <Avatar user={senderUser} size={36} />
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{senderName}</div>
                                                        <div style={{ fontSize: 11, color: '#475569' }}>muốn kết bạn</div>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 5 }}>
                                                        <button onClick={() => friendApi.acceptRequest(reqID).then(() => { setFriendRequests(p => p.filter(r => (r.requestID || r.RequestID) !== reqID)); toast.success('Đã chấp nhận'); })}
                                                            style={{ background: '#22c55e', border: 'none', borderRadius: 7, padding: '4px 8px', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>✓</button>
                                                        <button onClick={() => friendApi.rejectRequest(reqID).then(() => { setFriendRequests(p => p.filter(r => (r.requestID || r.RequestID) !== reqID)); })}
                                                            style={{ background: 'rgba(239,68,68,.15)', border: 'none', borderRadius: 7, padding: '4px 8px', color: '#f87171', fontSize: 11, cursor: 'pointer' }}>✕</button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        <div style={{ height: 1, background: 'rgba(255,255,255,.07)', margin: '8px 0' }} />
                                    </>
                                )}
                                {/* friends list */}
                                <div style={{ fontSize: 11, color: '#475569', padding: '4px 6px 6px', fontWeight: 600, letterSpacing: .5 }}>BẠN BÈ ({friends.length})</div>
                                {friends.map(f => {
                                    const isBlocked = blockedByMe.map(Number).includes(Number(f.userID));
                                    const isBlockedByOther = blockedMe.map(Number).includes(Number(f.userID));
                                    return (
                                        <div key={f.userID} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, cursor: 'pointer', marginBottom: 2 }}
                                            onClick={() => openDirectChat(f)}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.04)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <Avatar user={f} size={36} showOnline={!isBlocked && !isBlockedByOther} />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', display: 'flex', alignItems: 'center' }}>
                                                    {f.fullName || f.username}
                                                    {isBlocked && <span style={{ fontSize: 9.5, color: '#f87171', background: 'rgba(239,68,68,.15)', padding: '1px 4px', borderRadius: 4, marginLeft: 6 }}>Đã chặn</span>}
                                                    {isBlockedByOther && <span style={{ fontSize: 9.5, color: '#94a3b8', background: 'rgba(148,163,184,.15)', padding: '1px 4px', borderRadius: 4, marginLeft: 6 }}>Bị chặn</span>}
                                                </div>
                                                <div style={{ fontSize: 11, color: f.isOnline ? '#22c55e' : '#475569' }}>{f.isOnline ? '● Online' : 'Offline'}</div>
                                            </div>
                                            <button onClick={() => openDirectChat(f)}
                                                style={{ background: 'rgba(99,102,241,.15)', border: '1px solid rgba(99,102,241,.25)', borderRadius: 8, padding: '4px 10px', color: '#818cf8', fontSize: 11, cursor: 'pointer' }}>
                                                💬
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {/* ── NOTIFICATIONS view ── */}
                    {view === 'notifs' && (
                        <>
                            <div style={{ padding: '18px 14px 12px', borderBottom: '1px solid rgba(255,255,255,.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Space Grotesk', color: '#f1f5f9' }}>Thông báo</span>
                                {unreadNotifs > 0 && (
                                    <button onClick={markAllRead} style={{ background: 'none', border: 'none', color: '#818cf8', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Đọc tất cả</button>
                                )}
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                                {notifications.length === 0 && (
                                    <div style={{ textAlign: 'center', color: '#475569', fontSize: 13, padding: 32 }}>Không có thông báo</div>
                                )}
                                {notifications.map(n => (
                                    <div key={n.notificationID} style={{
                                        padding: '10px 12px', borderRadius: 10, marginBottom: 4,
                                        background: n.isRead ? 'transparent' : 'rgba(99,102,241,.07)',
                                        border: n.isRead ? '1px solid transparent' : '1px solid rgba(99,102,241,.15)',
                                        cursor: 'pointer'
                                    }} onClick={() => { notifApi.markRead(n.notificationID); setNotifications(p => p.map(x => x.notificationID === n.notificationID ? { ...x, isRead: true } : x)); setUnreadNotifs(c => Math.max(0, c - 1)); }}>
                                        <div style={{ fontSize: 13, fontWeight: n.isRead ? 400 : 600, color: '#e2e8f0' }}>{n.title}</div>
                                        {n.content && <div style={{ fontSize: 12, color: '#475569', marginTop: 3 }}>{n.content}</div>}
                                        <div style={{ fontSize: 10.5, color: '#374151', marginTop: 4 }}>{fmtTime(n.createdAt)}</div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                    {/* ── SETTINGS view ── */}
                    {view === 'settings' && (
                        <>
                            <div style={{ padding: '18px 14px 12px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
                                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Space Grotesk', color: '#f1f5f9' }}>
                                    Hồ sơ & Cài đặt
                                </div>
                            </div>

                            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 14px' }}>

                                {/* ── Profile Card ── */}
                                <div style={{
                                    background: 'rgba(99,102,241,.06)',
                                    border: '1px solid rgba(99,102,241,.15)',
                                    borderRadius: 16, padding: '20px 16px',
                                    marginBottom: 20, textAlign: 'center'
                                }}>
                                    {/* Avatar với hover overlay — FIX: wrapper nhận hover, không phải overlay */}
                                    <SettingsAvatar
                                        localUser={localUser}
                                        onUpload={async (file) => {
                                            if (file.size > 5 * 1024 * 1024) { toast.error('Ảnh tối đa 5MB'); return; }
                                            try {
                                                const res = await fileApi.upload(file, () => { });
                                                await updateProfile({ avatarUrl: res.fileUrl });
                                            } catch {
                                                toast.error('Upload thất bại');
                                            }
                                        }}
                                    />
                                    <div style={{ marginTop: 12, fontSize: 15, fontWeight: 600, color: '#f1f5f9' }}>
                                        {localUser?.fullName || localUser?.username}
                                    </div>
                                    <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                                        @{localUser?.username}
                                    </div>
                                    {localUser?.role && localUser.role !== 'User' && (
                                        <div style={{
                                            display: 'inline-block', marginTop: 8,
                                            background: 'rgba(99,102,241,.2)', border: '1px solid rgba(99,102,241,.35)',
                                            borderRadius: 20, padding: '2px 10px',
                                            fontSize: 10, fontWeight: 600, color: '#818cf8', letterSpacing: .5
                                        }}>{localUser.role.toUpperCase()}</div>
                                    )}
                                </div>

                                {/* ── Đổi tên hiển thị ── */}
                                <div style={{ marginBottom: 16 }}>
                                    <div style={{
                                        fontSize: 10, color: '#475569', fontWeight: 600,
                                        marginBottom: 8, letterSpacing: .8,
                                        display: 'flex', alignItems: 'center', gap: 6
                                    }}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                                        TÊN HIỂN THỊ
                                    </div>
                                    <input
                                        value={editName}
                                        onChange={e => setEditName(e.target.value)}
                                        placeholder={localUser?.fullName || localUser?.username || 'Nhập tên mới...'}
                                        style={{
                                            width: '100%', padding: '10px 12px',
                                            background: 'rgba(255,255,255,.05)',
                                            border: '1px solid rgba(255,255,255,.09)',
                                            borderRadius: 10, color: '#e2e8f0', fontSize: 13,
                                            outline: 'none', fontFamily: 'inherit', marginBottom: 8,
                                            transition: 'border-color .15s', boxSizing: 'border-box'
                                        }}
                                        onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,.5)'}
                                        onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,.09)'}
                                        onKeyDown={async e => {
                                            if (e.key !== 'Enter' || !editName.trim() || savingProfile) return;
                                            setSavingProfile(true);
                                            await updateProfile({ fullName: editName.trim() });
                                            setEditName('');
                                            setSavingProfile(false);
                                        }}
                                    />
                                    <button
                                        onClick={async () => {
                                            if (!editName.trim() || savingProfile) return;
                                            setSavingProfile(true);
                                            await updateProfile({ fullName: editName.trim() });
                                            setEditName('');
                                            setSavingProfile(false);
                                        }}
                                        disabled={!editName.trim() || savingProfile}
                                        style={{
                                            width: '100%', padding: '10px',
                                            background: editName.trim() && !savingProfile
                                                ? 'linear-gradient(135deg,#6366f1,#8b5cf6)'
                                                : 'rgba(255,255,255,.05)',
                                            border: 'none', borderRadius: 10,
                                            color: editName.trim() && !savingProfile ? '#fff' : '#475569',
                                            cursor: editName.trim() && !savingProfile ? 'pointer' : 'not-allowed',
                                            fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                                            transition: 'all .2s', display: 'flex',
                                            alignItems: 'center', justifyContent: 'center', gap: 6
                                        }}>
                                        {savingProfile
                                            ? <><div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .7s linear infinite' }} /> Đang lưu...</>
                                            : '✓ Lưu tên hiển thị'
                                        }
                                    </button>
                                </div>

                                {/* ── Thông tin tài khoản ── */}
                                <div style={{ marginBottom: 16 }}>
                                    <div style={{
                                        fontSize: 10, color: '#475569', fontWeight: 600,
                                        marginBottom: 8, letterSpacing: .8,
                                        display: 'flex', alignItems: 'center', gap: 6
                                    }}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                                        THÔNG TIN TÀI KHOẢN
                                    </div>
                                    <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 12, overflow: 'hidden' }}>
                                        {[
                                            { icon: '👤', label: 'Username', value: `@${localUser?.username}` },
                                            { icon: '✉️', label: 'Email', value: localUser?.email || '—' },
                                            { icon: '📅', label: 'Tham gia', value: localUser?.createdAt ? new Date(localUser.createdAt).toLocaleDateString('vi-VN') : '—' },
                                        ].map((row, i, arr) => (
                                            <div key={row.label} style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                padding: '11px 14px',
                                                borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,.05)' : 'none',
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span style={{ fontSize: 14 }}>{row.icon}</span>
                                                    <span style={{ fontSize: 12, color: '#64748b' }}>{row.label}</span>
                                                </div>
                                                <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500, maxWidth: 130, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* ── Trạng thái online ── */}
                                <div style={{ marginBottom: 20 }}>
                                    <div style={{
                                        fontSize: 10, color: '#475569', fontWeight: 600,
                                        marginBottom: 8, letterSpacing: .8,
                                        display: 'flex', alignItems: 'center', gap: 6
                                    }}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
                                        TRẠNG THÁI
                                    </div>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)',
                                        borderRadius: 12, padding: '11px 14px'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 6px rgba(34,197,94,.6)' }} />
                                            <span style={{ fontSize: 13, color: '#94a3b8' }}>Đang hoạt động</span>
                                        </div>
                                        <span style={{
                                            fontSize: 10, background: 'rgba(34,197,94,.12)',
                                            border: '1px solid rgba(34,197,94,.25)',
                                            color: '#4ade80', padding: '2px 8px', borderRadius: 20, fontWeight: 600
                                        }}>ONLINE</span>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                    {/* ── AI view: just show prompt ── */}
                    {view === 'ai' && (
                        <div style={{ padding: '18px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Space Grotesk', color: '#f1f5f9' }}>AI Assistant</div>
                            <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
                                Trò chuyện thông minh được hỗ trợ bởi Claude AI. Đặt câu hỏi, viết code, dịch thuật và nhiều hơn nữa.
                            </div>
                        </div>
                    )}
                </div>

                {/* ── MAIN CONTENT AREA ─────────────────────────────────────────────── */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

                    {/* AI Panel */}
                    {view === 'ai' && <AIPanel connection={connection} />}

                    {/* Empty state for chats/friends/notifs with no conversation selected */}
                    {view !== 'ai' && !selectedConv && (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#374151' }}>
                            <div style={{ fontSize: 48, marginBottom: 16, opacity: .4 }}>
                                {view === 'notifs' ? '🔔' : view === 'friends' ? '👥' : '💬'}
                            </div>
                            <div style={{ fontSize: 17, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                                {view === 'notifs' ? 'Xem thông báo ở sidebar' : view === 'friends' ? 'Chọn bạn bè để nhắn tin' : 'Chọn một cuộc trò chuyện'}
                            </div>
                            <div style={{ fontSize: 13 }}>
                                {view === 'chats' && 'hoặc tạo cuộc trò chuyện mới từ danh sách bạn bè'}
                            </div>
                        </div>
                    )}

                    {/* Chat main */}
                    {view !== 'ai' && selectedConv && (
                        <div style={{ display: 'flex', flex: 1, minWidth: 0, overflow: 'hidden' }}>
                            {/* Chat area */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                {/* Chat header */}
                                <div style={{
                                    padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,.07)',
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    background: '#111318', flexShrink: 0
                                }}>
                                    {/* Thay dòng Avatar trong header thành: */}
                                    <div
                                        onClick={() => setShowConvPanel(p => !p)}
                                        style={{ cursor: 'pointer' }}
                                        title="Xem thông tin"
                                    >
                                        {selectedConv.conversationType === 'Direct' ? (
                                            <Avatar user={otherMember} size={38} showOnline />
                                        ) : (
                                            <div style={{
                                                width: 38, height: 38, borderRadius: 11,
                                                background: avatarColor(selectedConv.conversationID),
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18
                                            }}>👥</div>
                                        )}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, fontSize: 14.5, fontFamily: 'Space Grotesk', color: '#f1f5f9', display: 'flex', alignItems: 'center' }}>
                                            {convName}
                                            {isOtherBlocked && <span style={{ fontSize: 10, color: '#f87171', background: 'rgba(239,68,68,.15)', padding: '1px 5px', borderRadius: 4, marginLeft: 6 }}>Đã chặn</span>}
                                            {isBlockedByOther && <span style={{ fontSize: 10, color: '#94a3b8', background: 'rgba(148,163,184,.15)', padding: '1px 5px', borderRadius: 4, marginLeft: 6 }}>Bị chặn</span>}
                                        </div>
                                        <div style={{ fontSize: 11.5, color: otherMember?.isOnline ? '#22c55e' : '#475569' }}>{convStatus}</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        {/* Thay button 🔍 trong header thành: */}
                                        <button
                                            title="Tìm trong chat"
                                            onClick={() => { setShowMsgSearch(p => !p); setMsgSearch(''); }}
                                            style={{
                                                background: showMsgSearch ? 'rgba(99,102,241,.2)' : 'rgba(255,255,255,.05)',
                                                border: `1px solid ${showMsgSearch ? 'rgba(99,102,241,.4)' : 'rgba(255,255,255,.08)'}`,
                                                borderRadius: 9, padding: '7px 10px', color: showMsgSearch ? '#818cf8' : '#94a3b8',
                                                cursor: 'pointer', fontSize: 15, transition: 'all .15s'
                                            }}
                                        >🔍</button>
                                        {[
                                            { icon: '📞', title: 'Gọi thoại' },
                                            { icon: '📹', title: 'Gọi video' },
                                        ].map(btn => (
                                            <button key={btn.icon} title={btn.title} style={{
                                                background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)',
                                                borderRadius: 9, padding: '7px 10px', color: '#94a3b8',
                                                cursor: 'pointer', fontSize: 15, transition: 'all .15s'
                                            }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.1)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,.05)'}
                                            >{btn.icon}</button>
                                        ))}
                                    </div>
                                </div>

                                {/* Messages */}
                                <div ref={messagesRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 8px' }}>
                                    {/* Search bar — hiện khi bấm nút 🔍 */}
                                    {showMsgSearch && (
                                        <div style={{
                                            padding: '8px 20px',
                                            borderBottom: '1px solid rgba(255,255,255,.07)',
                                            background: '#111318', flexShrink: 0,
                                            display: 'flex', alignItems: 'center', gap: 8
                                        }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                                stroke="#475569" strokeWidth="2">
                                                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                                            </svg>
                                            <input
                                                autoFocus
                                                value={msgSearch}
                                                onChange={e => setMsgSearch(e.target.value)}
                                                placeholder="Tìm trong cuộc trò chuyện..."
                                                style={{
                                                    flex: 1, background: 'none', border: 'none', outline: 'none',
                                                    color: '#e2e8f0', fontSize: 13, fontFamily: 'inherit'
                                                }}
                                            />
                                            {msgSearch && (
                                                <span style={{ fontSize: 11, color: '#475569' }}>
                                                    {messages.filter(m =>
                                                        m.content?.toLowerCase().includes(msgSearch.toLowerCase())
                                                    ).length} kết quả
                                                </span>
                                            )}
                                            <button onClick={() => { setShowMsgSearch(false); setMsgSearch(''); }}
                                                style={{
                                                    background: 'none', border: 'none', color: '#475569',
                                                    cursor: 'pointer', fontSize: 13
                                                }}>✕</button>
                                        </div>
                                    )}
                                    {hasMore && (
                                        <div style={{ textAlign: 'center', marginBottom: 12 }}>
                                            <button onClick={loadMore} disabled={loadingMsgs} style={{
                                                background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)',
                                                borderRadius: 8, padding: '5px 16px', color: '#94a3b8', cursor: 'pointer', fontSize: 12
                                            }}>
                                                {loadingMsgs ? 'Đang tải...' : '↑ Tải thêm tin nhắn cũ hơn'}
                                            </button>
                                        </div>
                                    )}

                                    {loadingMsgs && messages.length === 0 && (
                                        <div style={{ textAlign: 'center', color: '#475569', padding: 40 }}>
                                            <div style={{ width: 24, height: 24, border: '2px solid rgba(255,255,255,.1)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin .7s linear infinite', margin: '0 auto 8px' }} />
                                            Đang tải tin nhắn...
                                        </div>
                                    )}

                                    {Object.entries(groupedMessages).map(([day, dayMsgs]) => (
                                        <div key={day}>
                                            <div style={{ textAlign: 'center', margin: '12px 0 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.07)' }} />
                                                <span style={{ fontSize: 11, color: '#374151', fontWeight: 500, padding: '2px 10px', background: 'rgba(255,255,255,.04)', borderRadius: 20, border: '1px solid rgba(255,255,255,.07)' }}>{day}</span>
                                                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.07)' }} />
                                            </div>
                                            {dayMsgs.map((msg, i) => {
                                                const isOwn = msg.sender?.userID === user?.userID;
                                                const prevMsg = dayMsgs[i - 1];
                                                const showAvatar = !prevMsg || prevMsg.sender?.userID !== msg.sender?.userID;
                                                const senderDisplayName = msg.sender
                                                    ? getMemberDisplayName(memberNicknames, selectedConv.conversationID, msg.sender)
                                                    : null;
                                                return (
                                                    <div key={msg.messageID} className="msg-appear">
                                                        <MessageBubble
                                                            msg={msg}
                                                            isOwn={isOwn}
                                                            showAvatar={showAvatar}
                                                            senderDisplayName={senderDisplayName}
                                                            onReact={reactToMessage}
                                                            onReply={setReplyTo}
                                                            onEdit={startEdit}
                                                            onDelete={deleteMessage}
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ))}

                                    {/* Typing indicator */}
                                    {convTyping.length > 0 && (
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 4 }}>
                                            <div style={{ width: 28 }} />
                                            <div>
                                                <div style={{ fontSize: 11, color: '#475569', marginBottom: 4 }}>
                                                    {convTyping.join(', ')} đang soạn...
                                                </div>
                                                <div style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.09)', borderRadius: '4px 16px 16px 16px', padding: '10px 14px', display: 'flex', gap: 5 }}>
                                                    {[0, .2, .4].map((d, i) => (
                                                        <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#475569', animation: `pulse 1.2s ${d}s infinite ease-in-out` }} />
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    <div ref={bottomRef} />
                                </div>

                                {/* Input area */}
                                <div style={{ padding: '10px 20px 16px', borderTop: '1px solid rgba(255,255,255,.07)', background: '#111318', flexShrink: 0, position: 'relative', zIndex: 1 }}>

                                    {isOtherBlocked ? (
                                        /* ── Banner khi MÌNH đã chặn người này ── */
                                        <div style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            gap: 12, background: 'rgba(239,68,68,.06)',
                                            border: '1px solid rgba(239,68,68,.18)',
                                            borderRadius: 14, padding: '12px 16px'
                                        }}>
                                            <div style={{ fontSize: 13, color: '#f87171' }}>
                                                🚫 Bạn đã chặn {otherMember?.fullName || otherMember?.username}. Bạn không thể gửi hoặc nhận tin nhắn.
                                            </div>
                                            <button
                                                onClick={() => toggleBlockUser(otherMember.userID)}
                                                style={{
                                                    flexShrink: 0, padding: '8px 14px',
                                                    background: 'rgba(239,68,68,.12)',
                                                    border: '1px solid rgba(239,68,68,.3)', borderRadius: 9,
                                                    color: '#f87171', cursor: 'pointer', fontSize: 12.5,
                                                    fontFamily: 'inherit', fontWeight: 600
                                                }}
                                            >Bỏ chặn</button>
                                        </div>
                                    ) : isBlockedByOther ? (
                                        /* ── Banner khi NGƯỜI KIA đã chặn mình ── */
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: 12,
                                            background: 'rgba(148,163,184,.06)',
                                            border: '1px solid rgba(148,163,184,.18)',
                                            borderRadius: 14, padding: '12px 16px'
                                        }}>
                                            <div style={{ fontSize: 13, color: '#94a3b8' }}>
                                                🚫 {otherMember?.fullName || otherMember?.username || 'Người này'} đã chặn bạn. Bạn không thể gửi tin nhắn.
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            {/* Reply preview */}
                                            {replyTo && (
                                                <div style={{
                                                    display: 'flex', alignItems: 'center', gap: 8,
                                                    background: 'rgba(99,102,241,.08)', border: '1px solid rgba(99,102,241,.2)',
                                                    borderRadius: '10px 10px 0 0', padding: '7px 12px', marginBottom: -6
                                                }}>
                                                    <div style={{ flex: 1, fontSize: 12, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        <span style={{ color: '#818cf8', fontWeight: 600 }}>↩ {replyTo.sender?.username}: </span>
                                                        {replyTo.content}
                                                    </div>
                                                    <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 13 }}>✕</button>
                                                </div>
                                            )}

                                            {/* Edit indicator */}
                                            {editMsg && (
                                                <div style={{
                                                    display: 'flex', alignItems: 'center', gap: 8,
                                                    background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.2)',
                                                    borderRadius: '10px 10px 0 0', padding: '7px 12px', marginBottom: -6
                                                }}>
                                                    <div style={{ flex: 1, fontSize: 12, color: '#fbbf24' }}>✏️ Đang chỉnh sửa tin nhắn</div>
                                                    <button onClick={() => { setEditMsg(null); setInput(''); }} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 13 }}>✕</button>
                                                </div>
                                            )}

                                            {/* Upload progress */}
                                            {uploadProgress !== null && (
                                                <div style={{ marginBottom: 8 }}>
                                                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Đang upload... {uploadProgress}%</div>
                                                    <div style={{ height: 3, background: 'rgba(255,255,255,.1)', borderRadius: 2 }}>
                                                        <div style={{ height: '100%', width: `${uploadProgress}%`, background: '#6366f1', borderRadius: 2, transition: 'width .2s' }} />
                                                    </div>
                                                </div>
                                            )}

                                            <div style={{
                                                display: 'flex', gap: 10, alignItems: 'flex-end',
                                                background: 'rgba(255,255,255,.05)',
                                                border: `1px solid ${replyTo || editMsg ? 'rgba(99,102,241,.3)' : 'rgba(255,255,255,.1)'}`,
                                                borderRadius: replyTo || editMsg ? '0 0 14px 14px' : 14,
                                                padding: '10px 14px', transition: 'border-color .2s'
                                            }}>
                                                <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} accept="image/*,.pdf,.doc,.docx,.zip,.txt" />
                                                <button onClick={() => fileInputRef.current?.click()} title="Đính kèm file" style={{
                                                    background: 'none', border: 'none', color: '#475569',
                                                    cursor: 'pointer', fontSize: 17, padding: '2px 4px',
                                                    flexShrink: 0, transition: 'color .15s'
                                                }}
                                                    onMouseEnter={e => e.currentTarget.style.color = '#818cf8'}
                                                    onMouseLeave={e => e.currentTarget.style.color = '#475569'}
                                                >📎</button>

                                                <textarea
                                                    value={input}
                                                    onChange={handleInputChange}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                                                        if (e.key === 'Escape') { setReplyTo(null); setEditMsg(null); setInput(''); }
                                                    }}
                                                    placeholder={editMsg ? 'Chỉnh sửa tin nhắn...' : 'Nhập tin nhắn... (Enter gửi, Shift+Enter xuống dòng)'}
                                                    rows={1}
                                                    style={{
                                                        flex: 1, background: 'none', border: 'none', outline: 'none',
                                                        color: '#e2e8f0', fontSize: 13.5, fontFamily: 'inherit',
                                                        resize: 'none', maxHeight: 120, lineHeight: 1.5
                                                    }}
                                                    onInput={e => {
                                                        e.target.style.height = 'auto';
                                                        e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                                                    }}
                                                    autoFocus
                                                />

                                                <button onClick={sendMessage} disabled={sending || !input.trim()} style={{
                                                    width: 36, height: 36, borderRadius: 11, flexShrink: 0,
                                                    background: (!sending && input.trim()) ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,.08)',
                                                    border: 'none',
                                                    cursor: (!sending && input.trim()) ? 'pointer' : 'not-allowed',
                                                    color: '#fff', fontSize: 15,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    transition: 'all .2s',
                                                    boxShadow: (!sending && input.trim()) ? '0 4px 12px rgba(99,102,241,.4)' : 'none'
                                                }}>
                                                    {sending
                                                        ? <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
                                                        : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                                                    }
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                            {/* ConvInfoPanel — bên phải chat, trong flex row */}
                            {showConvPanel && (
                                <ConvInfoPanel
                                    conv={selectedConv}
                                    currentUserID={user?.userID}
                                    onClose={() => setShowConvPanel(false)}
                                    onDeleteConv={clearConversation}
                                    onNicknameChange={handleNicknameChange}
                                    memberNicknames={memberNicknames}
                                    onMemberNicknameChange={handleMemberNicknameChange}
                                    onLeaveGroup={leaveGroup}
                                    onOpenAddMembers={() => { setAddMemberSelection([]); setShowAddMembers(true); }}
                                    onKickMember={kickMember}
                                    isBlocked={isOtherBlocked}
                                    onToggleBlock={toggleBlockUser}
                                />
                            )}
                        </div>
                    )}
                </div>
            </div>
            {/* ── MODAL ĐỔI MẬT KHẨU ── */}
            {showChangePassword && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, backdropFilter: 'blur(4px)'
                }} onClick={e => e.target === e.currentTarget && setShowChangePassword(false)}>
                    <div style={{
                        width: 380, background: '#13161d',
                        border: '1px solid rgba(255,255,255,.1)',
                        borderRadius: 20, padding: '28px 24px',
                        boxShadow: '0 24px 80px rgba(0,0,0,.6)'
                    }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 20, fontFamily: 'Space Grotesk' }}>
                            🔒 Đổi mật khẩu
                        </div>

                        {[
                            { key: 'oldPassword', label: 'Mật khẩu hiện tại', placeholder: 'Nhập mật khẩu cũ' },
                            { key: 'newPassword', label: 'Mật khẩu mới', placeholder: 'Ít nhất 8 ký tự' },
                            { key: 'confirm', label: 'Xác nhận mật khẩu mới', placeholder: 'Nhập lại mật khẩu mới' },
                        ].map(field => (
                            <div key={field.key} style={{ marginBottom: 14 }}>
                                <div style={{ fontSize: 11, color: '#475569', fontWeight: 600, marginBottom: 6, letterSpacing: .5 }}>
                                    {field.label.toUpperCase()}
                                </div>
                                <input
                                    type="password"
                                    placeholder={field.placeholder}
                                    value={pwForm[field.key]}
                                    onChange={e => setPwForm(p => ({ ...p, [field.key]: e.target.value }))}
                                    style={{
                                        width: '100%', padding: '10px 12px',
                                        background: 'rgba(255,255,255,.05)',
                                        border: '1px solid rgba(255,255,255,.09)',
                                        borderRadius: 10, color: '#e2e8f0', fontSize: 13,
                                        outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box'
                                    }}
                                    onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,.5)'}
                                    onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,.09)'}
                                />
                            </div>
                        ))}

                        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                            <button
                                onClick={() => { setShowChangePassword(false); setPwForm({ oldPassword: '', newPassword: '', confirm: '' }); }}
                                style={{
                                    flex: 1, padding: '10px', background: 'rgba(255,255,255,.06)',
                                    border: '1px solid rgba(255,255,255,.1)', borderRadius: 10,
                                    color: '#94a3b8', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13
                                }}>Huỷ</button>
                            <button
                                disabled={changingPw}
                                onClick={async () => {
                                    if (!pwForm.oldPassword || !pwForm.newPassword) return toast.error('Vui lòng điền đầy đủ');
                                    if (pwForm.newPassword.length < 8) return toast.error('Mật khẩu mới ít nhất 8 ký tự');
                                    if (pwForm.newPassword !== pwForm.confirm) return toast.error('Mật khẩu xác nhận không khớp');
                                    setChangingPw(true);
                                    try {
                                        await axios.put('/api/users/change-password', {
                                            oldPassword: pwForm.oldPassword,
                                            newPassword: pwForm.newPassword
                                        });
                                        toast.success('Đổi mật khẩu thành công!');
                                        setShowChangePassword(false);
                                        setPwForm({ oldPassword: '', newPassword: '', confirm: '' });
                                    } catch (err) {
                                        toast.error(err.response?.data?.error || 'Đổi mật khẩu thất bại');
                                    } finally {
                                        setChangingPw(false);
                                    }
                                }}
                                style={{
                                    flex: 1, padding: '10px',
                                    background: changingPw ? 'rgba(255,255,255,.05)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                                    border: 'none', borderRadius: 10, color: '#fff',
                                    cursor: changingPw ? 'not-allowed' : 'pointer',
                                    fontWeight: 600, fontFamily: 'inherit', fontSize: 13
                                }}>
                                {changingPw ? 'Đang lưu...' : 'Xác nhận'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* ── CREATE GROUP MODAL ──────────────────────────────────────────────── */}
            {showGroupModal && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, backdropFilter: 'blur(4px)'
                }} onClick={e => e.target === e.currentTarget && setShowGroupModal(false)}>
                    <div style={{
                        width: 420, background: '#13161d',
                        border: '1px solid rgba(255,255,255,.1)',
                        borderRadius: 20, padding: '28px 24px',
                        boxShadow: '0 24px 80px rgba(0,0,0,.6)'
                    }}>
                        <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Space Grotesk', color: '#f1f5f9', marginBottom: 20 }}>👥 Tạo nhóm chat</div>
                        <input
                            value={groupName}
                            onChange={e => setGroupName(e.target.value)}
                            placeholder="Tên nhóm..."
                            style={{
                                width: '100%', padding: '10px 14px',
                                background: 'rgba(255,255,255,.05)',
                                border: '1px solid rgba(255,255,255,.1)',
                                borderRadius: 10, color: '#e2e8f0', fontSize: 13.5,
                                outline: 'none', fontFamily: 'inherit', marginBottom: 14
                            }}
                        />
                        <div style={{ fontSize: 12, color: '#475569', marginBottom: 8, fontWeight: 600 }}>CHỌN THÀNH VIÊN ({selectedMembers.length} đã chọn)</div>
                        <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 16 }}>
                            {friends.map(f => (
                                <div key={f.userID} style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '7px 10px', borderRadius: 9, cursor: 'pointer', marginBottom: 2,
                                    background: selectedMembers.includes(f.userID) ? 'rgba(99,102,241,.12)' : 'transparent',
                                    border: selectedMembers.includes(f.userID) ? '1px solid rgba(99,102,241,.25)' : '1px solid transparent'
                                }} onClick={() => setSelectedMembers(p => p.includes(f.userID) ? p.filter(id => id !== f.userID) : [...p, f.userID])}>
                                    <Avatar user={f} size={32} />
                                    <span style={{ fontSize: 13, color: '#e2e8f0', flex: 1 }}>{f.fullName || f.username}</span>
                                    {selectedMembers.includes(f.userID) && <span style={{ color: '#6366f1', fontSize: 15 }}>✓</span>}
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button onClick={() => setShowGroupModal(false)} style={{
                                flex: 1, padding: '10px', background: 'rgba(255,255,255,.06)',
                                border: '1px solid rgba(255,255,255,.1)', borderRadius: 10,
                                color: '#94a3b8', cursor: 'pointer', fontFamily: 'inherit'
                            }}>Huỷ</button>
                            <button onClick={createGroup} style={{
                                flex: 1, padding: '10px',
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                border: 'none', borderRadius: 10, color: '#fff',
                                cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit'
                            }}>Tạo nhóm</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── ADD MEMBERS TO EXISTING GROUP MODAL ─────────────────────────────── */}
            {showAddMembers && selectedConv && (() => {
                const existingIDs = new Set((selectedConv.members || []).map(m => m.userID));
                const eligibleFriends = friends.filter(f => !existingIDs.has(f.userID));
                return (
                    <div style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 1000, backdropFilter: 'blur(4px)'
                    }} onClick={e => e.target === e.currentTarget && setShowAddMembers(false)}>
                        <div style={{
                            width: 420, background: '#13161d',
                            border: '1px solid rgba(255,255,255,.1)',
                            borderRadius: 20, padding: '28px 24px',
                            boxShadow: '0 24px 80px rgba(0,0,0,.6)'
                        }}>
                            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Space Grotesk', color: '#f1f5f9', marginBottom: 6 }}>
                                👥 Thêm thành viên
                            </div>
                            <div style={{ fontSize: 12.5, color: '#64748b', marginBottom: 18 }}>
                                Chọn bạn bè để thêm vào nhóm "{selectedConv.name}"
                            </div>
                            <div style={{ fontSize: 12, color: '#475569', marginBottom: 8, fontWeight: 600 }}>
                                CHỌN THÀNH VIÊN ({addMemberSelection.length} đã chọn)
                            </div>
                            <div style={{ maxHeight: 260, overflowY: 'auto', marginBottom: 16 }}>
                                {eligibleFriends.length === 0 ? (
                                    <div style={{ textAlign: 'center', color: '#475569', fontSize: 13, padding: '24px 0' }}>
                                        Tất cả bạn bè của bạn đã ở trong nhóm này
                                    </div>
                                ) : eligibleFriends.map(f => (
                                    <div key={f.userID} style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '7px 10px', borderRadius: 9, cursor: 'pointer', marginBottom: 2,
                                        background: addMemberSelection.includes(f.userID) ? 'rgba(99,102,241,.12)' : 'transparent',
                                        border: addMemberSelection.includes(f.userID) ? '1px solid rgba(99,102,241,.25)' : '1px solid transparent'
                                    }} onClick={() => setAddMemberSelection(p =>
                                        p.includes(f.userID) ? p.filter(id => id !== f.userID) : [...p, f.userID]
                                    )}>
                                        <Avatar user={f} size={32} />
                                        <span style={{ fontSize: 13, color: '#e2e8f0', flex: 1 }}>{f.fullName || f.username}</span>
                                        {addMemberSelection.includes(f.userID) && <span style={{ color: '#6366f1', fontSize: 15 }}>✓</span>}
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button onClick={() => { setShowAddMembers(false); setAddMemberSelection([]); }} style={{
                                    flex: 1, padding: '10px', background: 'rgba(255,255,255,.06)',
                                    border: '1px solid rgba(255,255,255,.1)', borderRadius: 10,
                                    color: '#94a3b8', cursor: 'pointer', fontFamily: 'inherit'
                                }}>Huỷ</button>
                                <button
                                    onClick={() => addMembersToGroup(selectedConv.conversationID, addMemberSelection)}
                                    disabled={addMemberSelection.length === 0}
                                    style={{
                                        flex: 1, padding: '10px',
                                        background: addMemberSelection.length
                                            ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                                            : 'rgba(255,255,255,.06)',
                                        border: 'none', borderRadius: 10,
                                        color: addMemberSelection.length ? '#fff' : '#475569',
                                        cursor: addMemberSelection.length ? 'pointer' : 'not-allowed',
                                        fontWeight: 600, fontFamily: 'inherit'
                                    }}>Thêm vào nhóm</button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </>
    );
}