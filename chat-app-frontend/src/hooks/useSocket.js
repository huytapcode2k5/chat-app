import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export function useSocket(token) {
    const socketRef = useRef(null);
    const [isConnected, setIsConnected] = useState(false);
    const [connectionObj, setConnectionObj] = useState(null); // ✅ trong function

    useEffect(() => {
        if (!token) {
            socketRef.current?._socket?.disconnect();
            socketRef.current = null;
            setIsConnected(false);
            setConnectionObj(null);
            return;
        }

        if (socketRef.current?._socket?.connected) return;

        const socket = io(SERVER_URL, {
            auth: { token },
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 5,
            reconnectionDelay: 2000,
        });

        socket.on('connect', () => { setIsConnected(true); });
        socket.on('disconnect', () => { setIsConnected(false); });
        socket.on('connect_error', () => { setIsConnected(false); });

        const EVENT_MAP = {
            'JoinConversation': 'join_conversation',
            'LeaveConversation': 'leave_conversation',
            'SendMessage': 'send_message',
            'EditMessage': 'edit_message',
            'DeleteMessage': 'delete_message',
            'MarkSeen': 'mark_seen',
            'Typing': 'typing',
            'ReactToMessage': 'react_to_message',
        };

        socketRef.current = {
            on: (event, handler) => socket.on(event, handler),
            off: (event, handler) => socket.off(event, handler),
            invoke: (method, ...args) => {
                const backendEvent = EVENT_MAP[method] || method;
                socket.emit(backendEvent, ...args);
                return Promise.resolve();
            },
            get state() {
                return socket.connected ? 'Connected' : 'Disconnected';
            },
            _socket: socket,
        };
        setConnectionObj(socketRef.current);

        return () => {
            socket.disconnect();
            socketRef.current = null;
            setIsConnected(false);
            setConnectionObj(null);
        };
    }, [token]);

    return { connection: connectionObj, isConnected };
}