import { ForbiddenError } from "@shared/_core/errors";
import axios, { type AxiosInstance } from "axios";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";
import { ONE_YEAR_MS, AXIOS_TIMEOUT_MS } from "@shared/const";

import type {
  ExchangeTokenRequest,
  ExchangeTokenResponse,
  GetUserInfoResponse,
  GetUserInfoWithJwtRequest,
  GetUserInfoWithJwtResponse,
} from "./types/manusTypes";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
};

const EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
const GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
const GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;

// ✅ fonte única do nome do cookie
const SESSION_COOKIE_NAME = (ENV.sessionCookieName || "app_session_id").trim();

class OAuthService {
  constructor(private client: ReturnType<typeof axios.create>) {
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl || "(disabled)");
    if (!ENV.oAuthServerUrl) {
      console.warn("[OAuth] WARN: OAUTH_SERVER_URL is not configured. OAuth disabled.");
    }
  }

  private requireOAuth() {
    if (!ENV.oAuthServerUrl) {
      throw new Error("OAuth is disabled (OAUTH_SERVER_URL not set)");
    }
  }

  private decodeState(state: string): string {
    // state base64 -> redirectUri
    // ✅ Node-safe (atob não existe no Node)
    try {
      return Buffer.from(state, "base64").toString("utf-8");
    } catch {
      return "";
    }
  }

  async getTokenByCode(code: string, state: string): Promise<ExchangeTokenResponse> {
    this.requireOAuth();

    const redirectUri = this.decodeState(state);
    if (!redirectUri) {
      throw new Error("Invalid oauth state (cannot decode redirectUri)");
    }

    const payload: ExchangeTokenRequest = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri,
    };

    const { data } = await this.client.post<ExchangeTokenResponse>(EXCHANGE_TOKEN_PATH, payload);
    return data;
  }

  async getUserInfoByToken(token: ExchangeTokenResponse): Promise<GetUserInfoResponse> {
    this.requireOAuth();

    const { data } = await this.client.post<GetUserInfoResponse>(GET_USER_INFO_PATH, {
      accessToken: token.accessToken,
    });

    return data;
  }

  async getUserInfoWithJwt(jwtToken: string): Promise<GetUserInfoWithJwtResponse> {
    this.requireOAuth();

    const payload: GetUserInfoWithJwtRequest = {
      jwtToken,
      projectId: ENV.appId || "notifique-me",
    };

    const { data } = await this.client.post<GetUserInfoWithJwtResponse>(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    return data;
  }
}

const createOAuthHttpClient = (): AxiosInstance => {
  // quando OAuth estiver desabilitado, baseURL não importa (métodos vão bloquear).
  const baseURL = ENV.oAuthServerUrl || "http://127.0.0.1";
  return axios.create({
    baseURL,
    timeout: AXIOS_TIMEOUT_MS,
  });
};

class SDKServer {
  private readonly client: AxiosInstance;
  private readonly oauthService: OAuthService;

  constructor(client: AxiosInstance = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }

  private deriveLoginMethod(platforms: unknown, fallback: string | null | undefined): string | null {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;

    const set = new Set<string>(platforms.filter((p): p is string => typeof p === "string"));

    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";

    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }

  private isSystemOwner(openId: string): boolean {
    const ownerOpenId = ENV.ownerOpenId;
    if (!ownerOpenId) return false;
    return openId.toLowerCase() === ownerOpenId.toLowerCase();
  }

  async exchangeCodeForToken(code: string, state: string): Promise<ExchangeTokenResponse> {
    return this.oauthService.getTokenByCode(code, state);
  }

  async getUserInfo(accessToken: string): Promise<GetUserInfoResponse> {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken,
    } as ExchangeTokenResponse);

    const loginMethod = this.deriveLoginMethod((data as any)?.platforms, (data as any)?.platform ?? null);

    return {
      ...(data as any),
      platform: loginMethod,
      loginMethod,
    } as GetUserInfoResponse;
  }

  async getUserInfoWithJwt(jwtToken: string): Promise<GetUserInfoWithJwtResponse> {
    const data = await this.oauthService.getUserInfoWithJwt(jwtToken);

    const loginMethod = this.deriveLoginMethod(
      (data as any)?.platforms,
      (data as any)?.platform ?? (data as any)?.platform ?? null
    );

    return {
      ...(data as any),
      platform: loginMethod,
      loginMethod,
    } as GetUserInfoWithJwtResponse;
  }

  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) return new Map<string, string>();
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  private getSessionSecret() {
    const secret = ENV.cookieSecret;
    if (!secret) {
      if (ENV.isProduction) {
        throw new Error("COOKIE_SECRET is required in production");
      }
      return new TextEncoder().encode("dev-cookie-secret");
    }
    return new TextEncoder().encode(secret);
  }

  async createSessionToken(openId: string, options: { expiresInMs?: number; name?: string } = {}) {
    return this.signSession(
      { openId, appId: ENV.appId || "notifique-me", name: options.name || "" },
      { expiresInMs: options.expiresInMs }
    );
  }

  async signSession(payload: SessionPayload, options: { expiresInMs?: number } = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();

    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  async verifySession(cookieValue: string | undefined | null): Promise<SessionPayload | null> {
    if (!cookieValue) return null;

    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
      });

      const { openId, appId, name } = payload as Record<string, unknown>;
      if (!isNonEmptyString(openId)) return null;

      // ✅ Só valida appId quando ambos existem e são strings
      // (não quebra se ENV.appId estiver diferente/vazio em alguns ambientes)
      if (isNonEmptyString(appId) && isNonEmptyString(ENV.appId) && appId !== ENV.appId) {
        return null;
      }

      return {
        openId,
        appId: isNonEmptyString(appId) ? appId : (ENV.appId || "notifique-me"),
        name: isNonEmptyString(name) ? name : "",
      };
    } catch (error) {
      if (!ENV.isProduction) {
        console.warn("[Auth] Session verification failed:", String(error));
      }
      return null;
    }
  }

  async authenticateRequest(req: Request): Promise<User> {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(SESSION_COOKIE_NAME);

    // ✅ Não spammar logs (assets/healthchecks)
    if (!sessionCookie && !ENV.isProduction) {
      // só log em dev, e só se for request de API (onde importa)
      if (req.path?.startsWith("/api")) {
        console.warn("[Auth] Missing session cookie:", SESSION_COOKIE_NAME);
      }
    }

    const session = await this.verifySession(sessionCookie);
    if (!session) throw ForbiddenError("Invalid session cookie");

    const sessionUserId = session.openId;
    const signedInAt = new Date();

    // ✅ não criar usuário “do nada”
    let user = await db.getUserByOpenId(sessionUserId);
    if (!user) {
      throw ForbiddenError("User not found");
    }

    // garante owner
    if (this.isSystemOwner(user.openId) && user.role !== "owner") {
      await db.upsertUser({
        openId: user.openId,
        role: "owner",
        tenantId: null,
        lastSignedIn: signedInAt,
      } as any);

      user = await db.getUserByOpenId(user.openId);
      if (!user) throw ForbiddenError("User not found");
    }

    // atualiza lastSignedIn sempre
    await db.upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt,
    } as any);

    return user;
  }
}

export const sdk = new SDKServer();
