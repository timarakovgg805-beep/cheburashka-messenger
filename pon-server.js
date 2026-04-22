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

app.use(express.json());

const JWT_SECRET = 'pon-secret-key-change-in-production';
const ADMIN_PASSWORD = 'qwerty321';
const USERS_FILE = path.join(__dirname, 'users.json');
const MESSAGES_FILE = path.join(__dirname, 'messages.json');
const SHAME_BOARD_FILE = path.join(__dirname, 'shame-board.json');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cheburashka';
let db;
let usersCollection;
let messagesCollection;
let shameBoardCollection;

async function connectDB() {
    try {
        const client = await MongoClient.connect(MONGODB_URI);
        db = client.db();
        usersCollection = db.collection('users');
        messagesCollection = db.collection('messages');
        shameBoardCollection = db.collection('shameBoard');
        console.log('Connected to MongoDB');
    } catch (err) {
        console.error('MongoDB connection error:', err);
        console.log('Falling back to JSON files');
    }
}

connectDB();

const onlineUsers = new Map();

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

app.use((req, res, next) => {
    const blockedFiles = ['/users.json', '/messages.json', '/shame-board.json'];
    if (blockedFiles.includes(req.path)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    next();
});

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'pon.html'));
});

app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;

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
        const { token, withUser } = req.body;

        if (!token) {
            return res.status(400).json({ error: 'Токен не предоставлен' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const username = decoded.username;

        const allMessages = await loadMessages();
        const filteredMessages = allMessages.filter(msg =>
            !((msg.from === username && msg.to === withUser) ||
              (msg.from === withUser && msg.to === username))
        );

        fs.writeFileSync(MESSAGES_FILE, JSON.stringify(filteredMessages, null, 2));

        res.json({ success: true });
    } catch (err) {
        console.error('Delete messages error:', err);
        res.status(500).json({ error: 'Ошибка удаления сообщений' });
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

        fs.writeFileSync(SHAME_BOARD_FILE, JSON.stringify([], null, 2));
        res.json({ success: true, message: 'Доска позора очищена' });
    } catch (err) {
        console.error('Clear shame board error:', err);
        res.status(500).json({ error: 'Ошибка очистки доски позора' });
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

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('auth', async (token) => {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            socket.username = decoded.username;

            // Получаем аватар пользователя
            const users = await loadUsers();
            const user = users.find(u => u.username === decoded.username);
            const avatar = user?.avatar || null;

            onlineUsers.set(socket.id, {
                id: socket.id,
                username: decoded.username,
                avatar: avatar,
                online: true
            });

            console.log(`${decoded.username} authenticated, total users: ${onlineUsers.size}`);
            io.emit('users-update', Array.from(onlineUsers.values()));
        } catch (err) {
            socket.emit('auth-error', 'Неверный токен');
        }
    });

    socket.on('get-users', () => {
        socket.emit('users-update', Array.from(onlineUsers.values()));
    });

    socket.on('send-message', async ({ to, message }) => {
        const fromUsername = onlineUsers.get(socket.id)?.username;
        const toUser = Array.from(onlineUsers.values()).find(u => u.id === to);

        if (fromUsername && toUser) {
            await saveMessage({
                from: fromUsername,
                to: toUser.username,
                type: 'message',
                content: message,
                timestamp: new Date().toISOString()
            });
        }

        io.to(to).emit('receive-message', {
            from: socket.id,
            fromName: onlineUsers.get(socket.id)?.username,
            message
        });
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

    socket.on('disconnect', () => {
        const user = onlineUsers.get(socket.id);
        onlineUsers.delete(socket.id);
        io.emit('users-update', Array.from(onlineUsers.values()));
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
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Pon server running on http://localhost:${PORT}`);
});
