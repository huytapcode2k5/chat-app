import axios from 'axios';

/* ─────────────────────────────────────────────
   All API calls go through here.
   axios base URL + Bearer token injected
   by the interceptor in AuthContext.
───────────────────────────────────────────── */

// ── Conversations ────────────────────────────
export const conversationApi = {
    getAll: () => axios.get('/api/conversations').then(r => r.data),
    create: (payload) => axios.post('/api/conversations', payload).then(r => r.data),
    getMembers: (id) => axios.get(`/api/conversations/${id}/members`).then(r => r.data),
    addMember: (id, userID) => axios.post(`/api/conversations/${id}/members`, { userID }).then(r => r.data),
    leave: (id) => axios.delete(`/api/conversations/${id}/leave`).then(r => r.data),
    updateGroup: (id, payload) => axios.put(`/api/conversations/${id}`, payload).then(r => r.data),
};

// ── Messages ─────────────────────────────────
export const messageApi = {
    getPage: (convID, page = 1, pageSize = 50, beforeID = null) =>
        axios.get(`/api/messages/${convID}`, { params: { page, pageSize, beforeID } }).then(r => r.data),
    send: (payload) => axios.post('/api/messages', payload).then(r => r.data),
    edit: (id, content) => axios.put(`/api/messages/${id}`, { content }).then(r => r.data),
    delete: (id) => axios.delete(`/api/messages/${id}`).then(r => r.data),
    markSeen: (convID, lastID) => axios.post(`/api/messages/${convID}/seen`, { lastMessageID: lastID }),
};

// ── Friends ──────────────────────────────────
export const friendApi = {
    getList: () => axios.get('/api/friends').then(r => r.data),
    getPendingRequests: () => axios.get('/api/friends/requests').then(r => r.data),
    // SỬA:
    sendRequest: (receiverID) => axios.post(`/api/friends/request/${receiverID}`).then(r => r.data),
    acceptRequest: (id) => axios.put(`/api/friends/accept/${id}`).then(r => r.data),
    rejectRequest: (id) => axios.delete(`/api/friends/reject/${id}`).then(r => r.data),
    unfriend: (id) => axios.delete(`/api/friends/${id}`).then(r => r.data),
    search: (q) => axios.get('/api/users/search', { params: { q } }).then(r => r.data),
};

// ── Notifications ────────────────────────────
export const notifApi = {
    getAll: () => axios.get('/api/notifications').then(r => r.data),
    markRead: (id) => axios.put(`/api/notifications/${id}/read`).then(r => r.data),
    markAllRead: () => axios.put('/api/notifications/read-all').then(r => r.data),
};

// ── AI ───────────────────────────────────────
export const aiApi = {
    getConversations: () => axios.get('/api/ai/conversations').then(r => r.data),
    getMessages: (id) => axios.get(`/api/ai/conversations/${id}/messages`).then(r => r.data),
    send: (payload) => axios.post('/api/ai/chat', payload).then(r => r.data),
    deleteConversation: (id) => axios.delete(`/api/ai/conversations/${id}`).then(r => r.data),
};

// ── File Upload ──────────────────────────────
export const fileApi = {
    upload: (file, onProgress) => {
        const fd = new FormData();
        fd.append('file', file);
        return axios.post('/api/files/upload', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: e => {
                if (onProgress) onProgress(Math.round((e.loaded * 100) / e.total));
            },
        }).then(r => r.data);
    },
};

// ── User / Profile ───────────────────────────
export const userApi = {
    getMe: () => axios.get('/api/auth/me').then(r => r.data),
    // SỬA:
    updateProfile: (payload) => axios.put('/api/users/profile', payload).then(r => r.data),
    changePassword: (payload) => axios.put('/api/users/me/password', payload).then(r => r.data),
    uploadAvatar: (file) => fileApi.upload(file),
};

// ── Admin ────────────────────────────────────
export const adminApi = {
    getStats: () => axios.get('/api/admin/stats').then(r => r.data),
    getUsers: (page, q) => axios.get('/api/admin/users', { params: { page, q } }).then(r => r.data),
    blockUser: (id, block) => axios.put(`/api/admin/users/${id}/block`, { block }).then(r => r.data),
    deleteUser: (id) => axios.delete(`/api/admin/users/${id}`).then(r => r.data),
    getConversations: (page) => axios.get('/api/admin/conversations', { params: { page } }).then(r => r.data),
};