import os
import re

model_names = [
    "User", "UserAddress", "Product", "ProductVariant", "ProductReview",
    "Category", "Coupon", "CouponUsage", "Order", "OrderItem",
    "ShippingMethod", "PaymentMethod", "OrderStatusHistory",
    "AffiliateClick", "AffiliateCommission", "AffiliateConversion",
    "AffiliateLink", "NewsletterSubscription", "ChatSession", "ChatMessage",
    "WithdrawalRequest", "TokenBlocklist"
]

backend_dir = r"d:\Project\ecommerce-affiliate\backend\app"
counts = {name: 0 for name in model_names}
files_referencing = {name: [] for name in model_names}

for root, dirs, files in os.walk(backend_dir):
    for file in files:
        if not file.endswith(".py"):
            continue
        file_path = os.path.join(root, file)
        
        # Skip pycache
        if "__pycache__" in file_path:
            continue
            
        is_definition_file = "models.py" in file or "model_models.py" in file or "variant_models.py" in file or "review_models.py" in file
        
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
                
            for name in model_names:
                matches = re.findall(r"\b" + name + r"\b", content)
                if matches:
                    if is_definition_file:
                        continue
                    if file == "main.py":
                        continue
                    counts[name] += len(matches)
                    files_referencing[name].append(os.path.relpath(file_path, backend_dir))
        except Exception as e:
            print(f"Error reading {file_path}: {e}")

print("--- MODEL USAGE STATS ---")
for name in model_names:
    print(f"Model: {name}")
    print(f"  Total usage count (outside model def & main.py): {counts[name]}")
    print(f"  Referenced in: {list(set(files_referencing[name]))}")
    print()
