import type {
  ActivityItem,
  Invite,
  InviteAudit,
  TeamMember,
  TeamMeta,
  TeamRole,
} from "@shared/types"
import { describe, expect, it } from "vitest"

import {
  INVITE_STATUS,
  shapeActivity,
  shapeInviteDetail,
  shapeInvitesList,
  shapeMemberDetail,
  shapeMembersList,
  shapeRolesList,
  shapeTeamDetail,
} from "@/components/deep-link/shape"

/* ------------------------------ fixtures ------------------------------ */

const member: TeamMember = {
  userId: "u1",
  email: "alaap@x.com",
  firstName: "Alaap",
  lastName: "Kanchwala",
  imageUrl: null,
  roleId: "r1",
  roleTitle: "Admin",
  isYou: true,
  isAdmin: true,
  joinedAt: "2026-06-13T10:00:00.000Z",
}

const role: TeamRole = {
  id: "r1",
  title: "Editor",
  description: null,
  isDefault: false,
  memberCount: 1,
  active: true,
}

const invite: Invite = {
  id: "i1",
  email: "guest@x.com",
  roleId: "r1",
  roleTitle: "Editor",
  status: "pending",
  createdAt: "2026-06-13T10:00:00.000Z",
  expiresAt: "2026-06-20T10:00:00.000Z",
}

const audit: InviteAudit = {
  inviterName: "Alaap Kanchwala",
  inviterEmail: "alaap@x.com",
  inviterImageUrl: null,
  inviteeHasAccount: false,
  accepted: false,
  acceptedAt: null,
  shelfLifeHours: 168,
}

const meta: TeamMeta = {
  name: "Acme",
  createdAt: "2026-06-01T10:00:00.000Z",
  creatorName: "Alaap Kanchwala",
  creatorEmail: "alaap@x.com",
  updatedAt: null,
}

const activity: ActivityItem[] = [
  {
    id: "a1",
    type: "Member role changed",
    description: "Alaap changed Bo's role to Editor",
    actorName: "Alaap",
    createdAt: "2026-06-14T09:00:00.000Z",
  },
]

/* ------------------------------- tests -------------------------------- */

describe("INVITE_STATUS", () => {
  it("maps every invite state to a display label", () => {
    expect(INVITE_STATUS).toMatchObject({
      pending: "Pending",
      accepted: "Accepted",
      revoked: "Revoked",
      expired: "Expired",
    })
  })
})

describe("shapeActivity", () => {
  it("maps each item to { id, description, actor, timestamp }", () => {
    const [row] = shapeActivity(activity)
    expect(row.id).toBe("a1")
    expect(row.description).toBe("Alaap changed Bo's role to Editor")
    expect(row.actor).toBe("Alaap")
    expect(row).toHaveProperty("timestamp")
  })

  it("leaves actor undefined when actorName is null", () => {
    const [row] = shapeActivity([{ ...activity[0], actorName: null }])
    expect(row.actor).toBeUndefined()
  })
})

describe("shapeMembersList", () => {
  it("maps userId→id, name via personName, and a 'role · joined …' detail", () => {
    const { rows } = shapeMembersList([member])
    expect(rows?.[0].id).toBe("u1")
    expect(rows?.[0].name).toBe("Alaap Kanchwala")
    expect(String(rows?.[0].detail)).toContain("Admin")
    expect(String(rows?.[0].detail)).toContain("joined")
  })
})

describe("shapeRolesList", () => {
  it('adds the "(inactive)" suffix when !active', () => {
    const { rows } = shapeRolesList([{ ...role, active: false }])
    expect(rows?.[0].name).toBe("Editor (inactive)")
  })

  it("keeps the plain title when active", () => {
    const { rows } = shapeRolesList([role])
    expect(rows?.[0].name).toBe("Editor")
  })

  it('falls back to a "N members" detail when there is no description', () => {
    expect(shapeRolesList([{ ...role, memberCount: 1 }]).rows?.[0].detail).toBe("1 member")
    expect(shapeRolesList([{ ...role, memberCount: 3 }]).rows?.[0].detail).toBe("3 members")
  })

  it("uses the description for the detail when present", () => {
    const { rows } = shapeRolesList([{ ...role, description: "Can edit content" }])
    expect(rows?.[0].detail).toBe("Can edit content")
  })
})

describe("shapeInvitesList", () => {
  it("puts the email + an INVITE_STATUS value in the detail", () => {
    const { rows } = shapeInvitesList([invite])
    expect(rows?.[0].email).toBe("guest@x.com")
    expect(String(rows?.[0].detail)).toContain("Editor")
    expect(String(rows?.[0].detail)).toContain(INVITE_STATUS.pending)
  })
})

describe("shapeMemberDetail", () => {
  it("shapes the record fields and a shaped activity set", () => {
    const data = shapeMemberDetail(member, activity)
    expect(data.record?.id).toBe("u1")
    expect(data.record?.name).toBe("Alaap Kanchwala")
    expect(data.record?.email).toBe("alaap@x.com")
    expect(data.record?.role).toBe("Admin")
    expect(data.record).toHaveProperty("joined")
    expect(data.sets?.activity?.[0].id).toBe("a1")
  })
})

describe("shapeInviteDetail", () => {
  it("shapes the record + uses INVITE_STATUS for status", () => {
    const data = shapeInviteDetail(invite, audit, activity)
    expect(data.record?.id).toBe("i1")
    expect(data.record?.email).toBe("guest@x.com")
    expect(data.record?.status).toBe(INVITE_STATUS.pending)
    expect(data.record?.invitedBy).toBe("Alaap Kanchwala")
    expect(data.sets?.activity?.[0].id).toBe("a1")
  })

  it('shows accepted as "—" when the invite was not accepted', () => {
    const data = shapeInviteDetail(invite, audit, activity)
    expect(data.record?.accepted).toBe("—")
  })

  it('falls back invitedBy to "—" when there is no audit', () => {
    const data = shapeInviteDetail(invite, null, activity)
    expect(data.record?.invitedBy).toBe("—")
    expect(data.record?.accepted).toBe("—")
  })
})

describe("shapeTeamDetail", () => {
  it("shapes the record fields and a shaped activity set", () => {
    const data = shapeTeamDetail({
      teamId: "t1",
      name: "Acme",
      logoUrl: null,
      meta,
      activity,
    })
    expect(data.record?.id).toBe("t1")
    expect(data.record?.name).toBe("Acme")
    expect(data.record?.image).toBe("")
    expect(data.record?.createdBy).toBe("Alaap Kanchwala")
    expect(data.record?.updated).toBe("—") // meta.updatedAt is null
    expect(data.sets?.activity?.[0].id).toBe("a1")
  })
})
