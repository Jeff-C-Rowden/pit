import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { getDb, type UserRow } from "./db";
import { newId } from "./rng";

const SESSION_COOKIE = "pit_session";
const AGE_COOKIE = "pit_age";
const SESSION_DAYS = 7;

export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  ageConfirmed: boolean;
  isOperator: boolean;
  balanceCents: number;
  depositLimitCents: number | null;
  lossLimitCents: number | null;
};

export function toPublic(u: UserRow): PublicUser {
  return {
    id: u.id,
    email: u.email,
    displayName: u.display_name,
    ageConfirmed: !!u.age_confirmed,
    isOperator: !!u.is_operator,
    balanceCents: u.balance_cents,
    depositLimitCents: u.deposit_limit_cents,
    lossLimitCents: u.loss_limit_cents,
  };
}

export function hashPassword(pw: string): string {
  return bcrypt.hashSync(pw, 10);
}

export function verifyPassword(pw: string, hash: string): boolean {
  return bcrypt.compareSync(pw, hash);
}

export function createUser(opts: { email: string; password: string; displayName: string; ageConfirmed: boolean }): UserRow {
  const db = getDb();
  const email = opts.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("invalid email");
  if (opts.password.length < 8) throw new Error("password must be at least 8 characters");
  if (!opts.ageConfirmed) throw new Error("you must confirm you are 21 or older");
  const operatorEmail = (process.env.OPERATOR_EMAIL || "pitboss@pit.local").toLowerCase();
  const now = new Date().toISOString();
  const row: UserRow = {
    id: newId(),
    email,
    password_hash: hashPassword(opts.password),
    display_name: opts.displayName.trim().slice(0, 40) || email.split("@")[0]!,
    age_confirmed: 1,
    is_operator: email === operatorEmail ? 1 : 0,
    balance_cents: 0,
    deposit_limit_cents: null,
    loss_limit_cents: null,
    created_at: now,
  };
  db.prepare(
    `INSERT INTO users (id, email, password_hash, display_name, age_confirmed, is_operator, balance_cents, deposit_limit_cents, loss_limit_cents, created_at)
     VALUES (@id, @email, @password_hash, @display_name, @age_confirmed, @is_operator, @balance_cents, @deposit_limit_cents, @loss_limit_cents, @created_at)`
  ).run(row);
  return row;
}

export function loginUser(email: string, password: string): { user: UserRow; token: string } {
  const db = getDb();
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase()) as UserRow | undefined;
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new Error("invalid email or password");
  }
  const token = newId() + newId();
  const now = new Date();
  const exp = new Date(now.getTime() + SESSION_DAYS * 86400_000);
  db.prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
    token, user.id, now.toISOString(), exp.toISOString()
  );
  return { user, token };
}

export function sessionCookieOptions(token: string) {
  const secure =
    process.env.NODE_ENV === "production" || process.env.PIT_COOKIE_SECURE === "1";
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_DAYS * 86400,
    secure,
  };
}

export function getUserByToken(token: string | undefined | null): UserRow | null {
  if (!token) return null;
  const db = getDb();
  const row = db.prepare(
    `SELECT u.* FROM users u JOIN sessions s ON s.user_id = u.id
     WHERE s.token = ? AND s.expires_at > ?`
  ).get(token, new Date().toISOString()) as UserRow | undefined;
  return row ?? null;
}

export function destroySession(token: string) {
  getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export async function getSessionUser(): Promise<UserRow | null> {
  const jar = cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  return getUserByToken(token);
}

export function requireUserFromRequest(req: Request): UserRow {
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(/(?:^|; )pit_session=([^;]+)/);
  const token = m ? decodeURIComponent(m[1]!) : null;
  const user = getUserByToken(token);
  if (!user) {
    const err = new Error("unauthorized");
    (err as Error & { status: number }).status = 401;
    throw err;
  }
  return user;
}

export { SESSION_COOKIE, AGE_COOKIE };
