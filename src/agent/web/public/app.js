const chat = document.getElementById("chat");
const form = document.getElementById("composer");
const input = document.getElementById("input");
const submitButton = form.querySelector("button");

const CONVERSATION_KEY = "sellerbot_conversation_id";
let conversationId = localStorage.getItem(CONVERSATION_KEY);
if (!conversationId) {
  conversationId = crypto.randomUUID();
  localStorage.setItem(CONVERSATION_KEY, conversationId);
}

function appendUserMessage(text) {
  const el = document.createElement("div");
  el.className = "msg user";
  el.textContent = text;
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
}

function appendToolCallNotice(name, args) {
  const el = document.createElement("div");
  el.className = "msg tool-call";
  el.textContent = `[tool: ${name}(${args})]`;
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
}

function appendAgentHtml(html) {
  const el = document.createElement("div");
  el.className = "msg agent";
  el.innerHTML = html;
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
}

function appendError(text) {
  const el = document.createElement("div");
  el.className = "msg tool-call";
  el.textContent = text;
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
}

async function sendMessage(text) {
  appendUserMessage(text);
  input.value = "";
  input.disabled = true;
  submitButton.disabled = true;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, message: text }),
    });

    if (!res.ok) {
      appendError(`Error del servidor (${res.status}).`);
      return;
    }

    const data = await res.json();
    for (const call of data.toolCalls ?? []) {
      appendToolCallNotice(call.name, call.args);
    }
    appendAgentHtml(data.html);
  } catch {
    appendError("No se pudo conectar con el servidor.");
  } finally {
    input.disabled = false;
    submitButton.disabled = false;
    input.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (text === "") return;
  sendMessage(text);
});

input.focus();
