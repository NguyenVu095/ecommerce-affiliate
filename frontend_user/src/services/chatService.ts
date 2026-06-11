import api from "./api";

export interface ProductMetadata {
  id: number;
  name: string;
  base_price: number;
  thumbnail: string;
}

export interface Message {
  id: number;
  sender_type: "user" | "bot" | "admin";
  message_content: string;
  is_handoff_to_admin: boolean;
  metadata?: {
    products?: ProductMetadata[];
  };
}

export interface ChatSession {
  id: number;
  source: string;
  status: string;
  last_message_at: string;
  access_token?: string;
}

function chatSessionConfig(accessToken?: string) {
  return accessToken
    ? { headers: { "X-Chat-Session-Token": accessToken } }
    : undefined;
}

/**
 * Lấy lịch sử tin nhắn của một phiên chat.
 */
export async function getChatHistoryApi(sessionId: number, accessToken?: string): Promise<Message[]> {
  const res = await api.get<Message[]>(`/api/chat/session/${sessionId}/messages`, chatSessionConfig(accessToken));
  return res.data;
}

/**
 * Khởi tạo phiên chat mới.
 */
export async function startChatSessionApi(source = "web"): Promise<ChatSession> {
  const res = await api.post<ChatSession>("/api/chat/session", { source });
  return res.data;
}

/**
 * Gửi tin nhắn mới trong phiên chat và nhận tin nhắn phản hồi của trợ lý AI.
 */
export async function sendChatMessageApi(
  sessionId: number,
  messageContent: string,
  accessToken?: string,
): Promise<Message> {
  const res = await api.post<Message>(
    "/api/chat/message",
    {
      session_id: sessionId,
      message_content: messageContent,
    },
    chatSessionConfig(accessToken),
  );
  return res.data;
}

/**
 * Gửi yêu cầu chuyển phiên chat gặp nhân viên hỗ trợ (handoff).
 */
export async function requestChatHandoffApi(sessionId: number, accessToken?: string): Promise<void> {
  await api.post(`/api/chat/session/${sessionId}/handoff`, undefined, chatSessionConfig(accessToken));
}
