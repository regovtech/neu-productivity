"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface ImportResult {
  email: string;
  status: "invited" | "skipped" | "error";
  reason?: string;
}

interface Props {
  workspaceId: string;
}

export function CsvImportForm({ workspaceId }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setParseError(null);
    setResults(null);

    const file = fileRef.current?.files?.[0];
    if (!file) { setParseError("Please select a CSV file"); return; }
    if (!file.name.endsWith(".csv")) { setParseError("File must be a .csv"); return; }

    const text = await file.text();
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    // Expect header row: email[,role]
    if (lines.length < 2) { setParseError("CSV must have a header row and at least one data row"); return; }

    const headers = lines[0]!.toLowerCase().split(",").map((h) => h.trim());
    const emailIdx = headers.indexOf("email");
    const roleIdx = headers.indexOf("role");
    if (emailIdx === -1) { setParseError('CSV must have an "email" column'); return; }

    const rows = lines.slice(1).map((line) => {
      const cols = line.split(",").map((c) => c.trim());
      return {
        email: cols[emailIdx] ?? "",
        role: (roleIdx >= 0 ? cols[roleIdx] : "") || "member",
      };
    });

    setLoading(true);
    try {
      const resp = await fetch("/api/workspace/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, rows }),
      });
      const data: ImportResult[] = await resp.json();
      setResults(data);
    } catch {
      setParseError("Import failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
        <p className="font-medium text-gray-700 mb-1">CSV format</p>
        <pre className="font-mono text-xs">email,role{"\n"}alice@company.com,member{"\n"}bob@company.com,manager</pre>
        <p className="mt-2 text-xs">The <code>role</code> column is optional (defaults to member).</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Upload CSV
          </label>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4
                       file:rounded-lg file:border-0 file:text-sm file:font-medium
                       file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
          />
        </div>

        {parseError && (
          <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{parseError}</p>
        )}

        <Button type="submit" loading={loading}>
          Import employees
        </Button>
      </form>

      {results && (
        <div>
          <h3 className="font-semibold text-gray-900 mb-3">
            Import results — {results.filter((r) => r.status === "invited").length} invited,{" "}
            {results.filter((r) => r.status === "skipped").length} skipped,{" "}
            {results.filter((r) => r.status === "error").length} errors
          </h3>
          <div className="divide-y divide-gray-100 rounded-xl ring-1 ring-gray-200 bg-white overflow-hidden max-h-80 overflow-y-auto">
            {results.map((r, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm text-gray-900">{r.email}</span>
                <span
                  className={[
                    "text-xs font-medium rounded-full px-2 py-0.5",
                    r.status === "invited"
                      ? "bg-green-100 text-green-700"
                      : r.status === "skipped"
                      ? "bg-gray-100 text-gray-500"
                      : "bg-red-100 text-red-700",
                  ].join(" ")}
                >
                  {r.status}
                  {r.reason ? ` — ${r.reason}` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
