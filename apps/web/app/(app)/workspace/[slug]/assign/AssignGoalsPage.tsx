"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

const CATEGORIES = ["health", "work", "learning", "finance", "other"] as const;
const CADENCES = ["daily", "weekly"] as const;

interface Props {
  workspaceId: string;
  slug: string;
}

export function AssignGoalsPage({ workspaceId }: Props) {
  const utils = trpc.useUtils();

  // Templates
  const { data: templates } = trpc.manager.listTemplates.useQuery({ workspaceId });
  const { data: members } = trpc.departments.teamMembers.useQuery({ workspaceId });
  const { data: departments } = trpc.departments.list.useQuery({ workspaceId });

  const createTemplate = trpc.manager.createTemplate.useMutation({
    onSuccess: () => utils.manager.listTemplates.invalidate({ workspaceId }),
  });
  const archiveTemplate = trpc.manager.archiveTemplate.useMutation({
    onSuccess: () => utils.manager.listTemplates.invalidate({ workspaceId }),
  });
  const assignGoal = trpc.manager.assignGoal.useMutation({
    onSuccess: () => {
      setAssignSuccess(`Assigned to ${assignedCount} member(s).`);
      setSelectedUserIds([]);
      setSelectedDeptId("");
    },
  });

  // Template form state
  const [tmplTitle, setTmplTitle] = useState("");
  const [tmplCategory, setTmplCategory] = useState<typeof CATEGORIES[number]>("work");
  const [tmplTarget, setTmplTarget] = useState("1");
  const [tmplUnit, setTmplUnit] = useState("");
  const [tmplCadence, setTmplCadence] = useState<typeof CADENCES[number]>("daily");
  const [tmplMandatory, setTmplMandatory] = useState(false);

  // Assignment form state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [assignTitle, setAssignTitle] = useState("");
  const [assignCategory, setAssignCategory] = useState<typeof CATEGORIES[number]>("work");
  const [assignTarget, setAssignTarget] = useState("1");
  const [assignUnit, setAssignUnit] = useState("");
  const [assignCadence, setAssignCadence] = useState<typeof CADENCES[number]>("daily");
  const [assignDate, setAssignDate] = useState("");
  const [assignMandatory, setAssignMandatory] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState("");
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);

  const assignedCount =
    selectedUserIds.length +
    (selectedDeptId
      ? (members?.filter((m) => m.department_id === selectedDeptId).length ?? 0)
      : 0);

  function handleTemplateSelect(id: string) {
    setSelectedTemplateId(id);
    const tmpl = templates?.find((t) => t.id === id);
    if (tmpl) {
      setAssignTitle(tmpl.title);
      setAssignCategory(tmpl.category as typeof CATEGORIES[number]);
      setAssignTarget(String(tmpl.numeric_target));
      setAssignUnit(tmpl.unit);
      setAssignCadence(tmpl.cadence as typeof CADENCES[number]);
      setAssignMandatory(tmpl.is_mandatory);
    }
  }

  function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    setAssignSuccess(null);
    assignGoal.mutate({
      workspaceId,
      templateId: selectedTemplateId || undefined,
      title: assignTitle,
      category: assignCategory,
      numericTarget: parseFloat(assignTarget),
      unit: assignUnit,
      cadence: assignCadence,
      targetDate: assignDate,
      isMandatory: assignMandatory,
      targetUserIds: selectedUserIds.length > 0 ? selectedUserIds : undefined,
      targetDepartmentId: selectedDeptId || undefined,
    });
  }

  function toggleUser(userId: string) {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Assign Goals</h1>
        <p className="mt-1 text-sm text-gray-500">
          Create goal templates and assign them to team members or departments.
        </p>
      </div>

      {/* Create template */}
      <section className="rounded-xl bg-white p-5 ring-1 ring-gray-200">
        <h2 className="mb-4 font-semibold text-gray-900">Create Goal Template</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createTemplate.mutate({
              workspaceId,
              title: tmplTitle,
              category: tmplCategory,
              numericTarget: parseFloat(tmplTarget),
              unit: tmplUnit,
              cadence: tmplCadence,
              isMandatory: tmplMandatory,
            });
            setTmplTitle("");
            setTmplUnit("");
            setTmplTarget("1");
          }}
          className="grid grid-cols-2 gap-4"
        >
          <div className="col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">Title</label>
            <input
              value={tmplTitle}
              onChange={(e) => setTmplTitle(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="e.g. Daily exercise 30 min"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
            <select
              value={tmplCategory}
              onChange={(e) => setTmplCategory(e.target.value as typeof CATEGORIES[number])}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Cadence</label>
            <select
              value={tmplCadence}
              onChange={(e) => setTmplCadence(e.target.value as typeof CADENCES[number])}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {CADENCES.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Target value</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={tmplTarget}
              onChange={(e) => setTmplTarget(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Unit</label>
            <input
              value={tmplUnit}
              onChange={(e) => setTmplUnit(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="km, tasks, minutes…"
            />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <input
              type="checkbox"
              id="tmpl-mandatory"
              checked={tmplMandatory}
              onChange={(e) => setTmplMandatory(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="tmpl-mandatory" className="text-sm text-gray-700">
              Mark as mandatory (members cannot abandon)
            </label>
          </div>
          <div className="col-span-2">
            <button
              type="submit"
              disabled={createTemplate.isPending}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {createTemplate.isPending ? "Saving…" : "Save Template"}
            </button>
          </div>
        </form>

        {/* Existing templates */}
        {templates && templates.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 text-sm font-semibold text-gray-600">Saved Templates</h3>
            <ul className="space-y-2">
              {templates.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-gray-900">{t.title}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">
                      {t.category} · {t.cadence} · {t.numeric_target} {t.unit}
                    </span>
                    <button
                      onClick={() => handleTemplateSelect(t.id)}
                      className="text-xs text-brand-600 hover:underline"
                    >
                      Use
                    </button>
                    <button
                      onClick={() => archiveTemplate.mutate({ templateId: t.id })}
                      className="text-xs text-red-400 hover:underline"
                    >
                      Archive
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Assign goal form */}
      <section className="rounded-xl bg-white p-5 ring-1 ring-gray-200">
        <h2 className="mb-4 font-semibold text-gray-900">Assign to Team</h2>

        {assignSuccess && (
          <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
            {assignSuccess}
          </div>
        )}
        {assignGoal.isError && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {assignGoal.error.message}
          </div>
        )}

        <form onSubmit={handleAssign} className="grid grid-cols-2 gap-4">
          {selectedTemplateId && (
            <div className="col-span-2 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
              Pre-filled from template. You can edit fields below.
              <button
                type="button"
                onClick={() => setSelectedTemplateId("")}
                className="ml-2 underline"
              >
                Clear
              </button>
            </div>
          )}
          <div className="col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">Goal title</label>
            <input
              value={assignTitle}
              onChange={(e) => setAssignTitle(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
            <select
              value={assignCategory}
              onChange={(e) => setAssignCategory(e.target.value as typeof CATEGORIES[number])}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Cadence</label>
            <select
              value={assignCadence}
              onChange={(e) => setAssignCadence(e.target.value as typeof CADENCES[number])}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {CADENCES.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Target value</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={assignTarget}
              onChange={(e) => setAssignTarget(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Unit</label>
            <input
              value={assignUnit}
              onChange={(e) => setAssignUnit(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">Target date</label>
            <input
              type="date"
              value={assignDate}
              onChange={(e) => setAssignDate(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <input
              type="checkbox"
              id="assign-mandatory"
              checked={assignMandatory}
              onChange={(e) => setAssignMandatory(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="assign-mandatory" className="text-sm text-gray-700">
              Mandatory
            </label>
          </div>

          {/* Target selection */}
          <div className="col-span-2 space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Assign to department
              </label>
              <select
                value={selectedDeptId}
                onChange={(e) => setSelectedDeptId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">— None —</option>
                {departments?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Or select individual members
              </label>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200">
                {members?.map((m) => (
                  <label
                    key={m.user_id}
                    className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(m.user_id)}
                      onChange={() => toggleUser(m.user_id)}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-700">
                      {m.display_name ?? m.email}
                    </span>
                    <span className="text-xs text-gray-400">{m.role}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="col-span-2">
            <button
              type="submit"
              disabled={assignGoal.isPending || assignedCount === 0}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {assignGoal.isPending
                ? "Assigning…"
                : `Assign to ${assignedCount} member(s)`}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
