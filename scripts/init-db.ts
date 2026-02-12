/**
 * Script para inicializar o banco de dados PostgreSQL
 * Executa as migrations e cria as tabelas necessárias
 * 
 * Uso: npx tsx scripts/init-db.ts
 */

import postgres from 'postgres';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { hashPassword } from '../server/_core/password';

// Carregar variáveis de ambiente
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL não está definido no .env');
  process.exit(1);
}

async function initDatabase() {
  console.log('🔄 Conectando ao banco de dados...');
  
  const sql = postgres(DATABASE_URL!, {
    ssl: { rejectUnauthorized: false },
    max: 1,
    connect_timeout: 30,
  });

  try {
    // Testar conexão
    const result = await sql`SELECT NOW() as time`;
    console.log('✅ Conexão estabelecida:', result[0].time);

    // Ler e executar o script SQL
    const sqlFilePath = path.join(__dirname, 'create-tables.sql');
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf-8');

    console.log('🔄 Executando migrations...');
    
    // Dividir por comandos e executar um por um
    const commands = sqlContent
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));

    for (const command of commands) {
      try {
        await sql.unsafe(command);
        // Log apenas para comandos CREATE
        if (command.toUpperCase().includes('CREATE TABLE')) {
          const tableName = command.match(/CREATE TABLE IF NOT EXISTS (\w+)/i)?.[1];
          if (tableName) {
            console.log(`  ✅ Tabela ${tableName} criada/verificada`);
          }
        }
      } catch (error: any) {
        // Ignorar erros de "já existe"
        if (!error.message?.includes('already exists')) {
          console.warn(`  ⚠️ Aviso: ${error.message?.substring(0, 100)}`);
        }
      }
    }

    console.log('✅ Migrations executadas com sucesso!');

    // Verificar tabelas criadas
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    
    console.log('\n📋 Tabelas no banco de dados:');
    tables.forEach(t => console.log(`  - ${t.table_name}`));

    // Verificar se existe algum usuário owner
    const ownerOpenId = process.env.OWNER_OPEN_ID;
    const ownerPassword = process.env.OWNER_PASSWORD;
    if (ownerOpenId) {
      const existingOwner = await sql`
        SELECT id, "openId", role FROM users WHERE "openId" = ${ownerOpenId}
      `;
      
      const ownerPasswordHash = ownerPassword ? hashPassword(ownerPassword) : null;

      if (existingOwner.length === 0) {
        console.log(`\n🔄 Criando usuário owner: ${ownerOpenId}`);
        await sql`
          INSERT INTO users ("openId", name, email, role, "loginMethod", "passwordHash")
          VALUES (${ownerOpenId}, 'Owner', ${ownerOpenId}, 'owner', 'local', ${ownerPasswordHash})
          ON CONFLICT ("openId") DO UPDATE SET role = 'owner'
        `;
        console.log('✅ Usuário owner criado!');
      } else if (existingOwner[0].role !== 'owner') {
        console.log(`\n🔄 Atualizando usuário para owner: ${ownerOpenId}`);
        await sql`
          UPDATE users
          SET role = 'owner', "passwordHash" = COALESCE("passwordHash", ${ownerPasswordHash})
          WHERE "openId" = ${ownerOpenId}
        `;
        console.log('✅ Usuário atualizado para owner!');
      } else {
        console.log(`\n✅ Usuário owner já existe: ${ownerOpenId}`);

        if (ownerPasswordHash) {
          // define senha apenas se ainda não estiver definida
          await sql`
            UPDATE users
            SET "passwordHash" = COALESCE("passwordHash", ${ownerPasswordHash})
            WHERE "openId" = ${ownerOpenId}
          `;
        }
      }
    } else {
      console.log('\n⚠️ OWNER_OPEN_ID não definido. Nenhum owner será criado automaticamente.');
    }

  } catch (error) {
    console.error('❌ Erro ao executar migrations:', error);
    process.exit(1);
  } finally {
    await sql.end();
    console.log('\n✅ Inicialização concluída!');
  }
}

initDatabase();
