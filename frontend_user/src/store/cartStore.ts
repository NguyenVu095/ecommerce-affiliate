import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CartItem {
  product_id: number;
  variant_id: number;
  name: string;
  variant_info?: string; // "M / Đen"
  price: number;
  image_url: string;
  quantity: number;
  selected?: boolean;
}

interface CartState {
  items: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (variantId: number) => void;
  updateQuantity: (variantId: number, quantity: number) => void;
  clearCart: () => void;
  getTotalItems: () => number;
  getTotalPrice: () => number;
  toggleSelect: (variantId: number) => void;
  toggleSelectAll: (checked: boolean) => void;
  clearSelectedItems: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      
      addToCart: (newItem) => {
        set((state) => {
          const existingItem = state.items.find(item => item.variant_id === newItem.variant_id);
          if (existingItem) {
            return {
              items: state.items.map(item => 
                item.variant_id === newItem.variant_id 
                  ? { ...item, quantity: item.quantity + newItem.quantity, selected: true }
                  : item
              )
            };
          }
          return {
            items: [...state.items, { ...newItem, selected: true }]
          };
        });
      },
      
      removeFromCart: (variantId) => {
        set((state) => ({
          items: state.items.filter(item => item.variant_id !== variantId)
        }));
      },
      
      updateQuantity: (variantId, quantity) => {
        set((state) => ({
          items: state.items.map(item => 
            item.variant_id === variantId 
              ? { ...item, quantity: Math.max(1, quantity) }
              : item
          )
        }));
      },
      
      clearCart: () => set({ items: [] }),
      
      getTotalItems: () => {
        return get().items.reduce((total, item) => total + item.quantity, 0);
      },
      
      getTotalPrice: () => {
        return get().items
          .filter(item => item.selected !== false)
          .reduce((total, item) => total + (item.price * item.quantity), 0);
      },

      toggleSelect: (variantId) => {
        set((state) => ({
          items: state.items.map(item =>
            item.variant_id === variantId
              ? { ...item, selected: item.selected === false ? true : !item.selected }
              : item
          )
        }));
      },

      toggleSelectAll: (checked) => {
        set((state) => ({
          items: state.items.map(item => ({ ...item, selected: checked }))
        }));
      },

      clearSelectedItems: () => {
        set((state) => ({
          items: state.items.filter(item => item.selected === false)
        }));
      }
    }),
    {
      name: 'ecommerce-cart-storage',
    }
  )
)
