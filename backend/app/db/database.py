import os
import logging

from dotenv import load_dotenv
from sqlalchemy import create_engine, event
# SQLAlchemy 2.0+: declarative_base chuyển sang sqlalchemy.orm
# (sqlalchemy.ext.declarative.declarative_base bị deprecated)
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.orm import Session

load_dotenv()  # Đọc biến môi trường từ file .env

logger = logging.getLogger(__name__)

# Guard rõ ràng: tránh crash mơ hồ khi DATABASE_URL chưa được cấu hình
SQLALCHEMY_DATABASE_URL: str = os.getenv("DATABASE_URL", "")
if not SQLALCHEMY_DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL chưa được cấu hình trong file .env. "
        "Vui lòng thêm DATABASE_URL=<connection_string> vào .env."
    )

if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record) -> None:
        """Enable foreign-key constraints for the local SQLite development database."""
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
else:
    # Connection pool phù hợp cho Supabase/PgBouncer transaction mode.
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        pool_size=2,
        max_overflow=1,
        pool_timeout=10,
        pool_recycle=1800,
        pool_pre_ping=True,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class dùng chung cho tất cả SQLAlchemy ORM models trong dự án
Base = declarative_base()


def get_db() -> Session:
    """
    FastAPI dependency: cung cấp một SQLAlchemy Session cho mỗi request.

    Dùng pattern context manager (try/finally) để đảm bảo session luôn
    được đóng sau khi request hoàn thành, ngay cả khi có exception.
    Tránh rò rỉ kết nối từ connection pool.

    Ví dụ sử dụng::

        @router.get("/example")
        def example(db: Session = Depends(get_db)):
            return db.query(User).all()
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
