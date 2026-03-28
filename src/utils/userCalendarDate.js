/**
 * Календарные даты (YYYY-MM-DD) в часовом поясе пользователя.
 * Слой для пункта 5 плана (timezone). Используется day close, streak, coaching и др. по мере подключения.
 *
 * «Сегодня» / «завтра» — через Intl (как в reminder.js для localDateStr).
 * Сдвиг по строке YYYY-MM-DD — через Date.UTC + UTC getters (без локали процесса и без Z-якоря на полуночи).
 */

const DEFAULT_TIMEZONE = 'Europe/Moscow';

/**
 * @param {string | { timezone?: string | null } | null | undefined} userOrTz
 * IANA-имя зоны или объект пользователя с полем timezone (как в БД).
 */
function resolveTimeZone(userOrTz) {
  if (userOrTz == null) return DEFAULT_TIMEZONE;
  if (typeof userOrTz === 'string') {
    const s = userOrTz.trim();
    return s || DEFAULT_TIMEZONE;
  }
  const s = (userOrTz.timezone && String(userOrTz.timezone).trim()) || '';
  return s || DEFAULT_TIMEZONE;
}

/**
 * Календарная дата YYYY-MM-DD в указанной IANA-зоне для момента now.
 * @param {string} ianaTimeZone
 * @param {Date} [now]
 */
function getCalendarDateInTimeZone(ianaTimeZone, now = new Date()) {
  const tz = ianaTimeZone && String(ianaTimeZone).trim() ? ianaTimeZone : DEFAULT_TIMEZONE;
  try {
    return now.toLocaleDateString('en-CA', { timeZone: tz });
  } catch {
    return now.toLocaleDateString('en-CA', { timeZone: DEFAULT_TIMEZONE });
  }
}

/**
 * «Сегодня» пользователя (календарный день в user.timezone).
 * @param {string | { timezone?: string | null }} userOrTz
 * @param {Date} [now]
 * @returns {string} YYYY-MM-DD
 */
function getUserCalendarToday(userOrTz, now = new Date()) {
  return getCalendarDateInTimeZone(resolveTimeZone(userOrTz), now);
}

/**
 * «Завтра» после календарного «сегодня» пользователя (не локаль процесса).
 * @param {string | { timezone?: string | null }} userOrTz
 * @param {Date} [now]
 * @returns {string} YYYY-MM-DD
 */
function getUserCalendarTomorrow(userOrTz, now = new Date()) {
  const today = getUserCalendarToday(userOrTz, now);
  return addCalendarDays(today, 1);
}

/**
 * Сдвиг григорианской календарной даты на N дней.
 * Использует Date.UTC для нормализации (переходы месяца/года); результат читается через UTC-компоненты —
 * это не «дата в UTC по смыслу пользователя», а нейтральная арифметика Y-M-D.
 * @param {string} isoDateStr YYYY-MM-DD
 * @param {number} deltaDays положительное, отрицательное или ноль
 * @returns {string} YYYY-MM-DD
 */
function addCalendarDays(isoDateStr, deltaDays) {
  const parts = String(isoDateStr).split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) {
    throw new Error(`addCalendarDays: invalid date string "${isoDateStr}"`);
  }
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Предыдущий календарный день.
 * @param {string} isoDateStr YYYY-MM-DD
 * @returns {string} YYYY-MM-DD
 */
function getPreviousCalendarDay(isoDateStr) {
  return addCalendarDays(isoDateStr, -1);
}

/**
 * День недели для календарной даты YYYY-MM-DD (григорианский календарь).
 * Для одной civil-даты день недели совпадает в любой IANA-зоне; совместимо с date из day close (уже в календаре пользователя).
 * Не использовать server-local Date#getDay() на парсе строки — зависит от TZ процесса.
 * @returns {number} 0 = вс, 1 = пн, … 5 = пт, 6 = сб — как Date.prototype.getDay()
 */
function getIsoCalendarWeekday(isoDateStr) {
  const parts = String(isoDateStr).split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) {
    throw new Error(`getIsoCalendarWeekday: invalid date string "${isoDateStr}"`);
  }
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

module.exports = {
  DEFAULT_TIMEZONE,
  resolveTimeZone,
  getCalendarDateInTimeZone,
  getUserCalendarToday,
  getUserCalendarTomorrow,
  addCalendarDays,
  getPreviousCalendarDay,
  getIsoCalendarWeekday,
};
