import os
import re

versions_dir = r"d:\Project\ecommerce-affiliate\backend\alembic\versions"
tables_created = set()

for file in os.listdir(versions_dir):
    if not file.endswith(".py"):
        continue
    file_path = os.path.join(versions_dir, file)
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Find all table names in op.create_table('table_name', ...
    matches = re.findall(r"op\.create_table\(\s*['\"]([^'\"]+)['\"]", content)
    for match in matches:
        tables_created.add(match)

print("Tables created in Alembic migrations:")
for table in sorted(tables_created):
    print(f"- {table}")
