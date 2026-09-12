import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import type { AuthContext, Guards } from '../auth/context.js';
import { contentPack, learningUnit, learningUnitSkill, childProfile } from '../db/schema.js';

/**
 * Nội dung dành cho người học — CHỈ pack đã `PUBLISHED`.
 * Child session còn bị giới hạn theo `current_stage`; pack STUDIO còn theo `family_id`.
 * Soạn/duyệt nội dung: xem routes/studio.ts.
 */
export function registerContentRoutes(app: FastifyInstance, db: Database, guards: Guards): void {
  const auth = { preHandler: guards.requireAuth };

  async function childStage(a: AuthContext): Promise<string | null> {
    if (a.kind !== 'CHILD' || !a.childProfileId) return null;
    const rows = await db
      .select({ stage: childProfile.currentStage })
      .from(childProfile)
      .where(eq(childProfile.id, a.childProfileId));
    return rows[0]?.stage ?? '__none__';
  }

  app.get('/content/packs', auth, async (req) => {
    const query = z.object({ stage: z.string().optional() }).parse(req.query);
    const a = req.auth!;
    const forcedStage = await childStage(a);

    const conds = [eq(contentPack.status, 'PUBLISHED')];
    if (forcedStage) conds.push(eq(contentPack.stage, forcedStage));
    else if (query.stage) conds.push(eq(contentPack.stage, query.stage));

    const rows = await db.select().from(contentPack).where(and(...conds));
    // Pack STUDIO chỉ hiện cho family sở hữu; REFERENCE hiện cho mọi người.
    const visible = rows.filter((p) => p.origin === 'REFERENCE' || p.familyId === a.familyId);
    return { packs: visible };
  });

  app.get('/content/packs/:id', auth, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const a = req.auth!;
    const pack = await db.select().from(contentPack).where(eq(contentPack.id, id));
    const p = pack[0];
    if (!p || p.status !== 'PUBLISHED') return reply.code(404).send({ error: 'not_found' });
    if (p.origin === 'STUDIO' && p.familyId !== a.familyId) return reply.code(404).send({ error: 'not_found' });

    const forcedStage = await childStage(a);
    if (forcedStage && p.stage !== forcedStage) return reply.code(404).send({ error: 'not_found' });

    const units = await db.select().from(learningUnit).where(eq(learningUnit.packId, id));
    return { pack: p, units };
  });

  app.get('/content/units/:id', auth, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const a = req.auth!;
    const unit = await db.select().from(learningUnit).where(eq(learningUnit.id, id));
    const u = unit[0];
    if (!u) return reply.code(404).send({ error: 'not_found' });

    const pack = await db.select().from(contentPack).where(eq(contentPack.id, u.packId));
    const p = pack[0];
    if (!p || p.status !== 'PUBLISHED') return reply.code(404).send({ error: 'not_found' });
    if (p.origin === 'STUDIO' && p.familyId !== a.familyId) return reply.code(404).send({ error: 'not_found' });

    const forcedStage = await childStage(a);
    if (forcedStage && u.stage !== forcedStage) return reply.code(404).send({ error: 'not_found' });

    const skills = await db.select().from(learningUnitSkill).where(eq(learningUnitSkill.unitId, id));
    return { unit: u, skills };
  });
}
