import { Link } from "react-router-dom";
import { Share2, Camera, Send, ArrowRight, Mail, Phone, MapPin } from "lucide-react";
import NewsletterForm from "./NewsletterForm";

export default function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-300 pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
          
          {/* Brand Info */}
          <div className="space-y-6">
            <Link to="/" className="flex items-center gap-2 text-white group">
              <div className="w-10 h-10 bg-white text-slate-900 flex items-center justify-center rounded-xl group-hover:bg-primary-500 group-hover:text-white transition-colors">
                <span className="font-black text-xl">Z</span>
              </div>
              <span className="font-bold text-2xl tracking-tight">ZENTIS</span>
            </Link>
            <p className="text-slate-400 leading-relaxed text-sm">
              Nâng tầm phong cách cá nhân với những thiết kế thời trang hiện đại, tinh tế và dẫn đầu xu hướng. Zentis - Nơi khẳng định cái tôi bản lĩnh.
            </p>
            <div className="flex gap-4">
              <Link to="/lookbook" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-primary-600 hover:text-white transition-all">
                <Share2 className="w-5 h-5" />
              </Link>
              <Link to="/lookbook" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-primary-600 hover:text-white transition-all">
                <Camera className="w-5 h-5" />
              </Link>
              <Link to="/lien-he" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-primary-600 hover:text-white transition-all">
                <Send className="w-5 h-5" />
              </Link>
              <Link to="/sale" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-primary-600 hover:text-white transition-all">
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-white font-bold text-lg mb-6">Mua Sắm</h3>
            <ul className="space-y-4 text-sm">
              <li><Link to="/category/nam" className="hover:text-white transition-colors">Thời Trang Nam</Link></li>
              <li><Link to="/category/nu" className="hover:text-white transition-colors">Thời Trang Nữ</Link></li>
              <li><Link to="/category/phu-kien" className="hover:text-white transition-colors">Phụ Kiện</Link></li>
              <li><Link to="/sale" className="hover:text-white transition-colors">Bộ Sưu Tập Sale</Link></li>
              <li><Link to="/lookbook" className="hover:text-white transition-colors">Lookbook 2024</Link></li>
            </ul>
          </div>

          {/* Customer Service */}
          <div>
            <h3 className="text-white font-bold text-lg mb-6">Hỗ Trợ Khách Hàng</h3>
            <ul className="space-y-4 text-sm">
              <li><Link to="/chinh-sach-doi-tra" className="hover:text-white transition-colors">Chính Sách Đổi Trả</Link></li>
              <li><Link to="/huong-dan-chon-size" className="hover:text-white transition-colors">Hướng Dẫn Chọn Size</Link></li>
              <li><Link to="/order-lookup" className="hover:text-white transition-colors">Tra Cứu Đơn Hàng</Link></li>
              <li><Link to="/chinh-sach-bao-mat" className="hover:text-white transition-colors">Chính Sách Bảo Mật</Link></li>
              <li><Link to="/lien-he" className="hover:text-white transition-colors">Liên Hệ Chúng Tôi</Link></li>
              <li><Link to="/cau-hoi-thuong-gap" className="hover:text-white transition-colors">Câu Hỏi Thường Gặp</Link></li>
            </ul>
          </div>

          {/* Newsletter */}
          <div>
            <h3 className="text-white font-bold text-lg mb-6">Đăng Ký Bản Tin</h3>
            <p className="text-slate-400 text-sm mb-6">Đừng bỏ lỡ những thông tin ưu đãi và bộ sưu tập mới nhất.</p>
            <NewsletterForm
              source="footer"
              variant="dark"
              compact
              placeholder="Email của bạn..."
            />
            <div className="mt-8">
              <h4 className="text-white font-semibold text-xs uppercase tracking-widest mb-4">Phương Thức Thanh Toán</h4>
              <div className="flex gap-3 grayscale opacity-50">
                <img src="https://upload.wikimedia.org/wikipedia/commons/d/d0/VNPAY_Logo.png" alt="VNPAY" className="h-4 object-contain" />
                <img src="https://upload.wikimedia.org/wikipedia/vi/f/fe/MoMo_Logo.png" alt="Momo" className="h-5 object-contain" />
                <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Visa_Inc._logo.svg/2560px-Visa_Inc._logo.svg.png" alt="Visa" className="h-4 object-contain" />
              </div>
            </div>
          </div>

        </div>

        {/* Contact Info Bottom */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-8 border-t border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-primary-500">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-tighter">Địa chỉ</p>
              <p className="text-sm font-medium">123 Đường Fashion, Quận 1, TP. HCM</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-primary-500">
              <Phone className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-tighter">Hotline</p>
              <p className="text-sm font-medium">1900 6789 - 028 3456 789</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-primary-500">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-tighter">Email</p>
              <p className="text-sm font-medium">support@zentis.com</p>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="pt-8 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-slate-500">
            © 2024 Zentis. Tất cả các quyền được bảo lưu.
          </p>
          <div className="flex gap-6 text-xs text-slate-500">
            <Link to="/cau-hoi-thuong-gap" className="hover:text-white transition-colors">Điều khoản sử dụng</Link>
            <Link to="/chinh-sach-bao-mat" className="hover:text-white transition-colors">Bảo mật dữ liệu</Link>
            <Link to="/products" className="hover:text-white transition-colors">Sơ đồ trang web</Link>
          </div>
        </div>

      </div>
    </footer>
  );
}
