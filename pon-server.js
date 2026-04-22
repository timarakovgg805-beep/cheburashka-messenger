const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

const JWT_SECRET = 'pon-secret-key-change-in-production';
const USERS_FILE = path.join(__dirname, 'users.json');
const MESSAGES_FILE = path.join(__dirname, 'messages.json');
const SHAME_BOARD_FILE = path.join(__dirname, 'shame-board.json');

const onlineUsers = new Map();

function loadUsers() {
    try {
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return [];
    }
}

function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function loadMessages() {
    try {
        const data = fs.readFileSync(MESSAGES_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return [];
    }
}

function saveMessage(message) {
    const messages = loadMessages();
    messages.push(message);
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
}

function loadShameBoardMessages() {
    try {
        const data = fs.readFileSync(SHAME_BOARD_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return [];
    }
}

function saveShameBoardMessage(message) {
    const messages = loadShameBoardMessages();
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

        const users = loadUsers();

        if (users.find(u => u.username === username)) {
            return res.status(400).json({ error: 'Пользователь уже существует' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        users.push({
            id: Date.now().toString(),
            username,
            password: hashedPassword,
            avatar: null,
            createdAt: new Date().toISOString()
        });

        saveUsers(users);

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

        const users = loadUsers();
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

        const allMessages = loadMessages();
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

        const allMessages = loadMessages();
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

        const messages = loadShameBoardMessages();
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

        const users = loadUsers();
        const user = users.find(u => u.username === username);

        if (user) {
            user.avatar = avatar;
            saveUsers(users);
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
        const users = loadUsers();
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

app.get('/api/users/list', async (req, res) => {
    try {
        const users = loadUsers();
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

    socket.on('auth', (token) => {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            socket.username = decoded.username;

            // Получаем аватар пользователя
            const users = loadUsers();
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

    socket.on('send-message', ({ to, message }) => {
        const fromUsername = onlineUsers.get(socket.id)?.username;
        const toUser = Array.from(onlineUsers.values()).find(u => u.id === to);

        if (fromUsername && toUser) {
            saveMessage({
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

    socket.on('send-shame-message', ({ message }) => {
        const fromUsername = onlineUsers.get(socket.id)?.username;

        if (fromUsername) {
            saveShameBoardMessage({
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

    socket.on('send-file', ({ to, file }) => {
        const fromUsername = onlineUsers.get(socket.id)?.username;
        const toUser = Array.from(onlineUsers.values()).find(u => u.id === to);

        if (fromUsername && toUser) {
            saveMessage({
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

    socket.on('avatar-updated', () => {
        // Обновляем информацию о пользователе
        const users = loadUsers();
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
