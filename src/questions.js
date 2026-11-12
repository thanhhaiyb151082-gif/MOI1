'use strict';

const fs = require('node:fs');
const path = require('node:path');

function validateQuestions(list) {
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('questions.json phải là mảng có ít nhất 1 câu hỏi');
  }
  list.forEach((q, i) => {
    const where = `Câu ${i + 1}`;
    if (!q || typeof q.text !== 'string' || !q.text.trim()) {
      throw new Error(`${where}: thiếu nội dung "text"`);
    }
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6) {
      throw new Error(`${where}: "options" phải có từ 2 đến 6 đáp án`);
    }
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) {
      throw new Error(`${where}: "answer" phải là chỉ số (bắt đầu từ 0) của đáp án đúng`);
    }
  });
  return list;
}

function loadQuestions(file = path.join(__dirname, '..', 'questions.json')) {
  return validateQuestions(JSON.parse(fs.readFileSync(file, 'utf8')));
}

module.exports = { loadQuestions, validateQuestions };
