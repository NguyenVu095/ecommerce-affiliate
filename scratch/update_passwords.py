import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "backend"))

from dotenv import load_dotenv
load_dotenv()

from app.db.database import SessionLocal
from app.modules.user.models import User
from app.core.security import get_password_hash

db = SessionLocal()
try:
    admin_pw = os.getenv("SEED_ADMIN_PASSWORD")
    affiliate_pw = os.getenv("SEED_AFFILIATE_PASSWORD")
    
    if not admin_pw or not affiliate_pw:
        print("Error: SEED_ADMIN_PASSWORD or SEED_AFFILIATE_PASSWORD is not set in .env")
        sys.exit(1)
        
    admin = db.query(User).filter(User.email == "admin@gmail.com").first()
    if admin:
        admin.password = get_password_hash(admin_pw)
        print("Updated admin@gmail.com password in database.")
    else:
        print("admin@gmail.com user not found.")
        
    affiliate = db.query(User).filter(User.email == "affiliate_test@gmail.com").first()
    if affiliate:
        affiliate.password = get_password_hash(affiliate_pw)
        print("Updated affiliate_test@gmail.com password in database.")
    else:
        print("affiliate_test@gmail.com user not found.")
        
    db.commit()
    print("Changes committed successfully.")
except Exception as e:
    db.rollback()
    import traceback
    traceback.print_exc()
finally:
    db.close()
