import { SignJWT, jwtVerify } from "jose";
import type { Request } from "express";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { ENV } from "./env";

type SessionPayload = {
  userId: number;
  role: "user" | "admin" | "owner";
  tenantId: number | null;
};

const encoder = new TextEncoder();

const secret = encoder.encode(ENV.SESSION_SECRET);

function getCookie(req: Request, name: string): string | null {
  const cookie = req.headers.cookie;
  if (!cookie) return null;

  const parts = cookie.split(";").map((c) => c.trim());
  const found = parts.find((c) => c.startsWith(`${name}=`));
  if (!found) return null;

  return decodeURIComponent(found.split("=")[1]);
}

export const sdk = {
  /**
   * Cria JWT da sessão
   */
  async createSessionToken(payload: SessionPayload) {
    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(secret);

    return token;
  },

  /**
   * Valida JWT
   */
  async verifySessionToken(token: string): Promise<SessionPayload> {
    const { payload } = await jwtVerify(token, secret);
    return payload as SessionPayload;
  },

  /**
   * Autenticação principal (usada no context)
   */
  async authenticateRequest(req: Request) {
    const token = getCookie(req, ENV.COOKIE_NAME);

    if (!token) return null;

    try {
      const session = await this.verifySessionToken(token);

      const db = await getDb();
      if (!db) return null;

      const rows = await db
        .select()
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1);

      if (!rows.length) return null;

      const user = rows[0];

      return {
        ...user,
        role: session.role,
        tenantId: session.tenantId,
      };
    } catch {
      return null;
    }
  },
};
