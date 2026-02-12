import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
  boolean,
  json,
} from "drizzle-orm/pg-core";

// Enums (tipos no Postgres)
const statusEnum = pgEnum("status", ["active", "suspended", "expired"]);
const planEnum = pgEnum("plan", ["basic", "pro", "enterprise"]);
const roleEnum = pgEnum("role", ["user", "admin", "owner"]);
const priorityEnum = pgEnum("priority", ["normal", "important", "urgent"]);
const targetTypeEnum = pgEnum("targetType", ["all", "users", "groups"]);
const recurrenceEnum = pgEnum("recurrence", ["none", "daily", "weekly", "monthly"]);
const deliveryStatusEnum = pgEnum("deliveryStatus", ["sent", "delivered", "failed"]);
const feedbackEnum = pgEnum("deliveryFeedback", ["liked", "renew", "disliked"]);

/**
 * Tabela de Tenants
 */
export const tenants = pgTable("tenants", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  ownerId: integer("ownerId"),

  // ✅ ENUMS PRECISAM DO NOME DA COLUNA
  status: statusEnum("status").notNull().default("active"),
  plan: planEnum("plan").notNull().default("basic"),

  subscriptionExpiresAt: timestamp("subscriptionExpiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = typeof tenants.$inferInsert;

/**
 * Users
 */
export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),

  tenantId: integer("tenantId"),
  createdByAdminId: integer("createdByAdminId"),

  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  passwordHash: text("passwordHash"),

  // ✅ AQUI ERA O BUG: roleEnum("role"), não roleEnum()
  role: roleEnum("role").notNull().default("user"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Grupos
 */
export const groups = pgTable("groups", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tenantId: integer("tenantId").notNull(),
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
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("userId").notNull(),
  groupId: integer("groupId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Notificações/Mensagens
 */
export const notifications = pgTable("notifications", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tenantId: integer("tenantId").notNull(),

  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),

  priority: priorityEnum("priority").notNull().default("normal"),

  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),

  targetType: targetTypeEnum("targetType").notNull().default("all"),
  targetIds: json("targetIds").$type<number[]>(),

  imageUrl: varchar("imageUrl", { length: 500 }),

  isScheduled: boolean("isScheduled").default(false),
  scheduledFor: timestamp("scheduledFor"),
  recurrence: recurrenceEnum("recurrence").notNull().default("none"),
  isActive: boolean("isActive").default(true),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

/**
 * Agendamentos
 */
export const schedules = pgTable("schedules", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tenantId: integer("tenantId").notNull(),

  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),

  priority: priorityEnum("priority").notNull().default("normal"),

  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),

  targetType: targetTypeEnum("targetType").notNull().default("all"),
  targetIds: json("targetIds").$type<number[]>(),
  imageUrl: varchar("imageUrl", { length: 500 }),

  scheduledFor: timestamp("scheduledFor").notNull(),
  recurrence: recurrenceEnum("recurrence").notNull().default("none"),
  isActive: boolean("isActive").default(true),
  lastExecutedAt: timestamp("lastExecutedAt"),
});

export type Schedule = typeof schedules.$inferSelect;
export type InsertSchedule = typeof schedules.$inferInsert;

/**
 * Entregas (inbox do usuário)
 */
export const deliveries = pgTable("deliveries", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tenantId: integer("tenantId").notNull(),
  notificationId: integer("notificationId").notNull(),
  userId: integer("userId").notNull(),

  status: deliveryStatusEnum("status").notNull().default("sent"),

  deliveredAt: timestamp("deliveredAt"),
  readAt: timestamp("readAt"),
  isRead: boolean("isRead").default(false),

  errorMessage: text("errorMessage"),

  feedback: feedbackEnum("feedback"),
  feedbackAt: timestamp("feedbackAt"),
});

export type Delivery = typeof deliveries.$inferSelect;
export type InsertDelivery = typeof deliveries.$inferInsert;

/**
 * Arquivos
 */
export const files = pgTable("files", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
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
 * Logs
 */
export const logs = pgTable("logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tenantId: integer("tenantId"),
  createdByAdminId: integer("createdByAdminId"),
  userId: integer("userId"),
  action: varchar("action", { length: 255 }).notNull(),
  entityType: varchar("entityType", { length: 100 }),
  entityId: integer("entityId"),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
