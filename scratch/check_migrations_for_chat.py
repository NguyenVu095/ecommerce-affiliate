import os

versions_dir = r"d:\Project\ecommerce-affiliate\backend\alembic\versions"
found = False
for file in os.listdir(versions_dir):
    if not file.endswith(".py"):
        continue
    file_path = os.path.join(versions_dir, file)
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    if "chat_sessions" in content or "chat_messages" in content:
        print(f"Found chat table references in migration: {file}")
        found = True

if not found:
    print("No chat table references found in any alembic migrations.")
