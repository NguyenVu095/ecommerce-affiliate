with open("d:/Project/ecommerce-affiliate/backend/app/modules/order/routes.py", "r", encoding="utf-8") as f:
    lines = f.readlines()
for idx, line in enumerate(lines):
    if "AffiliateConversion" in line:
        print(f"Line {idx+1}: {line.strip()}")
