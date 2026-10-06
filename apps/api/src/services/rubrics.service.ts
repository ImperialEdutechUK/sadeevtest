import {
  DEFAULT_GRADE_BANDS,
  PRESET_RUBRICS,
  type CreateRubricInput,
  type MeetingType,
  type Rubric,
  type UpdateRubricInput,
} from '@slc/shared';
import { prisma } from '../db.js';
import type { Prisma } from '../generated/prisma/client.js';
import { audit } from '../lib/audit.js';
import { BadRequestError, NotFoundError } from '../lib/errors.js';
import { asArray, isoReq } from '../lib/serialize.js';

const rubricInclude = {
  categories: { orderBy: { order: 'asc' as const }, include: { criteria: { where: { isArchived: false }, orderBy: { order: 'asc' as const } } } },
} satisfies Prisma.RubricInclude;

type RubricRow = Prisma.RubricGetPayload<{ include: typeof rubricInclude }>;

export function serializeRubric(r: RubricRow): Rubric {
  const categories = r.categories.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    order: c.order,
    criteria: c.criteria.map((k) => ({
      id: k.id,
      categoryId: k.categoryId,
      code: k.code,
      title: k.title,
      description: k.description,
      weight: k.weight,
      isMandatory: k.isMandatory,
      descriptors: (k.descriptors as Record<'1' | '3' | '5', string>) ?? { '1': '', '3': '', '5': '' },
      frameworkRefs: asArray<{ framework: string; note: string }>(k.frameworkRefs),
      order: k.order,
    })),
  }));
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    meetingType: r.meetingType,
    version: r.version,
    isPreset: r.isPreset,
    isActive: r.isActive,
    isDefault: r.isDefault,
    gradeBands: asArray<{ min: number; label: string; colour: string; description: string }>(r.gradeBands),
    categories,
    criteriaCount: categories.reduce((n, c) => n + c.criteria.length, 0),
    createdAt: isoReq(r.createdAt),
    updatedAt: isoReq(r.updatedAt),
  };
}

export async function listRubrics(opts: { includeInactive?: boolean } = {}) {
  const rows = await prisma.rubric.findMany({
    where: opts.includeInactive ? {} : { isActive: true },
    include: rubricInclude,
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });
  return rows.map(serializeRubric);
}

export async function getRubric(id: string): Promise<Rubric> {
  const r = await prisma.rubric.findUnique({ where: { id }, include: rubricInclude });
  if (!r) throw new NotFoundError('Criteria set');
  return serializeRubric(r);
}

export async function getDefaultRubricId(meetingType: MeetingType): Promise<string> {
  const r =
    (await prisma.rubric.findFirst({ where: { meetingType, isActive: true, isDefault: true } })) ??
    (await prisma.rubric.findFirst({ where: { meetingType, isActive: true }, orderBy: { createdAt: 'asc' } })) ??
    (await prisma.rubric.findFirst({ where: { isActive: true, isDefault: true } })) ??
    (await prisma.rubric.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } }));
  if (!r) throw new BadRequestError('No criteria set is available. Ask an admin to create one.');
  return r.id;
}

function validateCriteriaCodes(categories: CreateRubricInput['categories']) {
  const codes = categories.flatMap((c) => c.criteria.map((k) => k.code.trim().toUpperCase()));
  const dupes = codes.filter((c, i) => codes.indexOf(c) !== i);
  if (dupes.length) throw new BadRequestError(`Criterion codes must be unique. Duplicated: ${[...new Set(dupes)].join(', ')}`);
  if (!codes.length) throw new BadRequestError('Add at least one criterion');
}

export async function createRubric(actorId: string | null, input: CreateRubricInput, opts: { isPreset?: boolean } = {}) {
  validateCriteriaCodes(input.categories);
  const r = await createRubricTwoStep(actorId, input, opts);
  audit({ actorId, action: 'rubric.created', entityType: 'rubric', entityId: r.id, metadata: { name: input.name } });
  return serializeRubric(r);
}

async function createRubricTwoStep(actorId: string | null, input: CreateRubricInput, opts: { isPreset?: boolean }) {
  return prisma.$transaction(async (tx) => {
    const rubric = await tx.rubric.create({
      data: {
        name: input.name,
        description: input.description,
        meetingType: input.meetingType,
        gradeBands: (input.gradeBands ?? [...DEFAULT_GRADE_BANDS]) as never,
        isPreset: opts.isPreset ?? false,
        createdById: actorId ?? null,
      },
    });
    await writeCategories(tx, rubric.id, input.categories);
    return tx.rubric.findUniqueOrThrow({ where: { id: rubric.id }, include: rubricInclude });
  });
}

async function writeCategories(tx: Prisma.TransactionClient, rubricId: string, categories: CreateRubricInput['categories']) {
  for (const [ci, c] of categories.entries()) {
    const cat = await tx.rubricCategory.create({ data: { rubricId, name: c.name, description: c.description, order: c.order ?? ci } });
    for (const [ki, k] of c.criteria.entries()) {
      await tx.criterion.create({
        data: {
          rubricId,
          categoryId: cat.id,
          code: k.code.trim().toUpperCase(),
          title: k.title,
          description: k.description,
          weight: k.weight,
          isMandatory: k.isMandatory,
          descriptors: k.descriptors as never,
          frameworkRefs: k.frameworkRefs as never,
          order: k.order ?? ki,
        },
      });
    }
  }
}

/**
 * Updating criteria creates a new version of the rubric. Existing analyses keep
 * pointing at the criterion rows they were scored against (archived, not deleted),
 * so historical reports stay exactly as they were.
 */
export async function updateRubric(actorId: string, id: string, input: UpdateRubricInput) {
  const existing = await prisma.rubric.findUnique({ where: { id }, include: rubricInclude });
  if (!existing) throw new NotFoundError('Criteria set');

  await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.rubric.updateMany({ where: { meetingType: input.meetingType ?? existing.meetingType, isDefault: true }, data: { isDefault: false } });
    }
    await tx.rubric.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        meetingType: input.meetingType,
        isActive: input.isActive,
        isDefault: input.isDefault,
        gradeBands: input.gradeBands as never,
        ...(input.categories ? { version: { increment: 1 } } : {}),
      },
    });
    if (input.categories) {
      validateCriteriaCodes(input.categories);
      const usedCriterionIds = new Set(
        (await tx.criterionResult.findMany({ where: { criterion: { rubricId: id } }, select: { criterionId: true }, distinct: ['criterionId'] })).map((r) => r.criterionId),
      );
      const existingCriteria = existing.categories.flatMap((c) => c.criteria);
      const incomingIds = new Set(input.categories.flatMap((c) => c.criteria.map((k) => k.id).filter(Boolean)));
      // Remove or archive criteria that are no longer present.
      for (const k of existingCriteria) {
        if (incomingIds.has(k.id)) continue;
        if (usedCriterionIds.has(k.id)) await tx.criterion.update({ where: { id: k.id }, data: { isArchived: true, code: `${k.code}~${k.id.slice(-4)}` } });
        else await tx.criterion.delete({ where: { id: k.id } });
      }
      const incomingCategoryIds = new Set(input.categories.map((c) => c.id).filter(Boolean));
      for (const c of existing.categories) {
        if (incomingCategoryIds.has(c.id)) continue;
        const stillHasArchived = await tx.criterion.count({ where: { categoryId: c.id } });
        if (stillHasArchived === 0) await tx.rubricCategory.delete({ where: { id: c.id } });
      }
      for (const [ci, c] of input.categories.entries()) {
        const cat = c.id
          ? await tx.rubricCategory.update({ where: { id: c.id }, data: { name: c.name, description: c.description, order: c.order ?? ci } })
          : await tx.rubricCategory.create({ data: { rubricId: id, name: c.name, description: c.description, order: c.order ?? ci } });
        for (const [ki, k] of c.criteria.entries()) {
          const data = {
            code: k.code.trim().toUpperCase(),
            title: k.title,
            description: k.description,
            weight: k.weight,
            isMandatory: k.isMandatory,
            descriptors: k.descriptors as never,
            frameworkRefs: k.frameworkRefs as never,
            order: k.order ?? ki,
            categoryId: cat.id,
          };
          if (k.id) await tx.criterion.update({ where: { id: k.id }, data });
          else await tx.criterion.create({ data: { ...data, rubricId: id } });
        }
      }
    }
  });
  audit({ actorId, action: 'rubric.updated', entityType: 'rubric', entityId: id, metadata: { fields: Object.keys(input) } });
  return getRubric(id);
}

export async function cloneRubric(actorId: string, id: string, name?: string) {
  const source = await getRubric(id);
  return createRubric(actorId, {
    name: name ?? `${source.name} (copy)`,
    description: source.description,
    meetingType: source.meetingType,
    gradeBands: source.gradeBands,
    categories: source.categories.map((c) => ({
      name: c.name,
      description: c.description,
      order: c.order,
      criteria: c.criteria.map((k) => ({
        code: k.code,
        title: k.title,
        description: k.description,
        weight: k.weight,
        isMandatory: k.isMandatory,
        descriptors: k.descriptors,
        frameworkRefs: k.frameworkRefs,
        order: k.order,
      })),
    })),
  });
}

export async function deleteRubric(actorId: string, id: string) {
  const inUse = await prisma.meeting.count({ where: { rubricId: id } });
  if (inUse > 0) {
    await prisma.rubric.update({ where: { id }, data: { isActive: false, isDefault: false } });
    audit({ actorId, action: 'rubric.archived', entityType: 'rubric', entityId: id });
    return { archived: true };
  }
  await prisma.rubric.delete({ where: { id } });
  audit({ actorId, action: 'rubric.deleted', entityType: 'rubric', entityId: id });
  return { archived: false };
}

/** Create the preset rubrics if they do not exist yet (idempotent). */
export async function ensurePresetRubrics(actorId: string | null) {
  for (const preset of PRESET_RUBRICS) {
    const exists = await prisma.rubric.findFirst({ where: { isPreset: true, name: preset.name } });
    if (exists) continue;
    const created = await createRubricTwoStep(actorId, {
      name: preset.name,
      description: preset.description,
      meetingType: preset.meetingType,
      gradeBands: preset.gradeBands,
      categories: preset.categories.map((c, ci) => ({
        name: c.name,
        description: c.description,
        order: ci,
        criteria: c.criteria.map((k, ki) => ({ ...k, order: ki })),
      })),
    }, { isPreset: true });
    const hasDefault = await prisma.rubric.count({ where: { meetingType: preset.meetingType, isDefault: true } });
    if (!hasDefault) await prisma.rubric.update({ where: { id: created.id }, data: { isDefault: true } });
  }
}
