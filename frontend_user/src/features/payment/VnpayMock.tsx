/**
 * VnpayMock.tsx — Trang giả lập cổng thanh toán VNPAY.
 *
 * Trang này mô phỏng màn hình xác nhận thanh toán của VNPAY.
 * Sau khi user click Thành công / Thất bại, frontend gọi URL callback
 * đã được backend ký số sẵn để cập nhật trạng thái đơn hàng.
 *
 * Tối ưu Giai đoạn 13:
 * - Thay alert() native block UI bằng React State error message.
 * - Chuẩn hóa catch (err: unknown) — Strict Type Safety.
 */

import { useSearchParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import api from "../../services/api";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import VnpayLogo from "../../components/VnpayLogo";

export default function VnpayMock() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"pending" | "success" | "error">("pending");
  /** Thông báo lỗi callback — thay thế alert() native block UI */
  const [callbackError, setCallbackError] = useState<string | null>(null);

  const orderId = searchParams.get("order_id");
  const amount = searchParams.get("amount");
  const successCallback = searchParams.get("success_callback");
  const failCallback = searchParams.get("fail_callback");

  const handlePayment = async (isSuccess: boolean) => {
    setCallbackError(null); // reset lỗi cũ trước khi thử lại
    try {
      const callbackUrl = isSuccess ? successCallback : failCallback;
      if (!callbackUrl) {
        throw new Error("Missing signed payment callback");
      }
      // Gọi thẳng URL callback đã được ký số sẵn từ backend
      await api.get(callbackUrl);
      setStatus(isSuccess ? "success" : "error");
    } catch (err: unknown) {
      console.error("Lỗi gọi Callback VNPAY:", err);
      // Hiển thị thông báo lỗi ngay trên trang thay vì block UI với alert()
      setCallbackError("Có lỗi xảy ra khi xử lý thanh toán. Vui lòng thử lại hoặc liên hệ hỗ trợ.");
    }
  };

  if (status === "success") {
    return (
      <div className="max-w-md mx-auto mt-20 p-8 bg-white rounded-3xl shadow-xl text-center border border-slate-100">
        <CheckCircle2 className="w-20 h-20 text-green-500 mx-auto mb-6" />
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Thanh toán thành công!</h1>
        <p className="text-slate-500 mb-8">
          Cảm ơn bạn đã mua sắm. Đơn hàng #{orderId} đã được ghi nhận.
        </p>
        <button
          onClick={() => navigate("/")}
          className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-slate-800"
        >
          Về trang chủ
        </button>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="max-w-md mx-auto mt-20 p-8 bg-white rounded-3xl shadow-xl text-center border border-slate-100">
        <XCircle className="w-20 h-20 text-red-500 mx-auto mb-6" />
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Thanh toán thất bại!</h1>
        <p className="text-slate-500 mb-8">Bạn đã huỷ giao dịch hoặc có lỗi xảy ra.</p>
        <button
          onClick={() => navigate("/")}
          className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-slate-800"
        >
          Về trang chủ
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-20 p-8 bg-white rounded-3xl shadow-xl border border-slate-100">
      <div className="text-center mb-8">
        <VnpayLogo className="h-10 w-auto mx-auto mb-4" />
        <h1 className="text-xl font-bold text-slate-800">Cổng Thanh Toán Giả Lập</h1>
      </div>

      <div className="bg-slate-50 p-4 rounded-xl mb-6 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Mã Đơn Hàng:</span>
          <span className="font-bold text-slate-900">#{orderId}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Số Tiền:</span>
          <span className="font-bold text-primary-600 text-lg">
            {Number(amount).toLocaleString("vi-VN")} ₫
          </span>
        </div>
      </div>

      {/* Thông báo lỗi callback — thay thế alert() native block UI */}
      {callbackError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{callbackError}</span>
        </div>
      )}

      <div className="space-y-4">
        <button
          onClick={() => handlePayment(true)}
          className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-md hover:bg-blue-700 transition-colors"
        >
          [Giả Lập] Thanh toán THÀNH CÔNG
        </button>
        <button
          onClick={() => handlePayment(false)}
          className="w-full bg-slate-200 text-slate-700 font-bold py-4 rounded-xl hover:bg-slate-300 transition-colors"
        >
          [Giả Lập] Thanh toán THẤT BẠI
        </button>
      </div>
    </div>
  );
}
