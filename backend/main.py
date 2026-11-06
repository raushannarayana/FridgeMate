"""FridgeMate backend v2 - FastAPI + SQLAlchemy. QR is the primary identity; NFC is an optional extra label."""
import os, io, re, smtplib, secrets, hashlib, hmac, time, random, logging, datetime as dt
from collections import defaultdict, deque
from email.message import EmailMessage
from typing import Optional
from zoneinfo import ZoneInfo
from fastapi import FastAPI, Depends, HTTPException, Header, Request, Query, Response, UploadFile, File
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import (create_engine, String, Float, Date, DateTime, ForeignKey, Text, Integer,
                        UniqueConstraint, select, func)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker, Session
import jwt, qrcode
from urllib.parse import urlparse
from PIL import Image, ImageDraw, ImageFont, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
def _normalize_db_url(url):
    """Hosts (Render, Neon, Supabase...) hand out 'postgres://...' or 'postgresql://...'. This project installs the psycopg 3 driver,
    which SQLAlchemy only uses when the address starts with 'postgresql+psycopg://'. Without this, the app crashes looking for psycopg2."""
    for old in ("postgres://", "postgresql://"):
        if url.startswith(old): return "postgresql+psycopg://" + url[len(old):]
    return url
DB_URL = _normalize_db_url(os.getenv("DATABASE_URL", "sqlite:///fridgemate.db"))
SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
PUBLIC_URL = os.getenv("PUBLIC_URL", "")
DEMO_MODE = os.getenv("DEMO_MODE", "true").lower() == "true"
# Name-only sign-in (no email/password). Convenient for demos, hostels and classrooms; turn off with QUICK_LOGIN=false.
QUICK_LOGIN = os.getenv("QUICK_LOGIN", "true").lower() == "true"
GUEST_DOMAIN = "guest.fridgemate.local"
if SECRET == "change-me-in-production" and not DEMO_MODE:  # production-style run (DEMO_MODE=false) with the publicly known default key = anyone could forge logins
    raise RuntimeError("Set JWT_SECRET to a long random value (e.g. python -c \"import secrets;print(secrets.token_urlsafe(48))\") when DEMO_MODE=false.")
# Browser origins allowed to call the API from another address: the Vite dev server and the Android app (Capacitor serves it from https://localhost).
# The website served by this same server needs no CORS entry (same origin). Add more origins with CORS_ORIGINS=a,b,c.
CORS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,https://localhost,http://localhost,capacitor://localhost").split(",") if o.strip()]
# pool_pre_ping: test a connection before using it; a free Postgres that went to sleep drops idle connections, and this reconnects instead of failing the request.
engine = create_engine(DB_URL, pool_pre_ping=True, pool_recycle=300, connect_args={"check_same_thread": False} if DB_URL.startswith("sqlite") else {})
SessionLocal = sessionmaker(engine, expire_on_commit=False)
now = lambda: dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)  # all timestamps stored in UTC
logger = logging.getLogger("fridgemate")

class Base(DeclarativeBase): pass

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    email: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    pw: Mapped[str] = mapped_column(String(200))
    created: Mapped[dt.datetime] = mapped_column(DateTime, default=now)

class Fridge(Base):
    __tablename__ = "refrigerators"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    code: Mapped[str] = mapped_column(String(12), unique=True)
    timezone: Mapped[str] = mapped_column(String(40), default="Asia/Kolkata")

class Member(Base):
    __tablename__ = "refrigerator_members"
    __table_args__ = (UniqueConstraint("fridge_id", "user_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    fridge_id: Mapped[int] = mapped_column(ForeignKey("refrigerators.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    role: Mapped[str] = mapped_column(String(10), default="member")

class Food(Base):
    __tablename__ = "food_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    fridge_id: Mapped[int] = mapped_column(ForeignKey("refrigerators.id"), index=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    category: Mapped[str] = mapped_column(String(40), default="Other")
    quantity: Mapped[float] = mapped_column(Float, default=1)
    unit: Mapped[str] = mapped_column(String(20), default="pcs")
    location: Mapped[str] = mapped_column(String(60), default="")
    storage_date: Mapped[dt.date] = mapped_column(Date, default=dt.date.today)
    expiry_date: Mapped[Optional[dt.date]] = mapped_column(Date, nullable=True)
    expiry_type: Mapped[str] = mapped_column(String(15), default="manufacturer")
    permission: Mapped[str] = mapped_column(String(12), default="shared")
    notes: Mapped[str] = mapped_column(Text, default="")
    state: Mapped[str] = mapped_column(String(12), default="active")  # active|consumed|removed
    consumed_at: Mapped[Optional[dt.datetime]] = mapped_column(DateTime, nullable=True)
    created: Mapped[dt.datetime] = mapped_column(DateTime, default=now)

class Label(Base):
    """One row per physical label. QR and NFC have SEPARATE tokens, so each can be deactivated/regenerated alone."""
    __tablename__ = "food_labels"
    id: Mapped[int] = mapped_column(primary_key=True)
    food_id: Mapped[int] = mapped_column(ForeignKey("food_items.id"), index=True)
    type: Mapped[str] = mapped_column(String(3))  # QR | NFC
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(12), default="active")  # active|deactivated|regenerated
    created: Mapped[dt.datetime] = mapped_column(DateTime, default=now)
    written_at: Mapped[Optional[dt.datetime]] = mapped_column(DateTime, nullable=True)
    last_scanned: Mapped[Optional[dt.datetime]] = mapped_column(DateTime, nullable=True)
    scan_count: Mapped[int] = mapped_column(Integer, default=0)

class SharingRequest(Base):
    __tablename__ = "sharing_requests"
    id: Mapped[int] = mapped_column(primary_key=True)
    food_id: Mapped[int] = mapped_column(ForeignKey("food_items.id"), index=True)
    requester_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    quantity: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(10), default="pending")
    created: Mapped[dt.datetime] = mapped_column(DateTime, default=now)

class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (UniqueConstraint("user_id", "key"),)  # duplicate prevention at DB level
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    key: Mapped[str] = mapped_column(String(80))
    text: Mapped[str] = mapped_column(String(250))
    created: Mapped[dt.datetime] = mapped_column(DateTime, default=now)

class Activity(Base):
    __tablename__ = "food_activity_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    fridge_id: Mapped[int] = mapped_column(ForeignKey("refrigerators.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    text: Mapped[str] = mapped_column(String(250))
    created: Mapped[dt.datetime] = mapped_column(DateTime, default=now)

class PasswordReset(Base):
    __tablename__ = "password_resets"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires: Mapped[dt.datetime] = mapped_column(DateTime)
    used: Mapped[int] = mapped_column(Integer, default=0)

# ---------- helpers ----------
def hash_pw(p, salt=None):
    salt = salt or secrets.token_hex(16)
    return salt + "$" + hashlib.pbkdf2_hmac("sha256", p.encode(), salt.encode(), 200_000).hex()
def check_pw(p, stored): return hmac.compare_digest(hash_pw(p, stored.split("$")[0]), stored)

_hits = defaultdict(deque)
def limited(name, n, sec):
    """Simple in-memory rate limiter (per IP). Use Redis for multi-process deployments."""
    def dep(request: Request):
        if os.getenv("RATE_LIMIT_OFF"): return
        q = _hits[(name, request.client.host if request.client else "?")]; t = time.time()
        while q and q[0] < t - sec: q.popleft()
        if len(q) >= n: raise HTTPException(429, "Too many requests - please slow down")
        q.append(t)
    return Depends(dep)

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()
def _user_from(authorization, db):
    if not authorization or not authorization.startswith("Bearer "): return None
    try: uid = jwt.decode(authorization[7:], SECRET, algorithms=["HS256"])["sub"]
    except Exception: return None
    return db.get(User, int(uid))
def current_user(authorization: str = Header(None), db: Session = Depends(get_db)):
    u = _user_from(authorization, db)
    if not u: raise HTTPException(401, "Not authenticated")
    return u
def optional_user(authorization: str = Header(None), db: Session = Depends(get_db)): return _user_from(authorization, db)

def membership(db, fid, uid): return db.scalar(select(Member).where(Member.fridge_id == fid, Member.user_id == uid))
def require_member(db, fid, user):
    m = membership(db, fid, user.id)
    if not m: raise HTTPException(403, "Not a member of this refrigerator")
    return m
def log(db, fid, user, text): db.add(Activity(fridge_id=fid, user_id=user.id, text=f"{user.name} {text}"))
def notify(db, uid, key, text):
    if not db.scalar(select(Notification).where(Notification.user_id == uid, Notification.key == key)):
        db.add(Notification(user_id=uid, key=key, text=text))

def today_for(db, fid):  # "today" in the refrigerator's own timezone
    f = db.get(Fridge, fid)
    try: return dt.datetime.now(ZoneInfo(f.timezone)).date()
    except Exception: return dt.date.today()
def status_of(f, db):
    if f.state != "active": return f.state
    if not f.expiry_date: return "fresh"
    d = (f.expiry_date - today_for(db, f.fridge_id)).days
    return "expired" if d < 0 else "expiring" if d <= 3 else "fresh"
def can_see(f, uid): return f.permission != "personal" or f.owner_id == uid

def new_label(db, food_id, typ):
    l = Label(food_id=food_id, type=typ, token=secrets.token_urlsafe(32)); db.add(l); return l
def active_label(db, food_id, typ):
    return db.scalar(select(Label).where(Label.food_id == food_id, Label.type == typ, Label.status == "active"))
def food_dict(db, f):
    o = db.get(User, f.owner_id)
    labels = {l.type: l for l in db.scalars(select(Label).where(Label.food_id == f.id).order_by(Label.id))}  # latest per type
    return dict(id=f.id, fridge_id=f.fridge_id, name=f.name, category=f.category, quantity=f.quantity, unit=f.unit,
        location=f.location, storage_date=f.storage_date, expiry_date=f.expiry_date, expiry_type=f.expiry_type,
        permission=f.permission, notes=f.notes, owner=o.name, owner_id=f.owner_id, status=status_of(f, db),
        qr_active=bool(labels.get("QR") and labels["QR"].status == "active"),
        nfc_active=bool(labels.get("NFC") and labels["NFC"].status == "active"))

# ---------- schemas ----------
class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=80); email: EmailStr; password: str = Field(min_length=8, max_length=100)
class LoginIn(BaseModel): email: EmailStr; password: str
class QuickIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    @field_validator("name")
    @classmethod
    def clean(cls, v):
        v = " ".join(v.split())
        if not v or not re.fullmatch(r"[\w .'-]+", v, re.UNICODE): raise ValueError("Use letters, numbers and spaces only")
        return v
class ForgotIn(BaseModel): email: EmailStr
class ResetIn(BaseModel): token: str; password: str = Field(min_length=8, max_length=100)
class FridgeIn(BaseModel):
    name: str = Field(min_length=1, max_length=80); timezone: str = "Asia/Kolkata"
    @field_validator("timezone")
    @classmethod
    def tz(cls, v):
        try: ZoneInfo(v)
        except Exception: raise ValueError("Unknown timezone")
        return v
class JoinIn(BaseModel): code: str
class RoleIn(BaseModel): role: str = Field(pattern="^(admin|member)$")
class FoodIn(BaseModel):
    name: str = Field(min_length=1, max_length=100); category: str = "Other"
    quantity: float = Field(gt=0, le=100000); unit: str = "pcs"; location: str = ""
    storage_date: Optional[dt.date] = None; expiry_date: Optional[dt.date] = None
    expiry_type: str = Field("manufacturer", pattern="^(manufacturer|estimated)$")
    permission: str = Field("shared", pattern="^(personal|shared|available)$"); notes: str = Field("", max_length=500)
class ReqIn(BaseModel): quantity: float = Field(gt=0)

app = FastAPI(title="FridgeMate API", version="2.0")
app.add_middleware(CORSMiddleware, allow_origins=CORS, allow_methods=["*"], allow_headers=["*"], expose_headers=["X-Total-Count"])
@app.middleware("http")
async def permissions_policy(request: Request, call_next):
    """Explicitly allow this site (and only this site) to use the camera; no microphone/location are needed."""
    resp = await call_next(request); resp.headers.setdefault("Permissions-Policy", "camera=(self), microphone=(), geolocation=()"); return resp

@app.exception_handler(HTTPException)
async def http_err(_, e):  # one consistent error format (keeps "detail" for older clients)
    return JSONResponse({"detail": e.detail, "error": {"status": e.status_code, "message": e.detail}}, e.status_code)
@app.exception_handler(RequestValidationError)
async def val_err(_, e):
    msg = "Invalid input: " + ", ".join(str(x["loc"][-1]) for x in e.errors())
    return JSONResponse({"detail": msg, "error": {"status": 422, "message": msg}}, 422)

@app.get("/api/config")
def config(request: Request):
    b = base_url(request)
    return {"demo": DEMO_MODE, "quick_login": QUICK_LOGIN, "label_base_url": b, "label_url_is_local": _is_local(urlparse(b).hostname)}

# ---------- auth ----------
def token_for(u): return jwt.encode({"sub": str(u.id), "exp": now() + dt.timedelta(days=7)}, SECRET, "HS256")
@app.post("/api/auth/register", dependencies=[limited("reg", 10, 3600)])
def register(b: RegisterIn, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.email == b.email.lower())): raise HTTPException(409, "Email already registered")
    u = User(name=b.name, email=b.email.lower(), pw=hash_pw(b.password)); db.add(u); db.commit()
    return {"token": token_for(u), "user": {"id": u.id, "name": u.name}}
@app.post("/api/auth/login", dependencies=[limited("login", 10, 60)])
def login(b: LoginIn, db: Session = Depends(get_db)):
    u = db.scalar(select(User).where(User.email == b.email.lower()))
    if not u or not check_pw(b.password, u.pw): raise HTTPException(401, "Invalid email or password")
    return {"token": token_for(u), "user": {"id": u.id, "name": u.name}}
@app.post("/api/auth/quick", dependencies=[limited("quick", 20, 60)])
def quick_login(b: QuickIn, db: Session = Depends(get_db)):
    """Sign in with just a name. The same name (case-insensitive) always returns the same guest account, which joins the first
    fridge automatically. Guest accounts have no usable password, and real email accounts can never be reached this way."""
    if not QUICK_LOGIN: raise HTTPException(403, "Name-only sign-in is switched off - please use email and password")
    slug = re.sub(r"[^\w]+", "-", b.name.lower(), flags=re.UNICODE).strip("-") or "guest"
    email = f"{slug}@{GUEST_DOMAIN}"; u = db.scalar(select(User).where(User.email == email))
    if not u:
        u = User(name=b.name, email=email, pw=hash_pw(secrets.token_urlsafe(24))); db.add(u); db.flush()
        fr = db.scalar(select(Fridge).order_by(Fridge.id))
        if not fr: fr = Fridge(name="Shared Fridge", code=secrets.token_hex(4).upper()); db.add(fr); db.flush(); db.add(Member(fridge_id=fr.id, user_id=u.id, role="admin"))
        else: db.add(Member(fridge_id=fr.id, user_id=u.id)); log(db, fr.id, u, "joined the refrigerator")
        db.commit()
    return {"token": token_for(u), "user": {"id": u.id, "name": u.name}}
def send_mail(to, subject, body):
    if os.getenv("SMTP_HOST"):
        m = EmailMessage(); m["To"], m["Subject"], m["From"] = to, subject, os.getenv("SMTP_FROM", "noreply@fridgemate.local"); m.set_content(body)
        with smtplib.SMTP(os.getenv("SMTP_HOST"), int(os.getenv("SMTP_PORT", "587"))) as s:
            s.starttls(); s.login(os.getenv("SMTP_USER", ""), os.getenv("SMTP_PASSWORD", "")); s.send_message(m)
    else: print(f"\n[DEV EMAIL] to={to}\n{subject}\n{body}\n", flush=True)  # console email backend
@app.post("/api/auth/forgot", dependencies=[limited("forgot", 5, 3600)])
def forgot(b: ForgotIn, request: Request, db: Session = Depends(get_db)):
    u = db.scalar(select(User).where(User.email == b.email.lower()))
    if u:
        t = secrets.token_urlsafe(32)
        db.add(PasswordReset(user_id=u.id, token_hash=hashlib.sha256(t.encode()).hexdigest(), expires=now() + dt.timedelta(hours=1))); db.commit()
        send_mail(u.email, "FridgeMate password reset", f"Reset link (valid 1 hour): {(PUBLIC_URL or str(request.base_url)).rstrip('/')}/reset?token={t}")
    return {"ok": True}  # same answer whether or not the email exists; token never returned
@app.post("/api/auth/reset", dependencies=[limited("reset", 10, 3600)])
def reset(b: ResetIn, db: Session = Depends(get_db)):
    r = db.scalar(select(PasswordReset).where(PasswordReset.token_hash == hashlib.sha256(b.token.encode()).hexdigest()))
    if not r or r.used or r.expires < now(): raise HTTPException(400, "Reset link is invalid or expired")
    db.get(User, r.user_id).pw = hash_pw(b.password); r.used = 1; db.commit(); return {"ok": True}
@app.get("/api/me")
def me(u: User = Depends(current_user)): return {"id": u.id, "name": u.name, "email": u.email}
@app.get("/api/me/export")
def export(u: User = Depends(current_user), db: Session = Depends(get_db)):
    foods = db.scalars(select(Food).where(Food.owner_id == u.id)).all()
    return {"user": {"name": u.name, "email": u.email, "created": u.created}, "foods": [food_dict(db, f) for f in foods],
            "notifications": [n.text for n in db.scalars(select(Notification).where(Notification.user_id == u.id))]}
@app.delete("/api/me")
def delete_me(u: User = Depends(current_user), db: Session = Depends(get_db)):
    for m in db.scalars(select(Member).where(Member.user_id == u.id)): db.delete(m)
    for f in db.scalars(select(Food).where(Food.owner_id == u.id, Food.state == "active")): f.state = "removed"
    u.name, u.email, u.pw = "Deleted user", f"deleted-{u.id}@invalid", secrets.token_hex(32); db.commit(); return {"ok": True}

# ---------- fridges ----------
@app.post("/api/fridges")
def create_fridge(b: FridgeIn, u: User = Depends(current_user), db: Session = Depends(get_db)):
    f = Fridge(name=b.name, timezone=b.timezone, code=secrets.token_hex(4).upper()); db.add(f); db.flush()
    db.add(Member(fridge_id=f.id, user_id=u.id, role="admin")); log(db, f.id, u, "created the refrigerator"); db.commit()
    return {"id": f.id, "name": f.name, "code": f.code, "role": "admin"}
@app.post("/api/fridges/join")
def join(b: JoinIn, u: User = Depends(current_user), db: Session = Depends(get_db)):
    f = db.scalar(select(Fridge).where(Fridge.code == b.code.strip().upper()))
    if not f: raise HTTPException(404, "Invalid invitation code")
    if not membership(db, f.id, u.id): db.add(Member(fridge_id=f.id, user_id=u.id)); log(db, f.id, u, "joined the refrigerator"); db.commit()
    return {"id": f.id, "name": f.name}
@app.get("/api/fridges")
def my_fridges(u: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.execute(select(Fridge, Member.role).join(Member, Member.fridge_id == Fridge.id).where(Member.user_id == u.id)).all()
    return [{"id": f.id, "name": f.name, "role": r, "timezone": f.timezone, "code": f.code if r == "admin" else None} for f, r in rows]
@app.get("/api/fridges/{fid}/members")
def members(fid: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    require_member(db, fid, u)
    rows = db.execute(select(User.id, User.name, Member.role).join(Member, Member.user_id == User.id).where(Member.fridge_id == fid)).all()
    return [{"id": i, "name": n, "role": r} for i, n, r in rows]
@app.patch("/api/fridges/{fid}/members/{uid}")
def set_role(fid: int, uid: int, b: RoleIn, u: User = Depends(current_user), db: Session = Depends(get_db)):
    if require_member(db, fid, u).role != "admin": raise HTTPException(403, "Admins only")
    m = membership(db, fid, uid)
    if not m: raise HTTPException(404, "Member not found")
    m.role = b.role; log(db, fid, u, f"changed a member's role to {b.role}"); db.commit(); return {"ok": True}
@app.delete("/api/fridges/{fid}/members/{uid}")
def remove_member(fid: int, uid: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    if require_member(db, fid, u).role != "admin": raise HTTPException(403, "Admins only")
    m = membership(db, fid, uid)
    if m: db.delete(m); log(db, fid, u, "removed a member"); db.commit()
    return {"ok": True}
@app.get("/api/fridges/{fid}/activity")
def activity(fid: int, limit: int = Query(30, le=100), offset: int = 0, u: User = Depends(current_user), db: Session = Depends(get_db)):
    require_member(db, fid, u)
    rows = db.scalars(select(Activity).where(Activity.fridge_id == fid).order_by(Activity.id.desc()).limit(limit).offset(offset))
    return [{"text": a.text, "time": a.created} for a in rows]

# ---------- food ----------
@app.post("/api/fridges/{fid}/foods")
def add_food(fid: int, b: FoodIn, u: User = Depends(current_user), db: Session = Depends(get_db)):
    require_member(db, fid, u)
    f = Food(fridge_id=fid, owner_id=u.id, **{**b.model_dump(), "storage_date": b.storage_date or dt.date.today()})
    db.add(f); db.flush(); new_label(db, f.id, "QR"); log(db, fid, u, f"added {f.name}"); log(db, fid, u, f"generated a QR label for {f.name}"); db.commit()
    return food_dict(db, f)
@app.get("/api/fridges/{fid}/foods")
def list_foods(fid: int, response: Response, q: str = "", permission: str = "", limit: int = Query(100, ge=1, le=200), offset: int = Query(0, ge=0),
               u: User = Depends(current_user), db: Session = Depends(get_db)):
    require_member(db, fid, u)
    stmt = select(Food).where(Food.fridge_id == fid, Food.state == "active").order_by(Food.expiry_date.is_(None), Food.expiry_date)
    if q: stmt = stmt.where(Food.name.ilike(f"%{q}%"))
    if permission: stmt = stmt.where(Food.permission == permission)
    vis = [f for f in db.scalars(stmt) if can_see(f, u.id)]
    response.headers["X-Total-Count"] = str(len(vis))
    return [food_dict(db, f) for f in vis[offset:offset + limit]]
def own_food(db, fid, u):
    f = db.get(Food, fid)
    if not f or f.state == "removed" or not can_see(f, u.id): raise HTTPException(404, "Food not found")
    require_member(db, f.fridge_id, u); return f
def owner_food(db, fid, u):
    f = own_food(db, fid, u)
    if f.owner_id != u.id: raise HTTPException(403, "Only the owner can do this")
    return f
@app.get("/api/foods/{fid}")
def get_food(fid: int, u: User = Depends(current_user), db: Session = Depends(get_db)): return food_dict(db, own_food(db, fid, u))
@app.patch("/api/foods/{fid}")
def edit_food(fid: int, b: FoodIn, u: User = Depends(current_user), db: Session = Depends(get_db)):
    f = owner_food(db, fid, u)
    for k, v in b.model_dump().items():
        if v is not None: setattr(f, k, v)
    log(db, f.fridge_id, u, f"updated {f.name}"); db.commit(); return food_dict(db, f)
@app.post("/api/foods/{fid}/consume")
def consume(fid: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    f = own_food(db, fid, u)
    if f.owner_id != u.id and f.permission != "shared": raise HTTPException(403, "Not allowed - ask the owner or send a request")
    f.state = "consumed"; f.consumed_at = now(); log(db, f.fridge_id, u, f"consumed {f.name}"); db.commit(); return {"ok": True}
@app.delete("/api/foods/{fid}")
def delete_food(fid: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    f = own_food(db, fid, u)
    if f.owner_id != u.id and membership(db, f.fridge_id, u.id).role != "admin": raise HTTPException(403, "Not allowed")
    f.state = "removed"
    for l in db.scalars(select(Label).where(Label.food_id == f.id, Label.status == "active")): l.status = "deactivated"
    log(db, f.fridge_id, u, f"removed {f.name}"); db.commit(); return {"ok": True}

# ---------- labels: QR (primary) + NFC (optional) ----------
def _is_local(host):
    return (host or "").strip("[]").lower() in ("", "localhost", "127.0.0.1", "0.0.0.0", "::1")
def base_url(request):
    """Origin printed inside every QR/NFC label. A phone can never open http://localhost, so a localhost PUBLIC_URL
    is ignored whenever the app is being used through a real address (LAN IP, ngrok, domain)."""
    configured = PUBLIC_URL.strip().rstrip("/")
    if configured and not _is_local(urlparse(configured).hostname): return configured
    if not _is_local(request.url.hostname): return str(request.base_url).rstrip("/")  # honours X-Forwarded-* with --proxy-headers
    return configured or str(request.base_url).rstrip("/")
def font(n):
    try: return ImageFont.load_default(size=n)
    except TypeError: return ImageFont.load_default()
def qr_image(url, px):
    """Square QR that fits in px*px. Integer module size (no blurry resampling) and the standard 4-module quiet zone."""
    q = qrcode.QRCode(box_size=1, border=0, error_correction=qrcode.constants.ERROR_CORRECT_M); q.add_data(url); q.make(fit=True)
    n = q.modules_count; box = max(1, px // (n + 8)); side = (n + 8) * box
    out = Image.new("RGB", (px, px), "white"); d = ImageDraw.Draw(out); off = (px - side) // 2 + 4 * box
    for r, row in enumerate(q.get_matrix()):
        for c, on in enumerate(row):
            if on: d.rectangle((off + c * box, off + r * box, off + (c + 1) * box - 1, off + (r + 1) * box - 1), fill="black")
    return out
def nfc_icon(d, cx, cy, r):
    d.ellipse((cx - 6, cy - 6, cx + 6, cy + 6), fill="black")
    for i in (1, 2, 3): d.arc((cx - 6 - i * r, cy - 6 - i * r, cx + 6 + i * r, cy + 6 + i * r), -45, 45, fill="black", width=7)
def build_label(name, owner, expiry, qr_url=None, nfc=False):
    """5 cm x 5 cm sticker at 300 dpi (591 px)."""
    S = 591; img = Image.new("RGB", (S, S), "white"); d = ImageDraw.Draw(img)
    d.rounded_rectangle((4, 4, S - 5, S - 5), 24, outline="#16a34a", width=6); y = 24
    if qr_url: img.paste(qr_image(qr_url, 330), ((S - 330) // 2, y)); y += 340
    else: nfc_icon(d, S // 2 - 60, 150, 36); d.text((S // 2, 280), "TAP PHONE HERE", fill="black", font=font(34), anchor="mm"); y = 330
    d.text((S // 2, y + 20), name[:24], fill="black", font=font(38), anchor="mm")
    d.text((S // 2, y + 66), f"Owner: {owner}", fill="#444", font=font(28), anchor="mm")
    d.text((S // 2, y + 104), f"Exp: {expiry or 'n/a'}", fill="#444", font=font(28), anchor="mm")
    if nfc and qr_url: nfc_icon(d, S - 70, S - 55, 10); d.text((S - 120, S - 55), "NFC", fill="black", font=font(24), anchor="rm")
    d.text((26, S - 30), "FridgeMate", fill="#16a34a", font=font(22), anchor="lm"); return img
def encode(img, fmt):
    buf = io.BytesIO(); img.save(buf, "PDF" if fmt == "pdf" else "PNG", resolution=300)
    return Response(buf.getvalue(), media_type="application/pdf" if fmt == "pdf" else "image/png")
@app.get("/api/foods/{fid}/label")
def label_image(fid: int, request: Request, type: str = Query("qr", pattern="^(qr|nfc|combined)$"), fmt: str = Query("png", pattern="^(png|pdf)$"),
                u: User = Depends(current_user), db: Session = Depends(get_db)):
    f = owner_food(db, fid, u); ql, nl = active_label(db, f.id, "QR"), active_label(db, f.id, "NFC")
    if type in ("qr", "combined") and not ql: raise HTTPException(409, "No active QR label - regenerate it first")
    if type == "nfc" and not nl: raise HTTPException(409, "No active NFC label - create one first")
    owner = db.get(User, f.owner_id).name
    return encode(build_label(f.name, owner, f.expiry_date, f"{base_url(request)}/q/{ql.token}" if type != "nfc" else None, nfc=bool(nl) and type == "combined"), fmt)
@app.get("/api/fridges/{fid}/labels/sheet")
def label_sheet(fid: int, request: Request, u: User = Depends(current_user), db: Session = Depends(get_db)):
    """A4 sheet (4 x 5) of 5 cm QR labels for the caller's own active food."""
    require_member(db, fid, u); S = 591; sheet = Image.new("RGB", (2480, 3508), "white"); n = 0
    for f in db.scalars(select(Food).where(Food.fridge_id == fid, Food.owner_id == u.id, Food.state == "active")):
        ql = active_label(db, f.id, "QR")
        if not ql or n >= 20: continue
        sheet.paste(build_label(f.name, u.name, f.expiry_date, f"{base_url(request)}/q/{ql.token}", bool(active_label(db, f.id, "NFC"))), (60 + (n % 4) * (S + 20), 60 + (n // 4) * (S + 20))); n += 1
    if not n: raise HTTPException(404, "No active food with QR labels")
    return encode(sheet, "pdf")
@app.get("/api/foods/{fid}/labels")
def labels(fid: int, request: Request, u: User = Depends(current_user), db: Session = Depends(get_db)):
    f = owner_food(db, fid, u)
    return [{"id": l.id, "type": l.type, "status": l.status, "created": l.created, "written_at": l.written_at, "last_scanned": l.last_scanned,
             "scan_count": l.scan_count, "url": f"{base_url(request)}/q/{l.token}" if l.status == "active" else None}
            for l in db.scalars(select(Label).where(Label.food_id == f.id).order_by(Label.id.desc()))]
@app.post("/api/foods/{fid}/labels/{typ}/regenerate")
def regen(fid: int, typ: str, u: User = Depends(current_user), db: Session = Depends(get_db)):
    if typ not in ("qr", "nfc"): raise HTTPException(404, "Unknown label type")
    f = owner_food(db, fid, u); T = typ.upper()
    old = active_label(db, f.id, T)
    if old: old.status = "regenerated"
    new_label(db, f.id, T); log(db, f.fridge_id, u, f"{'regenerated' if old else 'created'} the {T} label for {f.name}"); db.commit(); return {"ok": True}
@app.post("/api/foods/{fid}/labels/{typ}/deactivate")
def deactivate(fid: int, typ: str, u: User = Depends(current_user), db: Session = Depends(get_db)):
    if typ not in ("qr", "nfc"): raise HTTPException(404, "Unknown label type")
    f = owner_food(db, fid, u); l = active_label(db, f.id, typ.upper())
    if l: l.status = "deactivated"; log(db, f.fridge_id, u, f"deactivated the {typ.upper()} label for {f.name}"); db.commit()
    return {"ok": True}
@app.post("/api/foods/{fid}/labels/nfc/written")
def nfc_written(fid: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    f = owner_food(db, fid, u); l = active_label(db, f.id, "NFC")
    if not l: raise HTTPException(409, "No active NFC label")
    l.written_at = now(); log(db, f.fridge_id, u, f"wrote an NFC tag for {f.name}"); db.commit(); return {"ok": True}

@app.get("/api/qr/{token}", dependencies=[limited("lookup", 60, 60)])
def scan(token: str, u: Optional[User] = Depends(optional_user), db: Session = Depends(get_db)):
    """Shared lookup for QR and NFC tokens."""
    l = db.scalar(select(Label).where(Label.token == token))
    if not l: raise HTTPException(404, "Invalid code")
    f = db.get(Food, l.food_id)
    if f.state == "removed": raise HTTPException(404, "This food item was removed")
    if l.status == "regenerated": raise HTTPException(410, "This label was replaced by a newer one")
    if l.status == "deactivated": raise HTTPException(410, "This label has been deactivated")
    l.scan_count += 1; l.last_scanned = now(); db.commit()
    if u and membership(db, f.fridge_id, u.id) and can_see(f, u.id): return {"access": "member", "via": l.type, **food_dict(db, f)}
    if f.permission == "personal": return {"access": "public", "via": l.type, "name": f.name, "permission": "personal", "status": status_of(f, db)}
    return {"access": "public", "via": l.type, "name": f.name, "owner": db.get(User, f.owner_id).name.split()[0], "permission": f.permission, "status": status_of(f, db)}

# ---------- sharing ----------
@app.post("/api/foods/{fid}/request")
def request_food(fid: int, b: ReqIn, u: User = Depends(current_user), db: Session = Depends(get_db)):
    f = own_food(db, fid, u)
    if f.permission != "available" or f.owner_id == u.id or f.state != "active": raise HTTPException(400, "Food is not available to take")
    if b.quantity > f.quantity: raise HTTPException(400, "Requested quantity exceeds availability")
    r = SharingRequest(food_id=f.id, requester_id=u.id, quantity=b.quantity); db.add(r); db.flush()
    notify(db, f.owner_id, f"req:{r.id}", f"{u.name} requested {b.quantity:g} {f.unit} of {f.name}")
    log(db, f.fridge_id, u, f"requested {f.name}"); db.commit(); return {"id": r.id}
@app.get("/api/fridges/{fid}/requests")
def my_requests(fid: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    require_member(db, fid, u)
    rows = db.execute(select(SharingRequest, Food).join(Food, Food.id == SharingRequest.food_id).where(Food.fridge_id == fid).order_by(SharingRequest.id.desc())).all()
    return [{"id": r.id, "food": f.name, "quantity": r.quantity, "unit": f.unit, "status": r.status, "created": r.created,
             "requester": db.get(User, r.requester_id).name, "incoming": f.owner_id == u.id}
            for r, f in rows if f.owner_id == u.id or r.requester_id == u.id]
@app.post("/api/requests/{rid}/{action}")
def decide(rid: int, action: str, u: User = Depends(current_user), db: Session = Depends(get_db)):
    if action not in ("approve", "reject"): raise HTTPException(404, "Unknown action")
    r = db.scalar(select(SharingRequest).where(SharingRequest.id == rid).with_for_update())
    if not r: raise HTTPException(404, "Request not found")
    f = db.scalar(select(Food).where(Food.id == r.food_id).with_for_update())  # row lock (PostgreSQL) prevents double claiming
    if f.owner_id != u.id: raise HTTPException(403, "Only the owner can decide")
    if r.status != "pending": raise HTTPException(409, "Already decided")
    if action == "approve":
        if r.quantity > f.quantity: raise HTTPException(409, "Not enough quantity left")
        f.quantity -= r.quantity
        if f.quantity <= 0: f.state = "consumed"; f.consumed_at = now()
        r.status = "approved"
    else: r.status = "rejected"
    notify(db, r.requester_id, f"dec:{r.id}", f"Your request for {f.name} was {r.status}")
    log(db, f.fridge_id, u, f"{r.status} a request for {f.name}"); db.commit(); return {"status": r.status}

# ---------- expiry reminders, notifications, analytics ----------
def generate_reminders(db, user_id=None):
    """Idempotent: the (user, key) unique constraint guarantees one reminder per food per milestone."""
    stmt = select(Food).where(Food.state == "active", Food.expiry_date.is_not(None))
    if user_id: stmt = stmt.where(Food.owner_id == user_id)
    for f in db.scalars(stmt):
        d = (f.expiry_date - today_for(db, f.fridge_id)).days
        if d in (3, 1, 0): notify(db, f.owner_id, f"exp:{f.id}:{d}", f"{f.name} " + ("expires today" if d == 0 else f"expires in {d} day(s)"))
    db.commit()
def reminder_job():
    with SessionLocal() as db: generate_reminders(db)
@app.get("/api/notifications")
def notifications(limit: int = Query(50, le=100), u: User = Depends(current_user), db: Session = Depends(get_db)):
    generate_reminders(db, u.id)
    return [{"text": n.text, "time": n.created} for n in db.scalars(select(Notification).where(Notification.user_id == u.id).order_by(Notification.id.desc()).limit(limit))]

PERISHABLE = {"Dairy", "Meat", "Leftovers", "Fish", "Vegetables"}
@app.get("/api/fridges/{fid}/analytics")
def analytics(fid: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    require_member(db, fid, u)
    today = today_for(db, fid)
    visible = [f for f in db.scalars(select(Food).where(Food.fridge_id == fid, Food.state != "removed")) if can_see(f, u.id)]
    by_status, by_cat, by_member, by_perm, monthly, ranked = {}, {}, {}, {}, {}, []
    for f in visible:
        s = status_of(f, db); by_status[s] = by_status.get(s, 0) + 1
        by_cat[f.category] = by_cat.get(f.category, 0) + 1
        n = db.get(User, f.owner_id).name; by_member[n] = by_member.get(n, 0) + 1
        if f.state == "active": by_perm[f.permission] = by_perm.get(f.permission, 0) + 1
        k = None
        if f.state == "consumed" and f.consumed_at: k, col = f.consumed_at.strftime("%Y-%m"), "consumed"
        elif f.state == "active" and f.expiry_date and f.expiry_date < today: k, col = f.expiry_date.strftime("%Y-%m"), "expired"
        if k: monthly.setdefault(k, {"month": k, "consumed": 0, "expired": 0})[col] += 1
        if f.state == "active" and f.expiry_date:
            d = (f.expiry_date - today).days
            parts = ["Already expired - check before use" if d < 0 else "Expires today" if d == 0 else f"Expires in {d} day(s)"]
            if f.quantity >= 3: parts.append(f"large quantity ({f.quantity:g} {f.unit})")
            if f.category in PERISHABLE: parts.append("perishable category")
            ranked.append((d - (0.5 if f.category in PERISHABLE else 0) - (0.25 if f.quantity >= 3 else 0), {**food_dict(db, f), "reason": ", ".join(parts)}))
    ap = db.execute(select(func.count(), func.coalesce(func.sum(SharingRequest.quantity), 0)).join(Food, Food.id == SharingRequest.food_id)
                    .where(Food.fridge_id == fid, SharingRequest.status == "approved")).one()
    wasted = by_status.get("expired", 0)
    insights = [f"{n} of {c} items in the '{cat}' category have expired - consider buying smaller quantities." for cat, c in by_cat.items()
                for n in [sum(1 for f in visible if f.category == cat and status_of(f, db) == "expired")] if c >= 4 and n / c >= 0.3]
    return {"total": len(visible), "by_status": by_status, "by_category": by_cat, "by_member": by_member, "by_permission": by_perm,
            "monthly": sorted(monthly.values(), key=lambda m: m["month"]), "shared_transactions": ap[0],
            "waste_avoided_items": ap[0], "waste_avoided_note": "Estimate: every approved share counts as one item that was not thrown away. It is not a measured quantity.",
            "expired_count": wasted, "insights": insights, "consume_first": [x for _, x in sorted(ranked, key=lambda t: t[0])[:5]]}

# ---------- OCR (optional, needs the tesseract binary + pytesseract) ----------
def parse_date(raw):
    m = re.match(r"^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$", raw)
    try:
        if m:
            d, mo, y = map(int, m.groups()); y += 2000 if y < 100 else 0
            return dt.date(y, mo, d)
        m = re.match(r"^(\d{1,2})[/\-.](\d{4})$", raw)
        if m:
            mo, y = map(int, m.groups()); return (dt.date(y + (mo == 12), mo % 12 + 1, 1) - dt.timedelta(days=1))
    except ValueError: return None
def extract_dates(text):
    out = []
    for line in text.splitlines():
        low = line.lower()
        kind = "expiry" if re.search(r"exp|best before|use by|\bbb\b|b\.b", low) else "manufacture" if re.search(r"mfg|mfd|manufactur|pkd|packed", low) else "unknown"
        for m in re.finditer(r"\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{1,2}[/\-.]\d{4}", line):
            d = parse_date(m.group())
            if d: out.append({"kind": kind, "date": d.isoformat(), "raw": m.group(), "confidence": "medium" if kind != "unknown" else "low"})
    return out
@app.post("/api/ocr/dates", dependencies=[limited("ocr", 20, 60)])
async def ocr_dates(file: UploadFile = File(...), u: User = Depends(current_user)):
    data = await file.read()
    if len(data) > 5 * 1024 * 1024: raise HTTPException(413, "Image larger than 5 MB")
    try: img = Image.open(io.BytesIO(data)); fmt = img.format; img.load()
    except Exception: raise HTTPException(415, "Not a valid image")
    if fmt not in ("JPEG", "PNG", "WEBP"): raise HTTPException(415, "Only JPEG, PNG or WebP allowed")
    try: import pytesseract
    except ImportError: raise HTTPException(501, "OCR engine (pytesseract/Tesseract) is not installed on this server - enter the date manually")
    text = pytesseract.image_to_string(ImageOps.autocontrast(ImageOps.grayscale(ImageOps.exif_transpose(img))))
    return {"candidates": extract_dates(text), "needs_confirmation": True, "note": "OCR can be wrong. Always confirm the date against the package."}

# ---------- demo data ----------
def seed():
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        if db.scalar(select(User)): return  # existing data is never touched
        if not DEMO_MODE: return  # a fresh PUBLIC database must not get the demo accounts (alice@demo.com / demo1234 ...)
        rng = random.Random(7); mk = lambda n, e: User(name=n, email=e, pw=hash_pw("demo1234"))
        a, b, c = mk("Alice", "alice@demo.com"), mk("Bob", "bob@demo.com"), mk("Carol", "carol@demo.com")
        f1, f2 = Fridge(name="Hostel Fridge", code="DEMO1234"), Fridge(name="Family Fridge", code="FAMILY01")
        db.add_all([a, b, c, f1, f2]); db.flush()
        db.add_all([Member(fridge_id=f1.id, user_id=a.id, role="admin"), Member(fridge_id=f1.id, user_id=b.id), Member(fridge_id=f1.id, user_id=c.id),
                    Member(fridge_id=f2.id, user_id=c.id, role="admin"), Member(fridge_id=f2.id, user_id=a.id)])
        t = dt.date.today(); n0 = now(); D = lambda n: t + dt.timedelta(days=n)
        def add(fr, o, name, cat, q, unit, exp, perm, age=0, state="active", cons=None):
            f = Food(fridge_id=fr.id, owner_id=o.id, name=name, category=cat, quantity=q, unit=unit, expiry_date=exp, permission=perm, state=state,
                     created=n0 - dt.timedelta(days=age), storage_date=t - dt.timedelta(days=age), consumed_at=cons)
            db.add(f); db.flush(); db.add(Label(food_id=f.id, type="QR", token=secrets.token_urlsafe(32)))
            db.add(Activity(fridge_id=fr.id, user_id=o.id, text=f"{o.name} added {name}", created=n0 - dt.timedelta(days=age)))
            if cons: db.add(Activity(fridge_id=fr.id, user_id=o.id, text=f"{o.name} consumed {name}", created=cons))
            return f
        add(f1, a, "Greek Yogurt", "Dairy", 2, "cups", D(1), "personal", 2); add(f1, a, "Pasta Sauce", "Pantry", 1, "jar", D(30), "shared", 5)
        pan = add(f1, b, "Paneer", "Dairy", 400, "g", D(3), "available", 1); add(f1, b, "Milk", "Dairy", 1, "l", D(-1), "shared", 6)
        add(f1, a, "Apples", "Fruit", 6, "pcs", D(7), "available", 3); add(f1, c, "Leftover Biryani", "Leftovers", 1, "box", D(1), "available", 1)
        add(f2, c, "Idli Batter", "Pantry", 1, "l", D(2), "shared", 1); add(f2, a, "Cheese", "Dairy", 200, "g", D(10), "personal", 4)
        names = [("Milk", "Dairy"), ("Eggs", "Dairy"), ("Curd", "Dairy"), ("Bread", "Bakery"), ("Apples", "Fruit"), ("Leftover Rice", "Leftovers"), ("Spinach", "Vegetables"), ("Chicken", "Meat"), ("Juice", "Beverages")]
        for _ in range(38):
            nm, cat = rng.choice(names); o = rng.choice([a, b, c]); age = rng.randint(4, 60)
            if rng.random() < 0.72: add(f1, o, nm, cat, 1, "pcs", D(-age + 5), "shared", age, "consumed", n0 - dt.timedelta(days=age - rng.randint(1, 3)))
            else: add(f1, o, nm, cat, 1, "pcs", D(-(age // 2) - 1), "shared", age)
        for i in range(4):
            fd = add(f1, b, rng.choice(["Cake", "Samosas", "Fruit Salad", "Pizza"]), "Leftovers", 2, "pcs", D(-20 + i), "available", 22 - i, "consumed", n0 - dt.timedelta(days=18 - i))
            db.add(SharingRequest(food_id=fd.id, requester_id=a.id, quantity=2, status="approved", created=n0 - dt.timedelta(days=19 - i)))
        db.add(SharingRequest(food_id=pan.id, requester_id=a.id, quantity=200))
        db.add_all([Notification(user_id=a.id, key="seed:1", text="Greek Yogurt expires in 1 day(s)"), Notification(user_id=b.id, key="seed:2", text="Alice requested 200 g of Paneer")])
        db.commit()
seed()

@app.on_event("startup")
def start_scheduler():
    if os.getenv("DISABLE_SCHEDULER"): return
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        s = BackgroundScheduler(timezone="UTC"); s.add_job(reminder_job, "interval", hours=1, next_run_time=dt.datetime.now(dt.timezone.utc)); s.start()
    except ImportError: logger.warning("APScheduler missing - reminders are generated when notifications are opened")

# ---------- frontend (React build if present, else the static fallback) ----------
DIST = os.getenv("FRONTEND_DIST", os.path.join(HERE, "frontend_dist"))
if os.path.isdir(os.path.join(DIST, "assets")):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST, "assets")), name="assets")
    @app.get("/{path:path}")
    def spa(path: str):
        p = os.path.realpath(os.path.join(DIST, path))
        return FileResponse(p) if path and p.startswith(os.path.realpath(DIST)) and os.path.isfile(p) else FileResponse(os.path.join(DIST, "index.html"))
else:
    app.mount("/static", StaticFiles(directory=os.path.join(HERE, "static")), name="static")
    @app.get("/q/{token}")
    def q_redirect(token: str): return RedirectResponse(f"/#/q/{token}")
    @app.get("/")
    def index(): return FileResponse(os.path.join(HERE, "static", "index.html"))
