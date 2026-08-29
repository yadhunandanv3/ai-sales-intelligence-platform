import React, { useState, useRef, useEffect } from 'react';
import { api } from '../services/api.js';

export default function Assistant() {
  const [messages, setMessages] = useState([
    {
      sender: 'assistant',
      text: "Hello! I am your AI Sales Assistant. I can help you automate your pipeline. For example, ask me to 'create a lead for Dave value 5000' or 'update Dave status to WON'. What would you like to do?"
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input;
    setInput('');
    setMessages((prev) => [...prev, { sender: 'user', text: userMessage }]);
    setLoading(true);

    try {
      const response = await api.askAssistant(userMessage);
      
      const assistantReply = response.data.responseText || "I have processed your query.";
      const toolLogs = response.data.logs || [];

      setMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: assistantReply,
          logs: toolLogs
        }
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: `Error: ${err.message || 'Something went wrong.'}`,
          isError: true
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm h-[600px]">
      {/* Top Banner */}
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
          <span className="text-sm font-bold text-gray-800">Conversational CRM Assistant</span>
        </div>
        <span className="text-xs text-gray-500 font-medium">Powered by OpenAI & Tools API</span>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${
              msg.sender === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            <div
              className={`max-w-lg rounded-lg px-4 py-3 text-sm shadow-sm ${
                msg.sender === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-none'
                  : msg.isError
                  ? 'bg-red-50 text-red-700 border border-red-200 rounded-bl-none'
                  : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none'
              }`}
            >
              {msg.text}

              {/* Tool Execution Logs Overlay */}
              {msg.logs && msg.logs.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
                  <span className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                    ⚙️ Executed Tools Logs:
                  </span>
                  {msg.logs.map((log, lIdx) => (
                    <div key={lIdx} className="bg-gray-50 rounded border border-gray-200 p-2 text-xs font-mono text-gray-600">
                      <div>Action: <span className="font-bold text-gray-800">{log.action}</span></div>
                      {log.leadId && <div>Lead ID: <span className="text-[10px]">{log.leadId}</span></div>}
                      {log.taskId && <div>Task ID: <span className="text-[10px]">{log.taskId}</span></div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <span className="text-[10px] text-gray-400 mt-1 uppercase font-bold px-1">
              {msg.sender === 'user' ? 'You' : 'AI Assistant'}
            </span>
          </div>
        ))}
        {loading && (
          <div className="flex flex-col items-start">
            <div className="bg-white text-gray-500 border border-gray-200 rounded-lg rounded-bl-none px-4 py-3 text-sm shadow-sm">
              Thinking and executing CRM mutations...
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input Message Form */}
      <form onSubmit={handleSend} className="p-4 border-t border-gray-200 bg-white flex gap-4">
        <input
          type="text"
          value={input}
          disabled={loading}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. create a lead for Bob from Acme value 12000"
          className="flex-1 px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:bg-gray-100"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg font-semibold shadow-sm transition"
        >
          Send
        </button>
      </form>
    </div>
  );
}
