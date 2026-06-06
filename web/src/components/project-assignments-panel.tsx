import type { Role } from "@prisma/client";
import { assignProjectUser, removeProjectAssignment } from "@/app/actions/project-assignments";
import { SubmitButton } from "@/components/submit-button";

type AssignmentRow = { id: string; role: Role; user: { name: string; email: string } };
type UserOption = { id: string; name: string; email: string; role: Role };
type T = {
  title: string;
  supervisor: string;
  resident: string;
  noAssigned: string;
  assign: string;
  remove: string;
  chooseUser: string;
};

export function ProjectAssignmentsPanel({
  projectId, assignments, users, canManage, t,
}: {
  projectId: string;
  assignments: AssignmentRow[];
  users: UserOption[];
  canManage: boolean;
  t: T;
}) {
  const supervisors = assignments.filter((a) => a.role === "SUPERVISOR");
  const residents = assignments.filter((a) => a.role === "RESIDENT");
  return (
    <div className="assignment-panel">
      <div className="assignment-head">{t.title}</div>
      <AssignmentGroup label={t.supervisor} rows={supervisors} removeLabel={t.remove} canManage={canManage} />
      <AssignmentGroup label={t.resident} rows={residents} removeLabel={t.remove} canManage={canManage} />
      {assignments.length === 0 && <div className="mono text-steel" style={{ fontSize: "0.7rem" }}>{t.noAssigned}</div>}
      {canManage && (
        <form action={assignProjectUser} className="assignment-form">
          <input type="hidden" name="projectId" value={projectId} />
          <select name="role" className="input" defaultValue="SUPERVISOR">
            <option value="SUPERVISOR">{t.supervisor}</option>
            <option value="RESIDENT">{t.resident}</option>
          </select>
          <select name="userId" className="input" required defaultValue="">
            <option value="" disabled>{t.chooseUser}</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}
          </select>
          <SubmitButton className="btn btn-ghost">{t.assign}</SubmitButton>
        </form>
      )}
    </div>
  );
}

function AssignmentGroup({
  label, rows, removeLabel, canManage,
}: {
  label: string;
  rows: AssignmentRow[];
  removeLabel: string;
  canManage: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="assignment-group">
      <div className="form-label">{label}</div>
      {rows.map((row) => (
        <div key={row.id} className="assignment-row">
          <span>{row.user.name}</span>
          <span className="mono text-steel">{row.user.email}</span>
          {canManage && (
            <form action={removeProjectAssignment}>
              <input type="hidden" name="assignmentId" value={row.id} />
              <SubmitButton className="btn btn-ghost">{removeLabel}</SubmitButton>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}
