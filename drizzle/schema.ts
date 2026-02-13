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

// Enums (tipos Postgres)
const statusEnum = pgEnum("status", ["active", "suspended", "expired"]);
const planEnum = pgEnum("plan", ["basic", "pro", "enterprise"]);
const roleEnum = pgEnum("role", ["user", "admin", "owner"]);
const priorityEnum = pgEnum("priority", ["normal", "important", "urgent"]);
const targetTypeEnum = pgEnum("targetType", ["all", "users", "groups"]);
const recurrenceEnum = pgEnum("recurrence", ["none", "daily", "weekly", "monthly"]);
const deliveryStatusEnum = pgEnum("deliveryStatus", ["sent", "delivered", "failed"]);
const feedbackEnum = pgEnum("deliveryFeedback", ["liked", "renew", "disliked"]);

/**
 * Tabela de Tenants (Clientes/Empresas)
 */
export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),

  status: statusEnum("status").default("active").notNull(),
  plan: planEnum("plan").default("basic").notNull(),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Usuários do sistema (Admin Panel + Usuários finais)
 * - role: user/admin/owner
 * - tenantId: null para owner (superadmin global)
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),

  tenantId: integer("tenantId").references(() => tenants.id),

  // loginId: usado para login local (pode ser email ou username)
  loginId: varchar("loginId", { length: 255 }).notNull().unique(),

  // para exibir no painel
  name: varchar("name", { length: 255 }),

  // opcional (pode ser igual ao loginId se for email)
  email: varchar("email", { length: 255 }),

  // hash de senha (somente para auth local)
  passwordHash: text("passwordHash"),

  role: roleEnum("role").default("user").notNull(),

  // controle de criação por admin
  createdByAdminId: integer("createdByAdminId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Grupos (criados por Admin dentro do tenant)
 */
export const groups = pgTable("groups", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenantId")
    .references(() => tenants.id)
    .notNull(),

  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),

  createdByAdminId: integer("createdByAdminId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Relação Usuários x Grupos (many-to-many)
 */
export const userGroups = pgTable("user_groups", {
  id: serial("id").primaryKey(),

  tenantId: integer("tenantId")
    .references(() => tenants.id)
    .notNull(),

  userId: integer("userId")
    .references(() => users.id)
    .notNull(),

  groupId: integer("groupId")
    .references(() => groups.id)
    .notNull(),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Notificações/Mensagens (criadas por Admin ou Owner)
 * - targetType: all/users/groups (owner também usa)
 * - targetIds: array JSON com ids (userIds ou groupIds)
 */
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),

  tenantId: integer("tenantId")
    .references(() => tenants.id)
    .notNull(),

  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),

  // (hoje só tem imagem; vídeo está coberto pelo módulo files/upload)
  imageUrl: text("imageUrl"),

  priority: priorityEnum("priority").default("normal").notNull(),

  // quem criou (admin ou owner)
  createdBy: integer("createdBy").references(() => users.id),

  targetType: targetTypeEnum("targetType").default("all").notNull(),

  // ids (users ou groups) em JSON
  targetIds: json("targetIds").default([]).notNull(),

  // agenda
  isScheduled: boolean("isScheduled").default(false).notNull(),
  scheduledAt: timestamp("scheduledAt"),

  // controle
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Agendamentos (Scheduler) - opcional
 * (se você usar a tabela schedules para disparos recorrentes ou atrasados)
 */
export const schedules = pgTable("schedules", {
  id: serial("id").primaryKey(),

  tenantId: integer("tenantId")
    .references(() => tenants.id)
    .notNull(),

  notificationId: integer("notificationId")
    .references(() => notifications.id)
    .notNull(),

  recurrence: recurrenceEnum("recurrence").default("none").notNull(),
  runAt: timestamp("runAt"),

  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Entregas (Inbox) - cada usuário recebe uma "delivery" por notificação
 */
export const deliveries = pgTable("deliveries", {
  id: serial("id").primaryKey(),

  tenantId: integer("tenantId")
    .references(() => tenants.id)
    .notNull(),

  notificationId: integer("notificationId")
    .references(() => notifications.id)
    .notNull(),

  userId: integer("userId")
    .references(() => users.id)
    .notNull(),

  status: deliveryStatusEnum("status").default("sent").notNull(),

  // inbox
  isRead: boolean("isRead").default(false).notNull(),
  readAt: timestamp("readAt"),

  feedback: feedbackEnum("feedback"),
  feedbackAt: timestamp("feedbackAt"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Uploads (mídia)
 */
export const files = pgTable("files", {
  id: serial("id").primaryKey(),

  tenantId: integer("tenantId")
    .references(() => tenants.id)
    .notNull(),

  filename: varchar("filename", { length: 255 }).notNull(),
  fileKey: text("fileKey").notNull(),
  url: text("url").notNull(),

  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  fileSize: integer("fileSize").notNull(),

  uploadedBy: integer("uploadedBy")
    .references(() => users.id)
    .notNull(),

  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),

  relatedNotificationId: integer("relatedNotificationId").references(() => notifications.id),

  isPublic: boolean("isPublic").default(true).notNull(),
});

/**
 * Logs (eventos do sistema)
 */
export const logs = pgTable("logs", {
  id: serial("id").primaryKey(),

  tenantId: integer("tenantId").references(() => tenants.id),
  userId: integer("userId").references(() => users.id),

  level: varchar("level", { length: 20 }).default("info").notNull(),
  message: text("message").notNull(),
  meta: json("meta").default({}).notNull(),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
