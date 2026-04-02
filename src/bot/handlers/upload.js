const { Markup } = require('telegraf');
const { parseTxtContent } = require('../../services/simpleFileParser');

function registerUploadHandlers(bot) {
  bot.on('document', async (ctx) => {
    try {
      const doc = ctx.message.document;
      const fileName = doc.file_name || '';

      if (!fileName.endsWith('.txt')) {
        await ctx.reply('Поддерживаются только .txt файлы.');
        return;
      }

      console.log(`[UPLOAD] User ${ctx.from.id} uploaded: ${fileName}`);

      const fileLink = await ctx.telegram.getFileLink(doc.file_id);
      const response = await fetch(fileLink.href);
      const text = await response.text();

      const lines = parseTxtContent(text);

      if (lines.length === 0) {
        await ctx.reply('Файл пуст или не содержит текста.');
        return;
      }

      // Без Markdown — спецсимволы в тексте файла не ломают форматирование
      let output = `📄 Содержимое файла (${fileName}):\n\n`;
      lines.forEach((line, i) => {
        output += `${i + 1}. ${line}\n`;
      });
      output += '\nСкопируйте нужные пункты и используйте их при создании спринта или планировании дня.';

      await ctx.reply(output, Markup.inlineKeyboard([
        [Markup.button.callback('🚀 Создать спринт', 'action_new_sprint')],
        [Markup.button.callback('📋 Добавить задачи', 'action_plan_add')],
      ]));
    } catch (error) {
      console.error('[UPLOAD] Error:', error.message);
      await ctx.reply('Ошибка при обработке файла. Попробуйте ещё раз.');
    }
  });
}

module.exports = { registerUploadHandlers };
