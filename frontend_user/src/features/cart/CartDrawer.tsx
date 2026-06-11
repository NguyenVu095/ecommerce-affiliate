import { X, Trash2 } from "lucide-react";
import { useCartStore } from "../../store/cartStore";
import { Link } from "react-router-dom";

export default function CartDrawer({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const { items, removeFromCart, updateQuantity, getTotalPrice, toggleSelect, toggleSelectAll } = useCartStore();

  if (!isOpen) return null;

  const allSelected = items.length > 0 && items.every((item) => item.selected !== false);
  const selectedCount = items.filter((item) => item.selected !== false).length;

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm transition-opacity" onClick={onClose} />
      
      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl flex flex-col transform transition-transform duration-300">
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <h2 className="text-xl font-bold text-slate-900">Giỏ hàng của bạn</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {items.length === 0 ? (
            <div className="text-center text-slate-500 mt-12">
              <p>Giỏ hàng đang trống</p>
              <button onClick={onClose} className="mt-4 text-primary-600 font-semibold hover:underline">
                Tiếp tục mua sắm
              </button>
            </div>
          ) : (
            <>
              {/* Select All Checkbox */}
              <div className="flex items-center justify-between border-b pb-3 mb-2 px-2 text-sm">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                    className="rounded text-primary-600 focus:ring-primary-500 w-4 h-4 cursor-pointer"
                  />
                  Chọn tất cả ({items.length})
                </label>
              </div>

              {items.map((item) => (
                <div key={item.variant_id} className="flex items-center gap-3 bg-white p-3 border border-slate-100 rounded-xl shadow-sm">
                  {/* Item Selection Checkbox */}
                  <input
                    type="checkbox"
                    checked={item.selected !== false}
                    onChange={() => toggleSelect(item.variant_id)}
                    className="rounded text-primary-600 focus:ring-primary-500 w-4.5 h-4.5 cursor-pointer shrink-0"
                  />
                  
                  <img src={item.image_url} alt={item.name} className="w-16 h-16 object-cover rounded-lg bg-slate-100" />
                  
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-semibold text-slate-900 line-clamp-1">{item.name}</h3>
                      {item.variant_info && (
                        <p className="text-xs text-slate-400 mt-0.5">{item.variant_info}</p>
                      )}
                      <p className="text-primary-600 font-bold">{item.price.toLocaleString("vi-VN")} ₫</p>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
                        <button onClick={() => updateQuantity(item.variant_id, item.quantity - 1)} className="px-3 py-1 bg-slate-50 hover:bg-slate-100">-</button>
                        <span className="px-3 py-1 font-medium text-sm">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.variant_id, item.quantity + 1)} className="px-3 py-1 bg-slate-50 hover:bg-slate-100">+</button>
                      </div>
                      <button onClick={() => removeFromCart(item.variant_id)} className="text-red-400 hover:text-red-600 p-1">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {items.length > 0 && (
          <div className="p-6 border-t bg-slate-50">
            <div className="flex justify-between font-bold text-lg mb-6">
              <span>Tổng cộng ({selectedCount} sản phẩm):</span>
              <span className="text-primary-600">{getTotalPrice().toLocaleString("vi-VN")} ₫</span>
            </div>
            
            {selectedCount > 0 ? (
              <Link 
                to="/checkout" 
                onClick={onClose}
                className="w-full block text-center bg-primary-600 text-white font-bold py-4 rounded-xl shadow-md hover:bg-primary-700 transition-colors"
              >
                Tiến hành thanh toán ({selectedCount})
              </Link>
            ) : (
              <button 
                disabled
                className="w-full block text-center bg-slate-200 text-slate-400 font-bold py-4 rounded-xl cursor-not-allowed"
              >
                Tiến hành thanh toán (Chọn sản phẩm)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
