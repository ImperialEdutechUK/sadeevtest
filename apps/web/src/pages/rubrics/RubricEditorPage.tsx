import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, GripVertical, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DEFAULT_GRADE_BANDS, MEETING_TYPE_LABELS, MEETING_TYPES, type CreateRubricInput, type MeetingType } from '@slc/shared';
import { useAuth } from '@/app/AuthProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Alert, PageHeader, Skeleton, Switch } from '@/components/ui/Misc';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { keys, mutations, useRubric } from '@/lib/queries';
import { useQueryClient } from '@tanstack/react-query';

type Criterion = { id?: string; code: string; title: string; description: string; weight: number; isMandatory: boolean; descriptors: { '1': string; '3': string; '5': string }; frameworkRefs: { framework: string; note: string }[] };
type Category = { id?: string; name: string; description: string; criteria: Criterion[] };
type Draft = { name: string; description: string; meetingType: MeetingType; isActive: boolean; isDefault: boolean; gradeBands: { min: number; label: string; colour: string; description: string }[]; categories: Category[] };

const blankCriterion = (code: string): Criterion => ({ code, title: '', description: '', weight: 1, isMandatory: false, descriptors: { '1': '', '3': '', '5': '' }, frameworkRefs: [] });

export function RubricEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { can } = useAuth();
  const manage = can('rubric:manage');
  const { data: rubric, isLoading } = useRubric(id);
  const [draft, setDraft] = useState<Draft | null>(isNew ? { name: '', description: '', meetingType: 'INDUCTION', isActive: true, isDefault: false, gradeBands: [...DEFAULT_GRADE_BANDS], categories: [{ name: 'General', description: '', criteria: [blankCriterion('A1')] }] } : null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [openIdx, setOpenIdx] = useState<string | null>(null);

  useEffect(() => {
    if (rubric) setDraft({ name: rubric.name, description: rubric.description, meetingType: rubric.meetingType, isActive: rubric.isActive, isDefault: rubric.isDefault, gradeBands: rubric.gradeBands.map((b) => ({ ...b })), categories: rubric.categories.map((c) => ({ id: c.id, name: c.name, description: c.description, criteria: c.criteria.map((k) => ({ id: k.id, code: k.code, title: k.title, description: k.description, weight: k.weight, isMandatory: k.isMandatory, descriptors: { '1': k.descriptors['1'] ?? '', '3': k.descriptors['3'] ?? '', '5': k.descriptors['5'] ?? '' }, frameworkRefs: k.frameworkRefs })) })) });
  }, [rubric]);

  if (isLoading || !draft) return <div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64" /></div>;
  const readOnly = !manage;
  const total = draft.categories.reduce((n, c) => n + c.criteria.length, 0);
  const update = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const updateCat = (ci: number, patch: Partial<Category>) => update({ categories: draft.categories.map((c, i) => (i === ci ? { ...c, ...patch } : c)) });
  const updateCrit = (ci: number, ki: number, patch: Partial<Criterion>) => updateCat(ci, { criteria: draft.categories[ci].criteria.map((k, i) => (i === ki ? { ...k, ...patch } : k)) });
  const nextCode = (ci: number) => `${String.fromCharCode(65 + (ci % 26))}${draft.categories[ci].criteria.length + 1}`;

  const save = async () => {
    const errors: string[] = [];
    if (!draft.name.trim()) errors.push('Give the criteria set a name.');
    for (const c of draft.categories) for (const k of c.criteria) if (!k.title.trim() || !k.code.trim()) errors.push(`Every criterion needs a code and a title (check "${c.name}").`);
    if (errors.length) return toast.error(errors[0]);
    setSaving(true);
    try {
      const payload: CreateRubricInput & { isActive?: boolean; isDefault?: boolean } = {
        name: draft.name.trim(),
        description: draft.description.trim(),
        meetingType: draft.meetingType,
        gradeBands: draft.gradeBands,
        categories: draft.categories.map((c, ci) => ({ id: c.id, name: c.name.trim() || `Group ${ci + 1}`, description: c.description, order: ci, criteria: c.criteria.map((k, ki) => ({ ...k, code: k.code.trim().toUpperCase(), title: k.title.trim(), order: ki })) })),
        isActive: draft.isActive,
        isDefault: draft.isDefault,
      };
      if (isNew) {
        const r = await mutations.createRubric(payload);
        if (draft.isDefault) await mutations.updateRubric(r.id, { isDefault: true });
        toast.success('Criteria set created.');
        navigate(`/criteria/${r.id}`, { replace: true });
      } else {
        await mutations.updateRubric(id!, payload);
        toast.success('Saved as a new version.');
      }
      await qc.invalidateQueries({ queryKey: keys.rubrics });
      if (id) await qc.invalidateQueries({ queryKey: keys.rubric(id) });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      const res = await mutations.deleteRubric(id!);
      toast.success(res.archived ? 'This set is in use, so it has been archived instead of deleted.' : 'Criteria set deleted.');
      await qc.invalidateQueries({ queryKey: keys.rubrics });
      navigate('/criteria');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not delete.');
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        breadcrumb={{ to: '/criteria', label: 'Review criteria' }}
        title={isNew ? 'New criteria set' : draft.name || 'Criteria set'}
        description={isNew ? 'Build a set of criteria for a type of meeting.' : `Version ${rubric?.version} · ${total} criteria${rubric?.isPreset ? ' · preset (editable)' : ''}`}
        actions={manage ? <>{!isNew && <Button variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmDelete(true)}>Delete</Button>}<Button loading={saving} onClick={save}>{isNew ? 'Create' : 'Save changes'}</Button></> : undefined}
      />
      {readOnly && <Alert tone="info" className="mb-5">You can view these criteria. Academic admins and managers can edit them.</Alert>}

      <Card className="mb-6">
        <CardHeader title="About this set" />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" id="name" required><Input id="name" value={draft.name} onChange={(e) => update({ name: e.target.value })} disabled={readOnly} /></Field>
            <Field label="Used for" id="mt"><Select id="mt" value={draft.meetingType} onChange={(e) => update({ meetingType: e.target.value as MeetingType })} disabled={readOnly}>{MEETING_TYPES.map((t) => <option key={t} value={t}>{MEETING_TYPE_LABELS[t]}</option>)}</Select></Field>
          </div>
          <Field label="Description" id="desc"><Textarea id="desc" value={draft.description} onChange={(e) => update({ description: e.target.value })} disabled={readOnly} /></Field>
          {!readOnly && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Switch id="def" checked={draft.isDefault} onCheckedChange={(v) => update({ isDefault: v })} label="Default for this meeting type" description="Pre-selected when staff upload a meeting." />
              <Switch id="act" checked={draft.isActive} onCheckedChange={(v) => update({ isActive: v })} label="Available for new meetings" description="Turn off to archive without deleting." />
            </div>
          )}
        </CardBody>
      </Card>

      <Card className="mb-6">
        <CardHeader title="Grade bands" description="How an overall score (0-100) becomes a grade. Highest threshold first." />
        <CardBody>
          <div className="space-y-2">
            {[...draft.gradeBands].map((b, i) => (
              <div key={i} className="grid grid-cols-[80px_1fr_2fr] items-center gap-3">
                <Input type="number" min={0} max={100} value={b.min} aria-label="Minimum score" disabled={readOnly || b.min === 0} onChange={(e) => update({ gradeBands: draft.gradeBands.map((x, j) => (j === i ? { ...x, min: Number(e.target.value) } : x)) })} />
                <Input value={b.label} aria-label="Grade label" disabled={readOnly} onChange={(e) => update({ gradeBands: draft.gradeBands.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                <Input value={b.description} aria-label="Grade description" disabled={readOnly} onChange={(e) => update({ gradeBands: draft.gradeBands.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} />
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <div className="space-y-6">
        {draft.categories.map((cat, ci) => (
          <Card key={cat.id ?? ci}>
            <CardHeader
              title={<Input value={cat.name} onChange={(e) => updateCat(ci, { name: e.target.value })} disabled={readOnly} aria-label="Group name" className="h-10 max-w-sm font-semibold" />}
              description={<Input value={cat.description} onChange={(e) => updateCat(ci, { description: e.target.value })} disabled={readOnly} aria-label="Group description" placeholder="What this group of criteria is about" className="mt-1 h-9 max-w-lg text-sm" />}
              action={!readOnly && <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => update({ categories: draft.categories.filter((_, i) => i !== ci) })} aria-label="Remove group">Remove group</Button>}
            />
            <div className="divide-y divide-slate-100">
              {cat.criteria.map((k, ki) => {
                const key = `${ci}-${ki}`;
                const open = openIdx === key;
                return (
                  <div key={k.id ?? key}>
                    <button type="button" className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-slate-50" onClick={() => setOpenIdx(open ? null : key)} aria-expanded={open}>
                      <GripVertical className="h-4 w-4 text-slate-300" aria-hidden />
                      <span className="w-10 text-xs font-semibold text-slate-400">{k.code || '?'}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{k.title || <span className="text-slate-400">Untitled criterion</span>}</span>
                      {k.isMandatory && <Badge tone="brand">Essential</Badge>}
                      <span className="text-xs text-slate-500">weight {k.weight}</span>
                      <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', open && 'rotate-180')} />
                    </button>
                    {open && (
                      <div className="space-y-4 bg-slate-50/60 px-5 py-4">
                        <div className="grid gap-4 sm:grid-cols-[100px_1fr_140px]">
                          <Field label="Code" id={`code-${key}`}><Input id={`code-${key}`} value={k.code} maxLength={12} onChange={(e) => updateCrit(ci, ki, { code: e.target.value })} disabled={readOnly} /></Field>
                          <Field label="Title" id={`title-${key}`} required><Input id={`title-${key}`} value={k.title} onChange={(e) => updateCrit(ci, ki, { title: e.target.value })} disabled={readOnly} /></Field>
                          <Field label="Weight" id={`w-${key}`} help="How much this criterion counts towards the overall score. 1 is normal; 2 counts double.">
                            <Select id={`w-${key}`} value={String(k.weight)} onChange={(e) => updateCrit(ci, ki, { weight: Number(e.target.value) })} disabled={readOnly}>
                              {[0.5, 1, 1.5, 2, 3].map((w) => <option key={w} value={w}>{w}</option>)}
                            </Select>
                          </Field>
                        </div>
                        <Field label="What the reviewer looks for" id={`d-${key}`}><Textarea id={`d-${key}`} value={k.description} onChange={(e) => updateCrit(ci, ki, { description: e.target.value })} disabled={readOnly} className="min-h-[72px]" /></Field>
                        {!readOnly && <Switch id={`m-${key}`} checked={k.isMandatory} onCheckedChange={(v) => updateCrit(ci, ki, { isMandatory: v })} label="Essential item" description="Must be covered in every meeting. Counts towards 'essential items covered' and scores 1 when missing." />}
                        <div className="grid gap-3 sm:grid-cols-3">
                          {(['1', '3', '5'] as const).map((lvl) => (
                            <Field key={lvl} label={`What a ${lvl} looks like`} id={`${lvl}-${key}`}><Textarea id={`${lvl}-${key}`} value={k.descriptors[lvl]} onChange={(e) => updateCrit(ci, ki, { descriptors: { ...k.descriptors, [lvl]: e.target.value } })} disabled={readOnly} className="min-h-[88px] text-xs" /></Field>
                          ))}
                        </div>
                        <div>
                          <p className="mb-1.5 text-sm font-medium text-slate-800">Framework references <span className="font-normal text-slate-500">(why this criterion is here)</span></p>
                          <div className="space-y-2">
                            {k.frameworkRefs.map((f, fi) => (
                              <div key={fi} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                                <Input value={f.framework} placeholder="Framework" disabled={readOnly} aria-label="Framework" onChange={(e) => updateCrit(ci, ki, { frameworkRefs: k.frameworkRefs.map((x, j) => (j === fi ? { ...x, framework: e.target.value } : x)) })} />
                                <Input value={f.note} placeholder="Note" disabled={readOnly} aria-label="Note" onChange={(e) => updateCrit(ci, ki, { frameworkRefs: k.frameworkRefs.map((x, j) => (j === fi ? { ...x, note: e.target.value } : x)) })} />
                                {!readOnly && <Button variant="ghost" size="sm" aria-label="Remove reference" onClick={() => updateCrit(ci, ki, { frameworkRefs: k.frameworkRefs.filter((_, j) => j !== fi) })}><Trash2 className="h-4 w-4" /></Button>}
                              </div>
                            ))}
                            {!readOnly && <Button variant="ghost" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => updateCrit(ci, ki, { frameworkRefs: [...k.frameworkRefs, { framework: '', note: '' }] })}>Add reference</Button>}
                          </div>
                        </div>
                        {!readOnly && <div className="flex justify-end"><Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => updateCat(ci, { criteria: cat.criteria.filter((_, i) => i !== ki) })}>Remove criterion</Button></div>}
                      </div>
                    )}
                  </div>
                );
              })}
              {!readOnly && (
                <div className="px-5 py-3">
                  <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => { updateCat(ci, { criteria: [...cat.criteria, blankCriterion(nextCode(ci))] }); setOpenIdx(`${ci}-${cat.criteria.length}`); }}>Add a criterion</Button>
                </div>
              )}
            </div>
          </Card>
        ))}
        {!readOnly && <Button variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => update({ categories: [...draft.categories, { name: `Group ${draft.categories.length + 1}`, description: '', criteria: [] }] })}>Add a group of criteria</Button>}
      </div>

      {!readOnly && (
        <div className="sticky bottom-4 mt-8 flex justify-end">
          <Button size="lg" loading={saving} onClick={save} className="shadow-lg">{isNew ? 'Create criteria set' : 'Save changes'}</Button>
        </div>
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete} title="Delete this criteria set?" description="If any meeting has been reviewed with it, it will be archived instead so existing reports stay intact." footer={<><Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button><Button variant="danger" onClick={remove}>Delete</Button></>}>
        <p className="text-sm text-slate-600">Staff will no longer be able to choose it for new meetings.</p>
      </Dialog>
    </div>
  );
}
