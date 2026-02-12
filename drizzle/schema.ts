import {
  integer,
  serial,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
  boolean,
  json,
} from "drizzle-orm/pg-core";

// Enums
const statusEnum = pgEnum("status", ["active", "suspended", "expired"]);
const planEnum = pgEnum("plan", ["basic", "pro", "enterprise"]);
const roleEnum = pgEnum("role", ["user", "admin", "owner"]);
const priorityEnum = pgEnum("priority", ["normal", "important", "urgent"]);
const targetTypeEnum = pgEnum("targetType", ["all", "users", "groups"]);
const recurrenceEnum = pgEnum("recurrence", ["none", "daily", "weekly", "monthly"]);
const deliveryStatusEnum = pgEnum("deliveryStatus", ["sent", "delivered", "failed"]);

// ✅ Feedback (um dos 3, pode trocar depois)
const feedbackEnum = pgEnum("deliveryFeedback", ["liked", "renew", "disliked"]);

/**
 * Tabela de Tenants (Clientes/Empresas)
 */
export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  ownerId: integer("ownerId"),
  status: statusEnum().notNull().$default(() => "active"),
  plan: planEnum().notNull().$default(() => "basic"),
  subscriptionExpiresAt: timestamp("subscriptionExpiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = typeof tenants.$inferInsert;

/**
 * Users
 * - Owner: role=owner, tenantId=null
 * - Admin: role=admin, tenantId=..., createdByAdminId=null
 * - User comum: role=user, tenantId=..., createdByAdminId=<admin.id>
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),

  tenantId: integer("tenantId"),

  // ✅ isolamento por admin (usuários comuns criados por um admin)
  createdByAdminId: integer("createdByAdminId"),

  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),

  // ✅ Login local com senha (hash). Pode ser nulo para bases antigas; no primeiro login a senha é definida.
  passwordHash: text("passwordHash"),

  role: roleEnum().notNull().$default(() => "user"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Grupos (isolados por Tenant e por Admin criador)
 */
export const groups = pgTable("groups", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").notNull(),

  // ✅ isolamento por admin
  createdByAdminId: integer("createdByAdminId").notNull(),

  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Group = typeof groups.$inferSelect;
export type InsertGroup = typeof groups.$inferInsert;

/**
 * Relação user <-> group
 */
export const userGroups = pgTable("user_groups", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  groupId: integer("groupId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Notificações/Mensagens (isoladas por tenant e criadas por admin)
 */
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  priority: priorityEnum().notNull().$default(() => "normal"),

  // id do admin criador
  createdBy: integer("createdBy").notNull(),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  targetType: targetTypeEnum().notNull().$default(() => "all"),
  targetIds: json("targetIds").$type<number[]>(),

  // anexos (imagem/video) — se seu sistema usar só uma url, mantém aqui
  imageUrl: varchar("imageUrl", { length: 500 }),

  isScheduled: boolean("isScheduled").default(false),
  scheduledFor: timestamp("scheduledFor"),
  recurrence: recurrenceEnum().$default(() => "none"),
  isActive: boolean("isActive").default(true),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

/**
 * Agendamentos
 */
export const schedules = pgTable("schedules", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  priority: priorityEnum().notNull().$default(() => "normal"),

  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),

  targetType: targetTypeEnum().notNull().$default(() => "all"),
  targetIds: json("targetIds").$type<number[]>(),
  imageUrl: varchar("imageUrl", { length: 500 }),

  scheduledFor: timestamp("scheduledFor").notNull(),
  recurrence: recurrenceEnum().$default(() => "none"),
  isActive: boolean("isActive").default(true),
  lastExecutedAt: timestamp("lastExecutedAt"),
});

export type Schedule = typeof schedules.$inferSelect;
export type InsertSchedule = typeof schedules.$inferInsert;

/**
 * Entregas (inbox do usuário)
 */
export const deliveries = pgTable("deliveries", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").notNull(),
  notificationId: integer("notificationId").notNull(),
  userId: integer("userId").notNull(),

  status: deliveryStatusEnum().notNull().$default(() => "sent"),

  deliveredAt: timestamp("deliveredAt"),
  readAt: timestamp("readAt"),
  isRead: boolean("isRead").default(false),

  errorMessage: text("errorMessage"),

  // ✅ feedback do usuário (liked | renew | disliked) e data do feedback
  feedback: feedbackEnum("feedback"),
  feedbackAt: timestamp("feedbackAt"),
});

export type Delivery = typeof deliveries.$inferSelect;
export type InsertDelivery = typeof deliveries.$inferInsert;

/**
 * Arquivos (isolados por tenant)
 */
export const files = pgTable("files", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId").notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  fileKey: varchar("fileKey", { length: 500 }).notNull(),
  url: varchar("url", { length: 500 }).notNull(),
  mimeType: varchar("mimeType", { length: 100 }),
  fileSize: integer("fileSize"),
  uploadedBy: integer("uploadedBy").notNull(),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
  relatedNotificationId: integer("relatedNotificationId"),
  isPublic: boolean("isPublic"),
});

export type File = typeof files.$inferSelect;
export type InsertFile = typeof files.$inferInsert;

/**
 * Logs (isolados por tenant e opcionalmente por admin)
 */
export const logs = pgTable("logs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId"),

  // ✅ opcional para auditoria por admin
  createdByAdminId: integer("createdByAdminId"),

  userId: integer("userId"),
  action: varchar("action", { length: 255 }).notNull(),
  entityType: varchar("entityType", { length: 100 }),
  entityId: integer("entityId"),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
