import React, { useCallback, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquare, X, Send, Sparkles, RefreshCw, Headphones, ChevronDown } from "lucide-react";
import {
  getChatHistoryApi,
  startChatSessionApi,
  sendChatMessageApi,
  requestChatHandoffApi,
  type Message,
} from "../../services/chatService";

interface MessageContentProps {
  text: string;
  onProductLink: (href: string) => void;
}

function renderInlineMarkdown(text: string, onProductLink: (href: string) => void): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const tokenPattern = /(\*\*[^*]+\*\*|\[[^\]]+\]\(\/product\/\d+\))/g;
  let cursor = 0;

  for (const match of text.matchAll(tokenPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      nodes.push(text.slice(cursor, index));
    }

    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={`${index}-bold`}>{token.slice(2, -2)}</strong>);
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\((\/product\/\d+)\)$/);
      if (linkMatch) {
        const [, label, href] = linkMatch;
        nodes.push(
          <button
            key={`${index}-link`}
            type="button"
            className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
            onClick={() => onProductLink(href)}
          >
            {label}
          </button>,
        );
      }
    }
    cursor = index + token.length;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }
  return nodes;
}

function MessageContent({ text, onProductLink }: MessageContentProps) {
  return (
    <>
      {text.split("\n").map((line, index) => {
        const trimmed = line.trim();
        const isListItem = trimmed.startsWith("- ") || trimmed.startsWith("* ");
        const content = isListItem ? trimmed.slice(2) : line;
        return (
          <div key={`${index}-${line}`} className={isListItem ? "flex gap-2" : undefined}>
            {isListItem && <span aria-hidden="true">•</span>}
            <span>{renderInlineMarkdown(content, onProductLink)}</span>
          </div>
        );
      })}
    </>
  );
}

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessionAccessToken, setSessionAccessToken] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isHandoff, setIsHandoff] = useState<boolean>(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tempIdRef = useRef<number>(0);
  const navigate = useNavigate();

  const clearStoredSession = useCallback(() => {
    sessionStorage.removeItem("chat_session_id");
    sessionStorage.removeItem("chat_session_access_token");
    setSessionId(null);
    setSessionAccessToken(null);
  }, []);

  const loadChatHistory = useCallback(async (sId: number, accessToken?: string) => {
    try {
      const data = await getChatHistoryApi(sId, accessToken);
      if (Array.isArray(data)) {
        setMessages(data);
        const hasActiveHandoff = data.some(m => m.is_handoff_to_admin);
        if (hasActiveHandoff) {
          setIsHandoff(true);
        }
      }
    } catch (error) {
      console.error("Failed to load chat history:", error);
      // If session is not found in DB, clear local state
      clearStoredSession();
    }
  }, [clearStoredSession]);

  const startSession = async (): Promise<{ id: number; accessToken?: string }> => {
    try {
      const session = await startChatSessionApi("web");
      const newSessionId = session.id;
      const accessToken = session.access_token;
      setSessionId(newSessionId);
      setSessionAccessToken(accessToken ?? null);
      sessionStorage.setItem("chat_session_id", newSessionId.toString());
      if (accessToken) {
        sessionStorage.setItem("chat_session_access_token", accessToken);
      }
      return { id: newSessionId, accessToken };
    } catch (error) {
      console.error("Failed to start chat session:", error);
      throw error;
    }
  };

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    let activeSessionId = sessionId;
    let activeSessionAccessToken = sessionAccessToken ?? undefined;
    setIsLoading(true);

    try {
      // 1. Create session if not exists
      if (!activeSessionId) {
        const session = await startSession();
        activeSessionId = session.id;
        activeSessionAccessToken = session.accessToken;
      }

      // 2. Add user message locally for instant feedback
      tempIdRef.current += 1;
      const userMessageTemp: Message = {
        id: tempIdRef.current, // temporary ID
        sender_type: "user",
        message_content: textToSend,
        is_handoff_to_admin: false,
      };
      setMessages((prev) => [...prev, userMessageTemp]);
      setInputValue("");

      // 3. Send to API
      const botMessage = await sendChatMessageApi(activeSessionId, textToSend, activeSessionAccessToken);
      
      // Update messages list (remove temp user message, load actual DB messages)
      loadChatHistory(activeSessionId, activeSessionAccessToken);

      if (botMessage.is_handoff_to_admin) {
        setIsHandoff(true);
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      // Fallback message
      tempIdRef.current += 1;
      setMessages((prev) => [
        ...prev,
        {
          id: tempIdRef.current,
          sender_type: "bot",
          message_content: "Dạ, hệ thống đang gặp gián đoạn kết nối. Anh/chị vui lòng kiểm tra mạng và thử lại nhé!",
          is_handoff_to_admin: false,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(inputValue);
    }
  };

  const handleRequestHandoff = async () => {
    if (!sessionId || isHandoff) return;
    setIsLoading(true);
    try {
      await requestChatHandoffApi(sessionId, sessionAccessToken ?? undefined);
      setIsHandoff(true);
      loadChatHistory(sessionId, sessionAccessToken ?? undefined);
    } catch (error) {
      console.error("Failed to request handoff:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    if (window.confirm("Anh/chị có muốn xóa lịch sử trò chuyện và bắt đầu phiên chat mới?")) {
      clearStoredSession();
      setMessages([]);
      setIsHandoff(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(price);
  };

  // Quick suggestion prompts
  const suggestions = [
    "Tìm áo polo nam",
    "Tư vấn bảng size chuẩn",
    "Chính sách đổi trả 7 ngày",
    "Gặp nhân viên hỗ trợ",
  ];

  // Load session from sessionStorage on mount
  useEffect(() => {
    const savedSessionId = sessionStorage.getItem("chat_session_id");
    const savedAccessToken = sessionStorage.getItem("chat_session_access_token") ?? undefined;
    if (savedSessionId) {
      const sId = parseInt(savedSessionId, 10);
      setTimeout(() => {
        setSessionId(sId);
        setSessionAccessToken(savedAccessToken ?? null);
        loadChatHistory(sId, savedAccessToken);
      }, 0);
    }
  }, [loadChatHistory]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Adjust textarea height automatically
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [inputValue]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end font-sans">
      {/* 1. Chat Window */}
      {isOpen && (
        <div className="mb-4 flex h-[520px] w-[370px] flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 shadow-2xl backdrop-blur-md transition-all duration-300 sm:w-[400px]">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-violet-600 p-4 text-white shadow-md flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                  <Sparkles className="h-5 w-5 text-yellow-300 animate-pulse" />
                </div>
                <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-indigo-600 bg-green-400" />
              </div>
              <div>
                <h3 className="font-semibold text-sm leading-tight">Trợ Lý AI Mua Sắm</h3>
                <span className="text-[11px] text-indigo-100 flex items-center gap-1">
                  {isHandoff ? (
                    <>
                      <Headphones className="h-3 w-3" /> Đang chuyển Admin
                    </>
                  ) : (
                    "Đang trực tuyến (AI Active)"
                  )}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {!isHandoff && sessionId && (
                <button
                  onClick={handleRequestHandoff}
                  title="Gặp nhân viên hỗ trợ"
                  className="rounded-full p-1.5 hover:bg-white/10 transition-colors text-white/80 hover:text-white"
                >
                  <Headphones className="h-4.5 w-4.5" />
                </button>
              )}
              {messages.length > 0 && (
                <button
                  onClick={handleClearChat}
                  title="Bắt đầu phiên chat mới"
                  className="rounded-full p-1.5 hover:bg-white/10 transition-colors text-white/80 hover:text-white"
                >
                  <RefreshCw className="h-4.5 w-4.5" />
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-full p-1.5 hover:bg-white/10 transition-colors"
              >
                <ChevronDown className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 dark:bg-slate-950/20">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center p-6 text-center text-slate-500">
                <div className="mb-4 rounded-full bg-indigo-50 dark:bg-indigo-950/40 p-4">
                  <Sparkles className="h-8 w-8 text-indigo-500" />
                </div>
                <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Dạ, em có thể giúp gì cho mình ạ?</h4>
                <p className="text-xs text-slate-400 max-w-[240px]">
                  Em có thể tư vấn sản phẩm, tra đơn hàng hoặc trả lời thắc mắc về size số và đổi trả.
                </p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.sender_type === "user" ? "items-end" : "items-start"
                  }`}
                >
                  {/* Sender Label */}
                  <span className="text-[10px] text-slate-400 mb-1 px-1">
                    {msg.sender_type === "user"
                      ? "Bạn"
                      : msg.sender_type === "admin"
                      ? "Nhân viên hỗ trợ"
                      : "Trợ lý AI"}
                  </span>
                  
                  {/* Message Bubble */}
                  <div
                    className={`rounded-2xl px-4 py-2.5 max-w-[85%] text-sm shadow-sm leading-relaxed ${
                      msg.sender_type === "user"
                        ? "bg-indigo-600 text-white rounded-tr-none"
                        : "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700/60 rounded-tl-none"
                    }`}
                  >
                    <MessageContent
                      text={msg.message_content}
                      onProductLink={(href) => {
                        navigate(href);
                        setIsOpen(false);
                      }}
                    />
                  </div>

                  {/* Render Product Metadata if attached */}
                  {msg.metadata?.products && msg.metadata.products.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 gap-2 w-full max-w-[90%]">
                      {msg.metadata.products.map((prod) => (
                        <div
                          key={prod.id}
                          onClick={() => {
                            navigate(`/product/${prod.id}`);
                            setIsOpen(false);
                          }}
                          className="cursor-pointer overflow-hidden rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-850 p-2 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all"
                        >
                          <img
                            src={prod.thumbnail}
                            alt={prod.name}
                            className="h-24 w-full rounded-lg object-cover mb-2"
                          />
                          <h4 className="line-clamp-2 text-xs font-semibold text-slate-700 dark:text-slate-200 min-h-[32px]">
                            {prod.name}
                          </h4>
                          <p className="mt-1 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                            {formatPrice(prod.base_price)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}

            {/* Typing Indicator */}
            {isLoading && (
              <div className="flex flex-col items-start">
                <span className="text-[10px] text-slate-400 mb-1 px-1">Trợ lý AI</span>
                <div className="rounded-2xl rounded-tl-none bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700/60 px-4 py-3 shadow-sm flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Suggestions / Chips */}
          <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex gap-1.5 overflow-x-auto scrollbar-none whitespace-nowrap">
            {suggestions.map((sug, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(sug)}
                className="rounded-full bg-slate-50 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300 px-3 py-1.5 transition-colors cursor-pointer"
              >
                {sug}
              </button>
            ))}
          </div>

          {/* Input Box */}
          <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-end gap-2">
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Nhập tin nhắn..."
              disabled={isLoading}
              className="flex-1 max-h-28 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 dark:bg-slate-950 dark:text-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none resize-none disabled:bg-slate-50 dark:disabled:bg-slate-900"
            />
            <button
              onClick={() => handleSendMessage(inputValue)}
              disabled={!inputValue.trim() || isLoading}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors cursor-pointer disabled:bg-slate-200 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
            >
              <Send className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>
      )}

      {/* 2. Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-xl hover:shadow-2xl hover:scale-105 transition-all duration-300 cursor-pointer relative group"
      >
        <div className="absolute inset-0 rounded-full bg-indigo-600/30 animate-ping group-hover:animate-none" />
        {isOpen ? (
          <X className="h-6 w-6 relative z-10 transition-transform duration-300" />
        ) : (
          <MessageSquare className="h-6 w-6 relative z-10 transition-transform duration-300" />
        )}
      </button>
    </div>
  );
}
