const fs = require('fs');
const users = JSON.parse(fs.readFileSync('users.json', 'utf8'));

console.log(`Всего пользователей: ${users.length}\n`);
users.forEach((user, i) => {
    console.log(`${i + 1}. ${user.username} (создан: ${user.createdAt})`);
});
