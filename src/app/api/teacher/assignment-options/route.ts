import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery } from '@/server/db';
import { catchError, ok } from '@/lib/api';

export async function GET(request: NextRequest) {
  try {
    const user = await requireRole(request, ['teacher', 'school_admin', 'super_admin']);
    const args: unknown[] = [];
    let cohortScope = 'TRUE';
    let organizationId: string | null = user.organizationId;
    if (user.roles.includes('teacher') && !user.roles.includes('super_admin')) {
      args.push(user.id);
      cohortScope = `EXISTS (SELECT 1 FROM teacher_cohort_grants g WHERE g.cohort_id = c.id AND g.teacher_id = $${args.length})`;
    } else if (!user.roles.includes('super_admin')) {
      args.push(user.organizationId);
      cohortScope = `c.organization_id = $${args.length}`;
    }
    const cohorts = await dbQuery<{ id:string;name:string;organization_id:string }>(
      `SELECT c.id,c.name,c.organization_id FROM cohorts c WHERE c.deleted_at IS NULL AND c.status='active' AND ${cohortScope} ORDER BY c.name`,
      ...args,
    );
    if (user.roles.includes('super_admin')) organizationId = cohorts[0]?.organization_id ?? null;
    const tasks = await dbQuery<{ id:string;title:string;task_type:string;organization_id:string|null }>(
      `SELECT id,title,task_type,organization_id FROM practice_task_templates
       WHERE deleted_at IS NULL AND review_status='published' AND ($1::text IS NULL OR organization_id=$1 OR organization_id IS NULL)
       ORDER BY difficulty,title`, organizationId,
    );
    return ok({ cohorts, tasks: tasks.map(t=>({id:t.id,title:t.title,taskType:t.task_type,organizationId:t.organization_id})) });
  } catch (error) {
    return catchError(error);
  }
}
