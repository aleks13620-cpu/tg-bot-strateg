const crypto = require('crypto');
const { getUserByTelegramId } = require('../database/queries/users');

/**
 * Верифицирует Telegram initData и возвращает пользователя из БД.
 * @param {import('http').IncomingMessage} req
 * @returns {{ user: object, telegramUser: object }}
 * @throws {Error} с полем .status (401, 404)
 */
async function verifyAndGetUser(req) {
  const authHeader = req.headers['authorization'] || '';
  const initData = authHeader.startsWith('TelegramWebApp ')
    ? authHeader.slice('TelegramWebApp '.length)
    : null;

  if (!initData) {
    const err = new Error('Missing Authorization header');
    err.status = 401;
    throw err;
  }

  // Верификация HMAC-SHA256
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) {
    const err = new Error('Missing hash in initData');
    err.status = 401;
    throw err;
  }

  params.delete('hash');
  const pairs = [];
  params.forEach((value, key) => pairs.push(`${key}=${value}`));
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(process.env.BOT_TOKEN)
    .digest();

  const computedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (computedHash !== hash) {
    const err = new Error('Invalid hash');
    err.status = 401;
    throw err;
  }

  // Извлечь telegram user
  const userParam = params.get('user');
  if (!userParam) {
    const err = new Error('No user in initData');
    err.status = 401;
    throw err;
  }

  let telegramUser;
  try {
    telegramUser = JSON.parse(userParam);
  } catch {
    const err = new Error('Invalid user JSON in initData');
    err.status = 401;
    throw err;
  }

  // Найти пользователя в БД
  const { data: user, error } = await getUserByTelegramId(telegramUser.id);
  if (error || !user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  return { user, telegramUser };
}

/**
 * Обёртка для обработчиков: возвращает {user, telegramUser} или пишет ответ с ошибкой.
 * @returns {object|null} null если уже отписал ошибку
 */
async function authenticate(req, res) {
  try {
    return await verifyAndGetUser(req);
  } catch (err) {
    res.status(err.status || 401).json({ error: err.message });
    return null;
  }
}

module.exports = { verifyAndGetUser, authenticate };
