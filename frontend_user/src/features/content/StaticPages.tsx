import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, ChevronRight, Mail, MapPin, Phone } from "lucide-react";

type PageKey = "returns" | "size" | "privacy" | "contact" | "faq";

const pages: Record<PageKey, {
  title: string;
  subtitle: string;
  sections: { title: string; items: string[] }[];
}> = {
  returns: {
    title: "Chính sách đổi trả",
    subtitle: "Quy trình đổi trả rõ ràng cho các đơn hàng còn nguyên điều kiện sử dụng.",
    sections: [
      {
        title: "Điều kiện đổi trả",
        items: [
          "Sản phẩm còn nguyên tem, nhãn, chưa qua sử dụng hoặc giặt ủi.",
          "Yêu cầu đổi trả được gửi trong vòng 7 ngày kể từ khi nhận hàng.",
          "Sản phẩm lỗi do nhà sản xuất được hỗ trợ đổi mới theo tình trạng tồn kho.",
        ],
      },
      {
        title: "Không áp dụng",
        items: [
          "Sản phẩm đã qua sử dụng, mất nhãn hoặc có dấu hiệu hư hỏng do bảo quản sai.",
          "Sản phẩm giảm giá sâu hoặc hàng thanh lý nếu có ghi chú không đổi trả.",
        ],
      },
    ],
  },
  size: {
    title: "Hướng dẫn chọn size",
    subtitle: "Chọn size theo số đo thực tế để giảm rủi ro phải đổi hàng.",
    sections: [
      {
        title: "Áo",
        items: [
          "Size S: ngực 86-92 cm, cân nặng tham khảo 45-55 kg.",
          "Size M: ngực 92-98 cm, cân nặng tham khảo 55-65 kg.",
          "Size L: ngực 98-104 cm, cân nặng tham khảo 65-75 kg.",
          "Size XL: ngực 104-112 cm, cân nặng tham khảo 75-85 kg.",
        ],
      },
      {
        title: "Quần",
        items: [
          "Đo vòng eo tại vị trí thường mặc quần, không siết thước quá chặt.",
          "Nếu nằm giữa hai size, chọn size lớn hơn để thoải mái khi vận động.",
        ],
      },
    ],
  },
  privacy: {
    title: "Chính sách bảo mật",
    subtitle: "Thông tin khách hàng chỉ được dùng để xử lý đơn hàng và chăm sóc sau bán.",
    sections: [
      {
        title: "Dữ liệu thu thập",
        items: [
          "Thông tin liên hệ, địa chỉ giao hàng và lịch sử mua hàng.",
          "Thông tin kỹ thuật cần thiết để bảo vệ tài khoản và chống gian lận.",
        ],
      },
      {
        title: "Cam kết",
        items: [
          "Không bán dữ liệu cá nhân của khách hàng cho bên thứ ba.",
          "Chỉ chia sẻ thông tin giao hàng cần thiết với đối tác vận chuyển/thanh toán.",
        ],
      },
    ],
  },
  contact: {
    title: "Liên hệ chúng tôi",
    subtitle: "Đội ngũ hỗ trợ tiếp nhận câu hỏi về đơn hàng, đổi trả và tư vấn sản phẩm.",
    sections: [
      {
        title: "Kênh hỗ trợ",
        items: [
          "Hotline: 1900 6789 - 028 3456 789.",
          "Email: support@zentis.com.",
          "Địa chỉ: 123 Đường Fashion, Quận 1, TP. HCM.",
        ],
      },
      {
        title: "Thời gian phản hồi",
        items: [
          "Tin nhắn và email thường được phản hồi trong giờ làm việc.",
          "Với đơn đang giao, vui lòng chuẩn bị mã đơn hàng để được hỗ trợ nhanh hơn.",
        ],
      },
    ],
  },
  faq: {
    title: "Câu hỏi thường gặp",
    subtitle: "Các câu trả lời nhanh cho những vấn đề khách hàng hỏi nhiều nhất.",
    sections: [
      {
        title: "Đơn hàng",
        items: [
          "Bạn có thể theo dõi đơn bằng tài khoản hoặc tra cứu bằng mã đơn và số điện thoại/email.",
          "Đơn ở trạng thái chờ xác nhận hoặc đã xác nhận có thể hủy trong trang tài khoản.",
        ],
      },
      {
        title: "Thanh toán và vận chuyển",
        items: [
          "Hệ thống hỗ trợ COD, chuyển khoản và VNPAY mock trong môi trường phát triển.",
          "Phí vận chuyển được tính theo địa chỉ nhận hàng và thông tin kiện hàng.",
        ],
      },
    ],
  },
};

/**
 * Trang nội dung tĩnh đa mục đích (FAQ, chính sách, hướng dẫn).
 * Dữ liệu nội dung được khai báo tĩnh trong `pages` cùng file,
 * giúp quản lý dễ dàng mà không cần API call.
 *
 * @param page - Khóa xác định trang cần hiển thị (được định nghĩa trong type PageKey).
 */
export function ContentPage({ page }: { page: PageKey }) {
  const data = pages[page];

  return (
    <div className="min-h-screen bg-slate-50 pb-20 pt-8">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center gap-2 text-sm text-slate-500">
          <Link to="/" className="hover:text-primary-600">
            Trang chủ
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span className="font-medium text-slate-900">{data.title}</span>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-3xl font-black text-slate-900">{data.title}</h1>
          <p className="mt-3 max-w-2xl text-slate-500">{data.subtitle}</p>

          <div className="mt-8 grid gap-5">
            {data.sections.map((section) => (
              <section key={section.title} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                <h2 className="text-base font-bold text-slate-900">{section.title}</h2>
                <ul className="mt-4 space-y-3">
                  {section.items.map((item) => (
                    <li key={item} className="flex gap-3 text-sm leading-6 text-slate-600">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Trang Lookbook hiển thị các bộ đồ theo chủ đề dưới dạng lưới ảnh có hover effect.
 * Mỗi item dẫn tới trang danh mục tương ứng để khách hàng mua hàng ngay.
 */
export function LookbookPage() {
  const looks = [
    {
      title: "Office Minimal",
      image: "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?q=80&w=900&auto=format&fit=crop",
      category: "/category/ao-thun",
    },
    {
      title: "Street Weekend",
      image: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=900&auto=format&fit=crop",
      category: "/category/quan-jean",
    },
    {
      title: "Clean Accessories",
      image: "https://images.unsplash.com/photo-1509319117193-57bab727e09d?q=80&w=900&auto=format&fit=crop",
      category: "/category/phu-kien",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 pb-20 pt-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center gap-2 text-sm text-slate-500">
          <Link to="/" className="hover:text-primary-600">
            Trang chủ
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span className="font-medium text-slate-900">Lookbook</span>
        </div>

        <div className="mb-8 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-3xl font-black text-slate-900">Lookbook Zentis</h1>
          <p className="mt-3 max-w-2xl text-slate-500">
            Gợi ý phối đồ theo từng bối cảnh để khách hàng chọn nhanh sản phẩm phù hợp.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {looks.map((look) => (
            <Link
              key={look.title}
              to={look.category}
              className="group overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="aspect-[3/4] overflow-hidden bg-slate-100">
                <img
                  src={look.image}
                  alt={look.title}
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </div>
              <div className="flex items-center justify-between p-5">
                <h2 className="font-bold text-slate-900">{look.title}</h2>
                <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-primary-600" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Dải liên hệ dạng inline (Phone / Email / Địa chỉ) được nhúng vào trang chủ hoặc footer.
 * Component này thuần túy (pure UI, không có state hay side effect).
 */
export function ContactStrip() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <div className="flex items-center gap-3 rounded-2xl bg-white p-4">
        <Phone className="h-5 w-5 text-primary-600" />
        <span className="text-sm font-semibold text-slate-700">1900 6789</span>
      </div>
      <div className="flex items-center gap-3 rounded-2xl bg-white p-4">
        <Mail className="h-5 w-5 text-primary-600" />
        <span className="text-sm font-semibold text-slate-700">support@zentis.com</span>
      </div>
      <div className="flex items-center gap-3 rounded-2xl bg-white p-4">
        <MapPin className="h-5 w-5 text-primary-600" />
        <span className="text-sm font-semibold text-slate-700">Quận 1, TP. HCM</span>
      </div>
    </div>
  );
}
