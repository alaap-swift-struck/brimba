"use client"

// useScreenActions — the deep-link host's WRITE layer: the named-action dispatcher
// plus the two rich-payload creators (learning article, help ticket). Lifted out of
// the component so the host's mutation surface is one named thing, not inline in the
// render path.
//
// Every action follows the same cache-first rule (CACHING.md): call the
// permission-checked endpoint, PRIME the actor's own cache with the returned list so
// their screen updates instantly, and INVALIDATE any sibling cache whose count the
// write changed — everyone else gets the realtime row ping and re-pulls. runAction
// THROWS on failure so the calling dialog / confirm surfaces the error; the creators
// let the ApiFailure propagate the same way. Nothing here bypasses a gate — these are
// the exact endpoints the manual UI calls.

import * as React from "react"

import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"

import { content as contentApi, tenancy } from "@/lib/api"
import { applyCreated, helpKey, totalKey } from "@/lib/live-resources"
import { invalidate, primeCache } from "@/lib/store"
import type { LearningFormValues } from "@/components/learning-form-dialog"

export function useScreenActions(teamId: string | null) {
  // The named-action dispatcher — the flat `{key: string}` payloads the engine emits.
  const runAction = React.useCallback(
    async (actionId: string, payload: Record<string, string>): Promise<string | void> => {
      if (!teamId) return
      switch (actionId) {
        case "members.changeRole": {
          const { members } = await tenancy.setMemberRole(payload.userId, payload.roleId)
          primeCache(`members:${teamId}`, members)
          invalidate(`member_roles:${teamId}`) // member counts per role changed
          invalidate(`activity:user:${payload.userId}`) // their activity feed gained a row
          toast.success("Role updated.")
          break
        }
        case "members.remove": {
          const { members } = await tenancy.removeMember(payload.userId)
          primeCache(`members:${teamId}`, members)
          invalidate(`member_roles:${teamId}`)
          invalidate(`activity:user:${payload.userId}`)
          toast.success("Member removed.")
          break
        }
        case "invites.create": {
          // R21: the door returns the CREATED ROW — patch it in, don't re-pull the list.
          const { created, total } = await tenancy.createInvite(payload.email, payload.roleId)
          await applyCreated({
            listKey: `invites:${teamId}`,
            created,
            total,
            totalCacheKey: totalKey("invites", teamId),
          })
          toast.success(`Invited ${payload.email}.`)
          return created?.id // R22: FormShell opens the new invite
        }
        case "invites.revoke": {
          const { invites } = await tenancy.revokeInvite(payload.inviteId)
          primeCache(`invites:${teamId}`, invites)
          toast.success("Invite revoked.")
          break
        }
        case "roles.create": {
          const { created, total } = await tenancy.createRole(payload.title, payload.description)
          await applyCreated({
            listKey: `member_roles:${teamId}`,
            created,
            total,
            totalCacheKey: totalKey("member_roles", teamId),
          })
          toast.success(`Created ${payload.title}.`)
          return created?.id // R22: FormShell opens the new role
        }
      }
    },
    [teamId]
  )

  // Create a learning article — its own handler (a rich payload, not the flat string
  // map runAction takes). Primes the list so the new article appears at once; the
  // realtime "add" ping refreshes it for everyone else.
  const createLearning = React.useCallback(
    async (values: LearningFormValues) => {
      if (!teamId) return
      const { created, total } = await contentApi.createLearning({
        title: values.title,
        category: values.category || null,
        contentType: values.contentType || null,
        contentLink: values.contentLink || null,
        body: values.body || null,
      })
      await applyCreated({
        listKey: `learning:${teamId}`,
        created,
        total,
        totalCacheKey: totalKey("learning", teamId),
      })
      toast.success(`Created "${values.title}".`)
      return created?.id // R22: FormShell opens the new article
    },
    [teamId]
  )

  // Raise a help ticket — its own handler (a small object payload). Primes the list
  // so the ticket shows at once; the realtime "add" ping refreshes everyone else.
  const createHelp = React.useCallback(
    async (input: { description: string; helpType?: string }) => {
      if (!teamId) return
      const { created, total, mineTotal } = await contentApi.createHelp(input)
      // Both scopes: you raised it, so it belongs in All AND in My tickets.
      await applyCreated({ listKey: helpKey(teamId, "all"), created, total, totalCacheKey: totalKey("help", teamId) })
      await applyCreated({
        listKey: helpKey(teamId, "mine"),
        created,
        total: mineTotal,
        totalCacheKey: totalKey("help-mine", teamId),
      })
      toast.success("Ticket raised.")
      return created?.id // R22: FormShell opens the new ticket
    },
    [teamId]
  )

  return { runAction, createLearning, createHelp }
}
