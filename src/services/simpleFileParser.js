function parseTxtContent(text) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines;
}

function formatParsedContent(lines) {
  if (lines.length === 0) {
    return 'Файл пуст или не содержит текста.';
  }

  let text = '📄 *Содержимое файла:*\n\n';
  lines.forEach((line, i) => {
    text += `${i + 1}. ${line}\n`;
  });

  return text;
}

module.exports = { parseTxtContent, formatParsedContent };
