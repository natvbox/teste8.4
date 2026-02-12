import 'dotenv/config';
import { getDb } from '../server/db';
import { schedules, notifications, users, deliveries } from '../drizzle/schema';
import { eq, and, lte } from 'drizzle-orm';

async function processSchedules() {
  console.log(`[${new Date().toISOString()}] Verificando agendamentos no banco de dados...`);
  
  try {
    const db = await getDb();
    if (!db) {
      console.error('Banco de dados não disponível');
      return;
    }

    const now = new Date();
    
    // 1. Buscar agendamentos ativos que já deveriam ter sido enviados
    const pendingSchedules = await db
      .select()
      .from(schedules)
      .where(
        and(
          eq(schedules.isActive, true),
          lte(schedules.scheduledFor, now)
        )
      );

    if (pendingSchedules.length === 0) {
      console.log('Nenhum agendamento pendente encontrado.');
      return;
    }

    console.log(`Encontrados ${pendingSchedules.length} agendamentos pendentes`);

    for (const schedule of pendingSchedules) {
      console.log(`Processando agendamento: ${schedule.title} (ID: ${schedule.id})`);
      
      try {
        // Iniciar transação para garantir atomicidade
        await db.transaction(async (tx) => {
          // 2. Criar a notificação real
          const [newNotif] = await tx.insert(notifications).values({
            tenantId: schedule.tenantId,
            title: schedule.title,
            content: schedule.content,
            priority: schedule.priority,
            targetType: schedule.targetType || 'all',
            createdBy: schedule.createdBy,
            isScheduled: true,
            isActive: true,
            imageUrl: schedule.imageUrl,
            targetIds: schedule.targetIds,
          });

          const notificationId = Number(newNotif.insertId);

          // 3. Criar entregas para os usuários
          let targetUserIds: number[] = [];

          if (schedule.targetType === 'all' || !schedule.targetType) {
            const allUsers = await tx.select({ id: users.id }).from(users).where(eq(users.tenantId, schedule.tenantId));
            targetUserIds = allUsers.map(u => u.id);
          } else if (schedule.targetIds && schedule.targetIds.length > 0) {
            targetUserIds = schedule.targetIds;
          }

          if (targetUserIds.length > 0) {
            const deliveryValues = targetUserIds.map(userId => ({
              tenantId: schedule.tenantId,
              notificationId,
              userId,
              status: 'sent' as const,
            }));
            await tx.insert(deliveries).values(deliveryValues);
          }
          
          // 4. Tratar recorrência ou desativar
          if (schedule.recurrence === 'none' || !schedule.recurrence) {
            await tx
              .update(schedules)
              .set({ isActive: false, lastExecutedAt: now })
              .where(eq(schedules.id, schedule.id));
          } else {
            let nextRun = new Date(schedule.scheduledFor);
            
            if (schedule.recurrence === 'daily') {
              nextRun.setDate(nextRun.getDate() + 1);
            } else if (schedule.recurrence === 'weekly') {
              nextRun.setDate(nextRun.getDate() + 7);
            } else if (schedule.recurrence === 'monthly') {
              nextRun.setMonth(nextRun.getMonth() + 1);
            }
            
            await tx
              .update(schedules)
              .set({ scheduledFor: nextRun, lastExecutedAt: now })
              .where(eq(schedules.id, schedule.id));
          }
        });

        console.log(`✅ Agendamento ${schedule.id} processado com sucesso.`);
      } catch (err) {
        console.error(`❌ Erro ao processar agendamento ${schedule.id}:`, err);
      }
    }
  } catch (error) {
    console.error('Erro geral no processamento de agendamentos:', error);
  }
}

// Executar a cada 1 minuto se estiver em modo loop, ou apenas uma vez
const isLoop = process.argv.includes('--loop');

if (isLoop) {
  console.log('Iniciando worker de agendamentos em modo contínuo (1 min)...');
  setInterval(processSchedules, 60000);
  processSchedules();
} else {
  processSchedules().then(() => process.exit(0));
}
