'use strict';
// 一番下を表示
window.addEventListener('load', () => {
  window.scrollTo(0, document.body.scrollHeight);
});

// 入力した文字数を「12 / 150」の形で表示
const MAX_LENGTH = 150;
const charCountElement = document.getElementById('char-count');
function updateCharCount() {
  charCountElement.textContent = `${document.forms['message-form'].elements['content'].value.length} / ${MAX_LENGTH}`;
}

// エンターキー と Ctrlキー(Macの場合はCommandキー)を押していたら送信
const formElement = document.forms['message-form'];
const textareaElement = formElement.elements['content'];
textareaElement.addEventListener('keydown', (event) => {
  // 送信キーを押したら
  if (isPressedSubmitKey(event)) {
    // キーボード入力をキャンセルして送信
    event.preventDefault();
    formElement.submit();
  }
});

// 文字を入力するたびに、文字数を更新
textareaElement.addEventListener('input', updateCharCount);

// 送信キーを押しているか判定
function isPressedSubmitKey(event) {
  if (event.key !== 'Enter') {
    return false;
  }
  if (event.ctrlKey) {
    return true;
  }
  // MacのCommandキーはmetaKeyという名前
  if (event.metaKey) {
    return true;
  }
}