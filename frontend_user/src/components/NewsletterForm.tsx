import { useState, type FormEvent } from "react";
import axios from "axios";
import api from "../services/api";
import { CheckCircle2, Loader2, Send, XCircle } from "lucide-react";

type NewsletterFormProps = {
  source: string;
  variant?: "light" | "dark";
  placeholder?: string;
  buttonLabel?: string;
  className?: string;
  compact?: boolean;
};

type NewsletterResponse = {
  message: string;
  already_subscribed: boolean;
};

export default function NewsletterForm({
  source,
  variant = "light",
  placeholder = "Nhập địa chỉ email của bạn...",
  buttonLabel = "Đăng Ký Ngay",
  className = "",
  compact = false,
}: NewsletterFormProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const isDark = variant === "dark";
  const isLoading = status === "loading";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;

    setStatus("loading");
    setMessage("");

    try {
      const response = await api.post<NewsletterResponse>(
        "/api/newsletter/subscribe",
        { email: normalizedEmail, source }
      );

      setStatus("success");
      setMessage(response.data.message);
      setEmail("");
    } catch (error) {
      setStatus("error");
      if (axios.isAxiosError(error) && error.response?.status === 422) {
        setMessage("Email chưa đúng định dạng. Vui lòng kiểm tra lại.");
      } else {
        setMessage("Chưa thể đăng ký nhận tin. Vui lòng thử lại sau.");
      }
    }
  };

  const inputClass = isDark
    ? "bg-slate-800 text-white placeholder:text-slate-500 focus:ring-primary-500"
    : "bg-white text-slate-900 placeholder:text-slate-400 border border-slate-200 focus:ring-primary-500";

  const messageClass =
    status === "success"
      ? isDark
        ? "text-emerald-300"
        : "text-emerald-700"
      : isDark
        ? "text-red-300"
        : "text-red-600";

  if (compact) {
    return (
      <div className={className}>
        <form className="relative" onSubmit={handleSubmit}>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={placeholder}
            className={`w-full rounded-xl py-3 pl-4 pr-12 text-sm outline-none transition-all focus:ring-2 ${inputClass}`}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading}
            className="absolute right-2 top-1.5 rounded-lg bg-primary-600 p-1.5 text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70"
            aria-label="Đăng ký nhận bản tin"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
        {message && (
          <p className={`mt-3 flex items-start gap-2 text-xs leading-relaxed ${messageClass}`}>
            {status === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{message}</span>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <form className="mx-auto flex max-w-xl flex-col gap-4 sm:flex-row" onSubmit={handleSubmit}>
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={placeholder}
          className={`flex-1 rounded-full px-6 py-4 outline-none transition-all focus:ring-2 ${inputClass}`}
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-8 py-4 font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          <span>{isLoading ? "Đang gửi..." : buttonLabel}</span>
        </button>
      </form>
      {message && (
        <p className={`mx-auto mt-4 flex max-w-xl items-center justify-center gap-2 text-sm ${messageClass}`}>
          {status === "success" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          <span>{message}</span>
        </p>
      )}
    </div>
  );
}
