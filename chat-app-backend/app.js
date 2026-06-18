const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
require('dotenv').config();
const { connectDB } = require('./src/config/db');
const { initSocket } = require('./src/sockets');

const app = express();

app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
}));
app.use(express.json());

// Static files — serve ảnh upload
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Routes
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/users', require('./src/routes/users'));
app.use('/api/conversations', require('./src/routes/conversations'));
app.use('/api/messages', require('./src/routes/messages'));
app.use('/api/friends', require('./src/routes/friends'));
app.use('/api/notifications', require('./src/routes/notifications'));
app.use('/api/files', require('./src/routes/upload'));
app.use('/api/ai', require('./src/routes/ai'));
app.use('/api/admin', require('./src/routes/admin'));
app.use('/api/blocks', require('./src/routes/blocks'));
const server = http.createServer(app);

connectDB().then(() => {
    const io = initSocket(server);  // ← lưu lại
    app.set('io', io);
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
        console.log(`🚀 Server chạy tại http://localhost:${PORT}`);
    });
}).catch(err => {
    console.error('❌ DB connect failed:', err.message);
    process.exit(1);
});