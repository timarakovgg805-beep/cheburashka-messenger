const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const { MongoClient } = require('mongodb');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const JWT_SECRET = 'pon-secret-key-change-in-production';
const ADMIN_PASSWORD = 'qwerty321';
const MODERATOR_PASSWORD = 'moderator123';
const USERS_FILE = path.join(__dirname, 'users.json');
const MESSAGES_FILE = path.join(__dirname, 'messages.json');
const SHAME_BOARD_FILE = path.join(__dirname, 'shame-board.json');
const ADMIN_SETTINGS_FILE = path.join(__dirname, 'admin-settings.json');
const LOGIN_LOGS_FILE = path.join(__dirname, 'login-logs.json');
const NOTIFICATIONS_FILE = path.join(__dirname, 'notifications.json');
const FEEDBACK_FILE = path.join(__dirname, 'feedback.json');

// OneSignal config
const ONESIGNAL_APP_ID = '5115d1ff-f610-4545-b9d4-8b2b3b87f2cd';
const ONESIGNAL_API_KEY = 'os_v2_app_kek5d77wcbculoourmvtxb7szxgw53oup46emqvf5awichyf5rrxu3fb6pi5ty5xuds4midtkr4fylkp7cmz5wlajb3bez5l7ks7k4q';

// Store player IDs
const playerIds = new Map();

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cheburashka';
let db;
let usersCollection;
let messagesCollection;
let shameBoardCollection;
let loginLogsCollection;
let adminSettingsCollection;

async function connectDB() {
    try {
        const client = await MongoClient.connect(MONGODB_URI);
        db = client.db();
        usersCollection = db.collection('users');
        messagesCollection = db.collection('messages');
        shameBoardCollection = db.collection('shameBoard');
        loginLogsCollection = db.collection('loginLogs');
        adminSettingsCollection = db.collection('adminSettings');

        // Initialize default admin settings
        const settings = await adminSettingsCollection.findOne({ _id: 'config' });
        if (!settings) {
            await adminSettingsCollection.insertOne({
                _id: 'config',
                registrationEnabled: true,
                announcement: null,
                blockedIPs: []
            });
        }

        console.log('Connected to MongoDB');
    } catch (err) {
        console.error('MongoDB connection error:', err);
        console.log('Falling back to JSON files');
    }
}

connectDB();

const onlineUsers = new Map();
const lastSeen = new Map(); // { username: timestamp }

async function loadUsers() {
    if (usersCollection) {
        try {
            return await usersCollection.find({}).toArray();
        } catch (err) {
            console.error('MongoDB loadUsers error:', err);
        }
    }
    // Fallback to JSON
    try {
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return [];
    }
}

async function saveUsers(users) {
    if (usersCollection) {
        try {
            await usersCollection.deleteMany({});
            if (users.length > 0) {
                await usersCollection.insertMany(users);
            }
            return;
        } catch (err) {
            console.error('MongoDB saveUsers error:', err);
        }
    }
    // Fallback to JSON
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

async function addUser(user) {
    if (usersCollection) {
        try {
            await usersCollection.insertOne(user);
            return;
        } catch (err) {
            console.error('MongoDB addUser error:', err);
        }
    }
    // Fallback to JSON
    const users = await loadUsers();
    users.push(user);
    await await saveUsers(users);
}

async function loadMessages() {
    if (messagesCollection) {
        try {
            return await messagesCollection.find({}).toArray();
        } catch (err) {
            console.error('MongoDB loadMessages error:', err);
        }
    }
    // Fallback to JSON
    try {
        const data = fs.readFileSync(MESSAGES_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return [];
    }
}

async function saveMessage(message) {
    if (messagesCollection) {
        try {
            await messagesCollection.insertOne(message);
            return;
        } catch (err) {
            console.error('MongoDB saveMessage error:', err);
        }
    }
    // Fallback to JSON
    const messages = await loadMessages();
    messages.push(message);
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
}

async function loadShameBoardMessages() {
    if (shameBoardCollection) {
        try {
            return await shameBoardCollection.find({}).toArray();
        } catch (err) {
            console.error('MongoDB loadShameBoardMessages error:', err);
        }
    }
    // Fallback to JSON
    try {
        const data = fs.readFileSync(SHAME_BOARD_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return [];
    }
}

async function saveShameBoardMessage(message) {
    if (shameBoardCollection) {
        try {
            await shameBoardCollection.insertOne(message);
            return;
        } catch (err) {
            console.error('MongoDB saveShameBoardMessage error:', err);
        }
    }
    // Fallback to JSON
    const messages = await loadShameBoardMessages();
    messages.push(message);
    fs.writeFileSync(SHAME_BOARD_FILE, JSON.stringify(messages, null, 2));
}

async function saveLoginLog(username) {
    const logEntry = {
        username,
        timestamp: new Date().toISOString()
    };

    if (loginLogsCollection) {
        try {
            await loginLogsCollection.insertOne(logEntry);
            return;
        } catch (err) {
            console.error('MongoDB saveLoginLog error:', err);
        }
    }
    // Fallback: можно добавить сохранение в JSON файл если нужно
}

async function getLoginLogs() {
    if (loginLogsCollection) {
        try {
            return await loginLogsCollection.find({}).sort({ timestamp: -1 }).limit(100).toArray();
        } catch (err) {
            console.error('MongoDB getLoginLogs error:', err);
        }
    }
    // Fallback to JSON
    try {
        const data = fs.readFileSync(LOGIN_LOGS_FILE, 'utf8');
        const logs = JSON.parse(data);
        return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 100);
    } catch (err) {
        return [];
    }
}

// Функции для работы с уведомлениями
function loadNotifications() {
    try {
        const data = fs.readFileSync(NOTIFICATIONS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return {};
    }
}

function saveNotifications(notifications) {
    fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(notifications, null, 2));
}

function addNotification(username, notification) {
    const notifications = loadNotifications();
    if (!notifications[username]) {
        notifications[username] = [];
    }
    notifications[username].push(notification);
    saveNotifications(notifications);

    // Send push notification via OneSignal
    sendPushNotification(username, notification);
}

async function sendPushNotification(username, notification) {
    const ids = playerIds.get(username);
    if (!ids || ids.length === 0) return;

    try {
        const https = require('https');
        const data = JSON.stringify({
            app_id: ONESIGNAL_APP_ID,
            include_player_ids: ids,
            headings: { en: 'Cheburashka' },
            contents: { en: `${notification.from}: ${notification.message.substring(0, 50)}` },
            data: { from: notification.from, messageKey: notification.messageKey },
            url: `https://yoursite.com/?chat=${notification.from}`
        });

        const options = {
            hostname: 'onesignal.com',
            path: '/api/v1/notifications',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${ONESIGNAL_API_KEY}`
            }
        };

        const req = https.request(options);
        req.on('error', console.error);
        req.write(data);
        req.end();
    } catch (err) {
        console.error('Push notification error:', err);
    }
}

function loadFeedback() {
    try {
        const data = fs.readFileSync(FEEDBACK_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return [];
    }
}

function saveFeedback(feedback) {
    fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(feedback, null, 2));
}

function getNotifications(username) {
    const notifications = loadNotifications();
    return notifications[username] || [];
}

function clearNotifications(username) {
    const notifications = loadNotifications();
    notifications[username] = [];
    saveNotifications(notifications);
}

async function saveLoginLog(log) {
    if (loginLogsCollection) {
        try {
            await loginLogsCollection.insertOne(log);
            return;
        } catch (err) {
            console.error('MongoDB saveLoginLog error:', err);
        }
    }
    // Fallback to JSON
    try {
        let logs = [];
        try {
            const data = fs.readFileSync(LOGIN_LOGS_FILE, 'utf8');
            logs = JSON.parse(data);
        } catch (err) {
            // File doesn't exist yet
        }
        logs.push(log);
        fs.writeFileSync(LOGIN_LOGS_FILE, JSON.stringify(logs, null, 2));
    } catch (err) {
        console.error('Save login log error:', err);
    }
}

async function loadAdminSettings() {
    if (adminSettingsCollection) {
        try {
            const settings = await adminSettingsCollection.findOne({ _id: 'config' });
            return settings || { registrationEnabled: true, announcement: null, blockedIPs: [] };
        } catch (err) {
            console.error('MongoDB loadAdminSettings error:', err);
        }
    }
    // Fallback to JSON
    try {
        const data = fs.readFileSync(ADMIN_SETTINGS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return { registrationEnabled: true, announcement: null, blockedIPs: [] };
    }
}

async function saveAdminSettings(settings) {
    if (adminSettingsCollection) {
        try {
            await adminSettingsCollection.updateOne(
                { _id: 'config' },
                { $set: settings },
                { upsert: true }
            );
            return;
        } catch (err) {
            console.error('MongoDB saveAdminSettings error:', err);
        }
    }
    // Fallback to JSON
    fs.writeFileSync(ADMIN_SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

app.use((req, res, next) => {
    const blockedFiles = ['/users.json', '/messages.json', '/shame-board.json', '/admin-settings.json', '/login-logs.json'];
    if (blockedFiles.includes(req.path)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    next();
});

app.use(express.static(__dirname, {
    index: false,
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
        }
    }
}));

app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.sendFile(path.join(__dirname, 'pon.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'pon.html'));
});

app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Check if registration is enabled
        const settings = await loadAdminSettings();
        if (settings.registrationEnabled === false) {
            return res.status(403).json({ error: 'Регистрация временно отключена' });
        }

        if (!username || !password) {
            return res.status(400).json({ error: 'Имя пользователя и пароль обязательны' });
        }

        if (username.length < 3) {
            return res.status(400).json({ error: 'Имя должно быть минимум 3 символа' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Пароль должен быть минимум 6 символов' });
        }

        const users = await loadUsers();

        if (users.find(u => u.username === username)) {
            return res.status(400).json({ error: 'Пользователь уже существует' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = {
            id: Date.now().toString(),
            username,
            password: hashedPassword,
            avatar: null,
            createdAt: new Date().toISOString()
        };

        await addUser(newUser);

        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });

        res.json({ success: true, token, username });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Ошибка регистрации' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Имя пользователя и пароль обязательны' });
        }

        const users = await loadUsers();
        const user = users.find(u => u.username === username);

        if (!user) {
            return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
        }

        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
        }

        // Логируем успешный вход
        await saveLoginLog(username);

        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });

        res.json({ success: true, token, username });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Ошибка входа' });
    }
});

app.post('/api/verify', async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({ error: 'Токен не предоставлен' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        res.json({ success: true, username: decoded.username });
    } catch (err) {
        res.status(401).json({ error: 'Неверный токен' });
    }
});

app.post('/api/messages', async (req, res) => {
    try {
        const { token, withUser } = req.body;

        if (!token) {
            return res.status(400).json({ error: 'Токен не предоставлен' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const username = decoded.username;

        const allMessages = await loadMessages();
        const userMessages = allMessages.filter(msg =>
            (msg.from === username && msg.to === withUser) ||
            (msg.from === withUser && msg.to === username)
        );

        res.json({ success: true, messages: userMessages });
    } catch (err) {
        res.status(401).json({ error: 'Неверный токен' });
    }
});

app.post('/api/messages/delete', async (req, res) => {
    try {
        const { token, messageKey, emoji } = req.body;

        if (!token || !messageKey || !emoji) {
            return res.status(400).json({ error: 'Недостаточно данных' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const username = decoded.username;

        const allMessages = await loadMessages();
        const msgIndex = allMessages.findIndex(msg => msg.messageKey === messageKey);
        
        if (msgIndex === -1) {
            return res.status(404).json({ error: 'Сообщение не найдено' });
        }

        if (!allMessages[msgIndex].reactions) {
            allMessages[msgIndex].reactions = [];
        }

        const existingIdx = allMessages[msgIndex].reactions.findIndex(r => r.emoji === emoji);
        if (existingIdx >= 0) {
            allMessages[msgIndex].reactions[existingIdx].users.push(username);
        } else {
            allMessages[msgIndex].reactions.push({ emoji, users: [username] });
        }

        if (messagesCollection) {
            await messagesCollection.updateOne(
                { messageKey },
                { $set: { reactions: allMessages[msgIndex].reactions } }
            );
        }
        fs.writeFileSync(MESSAGES_FILE, JSON.stringify(allMessages, null, 2));

        res.json({ success: true });
    } catch (err) {
        res.status(401).json({ error: 'Ошибка сохранения реакции' });
    }
});

app.post('/api/reactions', async (req, res) => {
    try {
        const { token, messageKey, emoji, add } = req.body;
        if (!token || !messageKey || !emoji) {
            return res.status(400).json({ error: 'Недостаточно данных' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const username = decoded.username;

        const allMessages = await loadMessages();
        const msgIndex = allMessages.findIndex(msg => msg.messageKey === messageKey);
        
        if (msgIndex === -1) {
            return res.status(404).json({ error: 'Сообщение не найдено' });
        }

        if (!allMessages[msgIndex].reactions) {
            allMessages[msgIndex].reactions = [];
        }

        const existingIdx = allMessages[msgIndex].reactions.findIndex(r => r.emoji === emoji);
        
        if (add) {
            if (existingIdx >= 0) {
                if (!allMessages[msgIndex].reactions[existingIdx].users.includes(username)) {
                    allMessages[msgIndex].reactions[existingIdx].users.push(username);
                }
            } else {
                allMessages[msgIndex].reactions.push({ emoji, users: [username] });
            }
        } else {
            if (existingIdx >= 0) {
                allMessages[msgIndex].reactions[existingIdx].users = 
                    allMessages[msgIndex].reactions[existingIdx].users.filter(u => u !== username);
                if (allMessages[msgIndex].reactions[existingIdx].users.length === 0) {
                    allMessages[msgIndex].reactions.splice(existingIdx, 1);
                }
            }
        }

        fs.writeFileSync(MESSAGES_FILE, JSON.stringify(allMessages, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(401).json({ error: 'Ошибка сохранения реакции' });
    }
});

app.post('/api/shame-board/messages', async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({ error: 'Токен не предоставлен' });
        }

        jwt.verify(token, JWT_SECRET);

        const messages = await loadShameBoardMessages();
        res.json({ success: true, messages });
    } catch (err) {
        console.error('Load shame board messages error:', err);
        res.status(500).json({ error: 'Ошибка загрузки сообщений' });
    }
});

app.post('/api/avatar/update', async (req, res) => {
    try {
        const { token, avatar } = req.body;

        if (!token) {
            return res.status(400).json({ error: 'Токен не предоставлен' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const username = decoded.username;

        const users = await loadUsers();
        const user = users.find(u => u.username === username);

        if (user) {
            user.avatar = avatar;
            await saveUsers(users);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Пользователь не найден' });
        }
    } catch (err) {
        console.error('Update avatar error:', err);
        res.status(500).json({ error: 'Ошибка обновления аватара' });
    }
});

app.get('/api/avatar/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const users = await loadUsers();
        const user = users.find(u => u.username === username);

        if (user && user.avatar) {
            res.json({ success: true, avatar: user.avatar });
        } else {
            res.json({ success: true, avatar: null });
        }
    } catch (err) {
        console.error('Get avatar error:', err);
        res.status(500).json({ error: 'Ошибка получения аватара' });
    }
});

app.post('/api/admin/verify', async (req, res) => {
    try {
        const { password } = req.body;

        if (password === ADMIN_PASSWORD) {
            res.json({ success: true });
        } else {
            res.status(401).json({ error: 'Неверный пароль' });
        }
    } catch (err) {
        console.error('Admin verify error:', err);
        res.status(500).json({ error: 'Ошибка проверки пароля' });
    }
});

app.post('/api/admin/users', async (req, res) => {
    try {
        const { password } = req.body;

        if (password !== ADMIN_PASSWORD) {
            return res.status(401).json({ error: 'Неверный пароль' });
        }

        const users = await loadUsers();
        const userList = users.map(u => ({
            username: u.username,
            createdAt: u.createdAt
        }));
        res.json({ success: true, total: users.length, users: userList });
    } catch (err) {
        console.error('Get users list error:', err);
        res.status(500).json({ error: 'Ошибка получения списка пользователей' });
    }
});

app.post('/api/admin/delete-user', async (req, res) => {
    try {
        const { password, username } = req.body;

        if (password !== ADMIN_PASSWORD) {
            return res.status(401).json({ error: 'Неверный пароль' });
        }

        if (!username) {
            return res.status(400).json({ error: 'Имя пользователя не указано' });
        }

        const users = await loadUsers();
        const filteredUsers = users.filter(u => u.username !== username);

        if (users.length === filteredUsers.length) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        await saveUsers(filteredUsers);
        res.json({ success: true, message: `Пользователь ${username} удален` });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ error: 'Ошибка удаления пользователя' });
    }
});

app.post('/api/admin/clear-shame-board', async (req, res) => {
    try {
        const { password } = req.body;

        if (password !== ADMIN_PASSWORD) {
            return res.status(401).json({ error: 'Неверный пароль' });
        }

        if (shameBoardCollection) {
            await shameBoardCollection.deleteMany({});
        } else {
            fs.writeFileSync(SHAME_BOARD_FILE, JSON.stringify([], null, 2));
        }

        // Уведомляем всех клиентов об очистке доски позора
        io.emit('shame-board-cleared');

        res.json({ success: true, message: 'Доска позора очищена' });
    } catch (err) {
        console.error('Clear shame board error:', err);
        res.status(500).json({ error: 'Ошибка очистки доски позора' });
    }
});

app.post('/api/admin/rename-shame-board', async (req, res) => {
    try {
        const { password, newName } = req.body;

        if (password !== ADMIN_PASSWORD && password !== MODERATOR_PASSWORD) {
            return res.status(401).json({ error: 'Неверный пароль' });
        }

        if (!newName || newName.trim().length === 0) {
            return res.status(400).json({ error: 'Название не может быть пустым' });
        }

        const configPath = path.join(__dirname, 'shame-board-config.json');
        fs.writeFileSync(configPath, JSON.stringify({ name: newName.trim() }, null, 2));

        res.json({ success: true, message: 'Доска позора переименована' });
    } catch (err) {
        console.error('Rename shame board error:', err);
        res.status(500).json({ error: 'Ошибка переименования доски позора' });
    }
});

app.get('/api/shame-board-name', (req, res) => {
    try {
        const configPath = path.join(__dirname, 'shame-board-config.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            res.json({ success: true, name: config.name || 'Доска позора' });
        } else {
            res.json({ success: true, name: 'Доска позора' });
        }
    } catch (err) {
        console.error('Get shame board name error:', err);
        res.json({ success: true, name: 'Доска позора' });
    }
});

app.get('/api/shame-board-info', (req, res) => {
    try {
        const configPath = path.join(__dirname, 'shame-board-config.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            res.json({
                success: true,
                name: config.name || 'Доска позора',
                avatar: config.avatar || null
            });
        } else {
            res.json({ success: true, name: 'Доска позора', avatar: null });
        }
    } catch (err) {
        console.error('Get shame board info error:', err);
        res.json({ success: true, name: 'Доска позора', avatar: null });
    }
});

app.post('/api/admin/shame-board-avatar', async (req, res) => {
    try {
        const { password, avatar } = req.body;

        if (password !== ADMIN_PASSWORD && password !== MODERATOR_PASSWORD) {
            return res.status(401).json({ error: 'Неверный пароль' });
        }

        const configPath = path.join(__dirname, 'shame-board-config.json');
        let config = { name: 'Доска позора' };

        if (fs.existsSync(configPath)) {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }

        config.avatar = avatar;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        res.json({ success: true, message: 'Аватарка доски позора обновлена' });
    } catch (err) {
        console.error('Update shame board avatar error:', err);
        res.status(500).json({ error: 'Ошибка обновления аватарки' });
    }
});

app.post('/api/admin/login-logs', async (req, res) => {
    try {
        const { password } = req.body;

        if (password !== ADMIN_PASSWORD) {
            return res.status(401).json({ error: 'Неверный пароль' });
        }

        const logs = await getLoginLogs();
        res.json({ success: true, logs });
    } catch (err) {
        console.error('Get login logs error:', err);
        res.status(500).json({ error: 'Ошибка получения логов' });
    }
});

app.get('/api/users/list', async (req, res) => {
    try {
        const users = await loadUsers();
        const userList = users.map(u => ({
            username: u.username,
            createdAt: u.createdAt
        }));
        res.json({ success: true, total: users.length, users: userList });
    } catch (err) {
        console.error('Get users list error:', err);
        res.status(500).json({ error: 'Ошибка получения списка пользователей' });
    }
});

// Save OneSignal player ID
app.post('/api/onesignal-register', async (req, res) => {
    try {
        const { playerId, username } = req.body;
        if (!playerId || !username) {
            return res.status(400).json({ error: 'playerId and username required' });
        }
        if (!playerIds.has(username)) {
            playerIds.set(username, []);
        }
        const ids = playerIds.get(username);
        if (!ids.includes(playerId)) {
            ids.push(playerId);
        }
        console.log(`Registered OneSignal ID for ${username}: ${playerId}`);
        res.json({ success: true });
    } catch (err) {
        console.error('OneSignal register error:', err);
        res.status(500).json({ error: 'Ошибка регистрации' });
    }
});

// Search users
app.post('/api/search-users', async (req, res) => {
    try {
        const { query } = req.body;

        if (!query || query.trim().length === 0) {
            return res.json({ success: true, users: [] });
        }

        const users = await loadUsers();
        const searchQuery = query.toLowerCase().trim();

        // Ищем пользователей по имени (регистронезависимый поиск)
        const foundUsers = users
            .filter(u => u.username.toLowerCase().includes(searchQuery))
            .map(u => ({ username: u.username }))
            .slice(0, 20); // Ограничиваем результаты 20 пользователями

        res.json({ success: true, users: foundUsers });
    } catch (err) {
        console.error('Search users error:', err);
        res.status(500).json({ error: 'Ошибка поиска пользователей' });
    }
});

// Get top active users
app.post('/api/admin/top-users', async (req, res) => {
    try {
        const { password } = req.body;

        if (password !== ADMIN_PASSWORD && password !== MODERATOR_PASSWORD) {
            return res.status(401).json({ error: 'Неверный пароль' });
        }

        let topUsers = [];

        if (messagesCollection) {
            const pipeline = [
                { $group: { _id: '$from', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ];
            topUsers = await messagesCollection.aggregate(pipeline).toArray();
        } else {
            // Fallback to JSON
            const messages = await loadMessages();
            const userCounts = {};
            messages.forEach(msg => {
                if (msg.from) {
                    userCounts[msg.from] = (userCounts[msg.from] || 0) + 1;
                }
            });
            topUsers = Object.entries(userCounts)
                .map(([username, count]) => ({ _id: username, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 10);
        }

        const result = topUsers.map(u => ({ username: u._id, messageCount: u.count }));
        res.json({ success: true, users: result });
    } catch (err) {
        console.error('Get top users error:', err);
        res.status(500).json({ error: 'Ошибка получения статистики' });
    }
});

// Get/Set announcement
app.post('/api/admin/announcement', async (req, res) => {
    try {
        const { password, announcement } = req.body;

        if (password !== ADMIN_PASSWORD) {
            return res.status(401).json({ error: 'Неверный пароль' });
        }

        const settings = await loadAdminSettings();
        settings.announcement = announcement || null;
        await saveAdminSettings(settings);

        res.json({ success: true });
    } catch (err) {
        console.error('Set announcement error:', err);
        res.status(500).json({ error: 'Ошибка сохранения объявления' });
    }
});

app.get('/api/announcement', async (req, res) => {
    try {
        const settings = await loadAdminSettings();
        res.json({ success: true, announcement: settings.announcement || null });
    } catch (err) {
        console.error('Get announcement error:', err);
        res.status(500).json({ error: 'Ошибка получения объявления' });
    }
});

// Toggle registration
app.post('/api/admin/toggle-registration', async (req, res) => {
    try {
        const { password, enabled } = req.body;

        if (password !== ADMIN_PASSWORD) {
            return res.status(401).json({ error: 'Неверный пароль' });
        }

        const settings = await loadAdminSettings();
        settings.registrationEnabled = enabled;
        await saveAdminSettings(settings);

        res.json({ success: true, enabled });
    } catch (err) {
        console.error('Toggle registration error:', err);
        res.status(500).json({ error: 'Ошибка изменения настройки' });
    }
});

app.get('/api/registration-status', async (req, res) => {
    try {
        const settings = await loadAdminSettings();
        res.json({ success: true, enabled: settings.registrationEnabled !== false });
    } catch (err) {
        console.error('Get registration status error:', err);
        res.status(500).json({ error: 'Ошибка получения статуса' });
    }
});

// IP management
app.post('/api/admin/ip-history', async (req, res) => {
    try {
        const { password, username } = req.body;

        if (password !== ADMIN_PASSWORD) {
            return res.status(401).json({ error: 'Неверный пароль' });
        }

        let logs = [];

        if (loginLogsCollection) {
            const query = username ? { username } : {};
            logs = await loginLogsCollection
                .find(query)
                .sort({ timestamp: -1 })
                .limit(100)
                .toArray();
        } else {
            // Fallback to JSON
            logs = await getLoginLogs();
            if (username) {
                logs = logs.filter(log => log.username === username);
            }
        }

        res.json({ success: true, history: logs });
    } catch (err) {
        console.error('Get IP history error:', err);
        res.status(500).json({ error: 'Ошибка получения истории' });
    }
});

app.post('/api/admin/block-ip', async (req, res) => {
    try {
        const { password, ip, reason } = req.body;

        if (password !== ADMIN_PASSWORD) {
            return res.status(401).json({ error: 'Неверный пароль' });
        }

        const settings = await loadAdminSettings();
        const exists = settings.blockedIPs.find(b =>
            typeof b === 'string' ? b === ip : b.ip === ip
        );

        if (!exists) {
            settings.blockedIPs.push({
                ip: ip,
                reason: reason || 'Нарушение правил',
                blockedAt: new Date().toISOString()
            });
            await saveAdminSettings(settings);
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Block IP error:', err);
        res.status(500).json({ error: 'Ошибка блокировки IP' });
    }
});

app.post('/api/admin/unblock-ip', async (req, res) => {
    try {
        const { password, ip } = req.body;

        if (password !== ADMIN_PASSWORD) {
            return res.status(401).json({ error: 'Неверный пароль' });
        }

        const settings = await loadAdminSettings();
        settings.blockedIPs = settings.blockedIPs.filter(blockedIP =>
            typeof blockedIP === 'string' ? blockedIP !== ip : blockedIP.ip !== ip
        );
        await saveAdminSettings(settings);

        res.json({ success: true });
    } catch (err) {
        console.error('Unblock IP error:', err);
        res.status(500).json({ error: 'Ошибка разблокировки IP' });
    }
});

app.post('/api/admin/blocked-ips', async (req, res) => {
    try {
        const { password } = req.body;

        if (password !== ADMIN_PASSWORD) {
            return res.status(401).json({ error: 'Неверный пароль' });
        }

        const settings = await loadAdminSettings();
        res.json({ success: true, ips: settings.blockedIPs || [] });
    } catch (err) {
        console.error('Get blocked IPs error:', err);
        res.status(500).json({ error: 'Ошибка получения списка' });
    }
});


io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Get client IP
    const clientIP = socket.handshake.headers['x-forwarded-for']?.split(',')[0] ||
                     socket.handshake.address;

    socket.on('auth', async (token) => {
        try {
            // Check if IP is blocked
            const settings = await loadAdminSettings();
            if (settings.blockedIPs && settings.blockedIPs.length > 0) {
                const blocked = settings.blockedIPs.find(b =>
                    typeof b === 'string' ? b === clientIP : b.ip === clientIP
                );
                if (blocked) {
                    const reason = typeof blocked === 'string' ? 'Нарушение правил' : (blocked.reason || 'Нарушение правил');
                    socket.emit('auth-error', `Ваш IP-адрес заблокирован. Причина: ${reason}`);
                    socket.disconnect();
                    return;
                }
            }

            const decoded = jwt.verify(token, JWT_SECRET);
            socket.username = decoded.username;

            // Получаем аватар пользователя
            const users = await loadUsers();
            const user = users.find(u => u.username === decoded.username);
            const avatar = user?.avatar || null;

            // Log login with IP
            await saveLoginLog({
                username: decoded.username,
                ip: clientIP,
                timestamp: new Date(),
                userAgent: socket.handshake.headers['user-agent']
            });

            onlineUsers.set(socket.id, {
                id: socket.id,
                username: decoded.username,
                avatar: avatar,
                online: true,
                lastSeen: Date.now()
            });
            
            lastSeen.set(decoded.username, Date.now());

            console.log(`${decoded.username} authenticated from ${clientIP}, total users: ${onlineUsers.size}`);
            io.emit('users-update', Array.from(onlineUsers.values()));

            // Отправляем уведомления пользователю
            const notifications = getNotifications(decoded.username);
            if (notifications.length > 0) {
                socket.emit('notifications', notifications);
                clearNotifications(decoded.username);
            }
        } catch (err) {
            socket.emit('auth-error', 'Неверный токен');
        }
    });

    socket.on('get-users', () => {
        const userList = Array.from(onlineUsers.values()).map(u => ({
            ...u,
            lastSeen: lastSeen.get(u.username) || Date.now()
        }));
        socket.emit('users-update', userList);
    });

    // Тайп-индикатор
    socket.on('typing', ({ to }) => {
        io.to(to).emit('user-typing', {
            from: socket.id,
            username: onlineUsers.get(socket.id)?.username
        });
    });
    
    // Отметка о прочтении
    socket.on('message-read', ({ to }) => {
        const fromUsername = onlineUsers.get(socket.id)?.username;
        io.to(to).emit('messages-read', {
            by: fromUsername
        });
    });

    socket.on('send-message', async ({ to, message, replyTo }) => {
        const fromUsername = onlineUsers.get(socket.id)?.username;
        const toUser = Array.from(onlineUsers.values()).find(u => u.id === to);

        if (fromUsername) {
            // Определяем имя получателя
            let toUsername = toUser ? toUser.username : to;

            await saveMessage({
                from: fromUsername,
                to: toUsername,
                type: 'message',
                content: message,
                timestamp: new Date().toISOString(),
                messageKey: `${fromUsername}-${Date.now()}`,
                reactions: []
            });

            // Если пользователь онлайн, отправляем сообщение
            if (toUser) {
                io.to(to).emit('receive-message', {
                    from: socket.id,
                    fromName: fromUsername,
                    message,
                    messageKey: `${fromUsername}-${Date.now()}`,
                    replyTo: replyTo
                });
            } else {
                // Если пользователь оффлайн, создаем уведомление
                addNotification(toUsername, {
                    from: fromUsername,
                    message: message,
                    timestamp: new Date().toISOString(),
                    messageKey: `${fromUsername}-${Date.now()}`
                });
            }
        }
    });

    socket.on('send-shame-message', async ({ message }) => {
        const fromUsername = onlineUsers.get(socket.id)?.username;

        if (fromUsername) {
            await saveShameBoardMessage({
                from: fromUsername,
                content: message,
                timestamp: new Date().toISOString()
            });

            io.emit('receive-shame-message', {
                from: fromUsername,
                message
            });
        }
    });

    socket.on('send-file', async ({ to, file }) => {
        const fromUsername = onlineUsers.get(socket.id)?.username;
        const toUser = Array.from(onlineUsers.values()).find(u => u.id === to);

        if (fromUsername && toUser) {
            await saveMessage({
                from: fromUsername,
                to: toUser.username,
                type: 'file',
                content: file,
                timestamp: new Date().toISOString()
            });
        }

        io.to(to).emit('receive-file', {
            from: socket.id,
            fromName: onlineUsers.get(socket.id)?.username,
            file
        });
    });

    socket.on('send-voice', async ({ to, voice }) => {
        const fromUsername = onlineUsers.get(socket.id)?.username;
        const toUser = Array.from(onlineUsers.values()).find(u => u.id === to);

        if (fromUsername) {
            let toUsername = toUser ? toUser.username : to;

            await saveMessage({
                from: fromUsername,
                to: toUsername,
                type: 'voice',
                content: voice,
                timestamp: new Date().toISOString()
            });

            if (toUser) {
                io.to(to).emit('receive-voice', {
                    from: socket.id,
                    fromName: fromUsername,
                    voice
                });
            } else {
                addNotification(toUsername, {
                    from: fromUsername,
                    message: '🎤 Голосовое сообщение',
                    timestamp: new Date().toISOString()
                });
            }
        }
    });

    socket.on('disconnect', () => {
        const user = onlineUsers.get(socket.id);
        if (user?.username) {
            lastSeen.set(user.username, Date.now());
            // Remove player ID on disconnect
            playerIds.delete(user.username);
        }
        onlineUsers.delete(socket.id);
        io.emit('users-update', Array.from(onlineUsers.values()));
        // Обновляем last-seen для всех
        const userList = Array.from(onlineUsers.values()).map(u => ({
            ...u,
            lastSeen: lastSeen.get(u.username) || Date.now()
        }));
        io.emit('users-update', userList);
        console.log(`${user?.username || 'User'} disconnected, total users: ${onlineUsers.size}`);
    });

    // WebRTC сигналинг
    socket.on('call-offer', ({ to, offer, callType }) => {
        io.to(to).emit('call-offer', {
            from: socket.id,
            fromName: onlineUsers.get(socket.id)?.username,
            offer,
            callType
        });
    });

    socket.on('call-answer', ({ to, answer }) => {
        io.to(to).emit('call-answer', { answer });
    });

    socket.on('ice-candidate', ({ to, candidate }) => {
        io.to(to).emit('ice-candidate', { candidate });
    });

    socket.on('call-ended', ({ to }) => {
        io.to(to).emit('call-ended');
    });

    socket.on('call-rejected', ({ to }) => {
        io.to(to).emit('call-rejected');
    });

    socket.on('screen-share-stopped', ({ to }) => {
        io.to(to).emit('screen-share-stopped');
    });

    socket.on('avatar-updated', async () => {
        // Обновляем информацию о пользователе
        const users = await loadUsers();
        const user = users.find(u => u.username === socket.username);
        if (user && onlineUsers.has(socket.id)) {
            const onlineUser = onlineUsers.get(socket.id);
            onlineUser.avatar = user.avatar;
            onlineUsers.set(socket.id, onlineUser);
            io.emit('users-update', Array.from(onlineUsers.values()));
        }
    });

    socket.on('toggle-reaction', ({ messageKey, emoji, add }) => {
        // Отправляем реакцию всем остальным пользователям
        socket.broadcast.emit('receive-reaction', {
            messageKey,
            emoji,
            add
        });
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Pon server running on http://localhost:${PORT}`);
});

// Feedback endpoint
app.post('/api/feedback', (req, res) => {
    try {
        const { username, message } = req.body;

        if (!username || !message) {
            return res.json({ success: false, error: 'Заполните все поля' });
        }

        const feedback = loadFeedback();
        feedback.push({
            username,
            message,
            timestamp: new Date().toISOString()
        });
        saveFeedback(feedback);

        res.json({ success: true });
    } catch (err) {
        console.error('Feedback error:', err);
        res.json({ success: false, error: 'Ошибка отправки' });
    }
});

// Get feedback (admin/moderator only)
app.post('/api/admin/feedback', (req, res) => {
    try {
        const { password } = req.body;

        if (password !== ADMIN_PASSWORD && password !== MODERATOR_PASSWORD) {
            return res.json({ success: false, error: 'Неверный пароль' });
        }

        const feedback = loadFeedback();
        res.json({ success: true, feedback });
    } catch (err) {
        console.error('Get feedback error:', err);
        res.json({ success: false, error: 'Ошибка загрузки' });
    }
});
