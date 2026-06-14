import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "backend"))

from dotenv import load_dotenv
load_dotenv()

from app.db.database import SessionLocal
from app.modules.user.models import User
from app.core.security import verify_password, get_password_hash

db = SessionLocal()
try:
    users = db.query(User).all()
    print(f"Total users found: {len(users)}")
    for u in users:
        print(f"User ID: {u.id}, Email: {u.email}, Role: {u.role}, Status: {u.status}")
        
        # Test password from .env
        env_admin_pw = os.getenv("SEED_ADMIN_PASSWORD")
        env_affiliate_pw = os.getenv("SEED_AFFILIATE_PASSWORD")
        
        if env_admin_pw and verify_password(env_admin_pw, u.password):
            print("  -> Password matches SEED_ADMIN_PASSWORD from .env")
        elif env_affiliate_pw and verify_password(env_affiliate_pw, u.password):
            print("  -> Password matches SEED_AFFILIATE_PASSWORD from .env")
        else:
            print("  -> Password does NOT match the values in the current .env file!")
            
except Exception as e:
    import traceback
    traceback.print_exc()
finally:
    db.close()
