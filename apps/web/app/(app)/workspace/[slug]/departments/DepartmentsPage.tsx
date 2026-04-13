"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

interface Props {
  workspaceId: string;
}

export function DepartmentsPage({ workspaceId }: Props) {
  const utils = trpc.useUtils();

  const { data: departments, isLoading } = trpc.departments.list.useQuery({ workspaceId });
  const { data: members } = trpc.departments.teamMembers.useQuery({ workspaceId });

  const createDept = trpc.departments.create.useMutation({
    onSuccess: () => {
      utils.departments.list.invalidate({ workspaceId });
      setName("");
      setDesc("");
    },
  });
  const deleteDept = trpc.departments.delete.useMutation({
    onSuccess: () => utils.departments.list.invalidate({ workspaceId }),
  });
  const setMemberDept = trpc.departments.setMemberDepartment.useMutation({
    onSuccess: () => utils.departments.teamMembers.invalidate({ workspaceId }),
  });
  const setMemberMgr = trpc.departments.setMemberManager.useMutation({
    onSuccess: () => utils.departments.teamMembers.invalidate({ workspaceId }),
  });

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Departments</h1>
        <p className="mt-1 text-sm text-gray-500">
          Organise your team into departments and set manager reporting lines.
        </p>
      </div>

      {/* Create department */}
      <section className="rounded-xl bg-white p-5 ring-1 ring-gray-200">
        <h2 className="mb-4 font-semibold text-gray-900">Create Department</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createDept.mutate({ workspaceId, name, description: desc || undefined });
          }}
          className="flex flex-wrap gap-3 items-end"
        >
          <div className="flex-1 min-w-48">
            <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Engineering"
            />
          </div>
          <div className="flex-1 min-w-48">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Description (optional)
            </label>
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={createDept.isPending}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {createDept.isPending ? "Creating…" : "Create"}
          </button>
        </form>

        {/* List */}
        {!isLoading && departments && departments.length > 0 && (
          <ul className="mt-4 space-y-2">
            {departments.map((d) => {
              const count = members?.filter((m) => m.department_id === d.id).length ?? 0;
              return (
                <li
                  key={d.id}
                  className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2 text-sm"
                >
                  <div>
                    <span className="font-medium text-gray-900">{d.name}</span>
                    {d.description && (
                      <span className="ml-2 text-gray-400">{d.description}</span>
                    )}
                    <span className="ml-2 text-xs text-gray-400">
                      {count} member{count !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <button
                    onClick={() => deleteDept.mutate({ departmentId: d.id })}
                    className="text-xs text-red-400 hover:underline"
                  >
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Team hierarchy */}
      <section className="rounded-xl bg-white p-5 ring-1 ring-gray-200">
        <h2 className="mb-4 font-semibold text-gray-900">Team Hierarchy</h2>
        <p className="mb-4 text-sm text-gray-500">
          Assign members to departments and set their reporting manager.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Member</th>
                <th className="px-3 py-2 text-left">Role</th>
                <th className="px-3 py-2 text-left">Department</th>
                <th className="px-3 py-2 text-left">Reports to</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {members?.map((m) => (
                <tr key={m.user_id}>
                  <td className="px-3 py-2 font-medium text-gray-900">
                    {m.display_name ?? m.email}
                    <div className="text-xs text-gray-400">{m.email}</div>
                  </td>
                  <td className="px-3 py-2 text-gray-600 capitalize">{m.role}</td>
                  <td className="px-3 py-2">
                    <select
                      value={m.department_id ?? ""}
                      onChange={(e) =>
                        setMemberDept.mutate({
                          workspaceId,
                          targetUserId: m.user_id,
                          departmentId: e.target.value || null,
                        })
                      }
                      className="rounded-lg border border-gray-200 px-2 py-1 text-xs"
                    >
                      <option value="">None</option>
                      {departments?.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={m.manager_id ?? ""}
                      onChange={(e) =>
                        setMemberMgr.mutate({
                          workspaceId,
                          targetUserId: m.user_id,
                          managerId: e.target.value || null,
                        })
                      }
                      className="rounded-lg border border-gray-200 px-2 py-1 text-xs"
                    >
                      <option value="">None</option>
                      {members
                        ?.filter(
                          (mgr) =>
                            mgr.user_id !== m.user_id &&
                            ["owner", "admin", "manager"].includes(mgr.role)
                        )
                        .map((mgr) => (
                          <option key={mgr.user_id} value={mgr.user_id}>
                            {mgr.display_name ?? mgr.email}
                          </option>
                        ))}
                    </select>
                  </td>
                </tr>
              ))}
              {!members?.length && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-sm text-gray-400">
                    No members yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
