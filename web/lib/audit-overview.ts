// The ONE consistent audit block every record's Overview tab shows, so "metadata"
// reads the same everywhere (RULES/feedback 2026-06-30).
import { formatRelative } from "@/lib/format"

export type AuditMeta = {
  createdByName?: string | null
  createdAt?: string | null
  editedByName?: string | null
  updatedAt?: string | null
  status: string
}

/** The five audit rows, in a fixed order, for a DescriptionList. */
export function auditItems(a: AuditMeta): { label: string; value: string }[] {
  return [
    { label: "Created by", value: a.createdByName || "—" },
    { label: "Created", value: a.createdAt ? formatRelative(a.createdAt) : "—" },
    { label: "Last edited by", value: a.editedByName || "—" },
    { label: "Last edited", value: a.updatedAt ? formatRelative(a.updatedAt) : "—" },
    { label: "Status", value: a.status },
  ]
}
