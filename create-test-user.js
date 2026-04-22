const bcrypt = require('bcrypt');
const fs = require('fs');

async function createTestUser() {
    const users = JSON.parse(fs.readFileSync('users.json', 'utf8'));

    const hashedPassword = await bcrypt.hash('test123', 10);

    users.push({
        id: Date.now().toString(),
        username: 'test',
        password: hashedPassword,
        avatar: null,
        createdAt: new Date().toISOString()
    });

    fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
    console.log('Тестовый пользователь создан:');
    console.log('Логин: test');
    console.log('Пароль: test123');
}

createTestUser();
