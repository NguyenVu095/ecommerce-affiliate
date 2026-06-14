import { Suspense, lazy, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";

const ChatWidget = lazy(() => import("./components/chat/ChatWidget"));
const ProductList = lazy(() => import("./features/product/ProductList"));
const ProductDetail = lazy(() => import("./features/product/ProductDetail"));
const CategoryPage = lazy(() => import("./features/product/CategoryPage"));
const AllProductsPage = lazy(() => import("./features/product/AllProductsPage"));
const CheckoutPage = lazy(() => import("./features/checkout/CheckoutPage"));
const VnpayMock = lazy(() => import("./features/payment/VnpayMock"));
const LoginPage = lazy(() => import("./features/auth/LoginPage"));
const RegisterPage = lazy(() => import("./features/auth/RegisterPage"));
const AccountPage = lazy(() => import("./features/account/AccountPage"));
const OrderLookupPage = lazy(() => import("./features/account/OrderLookupPage"));
const SearchPage = lazy(() => import("./features/product/SearchPage"));
const SalePage = lazy(() => import("./features/product/SalePage"));
const ContentPage = lazy(() =>
  import("./features/content/StaticPages").then((module) => ({
    default: module.ContentPage,
  })),
);
const LookbookPage = lazy(() =>
  import("./features/content/StaticPages").then((module) => ({
    default: module.LookbookPage,
  })),
);

function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-sm font-medium text-slate-500">
      Đang tải...
    </div>
  );
}

function DeferredChatWidget() {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShouldRender(true), 1500);
    return () => window.clearTimeout(timer);
  }, []);

  if (!shouldRender) return null;
  return (
    <Suspense fallback={null}>
      <ChatWidget />
    </Suspense>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <Navbar />

        {/* Main Content */}
        <main className="flex-1 max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<ProductList />} />
              <Route path="/products" element={<AllProductsPage />} />
              <Route path="/category/:slug" element={<CategoryPage />} />
              <Route path="/product/:id" element={<ProductDetail />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/sale" element={<SalePage />} />
              <Route path="/lookbook" element={<LookbookPage />} />
              <Route path="/checkout" element={<CheckoutPage />} />
              <Route path="/vnpay-mock" element={<VnpayMock />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/order-lookup" element={<OrderLookupPage />} />
              <Route path="/chinh-sach-doi-tra" element={<ContentPage page="returns" />} />
              <Route path="/huong-dan-chon-size" element={<ContentPage page="size" />} />
              <Route path="/chinh-sach-bao-mat" element={<ContentPage page="privacy" />} />
              <Route path="/lien-he" element={<ContentPage page="contact" />} />
              <Route path="/cau-hoi-thuong-gap" element={<ContentPage page="faq" />} />
            </Routes>
          </Suspense>
        </main>

        <Footer />
        <DeferredChatWidget />
      </div>

    </BrowserRouter>
  );
}

export default App;
