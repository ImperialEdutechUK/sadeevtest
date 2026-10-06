import { z } from 'zod';
import { MEETING_TYPES } from '../enums.js';

export const GradeBandSchema = z.object({
  min: z.number().min(0).max(100),
  label: z.string().min(1).max(40),
  colour: z.string().min(1).max(20),
  description: z.string().max(300).default(''),
});

export const FrameworkRefSchema = z.object({
  framework: z.string().min(1).max(120),
  note: z.string().max(300).default(''),
});

export const DescriptorsSchema = z.object({
  '1': z.string().max(400).default(''),
  '3': z.string().max(400).default(''),
  '5': z.string().max(400).default(''),
});

export const CriterionInputSchema = z.object({
  code: z.string().min(1).max(12),
  title: z.string().min(1).max(160),
  description: z.string().max(800).default(''),
  weight: z.number().min(0.25).max(5).default(1),
  isMandatory: z.boolean().default(false),
  descriptors: DescriptorsSchema.default({ '1': '', '3': '', '5': '' }),
  frameworkRefs: z.array(FrameworkRefSchema).max(6).default([]),
  order: z.number().int().min(0).optional(),
});
export type CriterionInput = z.infer<typeof CriterionInputSchema>;

export const CategoryInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(120),
  description: z.string().max(400).default(''),
  order: z.number().int().min(0).optional(),
  criteria: z.array(CriterionInputSchema.extend({ id: z.string().optional() })).default([]),
});

export const CreateRubricSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(1000).default(''),
  meetingType: z.enum(MEETING_TYPES).default('INDUCTION'),
  gradeBands: z.array(GradeBandSchema).min(2).max(6).optional(),
  categories: z.array(CategoryInputSchema).default([]),
});
export type CreateRubricInput = z.infer<typeof CreateRubricSchema>;

export const UpdateRubricSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  description: z.string().max(1000).optional(),
  meetingType: z.enum(MEETING_TYPES).optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  gradeBands: z.array(GradeBandSchema).min(2).max(6).optional(),
  categories: z.array(CategoryInputSchema).optional(),
});
export type UpdateRubricInput = z.infer<typeof UpdateRubricSchema>;

export const RubricCriterionSchema = CriterionInputSchema.extend({
  id: z.string(),
  categoryId: z.string(),
  order: z.number().int(),
});
export const RubricCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  order: z.number().int(),
  criteria: z.array(RubricCriterionSchema),
});
export const RubricSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  meetingType: z.enum(MEETING_TYPES),
  version: z.number().int(),
  isPreset: z.boolean(),
  isActive: z.boolean(),
  isDefault: z.boolean(),
  gradeBands: z.array(GradeBandSchema),
  categories: z.array(RubricCategorySchema),
  criteriaCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Rubric = z.infer<typeof RubricSchema>;
export type RubricCategory = z.infer<typeof RubricCategorySchema>;
export type RubricCriterion = z.infer<typeof RubricCriterionSchema>;
